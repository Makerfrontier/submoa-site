// GET /api/admin/access/matrix — super_admin only.
// Returns: users[] + grants[] (per user, all active rows) + PAGE_KEYS schema.
import { getSessionUser, json } from '../../_utils';
import { requireSuperAdmin, PAGE_KEYS, AccessError } from '../../../../src/auth-utils';

export async function onRequest(context: { request: Request; env: any }) {
  const { request, env } = context;
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);
  try { await requireSuperAdmin(user, env); }
  catch (e: any) { return json({ error: e.message }, e instanceof AccessError ? e.status : 403); }

  try {
    const users = await env.submoacontent_db
      .prepare('SELECT id, email, name, role, super_admin, intel_access, created_at FROM users ORDER BY created_at ASC')
      .all();
    const grants = await env.submoacontent_db
      .prepare('SELECT id, user_id, page_key, action_key, granted, granted_by, granted_at, revoked_at FROM page_access WHERE granted = 1 AND revoked_at IS NULL')
      .all();
    return json({
      users: users.results || [],
      grants: grants.results || [],
      page_keys: PAGE_KEYS,
    });
  } catch (e: any) {
    return json({ error: e?.message || 'Server error' }, 500);
  }
}
