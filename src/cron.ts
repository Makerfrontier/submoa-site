// src/cron.ts — updated
// Adds packaging sweep after grading sweep
// Every 10 minutes:
//   1. Grade all article_done + ungraded submissions
//   2. Package all passed + unpackaged submissions
//   3. Detect stale generations

import { runGradingPipeline } from './routes/grade';
import { packageArticle, findUnpackagedArticles } from './packager';
import {
  notifyGradingComplete,
  emailArticleReady,
} from './notifications';

interface Env {
  submoacontent_db: D1Database;
  SUBMOA_IMAGES: R2Bucket;
  DISCORD_BOT_TOKEN: string;
  RESEND_API_KEY: string;
  COPYLEAKS_API_KEY?: string;
  LANGUAGETOOL_API_KEY?: string;
  OPENROUTER_API_KEY: string;
  APP_URL?: string;
  GENERATION_QUEUE?: Queue;
}

const STALE_GENERATION_MS = 30 * 60 * 1000;
const DISCORD_CHANNEL_ID = '1493283525795905557';

export default {
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext) {
    console.log('Cron fired:', new Date().toISOString());

    await Promise.all([
      resetStuckGrading(env),
      processUngradedArticles(env),
      processUnpackagedArticles(env),
      detectStaleGenerations(env),
      sweepStuckInfographics(env),
    ]);
  },
};

// ---------------------------------------------------------------------------
// Infographic stuck-sweep — auto-requeue up to MAX_ATTEMPTS, then terminal fail
// ---------------------------------------------------------------------------
const INFOGRAPHIC_STUCK_MS = 15 * 60 * 1000;
const INFOGRAPHIC_MAX_ATTEMPTS = 3;

async function sweepStuckInfographics(env: Env): Promise<void> {
  const cutoff = Date.now() - INFOGRAPHIC_STUCK_MS;
  const { results } = await env.submoacontent_db.prepare(
    `SELECT id, submission_id, generation_attempts
       FROM infographic_submissions
      WHERE infographic_status IN ('generating', 'rendering', 'queued')
        AND COALESCE(updated_at, created_at) < ?`
  ).bind(cutoff).all<any>().catch(() => ({ results: [] }));

  const stuck = results || [];
  if (stuck.length === 0) return;
  console.log(`[cron/infographic-sweep] detected ${stuck.length} stuck infographic(s)`);

  const now = Date.now();
  for (const row of stuck) {
    const attempts = Number(row.generation_attempts || 0);
    if (attempts >= INFOGRAPHIC_MAX_ATTEMPTS) {
      try {
        await env.submoacontent_db.prepare(
          `UPDATE infographic_submissions SET infographic_status='generation_failed', error_message=?, updated_at=? WHERE id=?`
        ).bind(`Generation failed after ${attempts} attempts (timeout)`, now, row.id).run();
        await env.submoacontent_db.prepare(
          `UPDATE submissions SET status='generation_failed', updated_at=? WHERE id=?`
        ).bind(now, row.submission_id).run();
        console.warn(`[cron/infographic-sweep] submission=${row.submission_id} attempts=${attempts} → marked failed`);
      } catch (e) {
        console.error('[cron/infographic-sweep] terminal update failed:', e);
      }
      continue;
    }

    try {
      await env.submoacontent_db.prepare(
        `UPDATE infographic_submissions SET infographic_status='queued', generation_attempts=COALESCE(generation_attempts,0)+1, error_message=NULL, updated_at=? WHERE id=?`
      ).bind(now, row.id).run();
      await env.submoacontent_db.prepare(
        `UPDATE submissions SET status='queued', updated_at=? WHERE id=?`
      ).bind(now, row.submission_id).run();
      if (env.GENERATION_QUEUE) {
        await env.GENERATION_QUEUE.send({ submission_id: row.submission_id, type: 'generation_job', queued_at: now });
      }
      console.log(`[cron/infographic-sweep] submission=${row.submission_id} attempt=${attempts + 1}/${INFOGRAPHIC_MAX_ATTEMPTS} → requeued`);
    } catch (e: any) {
      console.error(`[cron/infographic-sweep] requeue failed for ${row.submission_id}:`, e?.message || e);
    }
  }
}

// Reset submissions stuck in grade_status='grading' for >15 minutes so the
// next sweep picks them up again.
async function resetStuckGrading(env: Env): Promise<void> {
  const cutoff = Date.now() - 15 * 60 * 1000;
  const stuckGrading = await env.submoacontent_db.prepare(
    "SELECT id FROM submissions WHERE grade_status = 'grading' AND updated_at < ? LIMIT 10"
  ).bind(cutoff).all<{ id: string }>().catch(() => ({ results: [] as { id: string }[] }));

  for (const sub of stuckGrading.results) {
    await env.submoacontent_db.prepare(
      "UPDATE submissions SET grade_status = 'ungraded', updated_at = ? WHERE id = ?"
    ).bind(Date.now(), sub.id).run().catch(err => console.error(`Watchdog reset failed for ${sub.id}:`, err));
  }
}

// ---------------------------------------------------------------------------
// 1. Grading sweep
// ---------------------------------------------------------------------------
async function processUngradedArticles(env: Env): Promise<void> {
  const { results } = await env.submoacontent_db.prepare(
    `SELECT s.id, s.topic, s.author,
            ap.name as author_display_name,
            u.email as author_email
     FROM submissions s
     LEFT JOIN author_profiles ap ON s.author = ap.slug
     LEFT JOIN users u ON ap.account_id = u.account_id
     WHERE s.status = 'article_done'
     AND s.grade_status = 'ungraded'
     AND s.id NOT IN (
       SELECT id FROM submissions WHERE status = 'article_done' AND grade_status = 'grading'
     )
     ORDER BY s.created_at ASC`
  ).all<any>().catch(() => ({ results: [] }));

  if (results.length === 0) return;
  console.log(`Grading ${results.length} ungraded article(s)`);

  for (const sub of results) {
    try {
      const { grade } = await runGradingPipeline(env, sub.id);
      const authorName = sub.author_display_name ?? sub.author;

      // Every article gets graded — no status-based branching
      const gradeRecord = await env.submoacontent_db.prepare(
        `SELECT grammar_score, readability_score, ai_detection_score,
                plagiarism_score, seo_score, overall_score
         FROM grades WHERE submission_id = ? ORDER BY graded_at DESC LIMIT 1`
      ).bind(sub.id).first<any>().catch(() => null);

      if (gradeRecord?.overall_score != null) {
        await notifyGradingComplete(env, {
          id: sub.id,
          title: sub.topic,
          author_display_name: authorName,
          overall_score: gradeRecord.overall_score,
        });

        if (sub.author_email) {
          await emailArticleReady(env, sub.author_email, {
            id: sub.id,
            title: sub.topic,
            overall_score: gradeRecord.overall_score,
          });
        }
      }
    } catch (err) {
      console.error(`Grading error for ${sub.id}:`, err);
    }
  }
}

// ---------------------------------------------------------------------------
// 2. Packaging sweep — runs after grading
// ---------------------------------------------------------------------------
async function processUnpackagedArticles(env: Env): Promise<void> {
  const ids = await findUnpackagedArticles(env).catch(() => []);

  if (ids.length === 0) return;
  console.log(`Packaging ${ids.length} article(s)`);

  // Run sequentially to avoid overwhelming R2
  for (const id of ids) {
    try {
      await packageArticle(env, id);
      console.log(`Packaged submission ${id}`);
    } catch (err) {
      console.error(`Packaging error for ${id}:`, err);
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Stale detection
// ---------------------------------------------------------------------------
async function detectStaleGenerations(env: Env): Promise<void> {
  const cutoff = Date.now() - STALE_GENERATION_MS;

  const { results } = await env.submoacontent_db.prepare(
    `SELECT id, topic, updated_at
     FROM submissions
     WHERE status = 'generating'
     AND updated_at < ?
     ORDER BY updated_at ASC`
  ).bind(cutoff).all<any>().catch(() => ({ results: [] }));

  if (results.length === 0) return;

  console.warn(`${results.length} stale generation(s) detected`);

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
    ].join('\n');

    await fetch(`https://discord.com/api/v10/channels/${DISCORD_CHANNEL_ID}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content: message }),
    }).catch(err => console.error('Discord stale alert failed:', err));
  }
}
