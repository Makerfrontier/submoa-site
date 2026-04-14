// src/notifications.ts
// Discord + Resend notification service for SubMoa Content pipeline events

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const DISCORD_CHANNEL_ID = "1493283525795905557";

interface Env {
  DISCORD_BOT_TOKEN: string;
  RESEND_API_KEY: string;
  APP_URL?: string; // e.g. https://www.submoacontent.com
}

// ---------------------------------------------------------------------------
// Discord — post to channel
// ---------------------------------------------------------------------------
async function postToDiscord(token: string, content: string): Promise<void> {
  const res = await fetch(
    `https://discord.com/api/v10/channels/${DISCORD_CHANNEL_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    console.error("Discord notification failed:", res.status, err);
  }
}

// ---------------------------------------------------------------------------
// Discord message templates
// ---------------------------------------------------------------------------

// Called immediately when a brief is submitted.
// Sydney reads this, pulls submission by ID from DB, pulls skill from agent_skills.
export async function notifyBriefSubmitted(
  env: Env,
  submission: {
    id: string;
    title: string;
    author_display_name: string;
    article_format: string;
    optimization_target: string;
  }
): Promise<void> {
  const message = [
    `📋 **NEW BRIEF** — ready for generation`,
    ``,
    `**Title:** ${submission.title}`,
    `**Author:** ${submission.author_display_name}`,
    `**Format:** ${submission.article_format}`,
    `**Optimization:** ${submission.optimization_target}`,
    ``,
    `**Submission ID:** \`${submission.id}\``,
    ``,
    `Sydney — retrieve this brief from the database:`,
    `\`SELECT * FROM submissions WHERE id = '${submission.id}'\``,
    ``,
    `Retrieve the writing skill before generating:`,
    `\`SELECT content FROM agent_skills WHERE name = 'writing-skill' AND active = 1 LIMIT 1\``,
    ``,
    `Generate the article and post back to this channel when complete.`,
  ].join("\n");

  await postToDiscord(env.DISCORD_BOT_TOKEN, message);
}

// Called when grading passes.
export async function notifyGradingPassed(
  env: Env,
  submission: {
    id: string;
    title: string;
    author_display_name: string;
    overall_score: number;
  }
): Promise<void> {
  const message = [
    `✅ **ARTICLE READY** — graded`,
    ``,
    `**Title:** ${submission.title}`,
    `**Author:** ${submission.author_display_name}`,
    `**Overall Score:** ${submission.overall_score}/100`,
    ``,
    `Submission ID: \`${submission.id}\``,
    `Dashboard: ${env.APP_URL ?? "https://www.submoacontent.com"}/dashboard`,
  ].join("\n");

  await postToDiscord(env.DISCORD_BOT_TOKEN, message);
}

// Called when every article completes grading — no pass/fail gate
export async function notifyGradingComplete(
  env: Env,
  submission: {
    id: string;
    title: string;
    author_display_name: string;
    overall_score: number;
  }
): Promise<void> {
  const message = [
    `✅ **ARTICLE READY** — grading complete`,
    ``,
    `**Title:** ${submission.title}`,
    `**Author:** ${submission.author_display_name}`,
    `**Overall Score:** ${submission.overall_score}/100`,
    ``,
    `Submission ID: \`${submission.id}\``,
    `Dashboard: ${env.APP_URL ?? "https://www.submoacontent.com"}/dashboard`,
  ].join("\n");

  await postToDiscord(env.DISCORD_BOT_TOKEN, message);
}

// Called when grading fails after max rewrite attempts.
export async function notifyNeedsReview(
  env: Env,
  submission: {
    id: string;
    title: string;
    author_display_name: string;
  },
  scores: {
    grammar: number | null;
    readability: number | null;
    ai_detection: number | null;
    plagiarism: number | null;
    seo: number | null;
    overall: number | null;
  }
): Promise<void> {
  const message = [
    `🚨 **NEEDS REVIEW** — grading failed after 2 rewrite attempts`,
    ``,
    `**Title:** ${submission.title}`,
    `**Author:** ${submission.author_display_name}`,
    ``,
    `| Category    | Score | Min |`,
    `|-------------|-------|-----|`,
    `| Grammar     | ${scores.grammar ?? "N/A"}   | 85  |`,
    `| Readability | ${scores.readability ?? "N/A"}   | 70  |`,
    `| AI Detect   | ${scores.ai_detection ?? "N/A"}   | 80  |`,
    `| Plagiarism  | ${scores.plagiarism ?? "N/A"}   | 90  |`,
    `| SEO         | ${scores.seo ?? "N/A"}   | 70  |`,
    `| **Overall** | **${scores.overall ?? "N/A"}** | **80** |`,
    ``,
    `Submission ID: \`${submission.id}\``,
    `Dashboard: ${env.APP_URL ?? "https://www.submoacontent.com"}/dashboard`,
  ].join("\n");

  await postToDiscord(env.DISCORD_BOT_TOKEN, message);
}

// Called when Sydney finishes generating (before grading starts).
export async function notifyGenerationComplete(
  env: Env,
  submission: {
    id: string;
    title: string;
    author_display_name: string;
    word_count?: number;
  }
): Promise<void> {
  const message = [
    `✍️ **GENERATION COMPLETE** — grading starting`,
    ``,
    `**Title:** ${submission.title}`,
    `**Author:** ${submission.author_display_name}`,
    submission.word_count ? `**Word Count:** ${submission.word_count}` : null,
    ``,
    `Submission ID: \`${submission.id}\``,
  ]
    .filter(Boolean)
    .join("\n");

  await postToDiscord(env.DISCORD_BOT_TOKEN, message);
}

// ---------------------------------------------------------------------------
// Resend — user emails
// ---------------------------------------------------------------------------
async function sendEmail(
  apiKey: string,
  to: string,
  subject: string,
  html: string
): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "SubMoa Content <notifications@submoacontent.com>",
      to,
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Resend email failed:", res.status, err);
  }
}

// Email: brief received confirmation
export async function emailBriefReceived(
  env: Env,
  to: string,
  submission: {
    id: string;
    title: string;
  }
): Promise<void> {
  await sendEmail(
    env.RESEND_API_KEY,
    to,
    `Brief received — ${submission.title}`,
    `
    <p>Your brief has been received and is queued for generation.</p>
    <p><strong>${submission.title}</strong></p>
    <p>We'll email you when your article is ready to download.</p>
    <p><a href="https://www.submoacontent.com/dashboard">View your dashboard</a></p>
    `
  );
}

// Email: article ready to download
export async function emailArticleReady(
  env: Env,
  to: string,
  submission: {
    id: string;
    title: string;
    overall_score: number;
  }
): Promise<void> {
  await sendEmail(
    env.RESEND_API_KEY,
    to,
    `Your article is ready — ${submission.title}`,
    `
    <p>Your article has been generated and graded.</p>
    <p><strong>${submission.title}</strong></p>
    <p>Overall Score: <strong>${submission.overall_score}/100</strong></p>
    <p><a href="https://www.submoacontent.com/dashboard">Download your article</a></p>
    `
  );
}

// Email: article published confirmation
export async function emailArticlePublished(
  env: Env,
  to: string,
  submission: {
    id: string;
    title: string;
  }
): Promise<void> {
  await sendEmail(
    env.RESEND_API_KEY,
    to,
    `Published — ${submission.title}`,
    `
    <p>Your article has been marked as published.</p>
    <p><strong>${submission.title}</strong></p>
    <p><a href="https://www.submoacontent.com/dashboard">View your dashboard</a></p>
    `
  );
}
