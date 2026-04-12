import { json, getSessionUser, generateId } from '../_utils';

// GET /api/submissions — list submissions
// POST /api/submissions — create a new submission
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

  // GET — list submissions
  if (context.request.method === 'GET') {
    try {
      let stmt;
      if (user.role === 'admin') {
        stmt = context.env.submoacontent_db.prepare(`
          SELECT id, user_id, topic, author, article_format, vocal_tone, min_word_count,
            product_link, target_keywords, seo_research, human_observation, anecdotal_stories,
            email, status, created_at, updated_at, content_path, article_content,
            revision_notes, is_hidden, is_deleted, deleted_at, seo_report_content
          FROM submissions
          ORDER BY updated_at DESC
        `);
      } else {
        stmt = context.env.submoacontent_db.prepare(`
          SELECT id, user_id, topic, author, article_format, vocal_tone, min_word_count,
            product_link, target_keywords, seo_research, human_observation, anecdotal_stories,
            email, status, created_at, updated_at, content_path, article_content,
            revision_notes, is_hidden, is_deleted, seo_report_content
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

  // POST — create submission
  if (context.request.method === 'POST') {
    try {
      const {
        topic, author, article_format, vocal_tone, min_word_count,
        product_link, target_keywords, seo_research,
        human_observation, anecdotal_stories, email,
      } = await context.request.json();

      if (!topic || !author || !article_format || !min_word_count || !human_observation) {
        return json({ error: 'Missing required fields: topic, author, article_format, min_word_count, human_observation' }, 400);
      }

      const id = generateId();
      const now = Date.now();

      await context.env.submoacontent_db
        .prepare(`INSERT INTO submissions (id, user_id, topic, author, article_format, vocal_tone, min_word_count, product_link, target_keywords, seo_research, human_observation, anecdotal_stories, email, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`)
        .bind(
          id, user.id,
          topic, author, article_format,
          vocal_tone || null,
          min_word_count,
          product_link || null,
          target_keywords || null,
          seo_research ? 1 : 0,
          human_observation,
          anecdotal_stories || null,
          email || user.email,
          now, now
        )
        .run();

      const submission = await context.env.submoacontent_db
        .prepare('SELECT * FROM submissions WHERE id = ?').bind(id).first();

      return json({ submission }, 201);

    } catch (e) {
      return json({ error: e.message }, 500);
    }
  }

  return json({ error: 'Method not allowed' }, 405);
}
