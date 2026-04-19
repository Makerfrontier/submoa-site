// POST /api/admin/access/grant  { user_id, page_key, action_key }
// Super-admin only. Creates or re-enables a page_access row.
import { getSessionUser, json, generateId } from '../../_utils';
import { requireSuperAdmin, isValidPageAction, writeAudit, AccessError } from '../../../../src/auth-utils';

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
  if (!isValidPageAction(page_key, action_key)) return json({ error: `Unknown page/action: ${page_key}/${action_key}` }, 400);
  if (page_key === 'admin-users') return json({ error: 'admin-users is super-admin-only and cannot be granted' }, 400);

  try {
    // Upsert: if a row exists (possibly revoked), clear revoked_at and mark granted. Otherwise insert.
    const existing: any = await env.submoacontent_db
      .prepare('SELECT id FROM page_access WHERE user_id = ? AND page_key = ? AND action_key = ?')
      .bind(user_id, page_key, action_key).first();
    if (existing) {
      await env.submoacontent_db
        .prepare('UPDATE page_access SET granted = 1, revoked_at = NULL, granted_by = ?, granted_at = unixepoch() WHERE id = ?')
        .bind(user.id, existing.id).run();
    } else {
      await env.submoacontent_db
        .prepare('INSERT INTO page_access (id, user_id, page_key, action_key, granted, granted_by, granted_at) VALUES (?, ?, ?, ?, 1, ?, unixepoch())')
        .bind(generateId(), user_id, page_key, action_key, user.id).run();
    }
    await writeAudit(env, request, user.id, { action: 'access-granted', details: { target_user_id: user_id, page_key, action_key } });
    return json({ success: true });
  } catch (e: any) {
    return json({ error: e?.message || 'Server error' }, 500);
  }
}
