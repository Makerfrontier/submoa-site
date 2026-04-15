// POST /api/planner/save-draft
// Creates an itinerary_submissions row before plan generation so we have an id.

import { json, getSessionUser, generateId } from '../_utils';

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
  const { situation, clarifications = null, recap = null, title = null } = body;
  if (!situation) return json({ error: 'situation required' }, 400);

  const account_id = user.account_id || 'makerfrontier';
  const id = generateId();
  const plannedTitle = title || (situation.toString().slice(0, 80));

  await env.submoacontent_db.prepare(
    `INSERT INTO itinerary_submissions
       (id, account_id, title, situation, clarifications, recap, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?)`
  ).bind(
    id, account_id, plannedTitle, situation,
    clarifications ? (typeof clarifications === 'string' ? clarifications : JSON.stringify(clarifications)) : null,
    recap || null,
    Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)
  ).run();

  return json({ id });
}
