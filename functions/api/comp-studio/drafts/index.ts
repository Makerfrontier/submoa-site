import { getSessionUser, json, generateId } from '../../_utils';
import type { Env } from '../../_utils';

// GET  /api/comp-studio/drafts         — list drafts for caller's account (no html_content)
// POST /api/comp-studio/drafts         — create a new draft
export async function onRequest(context: { request: Request; env: Env }) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);
  const account_id = user.account_id || 'makerfrontier';

  if (request.method === 'GET') {
    const { results } = await env.submoacontent_db
      .prepare(`SELECT id, account_id, name, category, source_url, status,
                       strip_stats, thumbnail_r2_key, created_at, updated_at
                FROM comp_studio_drafts
                WHERE account_id = ?
                ORDER BY updated_at DESC`)
      .bind(account_id)
      .all();
    return json({ drafts: results || [] });
  }

  if (request.method === 'POST') {
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

    const name = String(body.name || '').trim() || 'Untitled Comp';
    const category = String(body.category || 'general').trim();
    const source_url = body.source_url ? String(body.source_url) : null;
    const html_content = String(body.html_content || '');
    const session_changes = JSON.stringify(Array.isArray(body.session_changes) ? body.session_changes : []);
    const strip_stats = JSON.stringify(typeof body.strip_stats === 'object' && body.strip_stats ? body.strip_stats : {});

    if (!html_content) return json({ error: 'html_content is required' }, 400);

    const id = generateId();
    const now = Math.floor(Date.now() / 1000);
    try {
      await env.submoacontent_db
        .prepare(`INSERT INTO comp_studio_drafts
                  (id, account_id, name, category, source_url, html_content,
                   session_changes, strip_stats, status, thumbnail_r2_key,
                   created_at, updated_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', NULL, ?, ?)`)
        .bind(id, account_id, name, category, source_url, html_content,
              session_changes, strip_stats, now, now)
        .run();
    } catch (err: any) {
      return json({ error: `DB insert failed: ${err?.message || err}` }, 500);
    }

    const row = await env.submoacontent_db
      .prepare(`SELECT id, account_id, name, category, source_url, status,
                       strip_stats, thumbnail_r2_key, created_at, updated_at
                FROM comp_studio_drafts WHERE id = ?`)
      .bind(id).first();
    return json({ draft: row });
  }

  return json({ error: 'Method not allowed' }, 405);
}
