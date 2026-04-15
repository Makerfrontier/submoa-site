import { json, getSessionUser, isAdmin, Env } from '../../_utils';

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
  if (!isAdmin(user)) return json({ error: 'Forbidden' }, 403);

  try {
    const body = await request.json();
    const { slug, name, style_guide, keyword_themes, semantic_entities, description, rss_url, source_type, scope, custom_name } = body;

    if (!slug || !name || !style_guide) {
      return json({ error: 'slug, name, and style_guide are required' }, 400);
    }

    const now = Date.now();
    const is_active = scope === 'user' ? 1 : 0;
    const quality_threshold = body.sample_grade?.overall ?? 80;
    const account_id = body.account_id || 'makerfrontier';
    const author_name = custom_name || name;

    // Check if profile already exists
    const existing = await env.submoacontent_db
      .prepare('SELECT slug FROM author_profiles WHERE slug = ?')
      .bind(slug)
      .first();

    if (existing) {
      // Update existing
      await env.submoacontent_db
        .prepare(`UPDATE author_profiles SET name = ?, style_guide = ?, keyword_themes = ?, semantic_entities = ?, description = ?, rss_url = ?, is_active = ?, quality_threshold = ?, updated_at = ? WHERE slug = ?`)
        .bind(author_name, style_guide, JSON.stringify(keyword_themes || []), JSON.stringify(semantic_entities || []), description || '', rss_url || '', is_active, quality_threshold, now, slug)
        .run();
    } else {
      // Insert new
      await env.submoacontent_db
        .prepare(`INSERT INTO author_profiles (slug, name, style_guide, keyword_themes, semantic_entities, description, rss_url, source_type, is_active, quality_threshold, account_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(slug, author_name, style_guide, JSON.stringify(keyword_themes || []), JSON.stringify(semantic_entities || []), description || '', rss_url || '', source_type || 'rss', is_active, quality_threshold, account_id, now, now)
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