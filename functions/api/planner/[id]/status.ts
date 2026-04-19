// GET /api/planner/:id/status
// Lightweight polling endpoint for the /planner/building/:id page. Returns
// just the status string so the client can transition without paying the
// cost of the full itinerary payload.

import { json, getSessionUser } from '../../_utils';

function parseId(pathname: string): string | null {
  const parts = pathname.split('/').filter(Boolean);
  const idx = parts.indexOf('planner');
  return idx >= 0 ? parts[idx + 1] ?? null : null;
}

export async function onRequest(context: any) {
  const { request, env } = context;
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);

  const url = new URL(request.url);
  const id = parseId(url.pathname);
  if (!id) return json({ error: 'Missing id' }, 400);
  const account_id = user.account_id || 'makerfrontier';

  const row: any = await env.submoacontent_db.prepare(
    'SELECT status, error_detail FROM itinerary_submissions WHERE id = ? AND account_id = ?'
  ).bind(id, account_id).first();
  if (!row) return json({ error: 'Not found' }, 404);

  return json({ id, status: row.status, error_detail: row.error_detail || null });
}
