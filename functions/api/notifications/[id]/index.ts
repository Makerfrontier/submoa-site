import { json, getSessionUser } from '../../_utils';

// PATCH /api/notifications/:id/read
export async function onRequest(context) {
  if (context.request.method !== 'PATCH') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const user = await getSessionUser(context.request, context.env);
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const id = context.params.id;
  if (!id) return json({ error: 'Notification ID required' }, 400);

  const notif = await context.env.submoacontent_db
    .prepare('SELECT id FROM notifications WHERE id = ? AND user_id = ?')
    .bind(id, user.id)
    .first();

  if (!notif) return json({ error: 'Not found' }, 404);

  await context.env.submoacontent_db
    .prepare('UPDATE notifications SET is_read = 1, updated_at = unixepoch() WHERE id = ?')
    .bind(id)
    .run();

  return json({ success: true });
}