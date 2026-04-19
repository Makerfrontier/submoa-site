import { getSessionUser, isAdmin, json } from '../../_utils';
import type { Env } from '../../_utils';

// GET    /api/admin/templates/:id — row + html_content from R2
// PUT    /api/admin/templates/:id — partial update, overwrite R2 if html_content provided
// DELETE /api/admin/templates/:id — remove R2 object and row
export async function onRequest(context: { request: Request; env: Env; params: { id?: string } }) {
  const { request, env, params } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);
  if (!isAdmin(user)) return json({ error: 'Forbidden' }, 403);

  const id = String(params.id || '');
  if (!id) return json({ error: 'Missing template id' }, 400);

  const row: any = await env.submoacontent_db
    .prepare(`SELECT id, name, description, category, r2_key, last_review, created_at, updated_at, stripped_at, account_id
              FROM html_templates WHERE id = ?`)
    .bind(id).first();
  if (!row) return json({ error: 'Template not found' }, 404);

  if (request.method === 'GET') {
    let html_content = '';
    try {
      const obj = await env.SUBMOA_IMAGES.get(row.r2_key);
      if (obj) html_content = await obj.text();
    } catch {}
    return json({ ...row, html_content });
  }

  if (request.method === 'PUT') {
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

    const updates: string[] = [];
    const args: any[] = [];
    if (typeof body.name === 'string') { updates.push('name = ?'); args.push(body.name.trim()); }
    if (typeof body.description === 'string') { updates.push('description = ?'); args.push(body.description); }
    if (typeof body.category === 'string') { updates.push('category = ?'); args.push(body.category.trim()); }

    if (typeof body.html_content === 'string') {
      try {
        await env.SUBMOA_IMAGES.put(row.r2_key, body.html_content, {
          httpMetadata: { contentType: 'text/html; charset=utf-8' },
        });
      } catch (err: any) {
        return json({ error: `R2 write failed: ${err?.message || err}` }, 500);
      }
      updates.push('stripped_at = ?');
      args.push(Math.floor(Date.now() / 1000));
    }

    updates.push('updated_at = unixepoch()');
    if (updates.length === 1 && typeof body.html_content !== 'string') {
      return json({ error: 'No fields to update' }, 400);
    }

    try {
      await env.submoacontent_db
        .prepare(`UPDATE html_templates SET ${updates.join(', ')} WHERE id = ?`)
        .bind(...args, id)
        .run();
    } catch (err: any) {
      return json({ error: `DB update failed: ${err?.message || err}` }, 500);
    }

    const updated = await env.submoacontent_db
      .prepare(`SELECT id, name, description, category, r2_key, last_review, created_at, updated_at, stripped_at, account_id
                FROM html_templates WHERE id = ?`)
      .bind(id).first();
    return json({ template: updated });
  }

  if (request.method === 'DELETE') {
    try { await env.SUBMOA_IMAGES.delete(row.r2_key); } catch {}
    await env.submoacontent_db
      .prepare(`DELETE FROM html_templates WHERE id = ?`)
      .bind(id).run();
    return json({ success: true });
  }

  return json({ error: 'Method not allowed' }, 405);
}
