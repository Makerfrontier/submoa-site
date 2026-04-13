import { json, getSessionUser } from '../_utils';

// PUT /api/user/settings — update user settings (e.g. quality threshold)
export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  const user = await getSessionUser(context.request, context.env);
  if (!user) return json({ error: 'Unauthorized' }, 401);

  if (context.request.method === 'GET') {
    try {
      const row = await context.env.submoacontent_db
        .prepare('SELECT user_quality_threshold FROM users WHERE id = ?')
        .bind(user.id)
        .first();
      return json({ user_quality_threshold: row?.user_quality_threshold ?? 85 });
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  }

  if (context.request.method === 'PUT') {
    try {
      const { user_quality_threshold } = await context.request.json();
      const threshold = Math.min(100, Math.max(80, parseInt(user_quality_threshold, 10) || 85));

      await context.env.submoacontent_db
        .prepare('UPDATE users SET user_quality_threshold = ?, updated_at = ? WHERE id = ?')
        .bind(threshold, Date.now(), user.id)
        .run();

      return json({ success: true, user_quality_threshold: threshold });
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  }

  return json({ error: 'Method not allowed' }, 405);
}
