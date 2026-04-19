import { json, requireWritebackAuth } from '../../../../_utils';

// POST /api/admin/agent/tasks/:id/complete
// Body: { files_changed[], bugs_closed[], features_updated[], summary }
export async function onRequest(context: any) {
  if (context.request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const auth = await requireWritebackAuth(context.request, context.env);
  if (!auth.ok) return auth.response;

  const body: any = await context.request.json().catch(() => ({}));
  const now = Math.floor(Date.now() / 1000);
  const filesChanged = Array.isArray(body?.files_changed) ? body.files_changed : [];
  const bugsClosed = Array.isArray(body?.bugs_closed) ? body.bugs_closed : [];
  const featuresUpdated = Array.isArray(body?.features_updated) ? body.features_updated : [];
  const summary = body?.summary || null;

  const res = await context.env.submoacontent_db
    .prepare(`
      UPDATE agent_tasks
      SET status = 'complete',
          completed_at = ?,
          files_changed = ?,
          bugs_closed = ?,
          features_updated = ?,
          summary = ?
      WHERE id = ?
    `)
    .bind(
      now,
      JSON.stringify(filesChanged),
      JSON.stringify(bugsClosed),
      JSON.stringify(featuresUpdated),
      summary,
      context.params.id,
    )
    .run();
  if (!res.meta?.changes) {
    // Create-on-complete path
    await context.env.submoacontent_db
      .prepare(`
        INSERT INTO agent_tasks (id, title, prompt, status, completed_at, files_changed, bugs_closed, features_updated, summary)
        VALUES (?, 'Ad-hoc task', '', 'complete', ?, ?, ?, ?, ?)
      `)
      .bind(
        context.params.id,
        now,
        JSON.stringify(filesChanged),
        JSON.stringify(bugsClosed),
        JSON.stringify(featuresUpdated),
        summary,
      )
      .run();
  }
  return json({ ok: true, id: context.params.id, completed_at: now });
}
