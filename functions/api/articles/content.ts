import { json, getSessionUser } from '../_utils';

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

export async function onRequestGet(context: any) {
  const { request, env } = context;
  try {
    const url = new URL(request.url);

    const id = url.searchParams.get('id');
    const format = url.searchParams.get('format') || 'viewer'; // 'viewer' | 'txt'

    const user = await getSessionUser(request, env);
    if (!user) return Response.json({ error: 'Not authenticated' }, { status: 401 });

    if (!id) return Response.json({ error: 'Missing article id' }, { status: 400 });

    const isAdmin = user.role === 'admin' || user.role === 'super_admin';

    let article;
    if (isAdmin) {
      // Admins can view any article with content
      article = await env.submoacontent_db.prepare(`
        SELECT id, user_id, account_id, topic, author, email, article_format, article_content, content_path, status, created_at, optimization_target, tone_stance, article_images, youtube_url, youtube_transcript, generated_image_key
        FROM submissions WHERE id = ? AND article_content IS NOT NULL
      `).bind(id).first();
    } else {
      // Regular users only see their own articles
      article = await env.submoacontent_db.prepare(`
        SELECT id, user_id, account_id, topic, author, email, article_format, article_content, content_path, status, created_at, optimization_target, tone_stance, article_images, youtube_url, youtube_transcript, generated_image_key
        FROM submissions WHERE id = ? AND account_id = ? AND article_content IS NOT NULL
      `).bind(id, user.account_id).first();
    }

    if (!article) return Response.json({ error: 'Article not found' }, { status: 404 });

    const content = article.article_content || '';
    const filename = (article.content_path || 'article').replace('/content/', '').replace('.md', '');

    if (format === 'txt') {
      const text = markdownToText(content);
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

    // viewer format - return the article content as JSON for the client to render
    return json({ article, content });

  } catch (err: any) {
    return Response.json({ error: err.message ?? 'Unknown error' }, { status: 500 });
  }
}
