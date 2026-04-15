import { json, getSessionUser, Env } from '../_utils';

// GET /api/authors — returns active author profiles for the session user's account
export async function onRequest(context: { request: Request; env: Env }) {
  if (context.request.method !== 'GET') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const user = await getSessionUser(context.request, context.env);
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const result = await context.env.submoacontent_db
      .prepare(
        `SELECT slug, name, description, tts_voice_id
         FROM author_profiles
         WHERE account_id = ? AND is_active = 1
         ORDER BY name ASC`
      )
      .bind(user.account_id)
      .all();

    return json({ authors: result.results || [] });
  } catch (err: any) {
    return json({ error: err.message || 'Server error' }, 500);
  }
}
