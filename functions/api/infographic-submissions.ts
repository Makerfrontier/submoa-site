import { json, getSessionUser, generateId } from './_utils';
import type { Env } from './_utils';
import { notifyBriefSubmitted, emailBriefReceived } from '../../src/notifications';
import { createProjectFolder } from '../../src/project-template';

export async function onRequest(context: { request: Request; env: Env }) {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (context.request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const user = await getSessionUser(context.request, context.env);
  if (!user) return json({ error: 'Not authenticated' }, 401);

  try {
    const body = await context.request.json();
    const { infographic, ...articleFields } = body as any;

    if (!articleFields.topic || !articleFields.author || !articleFields.article_format) {
      return json({ error: 'topic, author, and article_format are required' }, 400);
    }

    if (!infographic?.design_style) {
      return json({ error: 'design_style is required for infographic submissions' }, 400);
    }

    const submissionId = generateId();
    const infographicId = generateId();
    const now = Date.now();

    const effectiveMinWordCount = articleFields.min_word_count || '500';
    const effectiveEmail = (user as any).email || '';

    // Wrap both inserts in a batch for atomicity
    const results = await context.env.submoacontent_db.batch([
      // 1. Create submission record
      context.env.submoacontent_db.prepare(
        `INSERT INTO submissions (
          id, user_id, account_id, topic, author, article_format, optimization_target,
          tone_stance, vocal_tone, min_word_count, target_keywords,
          human_observation, anecdotal_stories, product_link,
          include_faq, generate_audio, email, status, grade_status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'brief', 'ungraded', ?, ?)`
      ).bind(
        submissionId,
        (user as any).id,
        (user as any).account_id || 'makerfrontier',
        articleFields.topic,
        articleFields.author,
        articleFields.article_format,
        articleFields.optimization_target ?? null,
        articleFields.tone_stance ?? null,
        articleFields.vocal_tone ?? null,
        effectiveMinWordCount,
        articleFields.target_keywords ?? null,
        articleFields.human_observation ?? null,
        articleFields.anecdotal_stories ?? null,
        articleFields.product_link ?? null,
        articleFields.include_faq ? 1 : 0,
        articleFields.generate_audio ? 1 : 0,
        effectiveEmail,
        now,
        now
      ),

      // 2. Create infographic record
      context.env.submoacontent_db.prepare(
        `INSERT INTO infographic_submissions (
          id, submission_id, design_style, infographic_type, layout,
          primary_stat, max_data_points, brand_colour, output_format,
          cta_text, infographic_status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`
      ).bind(
        infographicId,
        submissionId,
        infographic.design_style,
        infographic.infographic_type || null,
        infographic.layout ?? 'vertical',
        infographic.primary_stat || null,
        parseInt(infographic.max_data_points ?? '5'),
        infographic.brand_colour || null,
        infographic.output_format ?? 'both',
        infographic.cta_text || null,
        now
      ),
    ]);

    if (!results[0].success || !results[1].success) {
      return json({ error: 'Failed to create submission' }, 500);
    }

    // Create project folder in R2 with placeholders for all components
    context.waitUntil(
      createProjectFolder(context.env as any, submissionId).catch(e =>
        console.error('createProjectFolder failed:', e)
      )
    );

    // Notifications — non-fatal
    try {
      const author = await context.env.submoacontent_db.prepare(
        `SELECT name, email FROM author_profiles WHERE slug = ?`
      ).bind(articleFields.author).first<{ name: string; email: string }>();

      await notifyBriefSubmitted(context.env, {
        id: submissionId,
        title: articleFields.topic,
        author_display_name: author?.name ?? articleFields.author,
        article_format: `${articleFields.article_format} + Infographic`,
        optimization_target: articleFields.optimization_target ?? '',
      });

      if (author?.email) {
        await emailBriefReceived(context.env, author.email, {
          id: submissionId,
          title: articleFields.topic,
        });
      }
    } catch (e) {
      console.error('Notification error (non-fatal):', e);
    }

    return json({ id: submissionId, infographic_id: infographicId }, 201);
  } catch (err: any) {
    return json({ error: err.message || 'Server error' }, 500);
  }
}
