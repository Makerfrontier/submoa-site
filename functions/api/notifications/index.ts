import { json, getSessionUser } from '../_utils';

// GET /api/notifications — list notifications for current user
export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  const user = await getSessionUser(context.request, context.env);
  if (!user) return json({ error: 'Unauthorized' }, 401);

  if (context.request.method === 'GET') {
    const notifications = await context.env.submoacontent_db
      .prepare('SELECT id, message, link, is_read, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 10')
      .bind(user.id)
      .all();

    const unreadRow = await context.env.submoacontent_db
      .prepare('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0')
      .bind(user.id)
      .first();

    return json({
      notifications: notifications.results,
      unread_count: unreadRow?.count ?? 0
    });
  }

  return json({ error: 'Method not allowed' }, 405);
}