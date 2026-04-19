// GET /api/press-release — list press_releases for account.
// POST /api/press-release — create a draft row.
import { json, getSessionUser, generateId } from '../_utils';

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
      .prepare(`SELECT id, product_or_news, business_name, status, generated_content, author_id, created_at, updated_at
                FROM press_releases WHERE account_id = ? ORDER BY created_at DESC LIMIT 100`)
      .bind(accountId).all();
    return json({ press_releases: results || [] });
  }

  if (request.method === 'POST') {
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
    const id = generateId();
    await env.submoacontent_db.prepare(
      `INSERT INTO press_releases
        (id, account_id, product_or_news, links, business_name, business_location, business_website,
         cited_quotes, pr_contact, about_brand, emotional_context, brand_brief_r2_key,
         status, author_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, unixepoch(), unixepoch())`
    ).bind(
      id, accountId,
      String(body.product_or_news || '').slice(0, 2000),
      String(body.links || '').slice(0, 4000),
      String(body.business_name || '').slice(0, 200),
      String(body.business_location || '').slice(0, 200),
      String(body.business_website || '').slice(0, 400),
      String(body.cited_quotes || '').slice(0, 2000),
      String(body.pr_contact || '').slice(0, 1000),
      String(body.about_brand || '').slice(0, 2000),
      String(body.emotional_context || '').slice(0, 2000) || null,
      body.brand_brief_r2_key || null,
      body.author_id || null,
    ).run();
    const row = await env.submoacontent_db.prepare('SELECT * FROM press_releases WHERE id = ?').bind(id).first();
    return json({ press_release: row });
  }

  return json({ error: 'Method not allowed' }, 405);
}
