// GET /api/brief-builder — list briefs for account
// POST /api/brief-builder — create a draft row { brief_type, title, field_data, author_id? }
import { json, getSessionUser, generateId } from '../_utils';

const VALID_TYPES = new Set(['creative', 'strategy', 'content', 'project', 'brand', 'rfp']);

export async function onRequest(context: { request: Request; env: any }) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  }
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const accountId = user.account_id || 'makerfrontier';

  if (request.method === 'GET') {
    const { results } = await env.submoacontent_db
      .prepare(`SELECT id, brief_type, title, field_data, generated_content, status, author_id, created_at, updated_at
                FROM briefs WHERE account_id = ? ORDER BY created_at DESC LIMIT 100`)
      .bind(accountId).all();
    return json({ briefs: (results || []).map((r: any) => {
      let fd: any = {}; try { fd = r.field_data ? JSON.parse(r.field_data) : {}; } catch {}
      return { ...r, field_data: fd };
    }) });
  }

  if (request.method === 'POST') {
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
    const brief_type = String(body.brief_type || '').toLowerCase();
    if (!VALID_TYPES.has(brief_type)) return json({ error: 'Invalid brief_type' }, 400);
    const id = generateId();
    await env.submoacontent_db.prepare(
      `INSERT INTO briefs (id, account_id, brief_type, title, field_data, status, author_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'draft', ?, unixepoch(), unixepoch())`
    ).bind(
      id, accountId, brief_type,
      String(body.title || '').slice(0, 200),
      JSON.stringify(body.field_data || {}),
      body.author_id || null,
    ).run();
    const row = await env.submoacontent_db.prepare('SELECT * FROM briefs WHERE id = ?').bind(id).first();
    return json({ brief: row });
  }

  return json({ error: 'Method not allowed' }, 405);
}
