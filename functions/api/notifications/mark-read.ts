// POST /api/notifications/mark-read  { notification_id? }
// Marks a single notification or all the caller's notifications read.
import { json, getSessionUser } from '../_utils';

export async function onRequest(context: { request: Request; env: any }) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const accountId = user.account_id || 'makerfrontier';

  let body: any = {};
  try { body = await request.json(); } catch {}
  const id = body.notification_id ? String(body.notification_id) : null;

  try {
    if (id) {
      await env.submoacontent_db
        .prepare(`UPDATE notifications SET read = 1, is_read = 1 WHERE id = ? AND (user_id = ? OR account_id = ?)`)
        .bind(id, user.id, accountId).run();
    } else {
      await env.submoacontent_db
        .prepare(`UPDATE notifications SET read = 1, is_read = 1 WHERE user_id = ? OR account_id = ?`)
        .bind(user.id, accountId).run();
    }
    return json({ success: true });
  } catch (e: any) {
    return json({ error: e?.message || 'Server error' }, 500);
  }
}
