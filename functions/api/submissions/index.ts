import { json, getSessionUser, generateId } from '../_utils';
import { createProjectFolder } from '../../../src/project-template';

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
      let results;
      const submissionsQuery = `
          SELECT
            s.id,
            s.topic,
            s.article_format,
            s.optimization_target,
            s.tone_stance,
            s.vocal_tone,
            s.min_word_count,
            s.target_keywords,
            s.generate_audio,
            s.audio_requested,
            s.revision_notes,
            s.status,
            s.grade_status,
            s.package_status,
            s.word_count,
            s.created_at,
            s.updated_at,
            s.zip_url,
            s.content_rating,
            (SELECT display_name FROM llm_config WHERE slot = s.content_rating) as llm_display_name,
            CASE WHEN s.article_content IS NOT NULL AND s.article_content != '' THEN 1 ELSE 0 END as has_article,
            CASE WHEN s.article_content IS NOT NULL AND s.article_content != '' THEN 1 ELSE 0 END as has_docx,
            s.audio_path,
            s.infographic_r2_key,
            ap.name as author_display_name,
            g.grammar_score,
            g.readability_score,
            g.ai_detection_score,
            g.plagiarism_score,
            g.seo_score,
            g.overall_score,
            g.rewrite_attempts,
            g.status as grade_result,
            s.live_url,
            s.featured_image_filename,
            s.generated_image_key,
            s.custom_featured_image_key
          FROM submissions s
          LEFT JOIN author_profiles ap ON s.author = ap.slug
          LEFT JOIN grades g ON g.id = (
            SELECT id FROM grades
            WHERE submission_id = s.id
            ORDER BY COALESCE(graded_at, created_at) DESC
            LIMIT 1
          )
          WHERE s.user_id = ? AND s.is_deleted = 0
          ORDER BY s.created_at DESC
        `;

      // Per-user dashboard — admins/super_admins only see their own submissions here.
      // The /admin section is the place to view all-account content.
      results = await context.env.submoacontent_db.prepare(submissionsQuery).bind(user.id).all();

      const submissions = (results.results || []).map(row => ({
        id:                  row.id,
        topic:               row.topic,
        article_format:      row.article_format,
        optimization_target: row.optimization_target,
        tone_stance:         row.tone_stance || null,
        vocal_tone:          row.vocal_tone || null,
        min_word_count:      row.min_word_count || null,
        target_keywords:     row.target_keywords || null,
        generate_audio:      row.generate_audio ?? 0,
        audio_requested:     row.audio_requested ?? 0,
        revision_notes:      row.revision_notes || null,
        status:              row.status,
        grade_status:        row.grade_status,
        package_status:      row.package_status ?? null,
        word_count:          row.word_count,
        created_at:          row.created_at,
        updated_at:          row.updated_at,
        zip_url:             row.zip_url || null,
        live_url:            row.live_url || null,
        content_rating:      row.content_rating ?? 1,
        llm_display_name:    row.llm_display_name || null,
        featured_image_filename: row.featured_image_filename || null,
        generated_image_key: row.generated_image_key || null,
        custom_featured_image_key: row.custom_featured_image_key || null,
        infographic_r2_key:  row.infographic_r2_key || null,
        audio_path:          row.audio_path || null,
        has_docx:            !!row.has_docx,
        article_content:     row.has_article ? true : null,
        author_display_name: row.author_display_name || null,
        grade: (row.grammar_score !== null || row.overall_score !== null) ? {
          grammar_score:      row.grammar_score,
          readability_score:  row.readability_score,
          ai_detection_score: row.ai_detection_score,
          plagiarism_score:   row.plagiarism_score,
          seo_score:         row.seo_score,
          overall_score:     row.overall_score,
          rewrite_attempts:  row.rewrite_attempts,
        } : null,
      }));

      return json({ user: { name: user.name }, submissions });
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  }

  // POST — create submission
  if (context.request.method === 'POST') {
    try {
      const {
        topic, author, article_format, optimization_target, tone_stance, vocal_tone, min_word_count,
        product_link, product_details_manual, target_keywords,
        human_observation, anecdotal_stories, include_faq, has_images, generate_audio, email,
        youtube_url, use_youtube, relevant_links,
        content_rating,
        generate_featured_image, image_prompt_direction,
        tts_voice_id,
        status = 'draft',
      } = await context.request.json();

      const id = generateId();
      const now = Date.now();

      // Apply defaults for draft saves to satisfy NOT NULL constraints
      const saveStatus = status || 'draft';

      // Enforce required-fields rule on non-draft submits.
      // Drafts can be incomplete; brief/queued/published submissions must have observation + anecdote.
      if (saveStatus !== 'draft') {
        if (!human_observation || !String(human_observation).trim()) {
          return json({ error: 'Your observation on this topic is required to submit (drafts can be incomplete).' }, 400);
        }
        if (!anecdotal_stories || !String(anecdotal_stories).trim()) {
          return json({ error: 'Anecdotal stories are required to submit (drafts can be incomplete).' }, 400);
        }
      }

      const effectiveMinWordCount = min_word_count || '500';
      const effectiveAuthor = author || 'unassigned';
      const effectiveArticleFormat = article_format || 'blog-general';
      const effectiveHumanObservation = human_observation || '';
      const effectiveEmail = email || user.email || null;

      await context.env.submoacontent_db
        .prepare(`INSERT INTO submissions (id, user_id, topic, author, article_format, optimization_target, tone_stance, vocal_tone, min_word_count, product_link, product_details_manual, target_keywords, seo_research, human_observation, anecdotal_stories, include_faq, has_images, generate_audio, email, status, created_at, updated_at, account_id, youtube_url, use_youtube, youtube_transcript, relevant_links, content_rating, generate_featured_image, image_prompt_direction, tts_voice_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          id, user.id,
          topic || null, effectiveAuthor, effectiveArticleFormat,
          optimization_target || null,
          tone_stance || null,
          vocal_tone || null,
          effectiveMinWordCount,
          product_link || null,
          product_details_manual || null,
          target_keywords || null,
          1,
          effectiveHumanObservation,
          anecdotal_stories || null,
          include_faq ? 1 : 0,
          has_images ? 1 : 0,
          generate_audio ? 1 : 0,
          effectiveEmail,
          saveStatus,
          now, now,
          'makerfrontier',
          youtube_url || null,
          use_youtube ? 1 : 0,
          null,
          relevant_links || null,
          [1, 2, 3].includes(Number(content_rating)) ? Number(content_rating) : 1,
          generate_featured_image ? 1 : 0,
          image_prompt_direction || null,
          tts_voice_id || 'onyx',
        )
        .run();

      const submission = await context.env.submoacontent_db
        .prepare('SELECT * FROM submissions WHERE id = ?').bind(id).first();

      // Create project folder in R2 with placeholders for all components
      context.waitUntil(
        createProjectFolder(context.env as any, id).catch(e =>
          console.error('createProjectFolder failed:', e)
        )
      );

      // Enqueue generation job — fire and forget (doesn't block response)
      context.waitUntil(
        (async () => {
          try {
            const { enqueueGenerationJob } = await import('../queue-producer');
            await enqueueGenerationJob(context.env as any, id);
          } catch (e) {
            console.error('enqueueGenerationJob failed:', e);
          }
        })()
      );

      return json({ submission }, 201);

    } catch (e) {
      return json({ error: e.message }, 500);
    }
  }

  return json({ error: 'Method not allowed' }, 405);
}
