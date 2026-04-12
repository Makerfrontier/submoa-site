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

export async function onRequest(context) {
  const { env } = context;
  const url = new URL(context.request.url);

  const id = url.searchParams.get('id');
  const format = url.searchParams.get('format') || 'viewer'; // 'viewer' | 'txt'

  const user = await getSessionUser(context.request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);

  if (!id) return json({ error: 'Missing article id' }, 400);

  try {
    const stmt = env.submoacontent_db.prepare(`
      SELECT id, author, email, brief, article_content, content_path, status, created_at
      FROM submissions WHERE id = ?
    `);
    const article = await stmt.bind(id).first();

    if (!article) return json({ error: 'Article not found' }, 404);

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

  } catch (e) {
    return json({ error: e.message }, 500);
  }
}