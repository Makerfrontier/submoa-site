import { json, getSessionUser } from '../../_utils';

// PATCH /api/notifications/read-all
export async function onRequest(context) {
  const user = await getSessionUser(context.request, context.env);
  if (!user) return json({ error: 'Unauthorized' }, 401);

  if (context.request.method === 'PATCH') {
    await context.env.submoacontent_db
      .prepare('UPDATE notifications SET is_read = 1, updated_at = unixepoch() WHERE user_id = ? AND is_read = 0')
      .bind(user.id)
      .run();
    return json({ success: true });
  }

  return json({ error: 'Method not allowed' }, 405);
}