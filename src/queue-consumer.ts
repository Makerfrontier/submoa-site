// src/queue-consumer.ts
// Cloudflare Queue consumer — processes generation jobs

// ----------------------
// Usage logging
// ----------------------
async function logApiUsage(
  db: D1Database,
  apiName: string,
  inputTokens: number,
  outputTokens: number,
  costUsd: number,
  submissionId?: string
): Promise<void> {
  try {
    await db.prepare(`
      INSERT INTO api_usage_log (api_name, input_tokens, output_tokens, cost_usd, submission_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(apiName, inputTokens, outputTokens, costUsd, submissionId || null, Date.now()).run();
  } catch (e) {
    console.error('logApiUsage failed:', e.message);
  }
}

// For each job:
//   1. Fetch submission + author voice from DB
//   2. Fetch writing skill from DB
//   3. Pull DataforSEO keyword intelligence
//   4. Scrape product link if provided
//   5. Assemble full generation prompt
//   6. Call Claude API
//   7. Write article back to DB
//   8. Set status = 'article_done', grade_status = 'ungraded'
//   9. Notify Discord that generation is complete

import { getKeywordIntelligence, formatKeywordIntelligenceForPrompt } from "./dataforseo";
import { notifyGenerationComplete } from "./notifications";
import { runEnforcementAgent } from "./enforcement-agent";
import type { GenerationJob } from "./queue-producer";

interface Env {
  DB: D1Database;
  DATAFORSEO_LOGIN: string;
  DATAFORSEO_PASSWORD: string;
  DISCORD_BOT_TOKEN: string;
  RESEND_API_KEY: string;
  OPENROUTER_API_KEY: string;
  APP_URL?: string;
}

// ---------------------------------------------------------------------------
// Queue consumer export
// Wire this into your main worker as the queue handler
// ---------------------------------------------------------------------------
export default {
  async queue(batch: MessageBatch<GenerationJob>, env: Env): Promise<void> {
    // Process messages one at a time — maintains submission order
    for (const message of batch.messages) {
      try {
        await processGenerationJob(env, message.body);
        message.ack();
      } catch (err) {
        console.error(
          `Generation failed for submission ${message.body.submission_id}:`,
          err
        );
        // Retry up to 3 times via queue retry — then dead letter
        message.retry();
      }
    }
  },
};

// ---------------------------------------------------------------------------
// Core generation pipeline
// ---------------------------------------------------------------------------
async function processGenerationJob(
  env: Env,
  job: GenerationJob
): Promise<void> {
  const { submission_id } = job;

  console.log(`Processing generation job for submission ${submission_id}`);

  // Mark as generating
  await env.DB.prepare(
    `UPDATE submissions SET status = 'generating', updated_at = ? WHERE id = ?`
  )
    .bind(Date.now(), submission_id)
    .run();

  // -------------------------------------------------------------------------
  // Step 1 — Fetch submission + author voice
  // -------------------------------------------------------------------------
  const submission = await env.DB.prepare(
    `SELECT s.*,
            ap.name as author_display_name,
            ap.style_guide,
            u.email as author_email
     FROM submissions s
     LEFT JOIN author_profiles ap ON s.author = ap.slug
     LEFT JOIN users u ON ap.account_id = u.account_id
     WHERE s.id = ?`
  )
    .bind(submission_id)
    .first<{
      id: string;
      title: string;
      topic: string;
      article_format: string;
      optimization_target: string;
      tone_stance: string;
      vocal_tone: string | null;
      min_word_count: number;
      target_keywords: string | null;
      human_observation: string | null;
      anecdotal_stories: string | null;
      product_link: string | null;
      include_faq: number;
      generate_audio: number;
      author: string;
      author_display_name: string | null;
      style_guide: string | null;
      author_email: string | null;
    }>();

  if (!submission) {
    throw new Error(`Submission ${submission_id} not found`);
  }

  // -------------------------------------------------------------------------
  // Step 2 — Fetch writing skill from DB
  // -------------------------------------------------------------------------
  const skillRow = await env.DB.prepare(
    `SELECT content FROM agent_skills WHERE name = 'writing-skill' AND active = 1 LIMIT 1`
  ).first<{ content: string }>();

  const skillContent = skillRow?.content ?? "";

  if (!skillContent) {
    console.warn("Writing skill not found in DB — generating without skill document");
  }

  // -------------------------------------------------------------------------
  // Step 3 — DataforSEO keyword intelligence
  // -------------------------------------------------------------------------
  const targetKeywords = submission.target_keywords
    ? JSON.parse(submission.target_keywords) as string[]
    : [];

  let keywordBlock = "";
  try {
    const intel = await getKeywordIntelligence(
      env,
      targetKeywords,
      submission.topic
    );
    keywordBlock = formatKeywordIntelligenceForPrompt(intel);
    await logApiUsage(env.DB, 'DataforSEO', 0, 0, 0.01, submission.id); // approximate cost
  } catch (err) {
    console.error("DataforSEO failed — continuing without keyword intelligence:", err);
    keywordBlock = `=== KEYWORD INTELLIGENCE ===\nUnavailable — write naturally for topic: ${submission.topic}`;
  }

  // -------------------------------------------------------------------------
  // Step 4 — Product link scrape (if provided)
  // -------------------------------------------------------------------------
  let productBlock = "";
  if (submission.product_link) {
    try {
      const scrapeRes = await fetch(submission.product_link, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; SubMoaBot/1.0)" },
      });
      if (scrapeRes.ok) {
        const html = await scrapeRes.text();
        // Strip tags, collapse whitespace, truncate to 2000 chars
        const text = html
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 2000);

        productBlock = `=== PRODUCT CONTEXT ===\nSource: ${submission.product_link}\n\n${text}`;
      }
    } catch (err) {
      console.error("Product link scrape failed:", err);
    }

    if (!productBlock) {
      productBlock = `=== PRODUCT CONTEXT ===\nProduct link provided (${submission.product_link}) but could not be scraped. Write from general knowledge only. Flag any uncertain specifications with [UNVERIFIED].`;
    }
  } else {
    productBlock = `=== PRODUCT CONTEXT ===\nNo product link provided. Write from general knowledge only. Flag any uncertain specifications with [UNVERIFIED].`;
  }

  // -------------------------------------------------------------------------
  // Step 5 — Assemble full generation prompt
  // -------------------------------------------------------------------------
  const prompt = assemblePrompt({
    skillContent,
    submission,
    keywordBlock,
    productBlock,
  });

  // -------------------------------------------------------------------------
  // Step 6 — Call Claude API
  // -------------------------------------------------------------------------
  const rawArticle = await callClaude(prompt, env.OPENROUTER_API_KEY);
  await logApiUsage(env.DB, 'OpenRouter/Claude', 0, 0, 0.01, submission.id); // TODO: extract actual token usage from OpenRouter response

  if (!rawArticle) {
    throw new Error(`Claude returned empty content for submission ${submission_id}`);
  }

  // -------------------------------------------------------------------------
  // Step 6b — Enforcement agent (scan + fix banned patterns)
  // -------------------------------------------------------------------------
  const { article: articleContent, violations, fixed, error: enfError } = await runEnforcementAgent(
    rawArticle,
    env.OPENROUTER_API_KEY
  );

  if (fixed) {
    console.log(`[enforcement] Fixed ${violations.length} violation(s): ${violations.join(", ")}`);
    await logApiUsage(env.DB, 'OpenRouter/Enforcement', 0, 0, 0.01, submission.id); // TODO: real token tracking
  } else if (enfError) {
    console.warn(`[enforcement] Pass-through (fixer failed: ${enfError})`);
  } else {
    console.log(`[enforcement] Clean — ${violations.length} violations detected but no fix needed`);
  }

  // -------------------------------------------------------------------------
  // Step 7 — Word count
  // -------------------------------------------------------------------------
  const wordCount = articleContent.split(/\s+/).filter(Boolean).length;

  // -------------------------------------------------------------------------
  // Step 8 — Write article back to DB
  // -------------------------------------------------------------------------
  await env.DB.prepare(
    `UPDATE submissions
     SET article_content = ?,
         word_count = ?,
         status = 'article_done',
         grade_status = 'ungraded',
         updated_at = ?
     WHERE id = ?`
  )
    .bind(articleContent, wordCount, Date.now(), submission_id)
    .run();

  console.log(
    `Generation complete for submission ${submission_id} — ${wordCount} words`
  );

  // -------------------------------------------------------------------------
  // Step 9 — Discord notification (generation complete, grading starting soon)
  // -------------------------------------------------------------------------
  await notifyGenerationComplete(env, {
    id: submission_id,
    title: submission.title,
    author_display_name: submission.author_display_name ?? submission.author,
    word_count: wordCount,
  });
}

// ---------------------------------------------------------------------------
// Prompt assembly
// ---------------------------------------------------------------------------
function assemblePrompt(params: {
  skillContent: string;
  submission: {
    title: string;
    topic: string;
    article_format: string;
    optimization_target: string;
    tone_stance: string;
    vocal_tone: string | null;
    min_word_count: number;
    target_keywords: string | null;
    human_observation: string | null;
    anecdotal_stories: string | null;
    include_faq: number;
    generate_audio: number;
    author_display_name: string | null;
    author: string;
    style_guide: string | null;
  };
  keywordBlock: string;
  productBlock: string;
}): string {
  const { skillContent, submission, keywordBlock, productBlock } = params;

  const authorName = submission.author_display_name ?? submission.author;

  const sections = [
    skillContent
      ? `=== SKILL DOCUMENT ===\n${skillContent}`
      : null,

    submission.style_guide
      ? `=== AUTHOR VOICE ===\nYou are writing as ${authorName}. Follow this style guide exactly:\n\n${submission.style_guide}`
      : `=== AUTHOR VOICE ===\nAuthor: ${authorName}\nNo style guide available — write in a clear, natural, first-person conversational style.`,

    keywordBlock,

    productBlock,

    [
      `=== BRIEF ===`,
      `Title: ${submission.title}`,
      `Topic: ${submission.topic}`,
      `Article Format: ${submission.article_format}`,
      `Optimization Target: ${submission.optimization_target}`,
      `Tone/Stance: ${submission.tone_stance}`,
      submission.vocal_tone ? `Vocal Tone: ${submission.vocal_tone}` : null,
      `Minimum Word Count: ${submission.min_word_count}`,
      submission.target_keywords
        ? `Target Keywords: ${submission.target_keywords}`
        : null,
      submission.human_observation
        ? `\nHuman Observation:\n${submission.human_observation}`
        : null,
      submission.anecdotal_stories
        ? `\nAnecdotal Stories to Include:\n${submission.anecdotal_stories}`
        : null,
    ]
      .filter(Boolean)
      .join("\n"),

    [
      `=== GENERATION INSTRUCTIONS ===`,
      `Write a complete, publish-ready ${submission.article_format} article.`,
      `Optimization target: ${submission.optimization_target}.`,
      `Author voice: ${authorName}. Follow their style guide exactly.`,
      `Tone/Stance: ${submission.tone_stance}.`,
      submission.vocal_tone ? `Vocal Tone: ${submission.vocal_tone}.` : null,
      `Minimum ${submission.min_word_count} words. Hit the minimum with substance — do not pad.`,
      `Apply all format-specific and optimization rules from the skill document.`,
      submission.include_faq
        ? `Close with a 5-7 question FAQ section. Append FAQPage JSON-LD schema after the article.`
        : null,
      submission.generate_audio
        ? `Write for audio — spell out symbols, avoid abbreviations, use natural spoken rhythm.`
        : null,
    ]
      .filter(Boolean)
      .join("\n"),

    [
      `=== POST-GENERATION SELF-CHECK ===`,
      `Before returning the article, confirm:`,
      `- Introduction states what the reader will get`,
      `- Conclusion exists and delivers on the introduction's promise`,
      `- Word count meets minimum (count it — do not estimate)`,
      `- Author voice is consistent throughout`,
      `- No generic opener ("In today's world", "When it comes to")`,
      `- No em dashes`,
      `- No AI tell phrases (delve, tapestry, robust, crucial, leverage, navigate, unlock, game-changer, it's worth noting, furthermore, moreover)`,
      `- No invented product specifications`,
      `- Hard rules from the skill document are not violated`,
    ].join("\n"),
  ]
    .filter(Boolean)
    .join("\n\n");

  return sections;
}

// ---------------------------------------------------------------------------
// Claude API call
// ---------------------------------------------------------------------------
async function callClaude(prompt: string, apiKey: string): Promise<string> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "HTTP-Referer": "https://www.submoacontent.com",
      "X-Title": "SubMoa Content",
    },
    body: JSON.stringify({
      model: "anthropic/claude-3.7-sonnet",
      max_tokens: 8192,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });


  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter API error: ${res.status} ${err}`);
  }

  const data = await res.json() as {
    choices: Array<{ message: { content: string } }>;
  };

  return data.choices[0].message.content.trim();
}
