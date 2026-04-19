// POST /api/infographic/requeue  { submission_id }
// Resets a failed or stuck infographic back to queued and re-enqueues the
// generation job. Owner-or-admin-only.
import { getSessionUser, isAdmin, json } from '../_utils';

export async function onRequest(context: { request: Request; env: any }) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const submissionId = String(body.submission_id || '').trim();
  if (!submissionId) return json({ error: 'submission_id required' }, 400);

  // Ownership check — the caller must own the submission OR be an admin.
  const sub: any = await env.submoacontent_db
    .prepare('SELECT id, user_id, article_format FROM submissions WHERE id = ?')
    .bind(submissionId).first();
  if (!sub) return json({ error: 'Submission not found' }, 404);
  if (sub.user_id !== user.id && !isAdmin(user)) return json({ error: 'Forbidden' }, 403);

  const infra: any = await env.submoacontent_db
    .prepare('SELECT id FROM infographic_submissions WHERE submission_id = ?')
    .bind(submissionId).first();
  if (!infra) return json({ error: 'Infographic record not found for this submission' }, 404);

  try {
    // Manual requeue by the owner/admin resets the attempt counter — they're
    // explicitly choosing to try again after a terminal failure.
    await env.submoacontent_db.prepare(
      `UPDATE infographic_submissions
         SET infographic_status = 'queued',
             generation_attempts = 0,
             error_message = NULL,
             updated_at = ?
       WHERE id = ?`
    ).bind(Date.now(), infra.id).run();
    await env.submoacontent_db.prepare(
      `UPDATE submissions SET status = 'queued', updated_at = ? WHERE id = ?`
    ).bind(Date.now(), submissionId).run();
  } catch (e: any) {
    return json({ error: `DB update failed: ${e?.message || e}` }, 500);
  }

  // Re-enqueue the job. Import is dynamic so the main bundle stays lean.
  try {
    const { enqueueGenerationJob } = await import('../queue-producer');
    await enqueueGenerationJob(env as any, submissionId);
  } catch (e: any) {
    // Leave the row in 'queued' but return a warning — the user can retry.
    return json({ success: true, requeued: false, warning: `Enqueue failed: ${e?.message || e}` });
  }

  return json({ success: true, requeued: true });
}
