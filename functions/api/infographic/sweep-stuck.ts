// POST /api/infographic/sweep-stuck  (auth required; internal/admin)
//
// Detects infographic_submissions stuck in a non-terminal status for longer
// than STUCK_TIMEOUT_MS and either:
//   - auto-requeues them (incrementing generation_attempts) if they haven't
//     hit MAX_ATTEMPTS yet
//   - marks them 'generation_failed' with a terminal error_message once
//     they have
//
// Safe to call any time. Also called by the cron worker (src/cron.ts).
import { getSessionUser, json } from '../_utils';

const STUCK_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes since last update
const MAX_ATTEMPTS = 3;

export async function runInfographicSweep(env: any): Promise<{ requeued: number; failed: number; total: number }> {
  const cutoff = Date.now() - STUCK_TIMEOUT_MS;
  const { results } = await env.submoacontent_db.prepare(
    `SELECT id, submission_id, generation_attempts, infographic_status, COALESCE(updated_at, created_at) AS last_ts
       FROM infographic_submissions
      WHERE infographic_status IN ('generating', 'rendering', 'queued')
        AND COALESCE(updated_at, created_at) < ?`
  ).bind(cutoff).all();

  const stuck = (results || []) as any[];
  let requeued = 0;
  let failed = 0;
  const now = Date.now();

  for (const row of stuck) {
    const attempts = Number(row.generation_attempts || 0);
    if (attempts >= MAX_ATTEMPTS) {
      // Terminal failure — do not requeue again.
      try {
        await env.submoacontent_db.prepare(
          `UPDATE infographic_submissions
             SET infographic_status = 'generation_failed',
                 error_message = ?,
                 updated_at = ?
           WHERE id = ?`
        ).bind(`Generation failed after ${attempts} attempts (timeout)`, now, row.id).run();
        await env.submoacontent_db.prepare(
          `UPDATE submissions SET status = 'generation_failed', updated_at = ? WHERE id = ?`
        ).bind(now, row.submission_id).run();
        failed++;
        console.warn(`[infographic/sweep] submission=${row.submission_id} attempts=${attempts} → marked failed`);
      } catch (e) {
        console.error('[infographic/sweep] terminal update failed:', e);
      }
      continue;
    }

    // Auto-requeue. Increment attempt count BEFORE re-enqueuing so a race
    // doesn't let it go beyond MAX_ATTEMPTS.
    try {
      await env.submoacontent_db.prepare(
        `UPDATE infographic_submissions
           SET infographic_status = 'queued',
               generation_attempts = COALESCE(generation_attempts, 0) + 1,
               error_message = NULL,
               updated_at = ?
         WHERE id = ?`
      ).bind(now, row.id).run();
      await env.submoacontent_db.prepare(
        `UPDATE submissions SET status = 'queued', updated_at = ? WHERE id = ?`
      ).bind(now, row.submission_id).run();

      // Dynamic import — keeps the Pages bundle lean when the endpoint isn't hit.
      const { enqueueGenerationJob } = await import('../queue-producer');
      await enqueueGenerationJob(env, row.submission_id);
      requeued++;
      console.log(`[infographic/sweep] submission=${row.submission_id} attempt=${attempts + 1}/${MAX_ATTEMPTS} → requeued`);
    } catch (e: any) {
      console.error(`[infographic/sweep] requeue failed for ${row.submission_id}:`, e?.message || e);
    }
  }

  return { requeued, failed, total: stuck.length };
}

export async function onRequest(context: { request: Request; env: any }) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);

  try {
    const summary = await runInfographicSweep(env);
    return json({ success: true, ...summary });
  } catch (e: any) {
    return json({ error: e?.message || 'Server error' }, 500);
  }
}
