import { json, Env } from '../_utils';

// GET /api/authors — public, returns active author profiles
export async function onRequest(context: { request: Request; env: Env }) {
  if (context.request.method !== 'GET') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const result = await context.env.submoacontent_db
      .prepare('SELECT slug, name, description FROM author_profiles WHERE is_active = 1')
      .all();

    return json({ authors: result.results || [] });
  } catch (err: any) {
    return json({ error: err.message || 'Server error' }, 500);
  }
}