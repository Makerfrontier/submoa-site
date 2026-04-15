import { json, getSessionUser, isAdmin, Env } from '../../../_utils';

// PATCH /api/admin/authors/:slug — admin only, update existing profile
export async function onRequest(context: { request: Request; env: Env }) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'PATCH, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (request.method !== 'PATCH') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);
  if (!isAdmin(user)) return json({ error: 'Forbidden' }, 403);

  try {
    // Extract slug from URL path
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const slugIndex = pathParts.indexOf('authors') + 1;
    const slug = pathParts[slugIndex];

    if (!slug) {
      return json({ error: 'Author slug is required' }, 400);
    }

    const body = await request.json();
    const { name, description, style_guide, keyword_themes, semantic_entities, is_active } = body;

    // Build dynamic update query
    const updates: string[] = [];
    const values: any[] = [];

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }
    if (description !== undefined) {
      updates.push('description = ?');
      values.push(description);
    }
    if (style_guide !== undefined) {
      updates.push('style_guide = ?');
      values.push(style_guide);
    }
    if (keyword_themes !== undefined) {
      updates.push('keyword_themes = ?');
      values.push(JSON.stringify(keyword_themes));
    }
    if (semantic_entities !== undefined) {
      updates.push('semantic_entities = ?');
      values.push(JSON.stringify(semantic_entities));
    }
    if (is_active !== undefined) {
      updates.push('is_active = ?');
      values.push(is_active ? 1 : 0);
    }

    if (updates.length === 0) {
      return json({ error: 'No fields to update' }, 400);
    }

    updates.push('updated_at = ?');
    values.push(Date.now());
    values.push(slug);

    const query = `UPDATE author_profiles SET ${updates.join(', ')} WHERE slug = ?`;
    
    await env.submoacontent_db
      .prepare(query)
      .bind(...values)
      .run();

    const updated = await env.submoacontent_db
      .prepare('SELECT * FROM author_profiles WHERE slug = ?')
      .bind(slug)
      .first();

    return json({ success: true, profile: updated });
  } catch (err: any) {
    return json({ error: err.message || 'Server error' }, 500);
  }
}