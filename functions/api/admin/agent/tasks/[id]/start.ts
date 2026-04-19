import { json, requireWritebackAuth } from '../../../../_utils';

// POST /api/admin/agent/tasks/:id/start
export async function onRequest(context: any) {
  if (context.request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const auth = await requireWritebackAuth(context.request, context.env);
  if (!auth.ok) return auth.response;

  const now = Math.floor(Date.now() / 1000);
  const res = await context.env.submoacontent_db
    .prepare(`UPDATE agent_tasks SET status = 'executing', started_at = COALESCE(started_at, ?) WHERE id = ?`)
    .bind(now, context.params.id)
    .run();
  if (!res.meta?.changes) {
    // Create-on-start path — Claude Code may POST /start for a task it wasn't formally created with
    await context.env.submoacontent_db
      .prepare(`INSERT INTO agent_tasks (id, title, prompt, status, started_at) VALUES (?, 'Ad-hoc task', '', 'executing', ?)`)
      .bind(context.params.id, now)
      .run();
  }
  return json({ ok: true, id: context.params.id, started_at: now });
}
