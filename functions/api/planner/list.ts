// GET /api/planner/list
// Returns all itinerary_submissions for the caller's account, for dashboard rendering.

import { json, getSessionUser } from '../_utils';

export async function onRequest(context: any) {
  const { request, env } = context;
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);

  const account_id = user.account_id || 'makerfrontier';
  const { results } = await env.submoacontent_db.prepare(
    `SELECT id, title, status, pdf_r2_key,
            (plan_json IS NOT NULL) AS has_plan,
            created_at, updated_at
     FROM itinerary_submissions
     WHERE account_id = ?
     ORDER BY created_at DESC
     LIMIT 20`
  ).bind(account_id).all();

  return json({ itineraries: results ?? [] });
}
