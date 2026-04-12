import { json, getSessionUser } from '../_utils';

// GET /api/submissions — list submissions
// Admin sees all. Regular users see only their own (non-deleted).
export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  const user = await getSessionUser(context.request, context.env);
  if (!user) return json({ error: 'Not authenticated' }, 401);

  if (context.request.method !== 'GET') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    let stmt;
    if (user.role === 'admin') {
      // Admin sees everything including deleted
      stmt = context.env.submoacontent_db.prepare(`
        SELECT id, user_id, topic, author, article_format, vocal_tone, min_word_count,
          product_link, target_keywords, seo_research, human_observation, anecdotal_stories,
          email, status, created_at, updated_at, content_path, article_content,
          revision_notes, is_hidden, is_deleted, deleted_at
        FROM submissions
        ORDER BY updated_at DESC
      `);
    } else {
      // Regular users see their own, not deleted
      stmt = context.env.submoacontent_db.prepare(`
        SELECT id, user_id, topic, author, article_format, vocal_tone, min_word_count,
          product_link, target_keywords, seo_research, human_observation, anecdotal_stories,
          email, status, created_at, updated_at, content_path, article_content,
          revision_notes, is_hidden, is_deleted
        FROM submissions
        WHERE user_id = ? AND is_deleted = 0
        ORDER BY updated_at DESC
      `);
      stmt = stmt.bind(user.id);
    }

    const results = await stmt.all();
    return json({ submissions: results.results || [], role: user.role });

  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
