import { json, getSessionUser } from '../_utils';

export async function onRequest(context) {
  const { env } = context;
  const url = new URL(context.request.url);

  // GET /api/articles - list all articles
  if (context.request.method === 'GET') {
    const user = await getSessionUser(context.request, env);
    if (!user) return json({ error: 'Not authenticated' }, 401);

    try {
      const stmt = env.submoacontent_db.prepare(`
        SELECT id, author, email, brief, content_path, status, article_content, created_at, updated_at
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

  // PUT /api/articles - update article content
  if (context.request.method === 'PUT') {
    const user = await getSessionUser(context.request, env);
    if (!user) return json({ error: 'Not authenticated' }, 401);

    try {
      const body = await context.request.json();
      const { id, article_content, content_path, status } = body;

      if (!id) return json({ error: 'Missing article id' }, 400);

      // Build update query dynamically
      const updates = [];
      const values = [];

      if (article_content !== undefined) {
        updates.push('article_content = ?');
        values.push(article_content);
      }
      if (content_path !== undefined) {
        updates.push('content_path = ?');
        values.push(content_path);
      }
      if (status !== undefined) {
        updates.push('status = ?');
        values.push(status);
      }

      if (updates.length === 0) {
        return json({ error: 'No fields to update' }, 400);
      }

      updates.push('updated_at = ?');
      values.push(Date.now());
      values.push(id);

      const stmt = env.submoacontent_db.prepare(`
        UPDATE submissions SET ${updates.join(', ')} WHERE id = ?
      `);
      await stmt.run(...values);

      return json({ success: true });
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  }

  return json({ error: 'Method not allowed' }, 405);
}