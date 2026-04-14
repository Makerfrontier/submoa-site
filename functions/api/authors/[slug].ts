import { json } from '../_utils';

function getCookieValue(request: Request, name: string): string | null {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

// GET /api/authors/:slug — fetch a single author profile
export async function onRequestGet({ params, env, request }: any) {
  const session = getCookieValue(request, 'submoa_session');
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const author = await env.submoacontent_db.prepare(
    `SELECT slug, name, description, style_guide, keyword_themes,
            semantic_entities, source_type, is_active, tts_voice_id
     FROM author_profiles WHERE slug = ?`
  ).bind(params.slug).first();

  if (!author) return json({ error: 'Not found' }, 404);
  return json({ author });
}
