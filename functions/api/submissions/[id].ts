import { json, getSessionUser } from '../_utils';

// GET /api/submissions/:id — get single submission
// PUT /api/submissions/:id — update submission (hide, delete, status)
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
        UPDATE submissions
        SET status = 'revision_requested', revision_notes = ?, updated_at = ?
        WHERE id = ? AND user_id = ?
      `);
      await stmt.run(revision_notes.trim(), Date.now(), id, user.id);

      // Fetch updated record to confirm
      const sub = await context.env.submoacontent_db
        .prepare('SELECT * FROM submissions WHERE id = ?').bind(id).first();

      return json({ success: true, submission: sub });
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  }

  // GET /api/submissions/:id
  if (context.request.method === 'GET') {
    const id = (pathname.split('/').filter(Boolean))[2]; // submissions -> api -> id
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
      const { is_hidden, is_deleted, status, article_content } = body;

      // Non-admin can only update their own
      if (user.role !== 'admin') {
        const check = await context.env.submoacontent_db
          .prepare('SELECT id FROM submissions WHERE id = ? AND user_id = ?').bind(id, user.id).first();
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

      updates.push('updated_at = ?');
      values.push(Date.now());
      values.push(id);

      const stmt = context.env.submoacontent_db.prepare(`UPDATE submissions SET ${updates.join(', ')} WHERE id = ?`);
      await stmt.run(...values);

      const sub = await context.env.submoacontent_db.prepare('SELECT * FROM submissions WHERE id = ?').bind(id).first();
      return json({ success: true, submission: sub });

    } catch (e) {
      return json({ error: e.message }, 500);
    }
  }

  return json({ error: 'Method not allowed' }, 405);
}
