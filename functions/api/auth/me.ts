import { json, getSessionUser, Env } from '../_utils';

export async function onRequest(context: { request: Request; env: Env }) {
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

  if (!user) {
    return json({ error: 'Not authenticated' }, 401);
  }

  // GET — return current user
  if (context.request.method === 'GET') {
    return json({ user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      // @ts-ignore — populated by getSessionUser when admin is impersonating
      impersonating: !!(user as any).impersonating,
      // @ts-ignore
      impersonating_from: (user as any).impersonating_from || null,
    }});
  }

  // PUT — update user settings
  if (context.request.method === 'PUT') {
    try {
      const { name, user_quality_threshold } = await context.request.json();

      const updates = [];
      const values = [];

      if (name !== undefined) {
        updates.push('name = ?');
        values.push(name);
      }
      if (user_quality_threshold !== undefined) {
        updates.push('user_quality_threshold = ?');
        values.push(user_quality_threshold);
      }

      if (updates.length === 0) {
        return json({ error: 'No fields to update' }, 400);
      }

      updates.push('updated_at = ?');
      values.push(Date.now());
      values.push(user.id);

      await context.env.submoacontent_db
        .prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`)
        .run(...values);

      return json({ success: true });
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  }

  return json({ error: 'Method not allowed' }, 405);
}
