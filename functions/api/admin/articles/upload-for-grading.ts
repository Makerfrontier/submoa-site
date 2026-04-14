// functions/api/admin/articles/upload-for-grading.ts
// POST /api/admin/articles/upload-for-grading
// Admin tool: upload article text and create a submission ready for grading.

import { json, getSessionUser, generateId } from '../../_utils';

export async function onRequestPost(context: { request: Request; env: any }) {
  const user = await getSessionUser(context.request, context.env);
  if (!user) return json({ error: 'Not authenticated' }, 401);
  if (user.role !== 'admin') return json({ error: 'Forbidden' }, 403);

  let content: string, filename: string;
  try {
    const body = await context.request.json();
    content = body.content;
    filename = body.filename || 'uploaded-article';
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  if (!content || !content.trim()) {
    return json({ error: 'content is required' }, 400);
  }

  const id = generateId();
  const now = Date.now();

  // Derive a topic from the filename (strip extension)
  const topic = filename.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');

  await context.env.submoacontent_db
    .prepare(`
      INSERT INTO submissions
        (id, user_id, account_id, topic, article_format, status, article_content, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'article_done', ?, ?, ?)
    `)
    .bind(id, user.id, user.account_id ?? 'admin', topic, 'upload', content.trim(), now, now)
    .run();

  return json({ success: true, submission_id: id });
}
