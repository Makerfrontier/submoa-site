// /api/submissions/:id/share — GET list, POST create, DELETE revoke share links.

import { json, getSessionUser, isAdmin, generateId } from '../../_utils';

const EXPIRY_SECONDS = 60 * 60 * 24 * 7; // 7 days

function parseSubmissionId(pathname: string): string | null {
  const parts = pathname.split('/').filter(Boolean);
  const idx = parts.indexOf('submissions');
  return idx >= 0 ? parts[idx + 1] ?? null : null;
}

async function checkOwnership(env: any, id: string, user: any): Promise<boolean> {
  if (isAdmin(user)) {
    const r: any = await env.submoacontent_db.prepare('SELECT id FROM submissions WHERE id = ?').bind(id).first();
    return !!r;
  }
  const r: any = await env.submoacontent_db.prepare(
    'SELECT id FROM submissions WHERE id = ? AND account_id = ?'
  ).bind(id, user.account_id || 'makerfrontier').first();
  return !!r;
}

function buildShareUrl(request: Request, token: string): string {
  const url = new URL(request.url);
  return `${url.origin}/share/${token}`;
}

export async function onRequest(context: any) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  }

  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);

  const url = new URL(request.url);
  const id = parseSubmissionId(url.pathname);
  if (!id) return json({ error: 'Missing submission id' }, 400);

  if (!(await checkOwnership(env, id, user))) return json({ error: 'Not found' }, 404);

  if (request.method === 'GET') {
    const { results } = await env.submoacontent_db.prepare(
      `SELECT id, token, expires_at, created_at
       FROM share_links WHERE submission_id = ? AND expires_at > unixepoch()
       ORDER BY created_at DESC`
    ).bind(id).all();
    const links = (results ?? []).map((r: any) => ({
      ...r,
      share_url: buildShareUrl(request, r.token),
    }));
    return json({ links });
  }

  if (request.method === 'POST') {
    const token = crypto.randomUUID().replace(/-/g, '');
    const linkId = generateId();
    const expires_at = Math.floor(Date.now() / 1000) + EXPIRY_SECONDS;
    await env.submoacontent_db.prepare(
      `INSERT INTO share_links (id, submission_id, token, expires_at, created_at)
       VALUES (?, ?, ?, ?, unixepoch())`
    ).bind(linkId, id, token, expires_at).run();
    return json({ id: linkId, token, expires_at, share_url: buildShareUrl(request, token) });
  }

  if (request.method === 'DELETE') {
    const token = url.searchParams.get('token');
    if (!token) return json({ error: 'token required' }, 400);
    await env.submoacontent_db.prepare(
      'DELETE FROM share_links WHERE token = ? AND submission_id = ?'
    ).bind(token, id).run();
    return json({ ok: true });
  }

  return json({ error: 'Method not allowed' }, 405);
}
