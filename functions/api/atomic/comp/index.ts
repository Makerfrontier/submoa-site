import { getSessionUser, json, generateId } from '../../_utils';
import type { Env } from '../../_utils';

// GET  /api/atomic/comp          — list comps for caller's account
// POST /api/atomic/comp          — create a new empty comp
export async function onRequest(context: { request: Request; env: Env }) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
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
      .prepare(`SELECT id, name, source_url, share_token, share_enabled,
                       created_at, updated_at
                FROM atomic_comp_drafts
                WHERE account_id = ?
                ORDER BY updated_at DESC`)
      .bind(account_id)
      .all();
    return json({ comps: results || [] });
  }

  if (request.method === 'POST') {
    let body: any = {};
    try { body = await request.json(); } catch {}

    const name = String(body.name || '').trim() || 'Untitled Comp';
    const blocks_json = typeof body.blocks_json === 'string' ? body.blocks_json
      : JSON.stringify(Array.isArray(body.blocks) ? body.blocks : []);
    const brand_json  = typeof body.brand_json  === 'string' ? body.brand_json
      : JSON.stringify(body.brand && typeof body.brand === 'object' ? body.brand : {});
    const source_url  = body.source_url ? String(body.source_url) : null;

    const id = generateId();
    const now = Math.floor(Date.now() / 1000);
    try {
      await env.submoacontent_db
        .prepare(`INSERT INTO atomic_comp_drafts
                  (id, account_id, name, blocks_json, brand_json, source_url,
                   share_token, share_enabled, created_at, updated_at)
                  VALUES (?, ?, ?, ?, ?, ?, NULL, 0, ?, ?)`)
        .bind(id, account_id, name, blocks_json, brand_json, source_url, now, now)
        .run();
    } catch (err: any) {
      return json({ error: `DB insert failed: ${err?.message || err}` }, 500);
    }

    const row = await env.submoacontent_db
      .prepare(`SELECT id, name, source_url, share_token, share_enabled,
                       created_at, updated_at
                FROM atomic_comp_drafts WHERE id = ?`)
      .bind(id).first();
    return json({ comp: row });
  }

  return json({ error: 'Method not allowed' }, 405);
}
