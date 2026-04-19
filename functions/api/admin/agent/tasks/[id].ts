import { json, requireWritebackAuth } from '../../../_utils';

// GET /api/admin/agent/tasks/:id — full task with progress log
export async function onRequest(context: any) {
  if (context.request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  const auth = await requireWritebackAuth(context.request, context.env);
  if (!auth.ok) return auth.response;

  const row: any = await context.env.submoacontent_db
    .prepare(`SELECT * FROM agent_tasks WHERE id = ?`)
    .bind(context.params.id)
    .first();
  if (!row) return json({ error: 'Task not found' }, 404);
  const parse = (v: any) => { try { return JSON.parse(v || '[]'); } catch { return []; } };
  return json({
    task: {
      ...row,
      progress_log: parse(row.progress_log),
      files_changed: parse(row.files_changed),
      bugs_closed: parse(row.bugs_closed),
      features_updated: parse(row.features_updated),
    },
  });
}
