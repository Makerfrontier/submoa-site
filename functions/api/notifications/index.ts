import { json, getSessionUser } from '../_utils';

// GET /api/notifications — list user's notifications
// PUT /api/notifications/:id — mark as read
// PUT /api/notifications — mark all as read
export async function onRequest(context) {
  const { env } = context;
  const url = new URL(context.request.url);

  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  const user = await getSessionUser(context.request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);

  // GET /api/notifications — list
  if (context.request.method === 'GET') {
    const unreadOnly = url.searchParams.get('unread') === 'true';
    const limit = parseInt(url.searchParams.get('limit') || '20');

    try {
      let stmt;
      if (unreadOnly) {
        stmt = env.submoacontent_db.prepare(`
          SELECT id, type, message, link, is_read, created_at
          FROM notifications
          WHERE user_id = ? AND is_read = 0
          ORDER BY created_at DESC
          LIMIT ?
        `);
      } else {
        stmt = env.submoacontent_db.prepare(`
          SELECT id, type, message, link, is_read, created_at
          FROM notifications
          WHERE user_id = ?
          ORDER BY created_at DESC
          LIMIT ?
        `);
      }
      stmt = stmt.bind(user.id, limit);
      const results = await stmt.all();

      // Get unread count
      const unreadCount = await env.submoacontent_db
        .prepare('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0')
        .bind(user.id).first();

      return json({
        notifications: results.results || [],
        unreadCount: unreadCount?.count || 0,
      });
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  }

  // PUT /api/notifications — mark all read
  if (context.request.method === 'PUT' && url.pathname.endsWith('/notifications')) {
    try {
      await env.submoacontent_db
        .prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0')
        .bind(user.id).run();
      return json({ ok: true });
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  }

  // PUT /api/notifications/:id — mark single read
  if (context.request.method === 'PUT') {
    const id = url.pathname.split('/').filter(Boolean)[3]; // api/notifications/id
    if (!id) return json({ error: 'Missing notification id' }, 400);

    try {
      await env.submoacontent_db
        .prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?')
        .bind(id, user.id).run();
      return json({ ok: true });
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  }

  return json({ error: 'Method not allowed' }, 405);
}
