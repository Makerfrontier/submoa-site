// GET /api/submissions/:id/reviews
// Returns revision_reviews rows for a submission (review page data source).

import { json, getSessionUser, isAdmin } from '../../_utils';

function parseSubmissionId(pathname: string): string | null {
  const parts = pathname.split('/').filter(Boolean);
  const idx = parts.indexOf('submissions');
  return idx >= 0 ? parts[idx + 1] ?? null : null;
}

export async function onRequest(context: any) {
  const { request, env } = context;
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);

  const url = new URL(request.url);
  const submissionId = parseSubmissionId(url.pathname);
  if (!submissionId) return json({ error: 'Missing submission id' }, 400);

  const sub: any = await env.submoacontent_db.prepare(
    'SELECT id, user_id FROM submissions WHERE id = ?'
  ).bind(submissionId).first();
  if (!sub) return json({ error: 'Submission not found' }, 404);
  if (sub.user_id !== user.id && !isAdmin(user)) return json({ error: 'Forbidden' }, 403);

  const { results } = await env.submoacontent_db.prepare(
    `SELECT rr.id, rr.flag_id, rr.original_text, rr.context_buffer, rr.finding,
            rr.option_remove, rr.option_a, rr.option_b, rr.chosen_option, rr.created_at
     FROM revision_reviews rr
     WHERE rr.submission_id = ? AND rr.chosen_option IS NULL
     ORDER BY rr.created_at ASC`
  ).bind(submissionId).all();

  return json({ reviews: results ?? [] });
}
