import { getSessionUser, json } from '../../_utils';
import type { Env } from '../../_utils';

// GET    /api/atomic/comp/:id — full comp row
// PUT    /api/atomic/comp/:id — update name/blocks/brand/source_url
// DELETE /api/atomic/comp/:id — remove
export async function onRequest(context: { request: Request; env: Env; params: { id?: string } }) {
  const { request, env, params } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);
  const account_id = user.account_id || 'makerfrontier';

  const id = String(params.id || '');
  if (!id) return json({ error: 'Missing id' }, 400);

  const row: any = await env.submoacontent_db
    .prepare(`SELECT * FROM atomic_comp_drafts WHERE id = ? AND account_id = ?`)
    .bind(id, account_id).first();
  if (!row) return json({ error: 'Not found' }, 404);

  if (request.method === 'GET') {
    return json({
      ...row,
      blocks: safeParse(row.blocks_json, []),
      brand:  safeParse(row.brand_json, {}),
    });
  }

  if (request.method === 'PUT') {
    let body: any = {};
    try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

    const updates: string[] = [];
    const args: any[] = [];
    if (typeof body.name === 'string')       { updates.push('name = ?');        args.push(body.name.trim() || 'Untitled Comp'); }
    if ('source_url' in body)                { updates.push('source_url = ?');  args.push(body.source_url || null); }
    if (Array.isArray(body.blocks))          { updates.push('blocks_json = ?'); args.push(JSON.stringify(body.blocks)); }
    else if (typeof body.blocks_json === 'string') { updates.push('blocks_json = ?'); args.push(body.blocks_json); }
    if (body.brand && typeof body.brand === 'object') { updates.push('brand_json = ?'); args.push(JSON.stringify(body.brand)); }
    else if (typeof body.brand_json === 'string')     { updates.push('brand_json = ?'); args.push(body.brand_json); }

    if (updates.length === 0) return json({ error: 'No fields to update' }, 400);
    updates.push('updated_at = unixepoch()');

    try {
      await env.submoacontent_db
        .prepare(`UPDATE atomic_comp_drafts SET ${updates.join(', ')} WHERE id = ? AND account_id = ?`)
        .bind(...args, id, account_id)
        .run();
    } catch (err: any) {
      return json({ error: `DB update failed: ${err?.message || err}` }, 500);
    }

    const updated = await env.submoacontent_db
      .prepare(`SELECT * FROM atomic_comp_drafts WHERE id = ?`)
      .bind(id).first();
    return json({ comp: updated });
  }

  if (request.method === 'DELETE') {
    await env.submoacontent_db
      .prepare(`DELETE FROM atomic_comp_drafts WHERE id = ? AND account_id = ?`)
      .bind(id, account_id).run();
    return json({ ok: true });
  }

  return json({ error: 'Method not allowed' }, 405);
}

function safeParse(v: any, fallback: any): any {
  if (typeof v !== 'string') return fallback;
  try { return JSON.parse(v); } catch { return fallback; }
}
