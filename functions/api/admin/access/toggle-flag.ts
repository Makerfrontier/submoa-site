// POST /api/admin/access/toggle-flag  { user_id, flag: 'super_admin' | 'intel_access', value: 0 | 1 }
// Super-admin only. Toggles a user boolean flag. Cannot modify another
// super_admin user or demote self.
import { getSessionUser, json } from '../../_utils';
import { requireSuperAdmin, writeAudit, AccessError, isSuperAdmin } from '../../../../src/auth-utils';

const ALLOWED = new Set(['super_admin', 'intel_access', 'admin']);

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
  const flag = String(body.flag || '');
  const value = body.value ? 1 : 0;
  if (!user_id) return json({ error: 'user_id required' }, 400);
  if (!ALLOWED.has(flag)) return json({ error: 'Unknown flag' }, 400);

  if (user_id === user.id && flag === 'super_admin') return json({ error: 'Cannot demote yourself' }, 400);

  // If target is another super_admin refuse.
  const target: any = await env.submoacontent_db
    .prepare('SELECT super_admin FROM users WHERE id = ?')
    .bind(user_id).first();
  if (!target) return json({ error: 'User not found' }, 404);
  if (Number(target.super_admin) === 1 && user_id !== user.id) {
    return json({ error: 'Cannot modify another super_admin' }, 403);
  }

  try {
    if (flag === 'admin') {
      // Sets role to admin or user.
      await env.submoacontent_db
        .prepare("UPDATE users SET role = CASE WHEN ? = 1 THEN 'admin' ELSE 'user' END, updated_at = ? WHERE id = ?")
        .bind(value, Date.now(), user_id).run();
    } else {
      const col = flag === 'super_admin' ? 'super_admin' : 'intel_access';
      await env.submoacontent_db
        .prepare(`UPDATE users SET ${col} = ?, updated_at = ? WHERE id = ?`)
        .bind(value, Date.now(), user_id).run();
    }
    await writeAudit(env, request, user.id, { action: 'user-flag-toggled', details: { target_user_id: user_id, flag, value } });
    return json({ success: true });
  } catch (e: any) {
    return json({ error: e?.message || 'Server error' }, 500);
  }
}
