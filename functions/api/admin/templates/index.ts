import { getSessionUser, isAdmin, json, generateId } from '../../_utils';
import type { Env } from '../../_utils';

// GET  /api/admin/templates — list all templates (no html_content)
// POST /api/admin/templates — create new template, write html to R2, insert row
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
  if (!isAdmin(user)) return json({ error: 'Forbidden' }, 403);

  if (request.method === 'GET') {
    const { results } = await env.submoacontent_db
      .prepare(`SELECT id, name, description, category, r2_key, last_review, created_at, updated_at, stripped_at, account_id
                FROM html_templates
                ORDER BY category, name`)
      .all();
    return json({ templates: results || [] });
  }

  if (request.method === 'POST') {
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

    const name = String(body.name || '').trim();
    const description = String(body.description || '').trim();
    const category = String(body.category || 'general').trim();
    const html_content = String(body.html_content || '');

    if (!name) return json({ error: 'name is required' }, 400);
    if (!html_content) return json({ error: 'html_content is required' }, 400);

    const id = generateId();
    const r2Key = `templates/admin/${id}.html`;
    const now = Math.floor(Date.now() / 1000);
    const account_id = user.account_id || null;

    try {
      await env.SUBMOA_IMAGES.put(r2Key, html_content, {
        httpMetadata: { contentType: 'text/html; charset=utf-8' },
      });
    } catch (err: any) {
      return json({ error: `R2 write failed: ${err?.message || err}` }, 500);
    }

    try {
      await env.submoacontent_db
        .prepare(`INSERT INTO html_templates
                  (id, name, description, category, r2_key, created_at, updated_at, stripped_at, account_id)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(id, name, description, category, r2Key, now, now, now, account_id)
        .run();
    } catch (err: any) {
      return json({ error: `DB insert failed: ${err?.message || err}` }, 500);
    }

    const row = await env.submoacontent_db
      .prepare(`SELECT id, name, description, category, r2_key, last_review, created_at, updated_at, stripped_at, account_id
                FROM html_templates WHERE id = ?`)
      .bind(id).first();
    return json({ template: row });
  }

  return json({ error: 'Method not allowed' }, 405);
}
