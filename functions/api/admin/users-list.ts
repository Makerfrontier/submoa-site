// GET /api/admin/users-list?q=<search>
// Lightweight user picker feed for admin impersonation UI.

import { json, getRealSessionUser, isAdmin } from '../_utils';

export async function onRequest(context: any) {
  const { request, env } = context;
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const user = await getRealSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);
  if (!isAdmin(user)) return json({ error: 'Forbidden' }, 403);

  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim().toLowerCase();

  let stmt;
  if (q) {
    const like = `%${q}%`;
    stmt = env.submoacontent_db.prepare(
      'SELECT id, email, name, role, account_id FROM users WHERE lower(email) LIKE ? OR lower(name) LIKE ? ORDER BY name ASC LIMIT 50'
    ).bind(like, like);
  } else {
    stmt = env.submoacontent_db.prepare(
      'SELECT id, email, name, role, account_id FROM users ORDER BY name ASC LIMIT 50'
    );
  }
  const { results } = await stmt.all();
  return json({ users: (results ?? []).filter((u: any) => u.id !== user.id) });
}
