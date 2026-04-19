import { json, requireWritebackAuth } from '../../../_utils';

// GET /api/admin/agent/tasks?status= — list tasks
export async function onRequest(context: any) {
  const auth = await requireWritebackAuth(context.request, context.env);
  if (!auth.ok) return auth.response;

  if (context.request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  const url = new URL(context.request.url);
  const status = url.searchParams.get('status');
  const where = status ? 'WHERE status = ?' : '';
  const stmt = context.env.submoacontent_db.prepare(
    `SELECT id, title, status, created_at, started_at, completed_at, summary FROM agent_tasks ${where} ORDER BY created_at DESC LIMIT 100`
  );
  const rows = status ? await stmt.bind(status).all() : await stmt.all();
  return json({ tasks: rows.results || [] });
}
