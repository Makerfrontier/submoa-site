// GET /api/legislative/local/list — returns all local legislation rows for
// the caller's account. Used by the scope configuration panel.
import { getSessionUser, json } from '../../_utils';
import { requirePageAccess, AccessError } from '../../../../src/auth-utils';

export async function onRequest(context: { request: Request; env: any }) {
  const { request, env } = context;
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);
  try { await requirePageAccess(user, env, 'legislative-intelligence', 'view'); }
  catch (e: any) { return json({ error: e.message }, e instanceof AccessError ? e.status : 403); }

  const { results } = await env.submoacontent_db
    .prepare(`SELECT id, bill_id, title, sponsor_state, created_at
              FROM legislation WHERE bill_type = 'local' ORDER BY created_at DESC LIMIT 50`)
    .all();
  return json({ local: results || [] });
}
