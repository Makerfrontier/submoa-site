// GET /api/legislative/flags?brief_id=X
// POST /api/legislative/flags  { brief_id, selected_text, comment, flag_type, section_reference, char_offset_start, char_offset_end }
import { getSessionUser, json, generateId } from '../../_utils';
import { requirePageAccess, writeAudit, AccessError } from '../../../../src/auth-utils';

const ALLOWED_TYPES = new Set(['investigate', 'fact-check', 'talking-point', 'question']);

export async function onRequest(context: { request: Request; env: any }) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  }
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);
  try { await requirePageAccess(user, env, 'legislative-intelligence', 'view'); }
  catch (e: any) { return json({ error: e.message }, e instanceof AccessError ? e.status : 403); }

  if (request.method === 'GET') {
    const url = new URL(request.url);
    const briefId = url.searchParams.get('brief_id');
    if (!briefId) return json({ error: 'brief_id required' }, 400);
    const { results } = await env.submoacontent_db
      .prepare('SELECT * FROM legislative_flags WHERE brief_id = ? ORDER BY created_at ASC')
      .bind(briefId).all();
    return json({ flags: results || [] });
  }

  if (request.method === 'POST') {
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
    const brief_id = String(body.brief_id || '').trim();
    const selected_text = String(body.selected_text || '').trim().slice(0, 2000);
    const comment = String(body.comment || '').trim().slice(0, 2000);
    const flag_type = String(body.flag_type || 'investigate');
    if (!brief_id || !selected_text) return json({ error: 'brief_id and selected_text required' }, 400);
    if (!ALLOWED_TYPES.has(flag_type)) return json({ error: 'Invalid flag_type' }, 400);

    const id = generateId();
    try {
      await env.submoacontent_db.prepare(
        `INSERT INTO legislative_flags
          (id, brief_id, user_id, selected_text, comment, flag_type, section_reference,
           char_offset_start, char_offset_end, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())`
      ).bind(
        id, brief_id, user.id, selected_text, comment, flag_type,
        body.section_reference || null,
        body.char_offset_start ?? null, body.char_offset_end ?? null,
        flag_type === 'talking-point' ? 'saved' : 'open',
      ).run();
    } catch (e: any) {
      return json({ error: e?.message || 'Insert failed' }, 500);
    }

    await writeAudit(env, request, user.id, { action: 'flag-created', brief_id, details: { flag_type, id } });
    const flag = await env.submoacontent_db.prepare('SELECT * FROM legislative_flags WHERE id = ?').bind(id).first();
    return json({ flag });
  }

  return json({ error: 'Method not allowed' }, 405);
}
