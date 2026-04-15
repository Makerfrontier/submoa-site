// POST   /api/admin/impersonate     — start impersonating a user (super_admin/admin only)
// DELETE /api/admin/impersonate     — stop impersonating
// GET    /api/admin/impersonate     — current impersonation state

import { json, getRealSessionUser, isAdmin } from '../_utils';

const COOKIE = 'submoa_impersonate';
const MAX_AGE = 60 * 60 * 4; // 4h safety cap

export async function onRequest(context: any) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  }

  const real = await getRealSessionUser(request, env);
  if (!real) return json({ error: 'Not authenticated' }, 401);
  if (!isAdmin(real)) return json({ error: 'Forbidden' }, 403);

  if (request.method === 'GET') {
    const cookie = request.headers.get('Cookie') || '';
    const m = cookie.match(/submoa_impersonate=([^;]+)/);
    return json({ impersonating: !!m, target_id: m ? decodeURIComponent(m[1]) : null });
  }

  if (request.method === 'POST') {
    let body: any; try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
    const targetId = body?.user_id;
    if (!targetId) return json({ error: 'user_id required' }, 400);
    if (targetId === real.id) return json({ error: 'Cannot impersonate yourself' }, 400);

    const target: any = await env.submoacontent_db
      .prepare('SELECT id, email, name, role FROM users WHERE id = ?')
      .bind(targetId).first();
    if (!target) return json({ error: 'User not found' }, 404);

    // Prevent escalation: non-super admins cannot impersonate super_admins.
    if (target.role === 'super_admin' && real.role !== 'super_admin') {
      return json({ error: 'Cannot impersonate a super admin' }, 403);
    }

    const cookie = `${COOKIE}=${encodeURIComponent(targetId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}; Secure`;
    return new Response(JSON.stringify({ ok: true, target: { id: target.id, name: target.name, email: target.email, role: target.role } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Set-Cookie': cookie },
    });
  }

  if (request.method === 'DELETE') {
    const cookie = `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure`;
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Set-Cookie': cookie },
    });
  }

  return json({ error: 'Method not allowed' }, 405);
}
