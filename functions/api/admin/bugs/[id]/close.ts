import { json, requireWritebackAuth } from '../../../_utils';

// POST /api/admin/bugs/:id/close
// Body: { closed_in_task_id?, notes? }
// Accepts super admin session OR CLAUDE_CODE_API_KEY bearer.
export async function onRequest(context: any) {
  if (context.request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const auth = await requireWritebackAuth(context.request, context.env);
  if (!auth.ok) return auth.response;

  const id = context.params.id;
  const body: any = await context.request.json().catch(() => ({}));
  const now = Math.floor(Date.now() / 1000);
  const res = await context.env.submoacontent_db
    .prepare(`UPDATE bug_reports SET status = 'closed', closed_at = ?, closed_in_task_id = ?, notes = COALESCE(?, notes) WHERE id = ?`)
    .bind(now, body.closed_in_task_id || null, body.notes || null, id)
    .run();
  if (!res.meta?.changes) return json({ error: 'Bug not found' }, 404);
  return json({ ok: true, id, closed_at: now });
}
