// GET  /api/legislative/openstates-config — list caller's configured states
// POST /api/legislative/openstates-config  { state_code, state_name, include_local?, enabled? }
// DELETE /api/legislative/openstates-config?state_code=XX
import { getSessionUser, json, generateId } from '../_utils';
import { requirePageAccess, AccessError } from '../../../src/auth-utils';

export async function onRequest(context: { request: Request; env: any }) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  }
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);
  try { await requirePageAccess(user, env, 'legislative-intelligence', 'view'); }
  catch (e: any) { return json({ error: e.message }, e instanceof AccessError ? e.status : 403); }

  if (request.method === 'GET') {
    const { results } = await env.submoacontent_db
      .prepare('SELECT state_code, state_name, include_local, enabled FROM openstates_config WHERE user_id = ? ORDER BY state_code')
      .bind(user.id).all();
    return json({ states: results || [] });
  }

  if (request.method === 'POST') {
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
    const state_code = String(body.state_code || '').toUpperCase().slice(0, 2);
    const state_name = String(body.state_name || '').slice(0, 80);
    if (!/^[A-Z]{2}$/.test(state_code) || !state_name) return json({ error: 'state_code (2 chars) and state_name required' }, 400);
    const include_local = body.include_local ? 1 : 0;
    const enabled = body.enabled === false ? 0 : 1;

    try {
      const existing: any = await env.submoacontent_db
        .prepare('SELECT id FROM openstates_config WHERE user_id = ? AND state_code = ?')
        .bind(user.id, state_code).first();
      if (existing) {
        await env.submoacontent_db
          .prepare('UPDATE openstates_config SET enabled = ?, include_local = ?, state_name = ? WHERE id = ?')
          .bind(enabled, include_local, state_name, existing.id).run();
      } else {
        await env.submoacontent_db
          .prepare('INSERT INTO openstates_config (id, user_id, state_code, state_name, include_local, enabled) VALUES (?, ?, ?, ?, ?, ?)')
          .bind(generateId(), user.id, state_code, state_name, include_local, enabled).run();
      }
      return json({ success: true });
    } catch (e: any) {
      return json({ error: e?.message || 'Server error' }, 500);
    }
  }

  if (request.method === 'DELETE') {
    const url = new URL(request.url);
    const code = (url.searchParams.get('state_code') || '').toUpperCase();
    if (!code) return json({ error: 'state_code required' }, 400);
    await env.submoacontent_db
      .prepare('DELETE FROM openstates_config WHERE user_id = ? AND state_code = ?')
      .bind(user.id, code).run();
    return json({ success: true });
  }

  return json({ error: 'Method not allowed' }, 405);
}
