import { json, requireWritebackAuth } from '../../../../_utils';

// POST /api/admin/agent/tasks/:id/progress
// Body: { message }
export async function onRequest(context: any) {
  if (context.request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const auth = await requireWritebackAuth(context.request, context.env);
  if (!auth.ok) return auth.response;

  const body: any = await context.request.json().catch(() => ({}));
  const msg = String(body?.message || '').trim();
  if (!msg) return json({ error: 'message required' }, 400);

  const row: any = await context.env.submoacontent_db
    .prepare(`SELECT progress_log FROM agent_tasks WHERE id = ?`)
    .bind(context.params.id)
    .first();
  if (!row) return json({ error: 'Task not found' }, 404);

  let log: any[] = [];
  try { log = JSON.parse(row.progress_log || '[]'); } catch {}
  log.push({ ts: Math.floor(Date.now() / 1000), message: msg });
  await context.env.submoacontent_db
    .prepare(`UPDATE agent_tasks SET progress_log = ? WHERE id = ?`)
    .bind(JSON.stringify(log), context.params.id)
    .run();
  return json({ ok: true, entries: log.length });
}
