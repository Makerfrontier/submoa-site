// src/cron.ts
// Cloudflare Scheduled Worker — runs on a cron schedule
// Finds article_done + ungraded submissions, triggers grading, sends notifications
// Also detects stale generations and alerts Discord

import { runGradingPipeline } from "./routes/grade";
import {
  notifyGradingPassed,
  notifyNeedsReview,
  emailArticleReady,
} from "./notifications";

interface Env {
  DB: D1Database;
  DISCORD_BOT_TOKEN: string;
  RESEND_API_KEY: string;
  COPYLEAKS_API_KEY?: string;
  LANGUAGETOOL_API_KEY?: string;
  DISCORD_WEBHOOK_URL?: string;
  APP_URL?: string;
  AI: Ai;
}

// How long (ms) before a 'generating' submission is considered stale
const STALE_GENERATION_MS = 30 * 60 * 1000; // 30 minutes

export default {
  // ---------------------------------------------------------------------------
  // Scheduled handler — Cloudflare calls this on the cron schedule
  // ---------------------------------------------------------------------------
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext) {
    await Promise.all([
      processUngradedArticles(env),
      detectStaleGenerations(env),
    ]);
  },
};

// ---------------------------------------------------------------------------
// Find article_done + ungraded submissions and run grading
// ---------------------------------------------------------------------------
async function processUngradedArticles(env: Env): Promise<void> {
  const { results } = await env.DB.prepare(
    `SELECT s.id, s.topic, s.author,
            ap.name as author_display_name,
            u.email as author_email
     FROM submissions s
     LEFT JOIN author_profiles ap ON s.author = ap.slug
     LEFT JOIN users u ON ap.account_id = u.account_id
     WHERE s.status = 'article_done'
     AND s.grade_status = 'ungraded'
     ORDER BY s.created_at ASC`
  ).all<{
    id: string;
    topic: string;
    author: string;
    author_display_name: string | null;
    author_email: string | null;
  }>();

  if (results.length === 0) return;

  console.log(`Cron: found ${results.length} ungraded article(s) to process`);

  // Run sequentially — avoid hammering external grading APIs in parallel
  for (const sub of results) {
    try {
      console.log(`Cron: grading submission ${sub.id} — "${sub.topic}"`);

      const { grade } = await runGradingPipeline(env, sub.id);
      const status = (grade as { status: string }).status;
      const overallScore = (grade as { overall_score: number }).overall_score;
      const authorName = sub.author_display_name ?? sub.author;

      if (status === "passed") {
        // Discord notification
        await notifyGradingPassed(env, {
          id: sub.id,
          topic: sub.topic,
          author_display_name: authorName,
          overall_score: overallScore,
        });

        // User email
        if (sub.author_email) {
          await emailArticleReady(env, sub.author_email, {
            id: sub.id,
            topic: sub.topic,
            overall_score: overallScore,
          });
        }
      } else if (status === "needs_review") {
        // Fetch full scores for the Discord alert
        const gradeRecord = await env.DB.prepare(
          `SELECT grammar_score, readability_score, ai_detection_score,
                  plagiarism_score, seo_score, overall_score
           FROM grades WHERE submission_id = ? ORDER BY graded_at DESC LIMIT 1`
        )
          .bind(sub.id)
          .first<{
            grammar_score: number | null;
            readability_score: number | null;
            ai_detection_score: number | null;
            plagiarism_score: number | null;
            seo_score: number | null;
            overall_score: number | null;
          }>();

        await notifyNeedsReview(
          env,
          { id: sub.id, topic: sub.topic, author_display_name: authorName },
          {
            grammar: gradeRecord?.grammar_score ?? null,
            readability: gradeRecord?.readability_score ?? null,
            ai_detection: gradeRecord?.ai_detection_score ?? null,
            plagiarism: gradeRecord?.plagiarism_score ?? null,
            seo: gradeRecord?.seo_score ?? null,
            overall: gradeRecord?.overall_score ?? null,
          }
        );
        // No user email — admin resolves needs_review before user is notified
      }
    } catch (err) {
      console.error(`Cron: error grading submission ${sub.id}:`, err);
    }
  }
}

// ---------------------------------------------------------------------------
// Detect submissions stuck in 'generating' for too long
// ---------------------------------------------------------------------------
async function detectStaleGenerations(env: Env): Promise<void> {
  const cutoff = Date.now() - STALE_GENERATION_MS;

  const { results } = await env.DB.prepare(
    `SELECT id, topic, updated_at
     FROM submissions
     WHERE status = 'generating'
     AND updated_at < ?
     ORDER BY updated_at ASC`
  )
    .bind(cutoff)
    .all<{ id: string; topic: string; updated_at: number }>();

  if (results.length === 0) return;

  console.warn(`Cron: ${results.length} stale generation(s) detected`);

  for (const sub of results) {
    const staleMinutes = Math.round((Date.now() - sub.updated_at) / 60000);

    const message = [
      `⚠️ **STALE GENERATION** — Sydney may be stuck`,
      ``,
      `**Title:** ${sub.topic}`,
      `**Stuck for:** ${staleMinutes} minutes`,
      `**Submission ID:** \`${sub.id}\``,
      ``,
      `Check Sydney and requeue if needed.`,
    ].join("\n");

    await fetch(
      `https://discord.com/api/v10/channels/1493283525795905557/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content: message }),
      }
    );
  }
}
