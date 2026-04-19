// GET /api/access/my — returns the current user's effective page/action grants
// plus super_admin flag. Client uses this to filter the sidebar nav without
// hitting a DB round-trip per nav item.
import { getSessionUser, json } from '../_utils';
import { isSuperAdmin } from '../../../src/auth-utils';

export async function onRequest(context: { request: Request; env: any }) {
  const { request, env } = context;
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const user = await getSessionUser(request, env);
  if (!user) return json({ grants: [], super_admin: false }, 200);

  const superAdmin = await isSuperAdmin(env, user.id);
  if (superAdmin) {
    return json({ super_admin: true, grants: [], all_access: true });
  }

  try {
    const { results } = await env.submoacontent_db
      .prepare(
        `SELECT page_key, action_key FROM page_access
         WHERE user_id = ? AND granted = 1 AND revoked_at IS NULL`
      )
      .bind(user.id)
      .all();
    return json({
      super_admin: false,
      all_access: false,
      grants: (results || []).map((r: any) => ({ page_key: r.page_key, action_key: r.action_key })),
    });
  } catch (e: any) {
    return json({ error: e?.message || 'Server error' }, 500);
  }
}
