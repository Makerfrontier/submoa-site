import { getSessionUser, json } from '../../_utils';
import type { Env } from '../../_utils';

// GET    /api/comp-studio/drafts/:id — full draft row including html_content
// PUT    /api/comp-studio/drafts/:id — update any provided fields, bump updated_at
// DELETE /api/comp-studio/drafts/:id — remove row (and thumbnail R2 object if set)
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
  const account_id = user.account_id || 'makerfrontier';

  const id = String(params.id || '');
  if (!id) return json({ error: 'Missing draft id' }, 400);

  const row: any = await env.submoacontent_db
    .prepare(`SELECT * FROM comp_studio_drafts WHERE id = ? AND account_id = ?`)
    .bind(id, account_id).first();
  if (!row) return json({ error: 'Draft not found' }, 404);

  if (request.method === 'GET') {
    // Hydrate html_content from R2 when new-style storage is in use. Old
    // rows still carry the HTML inline in the D1 column, so fall through to
    // row.html_content in that case.
    let html_content: string = typeof row.html_content === 'string' ? row.html_content : '';
    if (row.html_r2_key) {
      try {
        const obj = await env.SUBMOA_IMAGES.get(row.html_r2_key as string);
        if (obj) html_content = await obj.text();
      } catch {}
    }
    return json({
      ...row,
      html_content,
      session_changes: safeParse(row.session_changes, []),
      strip_stats: safeParse(row.strip_stats, {}),
    });
  }

  if (request.method === 'PUT') {
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

    const updates: string[] = [];
    const args: any[] = [];
    if (typeof body.name === 'string')        { updates.push('name = ?');         args.push(body.name.trim()); }
    if (typeof body.category === 'string')    { updates.push('category = ?');     args.push(body.category.trim()); }
    if ('source_url' in body)                 { updates.push('source_url = ?');   args.push(body.source_url || null); }
    if (typeof body.html_content === 'string') {
      // Write HTML to R2 under a stable per-draft key; keep the D1 column
      // blank so we don't hit the row size limit on large pages.
      const html_r2_key = (row.html_r2_key as string | null)
        || `comp-studio/${account_id}/drafts/${id}/content.html`;
      try {
        await env.SUBMOA_IMAGES.put(html_r2_key, body.html_content, {
          httpMetadata: { contentType: 'text/html; charset=utf-8' },
        });
      } catch (err: any) {
        return json({ error: `R2 write failed: ${err?.message || err}` }, 500);
      }
      updates.push('html_r2_key = ?'); args.push(html_r2_key);
      updates.push('html_content = ?'); args.push('');
    }
    if (Array.isArray(body.session_changes))  { updates.push('session_changes = ?'); args.push(JSON.stringify(body.session_changes)); }
    if (typeof body.strip_stats === 'object' && body.strip_stats) {
      updates.push('strip_stats = ?'); args.push(JSON.stringify(body.strip_stats));
    }
    if (typeof body.status === 'string')      { updates.push('status = ?');       args.push(body.status.trim()); }

    if (updates.length === 0) return json({ error: 'No fields to update' }, 400);
    updates.push('updated_at = unixepoch()');

    try {
      await env.submoacontent_db
        .prepare(`UPDATE comp_studio_drafts SET ${updates.join(', ')}
                  WHERE id = ? AND account_id = ?`)
        .bind(...args, id, account_id)
        .run();
    } catch (err: any) {
      return json({ error: `DB update failed: ${err?.message || err}` }, 500);
    }

    const updated = await env.submoacontent_db
      .prepare(`SELECT id, account_id, name, category, source_url, status,
                       strip_stats, thumbnail_r2_key, created_at, updated_at
                FROM comp_studio_drafts WHERE id = ?`)
      .bind(id).first();
    return json({ draft: updated });
  }

  if (request.method === 'DELETE') {
    if (row.thumbnail_r2_key) {
      try { await env.SUBMOA_IMAGES.delete(row.thumbnail_r2_key); } catch {}
    }
    if (row.html_r2_key) {
      try { await env.SUBMOA_IMAGES.delete(row.html_r2_key); } catch {}
    }
    await env.submoacontent_db
      .prepare(`DELETE FROM comp_studio_drafts WHERE id = ? AND account_id = ?`)
      .bind(id, account_id).run();
    return json({ success: true });
  }

  return json({ error: 'Method not allowed' }, 405);
}

function safeParse(v: any, fallback: any): any {
  if (typeof v !== 'string') return fallback;
  try { return JSON.parse(v); } catch { return fallback; }
}
