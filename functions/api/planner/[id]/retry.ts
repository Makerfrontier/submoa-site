// POST /api/planner/:id/retry
// Re-enqueues a failed itinerary plan generation. Only works when the row
// is in 'generation_failed' status. Reads situation/answers/recap/additions
// from the existing row (already persisted by the original generate call).

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
  if (!id) return json({ error: 'Missing id' }, 400);
  const account_id = user.account_id || 'makerfrontier';

  const row: any = await env.submoacontent_db.prepare(
    'SELECT id, status FROM itinerary_submissions WHERE id = ? AND account_id = ?'
  ).bind(id, account_id).first();
  if (!row) return json({ error: 'Not found' }, 404);

  if (row.status !== 'generation_failed') {
    return json({ error: `Cannot retry from status '${row.status}'` }, 400);
  }

  const now = Math.floor(Date.now() / 1000);
  await env.submoacontent_db.prepare(
    `UPDATE itinerary_submissions SET status = 'generating', error_detail = NULL, updated_at = ? WHERE id = ?`
  ).bind(now, id).run();

  if (!env.GENERATION_QUEUE) {
    await env.submoacontent_db.prepare(
      `UPDATE itinerary_submissions SET status = 'generation_failed', error_detail = 'Queue not bound', updated_at = ? WHERE id = ?`
    ).bind(now, id).run();
    return json({ error: 'Generation queue not bound' }, 500);
  }

  try {
    await env.GENERATION_QUEUE.send({
      type: 'itinerary_plan',
      itinerary_id: id,
      account_id,
      queued_at: now,
    });
  } catch (e: any) {
    await env.submoacontent_db.prepare(
      `UPDATE itinerary_submissions SET status = 'generation_failed', error_detail = ?, updated_at = ? WHERE id = ?`
    ).bind((e?.message ?? String(e)).slice(0, 500), now, id).run();
    return json({ error: 'Failed to enqueue', detail: e?.message ?? String(e) }, 500);
  }

  return json({ id, status: 'generating' });
}
