import { json, getSessionUser, generateId, Env } from '../_utils';
import { articleRequestEmail, sendEmail } from '../_email-templates';

export async function onRequest(context: { request: Request; env: Env }) {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  const user = await getSessionUser(context.request, context.env);
  if (!user) return json({ error: 'Not authenticated' }, 401);

  if (context.request.method === 'GET') {
    const submissions = await context.env.submoacontent_db
      .prepare('SELECT * FROM submissions WHERE user_id = ? ORDER BY created_at DESC')
      .bind(user.id)
      .all();

    return json({ submissions: submissions.results });
  }

  if (context.request.method === 'POST') {
    try {
      const {
        topic,
        author,
        article_format,
        vocal_tone,
        min_word_count,
        product_link,
        target_keywords,
        seo_research,
        human_observation,
        anecdotal_stories,
        email,
      } = await context.request.json();

      if (!topic || !author || !article_format || !human_observation || !email) {
        return json({ error: 'Missing required fields' }, 400);
      }

      const id = generateId();
      const now = Date.now();

      await context.env.submoacontent_db
        .prepare(`
          INSERT INTO submissions
          (id, user_id, topic, author, article_format, vocal_tone, min_word_count, product_link, target_keywords, seo_research, human_observation, anecdotal_stories, email, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)
        `)
        .bind(
          id, user.id, topic, author, article_format,
          vocal_tone || null,
          min_word_count || '1200',
          product_link || null,
          target_keywords || null,
          seo_research ? 1 : 0,
          human_observation,
          anecdotal_stories || null,
          email,
          now, now
        )
        .run();

      // Notify via Discord
      try {
        const discordPayload = {
          embeds: [{
            title: `New Submission: ${topic}`,
            color: 0xa07c2e,
            fields: [
              { name: 'Author', value: author, inline: true },
              { name: 'Format', value: article_format, inline: true },
              { name: 'Word Count', value: `${min_word_count || 1200}+`, inline: true },
              { name: 'Email', value: email, inline: false },
            ],
            footer: { text: 'SubMoa Content Intake' },
            timestamp: new Date().toISOString(),
          }],
        };

        await fetch(context.env.DISCORD_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(discordPayload),
        });
      } catch (_) {
        // Discord notification is non-blocking
      }

      const submission = await context.env.submoacontent_db
        .prepare('SELECT * FROM submissions WHERE id = ?')
        .bind(id)
        .first();

      // Send confirmation email
      try {
        const { subject, html } = articleRequestEmail({
          name: user.name,
          topic,
          articleFormat: article_format,
          submissionId: id,
          dashboardUrl: `${new URL(context.request.url).origin}/dashboard`,
        })
        await sendEmail(context.env, { to: email, subject, html })
      } catch (emailErr) {
        console.error('Failed to send confirmation email:', emailErr.message)
      }

      return json({ submission }, 201);
    } catch (err: any) {
      return json({ error: err.message || 'Server error' }, 500);
    }
  }

  return json({ error: 'Method not allowed' }, 405);
}
