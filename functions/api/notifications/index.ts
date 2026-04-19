import { json, getSessionUser } from '../_utils';

// GET /api/notifications — list notifications for current user / account.
// Returns the new-schema fields (title, body, link, read, created_at) while
// still supporting legacy rows (message, is_read) via COALESCE so the UI
// sees a single consistent shape.
export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  const user = await getSessionUser(context.request, context.env);
  if (!user) return json({ error: 'Unauthorized' }, 401);

  if (context.request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const accountId = user.account_id || 'makerfrontier';
  const notifications = await context.env.submoacontent_db
    .prepare(
      `SELECT id, type,
              COALESCE(title, message) AS title,
              body,
              COALESCE(message, title) AS message,
              link,
              COALESCE(read, is_read, 0) AS read,
              COALESCE(read, is_read, 0) AS is_read,
              created_at
       FROM notifications
       WHERE user_id = ? OR account_id = ?
       ORDER BY created_at DESC LIMIT 50`
    )
    .bind(user.id, accountId)
    .all();

  const unreadRow = await context.env.submoacontent_db
    .prepare(
      `SELECT COUNT(*) AS count FROM notifications
       WHERE (user_id = ? OR account_id = ?)
         AND COALESCE(read, is_read, 0) = 0`
    )
    .bind(user.id, accountId)
    .first();

  return json({
    notifications: notifications.results || [],
    unread_count: unreadRow?.count ?? 0,
    items: notifications.results || [], // legacy alias for NotificationBell
  });
}
