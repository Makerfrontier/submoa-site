import { json, requireWritebackAuth } from '../../_utils';

// GET   /api/admin/bugs/:id
// PATCH /api/admin/bugs/:id — update fields (status, notes, feature_slug, ...)
export async function onRequest(context: any) {
  const auth = await requireWritebackAuth(context.request, context.env);
  if (!auth.ok) return auth.response;
  const id = context.params.id;

  if (context.request.method === 'GET') {
    const row = await context.env.submoacontent_db
      .prepare(`SELECT * FROM bug_reports WHERE id = ?`)
      .bind(id)
      .first();
    if (!row) return json({ error: 'Not found' }, 404);
    return json({ bug: row });
  }

  if (context.request.method === 'PATCH') {
    const body: any = await context.request.json();
    const allowed = ['feature_slug', 'title', 'description', 'expected', 'severity', 'status', 'notes', 'closed_in_task_id'];
    const sets: string[] = [];
    const vals: any[] = [];
    for (const k of allowed) {
      if (body[k] === undefined) continue;
      sets.push(`${k} = ?`);
      vals.push(body[k]);
    }
    if (body.status === 'closed' && !body.closed_at) {
      sets.push('closed_at = ?');
      vals.push(Math.floor(Date.now() / 1000));
    }
    if (body.status === 'open' || body.status === 'reopened') {
      sets.push('closed_at = NULL');
    }
    if (sets.length === 0) return json({ error: 'No fields to update' }, 400);
    vals.push(id);
    const res = await context.env.submoacontent_db
      .prepare(`UPDATE bug_reports SET ${sets.join(', ')} WHERE id = ?`)
      .bind(...vals)
      .run();
    if (!res.meta?.changes) return json({ error: 'Bug not found' }, 404);
    return json({ ok: true });
  }

  return json({ error: 'Method not allowed' }, 405);
}
