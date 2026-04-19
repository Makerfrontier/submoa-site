// POST /api/planner/generate
// Enqueues plan generation on the submoa-generation-queue and returns immediately.
// The queue consumer performs the OpenRouter call (no 30s client timeout),
// writes plan_json / plan_html, and flips status to 'plan_ready' or
// 'generation_failed'. The client polls /api/planner/:id/status.

import { json, getSessionUser } from '../_utils';
export { renderPlanHtml } from '../../../src/planner-render';

export async function onRequest(context: any) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const { itinerary_id, situation, answers = {}, confirmed_recap = '', additions = [] } = body;
  if (!situation) return json({ error: 'situation required' }, 400);
  if (!itinerary_id) return json({ error: 'itinerary_id required' }, 400);

  const account_id = user.account_id || 'makerfrontier';

  // Confirm the row exists and belongs to this account before marking generating.
  const row: any = await env.submoacontent_db.prepare(
    'SELECT id FROM itinerary_submissions WHERE id = ? AND account_id = ?'
  ).bind(itinerary_id, account_id).first();
  if (!row) return json({ error: 'Itinerary not found' }, 404);

  const now = Math.floor(Date.now() / 1000);

  // Persist the generation inputs alongside the status flip so the consumer
  // can read them directly from the row — avoids a fat queue payload.
  await env.submoacontent_db.prepare(
    `UPDATE itinerary_submissions
       SET status = 'generating',
           situation = ?,
           clarifications = ?,
           recap = ?,
           additions = ?,
           updated_at = ?
     WHERE id = ?`
  ).bind(
    situation,
    JSON.stringify(answers ?? {}),
    confirmed_recap || null,
    JSON.stringify(Array.isArray(additions) ? additions : []),
    now,
    itinerary_id,
  ).run();

  if (!env.GENERATION_QUEUE) {
    // Fail fast and reflect the state rather than leaving the row stuck.
    await env.submoacontent_db.prepare(
      `UPDATE itinerary_submissions SET status = 'generation_failed', updated_at = ? WHERE id = ?`
    ).bind(now, itinerary_id).run();
    return json({ error: 'Generation queue not bound' }, 500);
  }

  try {
    await env.GENERATION_QUEUE.send({
      type: 'itinerary_plan',
      itinerary_id,
      account_id,
      queued_at: now,
    });
  } catch (e: any) {
    await env.submoacontent_db.prepare(
      `UPDATE itinerary_submissions SET status = 'generation_failed', updated_at = ? WHERE id = ?`
    ).bind(now, itinerary_id).run();
    return json({ error: 'Failed to enqueue generation', detail: e?.message ?? String(e) }, 500);
  }

  return json({ id: itinerary_id, status: 'generating' });
}
