// POST /api/planner/:id/approve
// Marks itinerary as approved and enqueues PDF generation on the main generation queue.

import { json, getSessionUser } from '../../_utils';

function parseId(pathname: string): string | null {
  const parts = pathname.split('/').filter(Boolean);
  const idx = parts.indexOf('planner');
  return idx >= 0 ? parts[idx + 1] ?? null : null;
}

export async function onRequest(context: any) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);

  const url = new URL(request.url);
  const id = parseId(url.pathname);
  if (!id) return json({ error: 'Missing itinerary id' }, 400);
  const account_id = user.account_id || 'makerfrontier';

  const row: any = await env.submoacontent_db.prepare(
    'SELECT id FROM itinerary_submissions WHERE id = ? AND account_id = ?'
  ).bind(id, account_id).first();
  if (!row) return json({ error: 'Not found' }, 404);

  await env.submoacontent_db.prepare(
    "UPDATE itinerary_submissions SET status = 'approved', updated_at = ? WHERE id = ?"
  ).bind(Math.floor(Date.now() / 1000), id).run();

  try {
    await env.GENERATION_QUEUE.send({
      type: 'itinerary_pdf',
      itinerary_id: id,
      account_id,
      queued_at: Date.now(),
    });
  } catch (e: any) {
    console.error('[planner/approve] queue.send failed:', e?.message ?? e);
    return json({ error: 'Queue send failed', detail: e?.message ?? String(e) }, 500);
  }

  return json({ ok: true });
}
