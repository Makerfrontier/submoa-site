import { json, requireWritebackAuth } from '../../../_utils';

// POST /api/admin/bugs/:id/reopen
export async function onRequest(context: any) {
  if (context.request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const auth = await requireWritebackAuth(context.request, context.env);
  if (!auth.ok) return auth.response;

  const id = context.params.id;
  const res = await context.env.submoacontent_db
    .prepare(`UPDATE bug_reports SET status = 'open', closed_at = NULL, closed_in_task_id = NULL WHERE id = ?`)
    .bind(id)
    .run();
  if (!res.meta?.changes) return json({ error: 'Bug not found' }, 404);
  return json({ ok: true, id });
}
