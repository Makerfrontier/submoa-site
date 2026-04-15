import { json, getSessionUser, isAdmin, generateId } from '../_utils';
import { emailArticlePublished, notifyBriefSubmitted } from '../discord-notifications';

async function createNotification(env, userId, type, message, link) {
  const id = generateId();
  const now = Date.now();
  await env.submoacontent_db
    .prepare('INSERT INTO notifications (id, user_id, type, message, link, is_read, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)')
    .bind(id, userId, type, message, link, now)
    .run();
}

// GET /api/submissions/:id — get single submission
// PUT /api/submissions/:id — hide, delete, or update status
// PUT /api/submissions/:id/revision — submit revision request
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

  const url = new URL(context.request.url);
  const pathname = url.pathname;

  // PUT /api/submissions/:id/revision — submit revision request
  if (context.request.method === 'PUT' && pathname.endsWith('/revision')) {
    const id = pathname.split('/')[3];
    if (!id) return json({ error: 'Missing submission id' }, 400);

    try {
      const { revision_notes } = await context.request.json();
      if (!revision_notes || revision_notes.trim().length === 0) {
        return json({ error: 'Revision notes required' }, 400);
      }

      const stmt = context.env.submoacontent_db.prepare(`
        UPDATE submissions SET status = 'revision_requested', revision_notes = ?, updated_at = ? WHERE id = ? AND user_id = ?
      `);
      await stmt.run(revision_notes.trim(), Date.now(), id, user.id);

      const sub = await context.env.submoacontent_db.prepare('SELECT * FROM submissions WHERE id = ?').bind(id).first();
      return json({ success: true, submission: sub });
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  }

  // GET /api/submissions/:id
  if (context.request.method === 'GET') {
    const id = (pathname.split('/').filter(Boolean))[2];
    if (!id) return json({ error: 'Missing submission id' }, 400);

    try {
      let stmt;
      if (user.role === 'admin') {
        stmt = context.env.submoacontent_db.prepare('SELECT * FROM submissions WHERE id = ?');
        stmt = stmt.bind(id);
      } else {
        stmt = context.env.submoacontent_db.prepare('SELECT * FROM submissions WHERE id = ? AND user_id = ?');
        stmt = stmt.bind(id, user.id);
      }
      const sub = await stmt.first();
      if (!sub) return json({ error: 'Submission not found' }, 404);
      return json({ submission: sub });
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  }

  // PUT /api/submissions/:id — hide, delete, or update status
  if (context.request.method === 'PUT') {
    const id = (pathname.split('/').filter(Boolean))[2];
    if (!id) return json({ error: 'Missing submission id' }, 400);

    try {
      const body = await context.request.json();
      const { is_hidden, is_deleted, status, article_content, seo_report_content, article_images, youtube_url, use_youtube, youtube_transcript, product_details_manual } = body;

      if (!isAdmin(user)) {
        const check = await context.env.submoacontent_db.prepare('SELECT id FROM submissions WHERE id = ? AND user_id = ?').bind(id, user.id).first();
        if (!check) return json({ error: 'Not found' }, 404);
      }

      const updates = [];
      const values = [];

      if (is_hidden !== undefined) { updates.push('is_hidden = ?'); values.push(is_hidden ? 1 : 0); }
      if (is_deleted !== undefined) {
        updates.push('is_deleted = ?'); values.push(is_deleted ? 1 : 0);
        if (is_deleted) { updates.push('deleted_at = ?'); values.push(Date.now()); }
      }
      if (status !== undefined) { updates.push('status = ?'); values.push(status); }
      if (article_content !== undefined) { updates.push('article_content = ?'); values.push(article_content); }
      if (seo_report_content !== undefined) { updates.push('seo_report_content = ?'); values.push(seo_report_content); }
      if (article_images !== undefined) { updates.push('article_images = ?'); values.push(article_images); }
      if (youtube_url !== undefined) { updates.push('youtube_url = ?'); values.push(youtube_url); }
      if (use_youtube !== undefined) { updates.push('use_youtube = ?'); values.push(use_youtube ? 1 : 0); }
      if (youtube_transcript !== undefined) { updates.push('youtube_transcript = ?'); values.push(youtube_transcript); }
      if (product_details_manual !== undefined) { updates.push('product_details_manual = ?'); values.push(product_details_manual); }

      updates.push('updated_at = ?');
      values.push(Date.now());
      values.push(id);

      const stmt = context.env.submoacontent_db.prepare(`UPDATE submissions SET ${updates.join(', ')} WHERE id = ?`);
      await stmt.run(...values);

      const sub = await context.env.submoacontent_db.prepare('SELECT * FROM submissions WHERE id = ?').bind(id).first();

      // Auto-notify when content is marked done
      if (status === 'done' && sub) {
        const dashboardUrl = `${new URL(context.request.url).origin}/dashboard`;
        await createNotification(
          context.env,
          sub.user_id,
          'article_ready',
          `Your article "${sub.topic}" is ready — view and download it now.`,
          dashboardUrl
        );
        try {
          const { articleDeliveryEmail, sendEmail } = await import('../_email-templates');
          const { subject, html } = articleDeliveryEmail({
            name: sub.email,
            topic: sub.topic,
            downloadUrl: dashboardUrl,
            dashboardUrl,
          });
          await sendEmail(context.env, { to: sub.email, subject, html });
        } catch (emailErr) {
          console.error('Delivery email failed:', emailErr.message);
        }
      }

      return json({ success: true, submission: sub });

    } catch (e) {
      return json({ error: e.message }, 500);
    }
  }

  // PATCH /api/submissions/:id/publish — mark as published
  if (context.request.method === 'PATCH' && pathname.endsWith('/publish')) {
    const id = (pathname.split('/').filter(Boolean))[2];
    if (!id) return json({ error: 'Missing submission id' }, 400);

    try {
      const sub = await context.env.submoacontent_db.prepare('SELECT * FROM submissions WHERE id = ?').bind(id).first();
      if (!sub) return json({ error: 'Not found' }, 404);
      if (sub.user_id !== user.id && !isAdmin(user)) return json({ error: 'Forbidden' }, 403);

      let live_url: string | null = null;
      try {
        const body = await context.request.json();
        live_url = body.live_url || null;
      } catch { /* no body is fine */ }

      await context.env.submoacontent_db.prepare(
        'UPDATE submissions SET status = ?, live_url = ?, updated_at = ? WHERE id = ?'
      ).bind('published', live_url, Date.now(), id).run();

      // Fire published notification email
      if (sub.email) {
        emailArticlePublished(context.env as any, sub.email, { id: sub.id, title: sub.topic }).catch(e => console.error('emailArticlePublished failed:', e));
      }

      return json({ success: true });

    } catch (e) {
      return json({ error: e.message }, 500);
    }
  }

  // POST /api/submissions/:id/revise — reset and requeue for regeneration
  if (context.request.method === 'POST' && pathname.endsWith('/revise')) {
    const id = (pathname.split('/').filter(Boolean))[2];
    if (!id) return json({ error: 'Missing submission id' }, 400);

    try {
      const sub = await context.env.submoacontent_db.prepare(`
        SELECT s.*, ap.name as author_display_name
        FROM submissions s
        LEFT JOIN author_profiles ap ON s.author = ap.slug
        WHERE s.id = ?
      `).bind(id).first();
      if (!sub) return json({ error: 'Not found' }, 404);
      if (sub.user_id !== user.id && !isAdmin(user)) return json({ error: 'Forbidden' }, 403);

      await context.env.submoacontent_db.prepare(`
        UPDATE submissions
        SET status = 'queued', grade_status = 'ungraded', article_content = NULL, word_count = NULL, package_status = NULL, updated_at = ?
        WHERE id = ?
      `).bind(Date.now(), id).run();

      // Delete grade record so scores disappear immediately
      await context.env.submoacontent_db.prepare(
        `DELETE FROM grades WHERE submission_id = ?`
      ).bind(id).run();

      // Enqueue regeneration
      const { enqueueGenerationJob } = await import('../queue-producer');
      await (enqueueGenerationJob as any)(context.env, id);

      // Notify Discord — fire and forget (don't let Discord failures break the revise response)
      notifyBriefSubmitted(context.env, {
        id: sub.id,
        title: sub.topic,
        author_display_name: sub.author_display_name || sub.author,
        article_format: sub.article_format,
        optimization_target: sub.optimization_target,
      }).catch(err => console.error('Discord notification failed on revise:', err));

      return json({ success: true });

    } catch (e) {
      return json({ error: e.message }, 500);
    }
  }

  // DELETE /api/submissions/:id — delete a submission
  if (context.request.method === 'DELETE') {
    const id = (pathname.split('/').filter(Boolean))[2];
    if (!id) return json({ error: 'Missing submission id' }, 400);

    try {
      const check = await context.env.submoacontent_db.prepare('SELECT id FROM submissions WHERE id = ? AND user_id = ?').bind(id, user.id).first();
      if (!check && !isAdmin(user)) return json({ error: 'Not found' }, 404);

      await context.env.submoacontent_db.prepare('DELETE FROM submissions WHERE id = ?').bind(id).run();
      return json({ success: true });
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  }

  return json({ error: 'Method not allowed' }, 405);
}
