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
      // Join with author_profiles to get display name
      let results;
      const scoreCols = `s.submission_type, s.grade_status,
        s.grammar_score, s.readability_score, s.ai_detection_score,
        s.plagiarism_score, s.seo_score, s.overall_score,
        s.rewrite_attempts, s.generation_attempts,
        s.analysis_report, s.source_url, s.source_content`;

      if (user.role === 'admin') {
        const stmt = context.env.submoacontent_db.prepare(`
          SELECT s.id, s.user_id, s.topic, s.author, s.article_format, s.optimization_target, s.tone_stance, s.vocal_tone, s.min_word_count,
            s.product_link, s.target_keywords, s.seo_research, s.human_observation, s.anecdotal_stories,
            s.email, s.status, s.created_at, s.updated_at, s.content_path, s.article_content,
            s.revision_notes, s.is_hidden, s.is_deleted, s.deleted_at, s.seo_report_content,
            ap.name as author_display_name,
            ${scoreCols}
          FROM submissions s
          LEFT JOIN author_profiles ap ON s.author = ap.slug
          ORDER BY s.updated_at DESC
        `);
        results = await stmt.all();
      } else {
        const stmt = context.env.submoacontent_db.prepare(`
          SELECT s.id, s.user_id, s.topic, s.author, s.article_format, s.optimization_target, s.tone_stance, s.vocal_tone, s.min_word_count,
            s.product_link, s.target_keywords, s.seo_research, s.human_observation, s.anecdotal_stories,
            s.email, s.status, s.created_at, s.updated_at, s.content_path, s.article_content,
            s.revision_notes, s.is_hidden, s.is_deleted, s.seo_report_content,
            ap.name as author_display_name,
            ${scoreCols}
          FROM submissions s
          LEFT JOIN author_profiles ap ON s.author = ap.slug
          WHERE s.user_id = ? AND s.is_deleted = 0
          ORDER BY s.updated_at DESC
        `);
        results = await stmt.bind(user.id).all();
      }
      return json({ submissions: results.results || [], role: user.role });
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  }

  // POST — create submission
  if (context.request.method === 'POST') {
    try {
      const {
        topic, author, article_format, optimization_target, tone_stance, vocal_tone, min_word_count,
        product_link, target_keywords,
        human_observation, anecdotal_stories, include_faq, has_images, email,
        status = 'draft',
      } = await context.request.json();

      const id = generateId();
      const now = Date.now();

      // Apply defaults for draft saves to satisfy NOT NULL constraints
      const saveStatus = status || 'draft';
      const effectiveMinWordCount = min_word_count || '500';
      const effectiveAuthor = author || 'unassigned';
      const effectiveArticleFormat = article_format || 'blog-general';
      const effectiveHumanObservation = human_observation || '';
      const effectiveEmail = email || user.email || null;

      await context.env.submoacontent_db
        .prepare(`INSERT INTO submissions (id, user_id, topic, author, article_format, optimization_target, tone_stance, vocal_tone, min_word_count, product_link, target_keywords, seo_research, human_observation, anecdotal_stories, include_faq, has_images, email, status, created_at, updated_at, account_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          id, user.id,
          topic || null, effectiveAuthor, effectiveArticleFormat,
          optimization_target || null,
          tone_stance || null,
          vocal_tone || null,
          effectiveMinWordCount,
          product_link || null,
          target_keywords || null,
          1,
          effectiveHumanObservation,
          anecdotal_stories || null,
          include_faq ? 1 : 0,
          has_images ? 1 : 0,
          effectiveEmail,
          saveStatus,
          now, now,
          'makerfrontier'
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
