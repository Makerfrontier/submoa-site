import { json, getSessionUser } from '../../_utils';

// PATCH /api/notifications/:id — marks read (legacy)
// DELETE /api/notifications/:id — removes notification
export async function onRequest(context: { request: Request; env: any; params: { id?: string } }) {
  const { request, env, params } = context;
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'PATCH, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  }
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const accountId = user.account_id || 'makerfrontier';

  const id = String(params.id || '');
  if (!id) return json({ error: 'Notification ID required' }, 400);

  const notif: any = await env.submoacontent_db
    .prepare('SELECT id FROM notifications WHERE id = ? AND (user_id = ? OR account_id = ?)')
    .bind(id, user.id, accountId).first();
  if (!notif) return json({ error: 'Not found' }, 404);

  if (request.method === 'PATCH') {
    await env.submoacontent_db
      .prepare('UPDATE notifications SET is_read = 1, read = 1 WHERE id = ?')
      .bind(id).run();
    return json({ success: true });
  }

  if (request.method === 'DELETE') {
    await env.submoacontent_db.prepare('DELETE FROM notifications WHERE id = ?').bind(id).run();
    return json({ success: true });
  }

  return json({ error: 'Method not allowed' }, 405);
}
