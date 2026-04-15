// GET /api/planner/:id — returns an itinerary (used by PlannerDetail).

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
    'SELECT * FROM itinerary_submissions WHERE id = ? AND account_id = ?'
  ).bind(id, account_id).first();
  if (!row) return json({ error: 'Not found' }, 404);

  try { row.plan_json = row.plan_json ? JSON.parse(row.plan_json) : null; } catch {}
  try { row.revised_plan_json = row.revised_plan_json ? JSON.parse(row.revised_plan_json) : null; } catch {}
  try { row.additions = row.additions ? JSON.parse(row.additions) : []; } catch { row.additions = []; }

  return json({ itinerary: row });
}
