import { json, generateId, requireWritebackAuth } from '../../_utils';

// GET  /api/admin/decisions — list recent decisions
// POST /api/admin/decisions — log new decision
export async function onRequest(context: any) {
  const auth = await requireWritebackAuth(context.request, context.env);
  if (!auth.ok) return auth.response;

  if (context.request.method === 'GET') {
    const result = await context.env.submoacontent_db
      .prepare(`SELECT * FROM decisions ORDER BY created_at DESC LIMIT 100`)
      .all();
    return json({ decisions: result.results || [] });
  }

  if (context.request.method === 'POST') {
    const body: any = await context.request.json();
    if (!body?.summary) return json({ error: 'summary required' }, 400);
    const id = generateId();
    const loggedBy = auth.via === 'bearer' ? 'claude_code' : (auth.user?.email || 'admin');
    await context.env.submoacontent_db
      .prepare(`INSERT INTO decisions (id, summary, context, feature_slug, logged_by) VALUES (?, ?, ?, ?, ?)`)
      .bind(id, body.summary, body.context || '', body.feature_slug || null, loggedBy)
      .run();
    return json({ ok: true, id });
  }

  return json({ error: 'Method not allowed' }, 405);
}
