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
    `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0a1a0a;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a1a0a;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="padding:0 0 32px 0;text-align:center;border-bottom:1px solid #1e3a1e;">
          <div style="font-family:Georgia,serif;font-size:28px;font-weight:700;color:#ffffff;">SubMoa</div>
          <div style="font-family:sans-serif;font-size:11px;color:#5a7a5a;letter-spacing:.1em;text-transform:uppercase;margin-top:4px;">Content Platform</div>
        </td></tr>
        <tr><td style="padding:40px 0;">
          <div style="font-family:Georgia,serif;font-size:22px;color:#ffffff;margin-bottom:16px;">Brief received.</div>
          <div style="font-family:sans-serif;font-size:15px;color:#8aaa8a;line-height:1.7;margin-bottom:24px;">
            Your brief has been received and queued for generation. We'll notify you the moment your article is ready.
          </div>
          <div style="background:#0f200f;border:0.5px solid #1e3a1e;border-radius:6px;padding:16px 20px;margin-bottom:32px;">
            <div style="font-family:sans-serif;font-size:11px;color:#5a7a5a;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;">Article</div>
            <div style="font-family:Georgia,serif;font-size:16px;color:#ffffff;">${submission.title}</div>
          </div>
          <table cellpadding="0" cellspacing="0">
            <tr><td style="border-radius:5px;background:#c8973a;">
              <a href="https://www.submoacontent.com/dashboard" style="display:inline-block;padding:12px 28px;font-family:sans-serif;font-size:13px;font-weight:600;color:#000000;text-decoration:none;">
                View Dashboard
              </a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:24px 0 0 0;border-top:1px solid #1e3a1e;text-align:center;">
          <div style="font-family:sans-serif;font-size:11px;color:#3a5a3a;">SubMoa Content · submoacontent.com</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
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
    `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0a1a0a;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a1a0a;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="padding:0 0 32px 0;text-align:center;border-bottom:1px solid #1e3a1e;">
          <div style="font-family:Georgia,serif;font-size:28px;font-weight:700;color:#ffffff;">SubMoa</div>
          <div style="font-family:sans-serif;font-size:11px;color:#5a7a5a;letter-spacing:.1em;text-transform:uppercase;margin-top:4px;">Content Platform</div>
        </td></tr>
        <tr><td style="padding:40px 0;">
          <div style="font-family:Georgia,serif;font-size:22px;color:#ffffff;margin-bottom:8px;">Your article is ready.</div>
          <div style="font-family:sans-serif;font-size:15px;color:#8aaa8a;line-height:1.7;margin-bottom:24px;">
            Your article has been generated and graded. Download your complete package from the dashboard.
          </div>
          <div style="background:#0f200f;border:0.5px solid #1e3a1e;border-radius:6px;padding:16px 20px;margin-bottom:24px;">
            <div style="font-family:sans-serif;font-size:11px;color:#5a7a5a;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;">Article</div>
            <div style="font-family:Georgia,serif;font-size:16px;color:#ffffff;margin-bottom:12px;">${submission.title}</div>
            <div style="font-family:sans-serif;font-size:13px;color:#5a7a5a;">
              Overall score: <span style="color:${submission.overall_score >= 80 ? '#5ab85a' : submission.overall_score >= 65 ? '#d4a85a' : '#d45a5a'};font-weight:600;">${submission.overall_score}/100</span>
            </div>
          </div>
          <table cellpadding="0" cellspacing="0" style="margin-bottom:12px;">
            <tr><td style="border-radius:5px;background:#c8973a;">
              <a href="https://www.submoacontent.com/dashboard" style="display:inline-block;padding:12px 28px;font-family:sans-serif;font-size:13px;font-weight:600;color:#000000;text-decoration:none;">
                Download Article
              </a>
            </td></tr>
          </table>
          <table cellpadding="0" cellspacing="0">
            <tr><td style="border-radius:5px;border:0.5px solid #1e3a1e;">
              <a href="https://www.submoacontent.com/content/${submission.id}" style="display:inline-block;padding:12px 28px;font-family:sans-serif;font-size:13px;color:#8aaa8a;text-decoration:none;">
                View Rendered Article
              </a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:24px 0 0 0;border-top:1px solid #1e3a1e;text-align:center;">
          <div style="font-family:sans-serif;font-size:11px;color:#3a5a3a;">SubMoa Content · submoacontent.com</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
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
