// POST /api/admin/access/revoke  { user_id, page_key, action_key }
// Super-admin only. Sets revoked_at on an existing page_access row.
import { getSessionUser, json } from '../../_utils';
import { requireSuperAdmin, writeAudit, AccessError } from '../../../../src/auth-utils';

export async function onRequest(context: { request: Request; env: any }) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);

  try { await requireSuperAdmin(user, env); }
  catch (e: any) { return json({ error: e.message }, e instanceof AccessError ? e.status : 403); }

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const user_id = String(body.user_id || '').trim();
  const page_key = String(body.page_key || '').trim();
  const action_key = String(body.action_key || 'view').trim();
  if (!user_id || !page_key) return json({ error: 'user_id and page_key are required' }, 400);

  try {
    await env.submoacontent_db
      .prepare('UPDATE page_access SET revoked_at = unixepoch(), granted = 0 WHERE user_id = ? AND page_key = ? AND action_key = ?')
      .bind(user_id, page_key, action_key).run();
    await writeAudit(env, request, user.id, { action: 'access-revoked', details: { target_user_id: user_id, page_key, action_key } });
    return json({ success: true });
  } catch (e: any) {
    return json({ error: e?.message || 'Server error' }, 500);
  }
}
