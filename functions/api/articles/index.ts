import { json, getSessionUser, generateId } from '../_utils';
import JSZip from 'jszip';

// Convert markdown to plain text for .txt download
function markdownToText(md) {
  return md
    .replace(/#{1,6}\s+/g, '')          // Remove headers
    .replace(/\*\*(.+?)\*\*/g, '$1')    // Bold → plain
    .replace(/\*(.+?)\*/g, '$1')         // Italic → plain
    .replace(/\[(.+?)\]\(.+?\)/g, '$1') // Links → text
    .replace(/^\s*[-*]\s+/gm, '')       // List bullets
    .replace(/^\s*\d+\.\s+/gm, '')      // Numbered lists
    .replace(/\n{3,}/g, '\n\n')         // Extra newlines
    .trim();
}

// GET /api/articles — list all articles OR get single article with ?id=
// PUT /api/articles — update article
// POST /api/articles/:id/feedback — submit feedback
export async function onRequest(context) {
  try {
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

    // POST /api/articles/:id/feedback
    if (context.request.method === 'POST' && pathname.match(/\/api\/articles\/[^/]+\/feedback$/)) {
      const id = pathname.split('/')[3];
      try {
        const { rating, what_worked, what_needs_work } = await context.request.json();
        if (!rating || rating < 1 || rating > 5) {
          return json({ error: 'Rating must be 1 to 5' }, 400);
        }
        const feedbackId = generateId();
        const now = Date.now();
        await context.env.submoacontent_db
          .prepare(`INSERT INTO feedback (id, submission_id, user_id, rating, what_worked, what_needs_work, created_at, account_id)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(feedbackId, id, user.id, rating, what_worked || '', what_needs_work || '', now, 'makerfrontier')
          .run();
        return json({ success: true });
      } catch (e) {
        return json({ error: e.message }, 500);
      }
    }

    // GET /api/articles — list OR get single via ?id=
    if (context.request.method === 'GET') {
      const id = url.searchParams.get('id');
      const format = url.searchParams.get('format') || 'viewer';

      if (id) {
        // Fetch single article by ID (accept both UUID-with-dashes and hex-without-dashes formats)
        const stmt = context.env.submoacontent_db.prepare(`
          SELECT * FROM submissions WHERE id = ?
        `);
        const article = await stmt.bind(id).first();
        if (!article) return json({ error: 'Article not found' }, 404);

        if (format === 'txt') {
          const content = article.article_content || '';
          const text = markdownToText(content);
          const filename = (article.content_path || 'article').replace('/content/', '').replace('.md', '');
          const encoder = new TextEncoder();
          const data = encoder.encode(text);
          return new Response(data, {
            headers: {
              'Content-Type': 'text/plain; charset=utf-8',
              'Content-Disposition': `attachment; filename="${filename}.txt"`,
              'Content-Length': String(data.length),
            }
          });
        }

        if (format === 'zip') {
          const zip = new JSZip();
          const filename = (article.content_path || 'article').replace('/content/', '').replace('.md', '');

          // Add article text
          const content = article.article_content || '';
          const text = markdownToText(content);
          zip.file(`${filename}.txt`, text);

          // Add SEO report if exists
          if (article.seo_report_content) {
            zip.file(`${filename}-seo-report.txt`, article.seo_report_content);
          }

          // Add YouTube transcript if exists
          if (article.youtube_transcript) {
            zip.file('extras/transcript.txt', article.youtube_transcript);
          }

          const zipData = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
          return new Response(zipData, {
            headers: {
              'Content-Type': 'application/zip',
              'Content-Disposition': `attachment; filename="${filename}.zip"`,
              'Content-Length': String(zipData.length),
            }
          });
        }

        return json({ article, content: article.article_content || '' });
      }

      // List all articles
      try {
        const stmt = context.env.submoacontent_db.prepare(`
          SELECT id, user_id, author, email, content_path, status, article_content, created_at, updated_at
          FROM submissions
          WHERE status = 'done'
          ORDER BY updated_at DESC
        `);
        const results = await stmt.all();
        return json({ articles: results });
      } catch (e) {
        return json({ error: e.message }, 500);
      }
    }

    // PUT /api/articles — update article
    if (context.request.method === 'PUT') {
      try {
        const body = await context.request.json();
        const { id, article_content, content_path, status } = body;
        if (!id) return json({ error: 'Missing article id' }, 400);

        const updates = [];
        const values = [];
        if (article_content !== undefined) { updates.push('article_content = ?'); values.push(article_content); }
        if (content_path !== undefined) { updates.push('content_path = ?'); values.push(content_path); }
        if (status !== undefined) { updates.push('status = ?'); values.push(status); }

        if (updates.length === 0) return json({ error: 'No fields to update' }, 400);

        updates.push('updated_at = ?');
        values.push(Date.now());
        values.push(id);

        const stmt = context.env.submoacontent_db.prepare(`UPDATE submissions SET ${updates.join(', ')} WHERE id = ?`);
        await stmt.run(...values);
        return json({ success: true });
      } catch (e) {
        return json({ error: e.message }, 500);
      }
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (err) {
    return Response.json({ error: err.message ?? 'Unknown error' }, { status: 500 });
  }
}