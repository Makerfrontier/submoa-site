import { json, generateId, requireWritebackAuth } from '../../../_utils';

// POST /api/admin/agent/tasks/create
// Body: { id?, title, prompt, conversation_id? }
export async function onRequest(context: any) {
  if (context.request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const auth = await requireWritebackAuth(context.request, context.env);
  if (!auth.ok) return auth.response;

  const body: any = await context.request.json();
  if (!body?.title || !body?.prompt) return json({ error: 'title and prompt required' }, 400);
  const id = body.id || generateId();
  try {
    await context.env.submoacontent_db
      .prepare(`INSERT INTO agent_tasks (id, conversation_id, title, prompt, status) VALUES (?, ?, ?, ?, 'pending_execution')`)
      .bind(id, body.conversation_id || null, body.title, body.prompt)
      .run();
    return json({ ok: true, id });
  } catch (e: any) {
    // Idempotent — if task already exists, return existing
    const existing = await context.env.submoacontent_db
      .prepare(`SELECT id FROM agent_tasks WHERE id = ?`).bind(id).first();
    if (existing) return json({ ok: true, id, existing: true });
    return json({ error: e.message }, 400);
  }
}
