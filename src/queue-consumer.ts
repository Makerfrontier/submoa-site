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
import { writeProjectFile } from "./project-template";
import { packageAudio } from "./packager-update";
import { processImages, injectImagesIntoArticle, generateImageCopyBuffers } from "./image-processor";
import { assembleEmail, type EmailRecord } from "./email-assembler";
import { assemblePresentation, type PresentationRecord } from "./presentation-assembler";
import type { GenerationJob } from "./queue-producer";
import puppeteer from "@cloudflare/puppeteer";

interface Env {
  DB: D1Database;
  SUBMOA_IMAGES: R2Bucket;
  DATAFORSEO_LOGIN: string;
  DATAFORSEO_PASSWORD: string;
  DISCORD_BOT_TOKEN: string;
  RESEND_API_KEY: string;
  OPENROUTER_API_KEY: string;
  OPENAI_API_KEY?: string;
  AI: Ai;                    // Cloudflare Workers AI — used for TTS
  BROWSER?: any;             // Cloudflare Browser Rendering (for itinerary PDF)
  APP_URL?: string;
}

type QueueMessage =
  | GenerationJob
  | { type: 'itinerary_pdf'; itinerary_id: string; account_id: string; queued_at: number };

// ---------------------------------------------------------------------------
// Queue consumer export
// Wire this into your main worker as the queue handler
// ---------------------------------------------------------------------------
export default {
  async queue(batch: MessageBatch<QueueMessage>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      const body: any = message.body;
      try {
        if (body?.type === 'itinerary_pdf') {
          await processItineraryPdf(env, body.itinerary_id);
        } else {
          await processGenerationJob(env, body as GenerationJob);
        }
        message.ack();
      } catch (err) {
        console.error(`Queue job failed (${body?.type || 'generation'}):`, err);
        message.retry();
      }
    }
  },
};

// ---------------------------------------------------------------------------
// Itinerary PDF generation via Cloudflare Browser Rendering
// ---------------------------------------------------------------------------
async function processItineraryPdf(env: Env, itineraryId: string): Promise<void> {
  console.log(`[itinerary-pdf] start ${itineraryId}`);
  const row: any = await env.DB.prepare(
    `SELECT id, title, summary, plan_html, revised_plan_html, plan_json, revised_plan_json,
            status, created_at
     FROM itinerary_submissions WHERE id = ?`
  ).bind(itineraryId).first();

  if (!row) {
    console.error(`[itinerary-pdf] missing itinerary ${itineraryId}`);
    return;
  }

  const planBody = row.revised_plan_html || row.plan_html || '';
  const plan = (() => {
    try { return JSON.parse(row.revised_plan_json || row.plan_json || '{}'); } catch { return {}; }
  })();
  const title = row.title || plan?.plan_title || 'Itinerary';
  const generated = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@700;800&display=swap" rel="stylesheet">
<title>${esc(title)}</title>
<style>
  :root { --bg:#EDE8DF; --card:#FAF7F2; --green:#3D5A3E; --amber:#B8872E; --text:#221A10; --mid:#6B5744; --border:#CDC5B4; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'DM Sans', sans-serif; background: var(--bg); color: var(--text); }
  .cover { height: 100vh; display: flex; flex-direction: column; justify-content: center; padding: 60px; background: var(--bg); page-break-after: always; }
  .cover h1 { font-family: 'Playfair Display', serif; font-size: 56px; color: var(--text); margin: 0 0 14px; line-height: 1.05; }
  .cover .sub { font-size: 16px; color: var(--mid); margin-bottom: 28px; max-width: 560px; line-height: 1.55; }
  .cover .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; max-width: 560px; margin-top: 20px; }
  .cover .meta div { padding: 14px 16px; background: var(--card); border: 1px solid var(--border); border-radius: 10px; }
  .cover .meta label { display: block; font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--amber); font-weight: 600; margin-bottom: 4px; }
  .cover .meta value { font-size: 14px; color: var(--text); }
  .cover .date { margin-top: 22px; font-size: 12px; color: var(--mid); }
  .plan { padding: 48px 60px; background: var(--bg); }
  .plan .summary { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 20px; margin-bottom: 22px; font-size: 15px; line-height: 1.6; }
  .plan section.task { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 20px; margin-bottom: 18px; page-break-inside: avoid; }
  .plan .eyebrow { font-family: 'DM Sans', sans-serif; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.2em; color: var(--amber); margin-bottom: 6px; }
  .plan .desc { font-size: 14px; color: var(--text); margin-bottom: 10px; line-height: 1.55; }
  .plan .tags { margin-bottom: 12px; }
  .plan .tag { display: inline-block; font-size: 10px; padding: 2px 8px; background: #F5EDD8; color: var(--amber); border-radius: 100px; margin-right: 6px; }
  .plan .opts { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
  .plan .opt { background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 12px; font-size: 12px; }
  .plan .opt .rank { width: 20px; height: 20px; border-radius: 50%; background: var(--green); color: #fff; font-weight: 700; text-align: center; line-height: 20px; font-size: 11px; margin-bottom: 6px; }
  .plan .opt .vendor { font-family: 'Playfair Display', serif; font-size: 15px; font-weight: 700; margin-bottom: 2px; }
  .plan .opt .tagline { font-size: 11px; color: var(--mid); margin-bottom: 8px; }
  .plan .opt .cost { display: inline-block; background: #F5EDD8; color: var(--amber); font-weight: 700; padding: 2px 8px; border-radius: 100px; font-size: 11px; margin-bottom: 6px; }
  .plan .opt .phone, .plan .opt .web { font-size: 11px; color: var(--mid); margin-bottom: 4px; }
  .plan .opt ul { margin: 4px 0; padding-left: 14px; font-size: 11px; line-height: 1.45; }
  .plan .opt ul.cons li { color: var(--amber); }
  .plan .opt .bestfor { font-size: 10px; color: var(--mid); margin-top: 6px; font-style: italic; }
  .plan section.next { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 20px; margin-top: 18px; }
  .plan section.totals { background: var(--green); color: #fff; border-radius: 10px; padding: 20px; margin-top: 14px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 13px; }
  .plan section.totals strong { font-weight: 700; }
</style></head><body>
  <div class="cover">
    <div style="font-size:11px;letter-spacing:0.3em;color:var(--amber);font-weight:600;text-transform:uppercase;margin-bottom:18px;">✦ Itinerary</div>
    <h1>${esc(title)}</h1>
    <div class="sub">${esc(plan?.summary ?? '')}</div>
    <div class="meta">
      <div><label>Timeline</label><value>${esc(plan?.timeline ?? '—')}</value></div>
      <div><label>Total cost estimate</label><value>${esc(plan?.total_cost_estimate ?? '—')}</value></div>
    </div>
    <div class="date">Generated ${esc(generated)}</div>
  </div>
  <div class="plan">${planBody}</div>
</body></html>`;

  if (!env.BROWSER) {
    console.error('[itinerary-pdf] BROWSER binding missing — marking pdf_failed');
    await env.DB.prepare(
      `UPDATE itinerary_submissions SET status = 'pdf_failed', updated_at = ? WHERE id = ?`
    ).bind(Math.floor(Date.now() / 1000), itineraryId).run();
    return;
  }

  let pdfBytes: Uint8Array;
  try {
    const browser: any = await (puppeteer as any).launch(env.BROWSER);
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    pdfBytes = await page.pdf({ format: 'A4', printBackground: true });
    await browser.close();
  } catch (e: any) {
    console.error('[itinerary-pdf] puppeteer failed:', e?.message ?? e);
    await env.DB.prepare(
      `UPDATE itinerary_submissions SET status = 'pdf_failed', updated_at = ? WHERE id = ?`
    ).bind(Math.floor(Date.now() / 1000), itineraryId).run();
    return;
  }

  const r2Key = `projects/itineraries/${itineraryId}/itinerary.pdf`;
  await env.SUBMOA_IMAGES.put(r2Key, pdfBytes, {
    httpMetadata: { contentType: 'application/pdf' },
  });

  await env.DB.prepare(
    `UPDATE itinerary_submissions SET pdf_r2_key = ?, status = 'pdf_ready', updated_at = ? WHERE id = ?`
  ).bind(r2Key, Math.floor(Date.now() / 1000), itineraryId).run();

  console.log(`[itinerary-pdf] stored at ${r2Key}`);
}

function esc(s: any): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

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
      image_urls: string | null;
      image_r2_keys: string | null;
      author: string;
      author_display_name: string | null;
      style_guide: string | null;
      author_email: string | null;
      revision_notes: string | null;
      content_rating: number | null;
      generate_featured_image: number | null;
      image_mood: string | null;
      image_perspective: string | null;
      image_setting: string | null;
    }>();

  if (!submission) {
    throw new Error(`Submission ${submission_id} not found`);
  }

  // -------------------------------------------------------------------------
  // Email branch — short-circuits the article generation pipeline entirely
  // -------------------------------------------------------------------------
  if (submission.article_format === "email") {
    const emailRecord = await env.DB.prepare(
      `SELECT * FROM email_submissions WHERE submission_id = ?`
    ).bind(submission_id).first<EmailRecord>();

    if (!emailRecord) {
      console.error(`[email-assembler] No email_submissions row for ${submission_id} — aborting`);
      await env.DB.prepare(
        `UPDATE submissions SET status = 'failed', updated_at = ? WHERE id = ?`
      ).bind(Date.now(), submission_id).run();
      return;
    }

    await assembleEmail(env as any, {
      id: submission_id,
      topic: submission.topic,
      author: submission.author,
      author_display_name: submission.author_display_name,
      style_guide: submission.style_guide,
    }, emailRecord);
    return;
  }

  // -------------------------------------------------------------------------
  // Presentation branch — same short-circuit pattern as email
  // -------------------------------------------------------------------------
  if (submission.article_format === "presentation") {
    const presRecord = await env.DB.prepare(
      `SELECT * FROM presentation_submissions WHERE submission_id = ?`
    ).bind(submission_id).first<PresentationRecord>();

    if (!presRecord) {
      console.error(`[presentation-assembler] No presentation_submissions row for ${submission_id} — aborting`);
      await env.DB.prepare(
        `UPDATE submissions SET status = 'failed', updated_at = ? WHERE id = ?`
      ).bind(Date.now(), submission_id).run();
      return;
    }

    await assemblePresentation(env as any, {
      id: submission_id,
      topic: submission.topic,
      author: submission.author,
      target_keywords: submission.target_keywords,
    }, presRecord);
    return;
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
    imageCount: submission.image_urls ? JSON.parse(submission.image_urls).length : 0,
    revisionNotes: submission.revision_notes ?? null,
  });

  // -------------------------------------------------------------------------
  // Step 6 — Call OpenRouter with slot-selected model + system prompt
  // -------------------------------------------------------------------------
  const requestedSlot = [1, 2, 3].includes(Number(submission.content_rating))
    ? Number(submission.content_rating)
    : 1;

  let slotRow = await env.DB.prepare(
    `SELECT slot, model_string, display_name FROM llm_config WHERE slot = ?`
  ).bind(requestedSlot).first<{ slot: number; model_string: string; display_name: string }>();

  if (!slotRow) {
    slotRow = await env.DB.prepare(
      `SELECT slot, model_string, display_name FROM llm_config WHERE slot = 1`
    ).first<{ slot: number; model_string: string; display_name: string }>();
  }

  const effectiveSlot = slotRow?.slot ?? 1;
  const effectiveModel = slotRow?.model_string ?? 'anthropic/claude-sonnet-4-5';
  const effectiveDisplayName = slotRow?.display_name ?? 'Standard Issue';

  console.log(
    `[llm-config] submission=${submission_id} slot=${effectiveSlot} display_name="${effectiveDisplayName}" model=${effectiveModel}`
  );

  const systemPrompt = buildSystemPromptForSlot(effectiveSlot, submission);

  const rawArticle = await callOpenRouter(prompt, env.OPENROUTER_API_KEY, effectiveModel, systemPrompt);
  await logApiUsage(env.DB, 'OpenRouter/Claude', 0, 0, 0.01, submission.id); // TODO: extract actual token usage from OpenRouter response

  if (!rawArticle) {
    throw new Error(`Claude returned empty content for submission ${submission_id}`);
  }

  // -------------------------------------------------------------------------
  // Step 6b — Enforcement agent (scan + fix banned patterns)
  // -------------------------------------------------------------------------
  // ── Enforce writing guidelines ────────────────────────────────────────
  const enforcement = await runEnforcementAgent(rawArticle, {
    OPENROUTER_API_KEY: env.OPENROUTER_API_KEY,
  }).catch((err) => {
    console.error('Enforcement agent failed, using raw article:', err);
    return {
      content: rawArticle,
      violations_found: [],
      violations_fixed: [],
      enforcement_calls: 0,
      was_clean: true,
    };
  });


  const articleContent = enforcement.content;

  if (!enforcement.was_clean) {
    console.log(
      `Enforcement: found ${enforcement.violations_found.length} violation type(s), ` +
      `fixed ${enforcement.violations_fixed.length}`
    );
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
  // Step 8b — Image SEO pipeline (before HTML write so images get injected)
  // -------------------------------------------------------------------------
  let articleBodyHtml = articleContent;

  const imageKeys: string[] = (() => {
    const raw = submission.image_r2_keys ?? submission.image_urls;
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((k) => typeof k === "string") : [];
    } catch {
      return [];
    }
  })();

  if (imageKeys.length > 0) {
    try {
      const targetKeywords = submission.target_keywords
        ? (() => {
            try {
              const p = JSON.parse(submission.target_keywords);
              return Array.isArray(p) ? p : [submission.topic];
            } catch {
              return submission.target_keywords.split(",").map((k) => k.trim()).filter(Boolean);
            }
          })()
        : [submission.topic];

      const processed = await processImages(
        env as any,
        submission_id,
        submission.topic,
        articleContent,
        targetKeywords,
        imageKeys
      );

      if (processed.images.length > 0) {
        // Best-effort copy buffers — failure shouldn't block image injection
        await generateImageCopyBuffers(
          env as any,
          articleContent,
          processed.images,
          submission.topic,
          targetKeywords
        ).catch((e) => {
          console.error(`[image-processor] copy-buffers failed for ${submission_id}:`, e);
          return {};
        });

        articleBodyHtml = injectImagesIntoArticle(articleContent, processed.images, submission_id);

        await env.DB.prepare(
          `UPDATE submissions
             SET image_metadata = ?,
                 featured_image_filename = ?,
                 updated_at = ?
           WHERE id = ?`
        ).bind(
          JSON.stringify(processed.images),
          processed.featuredImage?.renamedFilename ?? null,
          Date.now(),
          submission_id
        ).run();

        console.log(
          `[image-processor] Processed ${processed.images.length} image(s) for ${submission_id}; featured: ${processed.featuredImage?.renamedFilename ?? "none"}`
        );
      }
    } catch (e: any) {
      console.error(`[image-processor] Failed for ${submission_id}:`, e?.message ?? e);
    }
  }

  // -------------------------------------------------------------------------
  // Step 8b.2 — Featured image generation via OpenRouter → gemini-2.5-flash-image
  // Best-effort: any failure is logged and skipped. Never blocks delivery.
  // -------------------------------------------------------------------------
  if (Number(submission.generate_featured_image) === 1) {
    try {
      // Resolve the slot 1 model for the image-prompt LLM call
      const slot1 = await env.DB.prepare(
        `SELECT model_string FROM llm_config WHERE slot = 1`
      ).first<{ model_string: string }>();
      const promptModel = slot1?.model_string ?? 'anthropic/claude-sonnet-4-5';

      const imagePromptSystem =
        "You are a creative director briefing a graphic designer. Write a single detailed image generation prompt for a 16:9 featured image in graphic design style. The image must look like professional editorial graphic design work — not photography, not illustration, not AI art. Think: magazine cover design, editorial layout, bold typographic composition, intentional negative space, strong color palette, print-quality visual hierarchy. The image should never contain readable text, placeholder text, human faces, or people. It should use the mood, perspective, and setting values provided as directional inputs within the graphic design aesthetic. Return only the prompt text with no preamble, no explanation, no quotes.";

      const imagePromptUser =
        `Article title: ${submission.topic}. Target keywords: ${submission.target_keywords ?? 'none'}. Article opening: ${(articleContent || '').slice(0, 500)}. Mood: ${submission.image_mood ?? 'natural-bright'}. Perspective: ${submission.image_perspective ?? 'eye-level'}. Setting: ${submission.image_setting ?? 'outdoors'}. Write the image generation prompt now.`;

      const promptRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'https://www.submoacontent.com',
          'X-Title': 'SubMoa Content',
        },
        body: JSON.stringify({
          model: promptModel,
          max_tokens: 800,
          messages: [
            { role: 'system', content: imagePromptSystem },
            { role: 'user', content: imagePromptUser },
          ],
        }),
      });

      if (!promptRes.ok) {
        const errBody = await promptRes.text().catch(() => '');
        throw new Error(`Image-prompt LLM HTTP ${promptRes.status}: ${errBody.slice(0, 200)}`);
      }

      const promptJson = await promptRes.json() as { choices: Array<{ message: { content: string } }> };
      let imagePrompt = (promptJson.choices?.[0]?.message?.content ?? '').trim();
      if (!imagePrompt) throw new Error('Image-prompt LLM returned empty content');

      imagePrompt = imagePrompt.replace(/\s+$/, '');
      if (!imagePrompt.endsWith('.')) imagePrompt += '.';
      imagePrompt += ' 16:9 landscape aspect ratio. Graphic design style only. No faces. No people. No text. No words. No letters. No watermarks. No stock photo look. No generic AI aesthetics. No purple gradients. No lens flare. No HDR overprocessing. No uncanny valley.';

      console.log(`[featured-image] submission=${submission_id} prompt="${imagePrompt}"`);

      // Image generation via OpenRouter (gemini 2.5 flash image)
      const genRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'https://www.submoacontent.com',
          'X-Title': 'SubMoa Content',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash-image-preview',
          modalities: ['image', 'text'],
          messages: [
            { role: 'user', content: imagePrompt },
          ],
        }),
      });

      if (!genRes.ok) {
        const errBody = await genRes.text().catch(() => '');
        throw new Error(`OpenRouter image-gen HTTP ${genRes.status}: ${errBody.slice(0, 300)}`);
      }

      const genJson = await genRes.json() as {
        choices: Array<{ message: { images?: Array<{ image_url?: { url?: string }; type?: string }> } }>;
      };

      const imageDataUrl = genJson.choices?.[0]?.message?.images?.[0]?.image_url?.url;
      if (!imageDataUrl) throw new Error('OpenRouter response missing images[0].image_url.url');

      // Parse data URL → mime + bytes
      const dataUrlMatch = imageDataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!dataUrlMatch) throw new Error('Image payload is not a base64 data URL');
      const mime = dataUrlMatch[1] || 'image/png';
      const b64 = dataUrlMatch[2];

      // base64 → ArrayBuffer
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const imgBuffer = bytes.buffer;

      const ext = mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'png';
      const filename = `featured-generated.${ext}`;
      const r2Key = `projects/${submission_id}/images/${filename}`;

      await env.SUBMOA_IMAGES.put(r2Key, imgBuffer, {
        httpMetadata: { contentType: mime },
        customMetadata: {
          submissionId: submission_id,
          prompt: imagePrompt.slice(0, 2000),
        },
      });

      await env.DB.prepare(
        `UPDATE submissions
           SET generated_image_key = ?,
               generated_image_prompt = ?,
               featured_image_filename = ?,
               updated_at = ?
         WHERE id = ?`
      ).bind(
        r2Key,
        imagePrompt,
        filename,
        Date.now(),
        submission_id
      ).run();

      await logApiUsage(env.DB, 'OpenRouter/gemini-2.5-flash-image', 0, 0, 0.003, submission.id);

      console.log(`[featured-image] submission=${submission_id} stored at ${r2Key} (${mime})`);
    } catch (e: any) {
      console.error(`[featured-image] Failed for ${submission_id}:`, e?.message ?? e);
      // Never block delivery on image failure
    }
  }

  // -------------------------------------------------------------------------
  // Step 8c — Write article HTML to project folder
  // (Full DOCX with grade info is written by packager.ts after grading)
  // -------------------------------------------------------------------------
  try {
    const articleHtml = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${
      escapeHtmlBasic(submission.topic)
    }</title></head><body>${articleBodyHtml}</body></html>`;
    await writeProjectFile(
      env as any, submission_id, "article", "article.html",
      articleHtml, "text/html"
    );
  } catch (e) {
    console.error(`[ProjectFolder] article.html write failed for ${submission_id}:`, e);
  }

  // -------------------------------------------------------------------------
  // Step 8b — TTS audio generation (if requested)
  // Uses OpenAI tts-1 via OpenRouter (same path as admin generate-audio endpoint).
  // Replaces the prior MeloTTS call which was returning empty audio under load.
  // -------------------------------------------------------------------------
  if (submission.generate_audio) {
    try {
      const input = stripHtmlForAudio(articleContent);
      if (!input) {
        console.error(`[TTS] Stripped content is empty for submission ${submission_id} — skipping TTS`);
      } else if (!env.OPENAI_API_KEY) {
        console.error(`[TTS] OPENAI_API_KEY not set — skipping TTS for ${submission_id}`);
      } else {
        const ttsRes = await fetch('https://api.openai.com/v1/audio/speech', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ model: 'tts-1', input, voice: 'alloy', response_format: 'mp3' }),
        });

        if (!ttsRes.ok) {
          const errBody = await ttsRes.text().catch(() => '');
          console.error(`[TTS] OpenAI HTTP ${ttsRes.status} for ${submission_id}: ${errBody.slice(0, 200)}`);
        } else {
          const audioBuffer = await ttsRes.arrayBuffer();
          if (!audioBuffer || audioBuffer.byteLength === 0) {
            console.error(`[TTS] OpenAI returned empty body for ${submission_id}`);
          } else {
            try {
              // Canonical path. Legacy `packages/` write was dropped in the
              // audio-path symmetry fix; the audio endpoint reads `projects/`
              // first and falls back to `packages/` only for unmigrated rows.
              await packageAudio(env as any, submission_id, audioBuffer);
              console.log(`[TTS] Audio generated and stored for submission ${submission_id} (${audioBuffer.byteLength} bytes)`);
            } catch (r2Err) {
              console.error(`[TTS] R2 put failed for submission ${submission_id}:`, r2Err);
            }
          }
        }
      }
    } catch (err) {
      console.error(`[TTS] Unexpected error for submission ${submission_id}:`, err);
      // Never block the pipeline on audio failure
    }
  }

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
// Basic HTML escaper for project folder filenames / titles
// ---------------------------------------------------------------------------
function escapeHtmlBasic(str: string): string {
  return (str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Strip HTML for TTS input
// ---------------------------------------------------------------------------
function stripHtmlForAudio(html: string): string {
  const TTS_CHAR_LIMIT = 4096; // OpenAI tts-1 hard cap per request
  const stripped = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (stripped.length > TTS_CHAR_LIMIT) {
    console.warn(`[TTS] Content truncated from ${stripped.length} to ${TTS_CHAR_LIMIT} chars`);
    return stripped.slice(0, TTS_CHAR_LIMIT);
  }
  return stripped;
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
  imageCount: number;
  revisionNotes: string | null;
}): string {
  const { skillContent, submission, keywordBlock, productBlock, imageCount, revisionNotes } = params;

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

    imageCount > 0
      ? `=== PRODUCT IMAGES ===\n${imageCount} product image(s) have been uploaded for this article. Place exactly ${imageCount} placeholder(s) in the format [IMAGE_1], [IMAGE_2], etc. at natural, high-impact positions in the article body (e.g., after the introduction or within a section where the product is directly discussed). Do NOT place an image placeholder inside the introduction paragraph itself.`
      : null,

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

    revisionNotes
      ? `=== REVISION INSTRUCTIONS FROM USER ===\n${revisionNotes}\n\nApply these changes in this generation. They override any conflicting defaults.`
      : null,

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
// System prompt selection per slot
// ---------------------------------------------------------------------------
function buildSystemPromptForSlot(
  slot: number,
  submission: { article_format: string; min_word_count: number; target_keywords: string | null }
): string | null {
  // Slot 1 — production default. Preserve exact current behavior: no system prompt,
  // the full brief is still delivered via the user message, unchanged.
  if (slot === 1) return null;

  // Slot 2 — Operator: direct, no hedging, adult themes allowed, no forced balance.
  if (slot === 2) {
    return [
      'You are a seasoned journalist with nothing to lose.',
      'Write with a direct, assertive voice. No hedging. No disclaimers. No forced balance.',
      'Adult themes and strong opinions are allowed when relevant to the topic.',
      'Do not soften claims with qualifiers like "some would argue" or "it may be worth considering".',
      'Do not append safety warnings, ethical caveats, or content advisories.',
      'State conclusions plainly. If the evidence points one way, say so.',
    ].join('\n');
  }

  // Slot 3 — No Limits: absolute-minimum system prompt. Format, word count,
  // and keywords only. Zero content restrictions.
  if (slot === 3) {
    const kw = (() => {
      if (!submission.target_keywords) return '';
      try {
        const p = JSON.parse(submission.target_keywords);
        return Array.isArray(p) ? p.join(', ') : String(submission.target_keywords);
      } catch {
        return String(submission.target_keywords);
      }
    })();
    const lines = [
      `Article format: ${submission.article_format}.`,
      `Minimum word count: ${submission.min_word_count}.`,
    ];
    if (kw) lines.push(`Keywords: ${kw}.`);
    return lines.join('\n');
  }

  return null;
}

// ---------------------------------------------------------------------------
// OpenRouter API call
// ---------------------------------------------------------------------------
async function callOpenRouter(
  prompt: string,
  apiKey: string,
  model: string,
  systemPrompt: string | null
): Promise<string> {
  const messages: Array<{ role: string; content: string }> = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: prompt });

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "HTTP-Referer": "https://www.submoacontent.com",
      "X-Title": "SubMoa Content",
    },
    body: JSON.stringify({
      model,
      max_tokens: 8192,
      messages,
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
