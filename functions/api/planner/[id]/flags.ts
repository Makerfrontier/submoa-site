// GET / POST /api/planner/:id/flags

import { json, getSessionUser, generateId } from '../../_utils';

function parseId(pathname: string): string | null {
  const parts = pathname.split('/').filter(Boolean);
  const idx = parts.indexOf('planner');
  return idx >= 0 ? parts[idx + 1] ?? null : null;
}

async function ownItinerary(env: any, id: string, account_id: string): Promise<boolean> {
  const row: any = await env.submoacontent_db.prepare(
    'SELECT id FROM itinerary_submissions WHERE id = ? AND account_id = ?'
  ).bind(id, account_id).first();
  return !!row;
}

export async function onRequest(context: any) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  }

  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);

  const url = new URL(request.url);
  const id = parseId(url.pathname);
  if (!id) return json({ error: 'Missing itinerary id' }, 400);
  const account_id = user.account_id || 'makerfrontier';

  if (!(await ownItinerary(env, id, account_id))) return json({ error: 'Not found' }, 404);

  if (request.method === 'GET') {
    const { results } = await env.submoacontent_db.prepare(
      `SELECT id, section_id, section_title, selected_text, comment, flag_type, status, created_at
       FROM itinerary_flags WHERE itinerary_id = ? ORDER BY created_at ASC`
    ).bind(id).all();
    return json({ flags: results ?? [] });
  }

  if (request.method === 'POST') {
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
    const { section_id, section_title = null, selected_text = null, comment, flag_type = 'edit' } = body;
    if (!section_id) return json({ error: 'section_id required' }, 400);
    if (!comment || !String(comment).trim()) return json({ error: 'comment required' }, 400);

    const flagId = generateId();
    await env.submoacontent_db.prepare(
      `INSERT INTO itinerary_flags
         (id, itinerary_id, section_id, section_title, selected_text, comment, flag_type, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)`
    ).bind(flagId, id, section_id, section_title, selected_text, comment, flag_type, Math.floor(Date.now() / 1000)).run();

    const flag = await env.submoacontent_db.prepare(
      'SELECT * FROM itinerary_flags WHERE id = ?'
    ).bind(flagId).first();

    return json({ flag });
  }

  return json({ error: 'Method not allowed' }, 405);
}
