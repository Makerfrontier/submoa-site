import { json, getSessionUser, Env } from '../../_utils';

export async function onRequest(context: { request: Request; env: Env }) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);
  if (user.role !== 'admin') return json({ error: 'Forbidden' }, 403);

  try {
    const body = await request.json();
    const { slug, name, style_guide, keyword_themes, semantic_entities, description, rss_url, source_type } = body;

    if (!slug || !name || !style_guide) {
      return json({ error: 'slug, name, and style_guide are required' }, 400);
    }

    const now = Date.now();

    // Check if profile already exists
    const existing = await env.submoacontent_db
      .prepare('SELECT slug FROM author_profiles WHERE slug = ?')
      .bind(slug)
      .first();

    if (existing) {
      // Update existing
      await env.submoacontent_db
        .prepare(`UPDATE author_profiles SET name = ?, style_guide = ?, keyword_themes = ?, semantic_entities = ?, description = ?, rss_url = ?, is_active = 1, updated_at = ? WHERE slug = ?`)
        .bind(name, style_guide, JSON.stringify(keyword_themes || []), JSON.stringify(semantic_entities || []), description || '', rss_url || '', now, slug)
        .run();
    } else {
      // Insert new
      await env.submoacontent_db
        .prepare(`INSERT INTO author_profiles (slug, name, style_guide, keyword_themes, semantic_entities, description, rss_url, source_type, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`)
        .bind(slug, name, style_guide, JSON.stringify(keyword_themes || []), JSON.stringify(semantic_entities || []), description || '', rss_url || '', source_type || 'rss', now, now)
        .run();
    }

    // Fetch the saved record
    const saved = await env.submoacontent_db
      .prepare('SELECT * FROM author_profiles WHERE slug = ?')
      .bind(slug)
      .first();

    return json({ success: true, profile: saved });
  } catch (err: any) {
    return json({ error: err.message || 'Server error' }, 500);
  }
}