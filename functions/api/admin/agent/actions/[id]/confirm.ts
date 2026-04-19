import { json, generateId } from '../../../../_utils';
import { requireAgentAdmin } from '../../_shared';

// POST /api/admin/agent/actions/:id/confirm
// Executes a proposed action, returns { result, details }.
export async function onRequest(context: any) {
  if (context.request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const auth = await requireAgentAdmin(context.request, context.env);
  if (!auth.ok) return auth.response;

  const id = context.params.id;
  const row: any = await context.env.submoacontent_db
    .prepare(`SELECT * FROM agent_actions WHERE id = ?`)
    .bind(id)
    .first();
  if (!row) return json({ error: 'Action not found' }, 404);
  if (row.status !== 'proposed') return json({ error: 'Action not in proposed state', status: row.status }, 400);

  let payload: any = {};
  try { payload = JSON.parse(row.payload || '{}'); } catch {}
  const loggedBy = auth.user.email;
  let details: any = null;

  try {
    if (row.action_type === 'file_bug') {
      const bugId = generateId();
      await context.env.submoacontent_db
        .prepare(`
          INSERT INTO bug_reports (id, feature_slug, title, description, expected, severity, status, logged_from_url, logged_by)
          VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?)
        `)
        .bind(
          bugId,
          payload.feature_slug,
          payload.title,
          payload.description || '',
          payload.expected || '',
          payload.severity || 'minor',
          payload.logged_from_url || null,
          loggedBy,
        )
        .run();
      details = { bug_id: bugId };
    } else if (row.action_type === 'update_feature_spec') {
      const slug = payload.slug;
      if (!slug) throw new Error('slug missing');
      const allowed = ['name', 'status', 'what_it_does', 'how_its_built', 'behavior', 'pending', 'source_files', 'db_tables', 'r2_paths', 'endpoints', 'external_apis'];
      const JSON_FIELDS = ['pending', 'source_files', 'db_tables', 'r2_paths', 'endpoints', 'external_apis'];
      const sets: string[] = [];
      const vals: any[] = [];
      for (const k of allowed) {
        if (payload[k] === undefined) continue;
        sets.push(`${k} = ?`);
        vals.push(JSON_FIELDS.includes(k) ? JSON.stringify(payload[k]) : payload[k]);
      }
      if (sets.length) {
        sets.push('last_updated = ?', 'last_updated_by = ?');
        vals.push(Math.floor(Date.now() / 1000), loggedBy);
        vals.push(slug);
        await context.env.submoacontent_db
          .prepare(`UPDATE features SET ${sets.join(', ')} WHERE slug = ?`)
          .bind(...vals)
          .run();
      }
      details = { slug };
    } else if (row.action_type === 'log_decision') {
      const did = generateId();
      await context.env.submoacontent_db
        .prepare(`INSERT INTO decisions (id, summary, context, feature_slug, logged_by) VALUES (?, ?, ?, ?, ?)`)
        .bind(did, payload.summary || '(no summary)', payload.context || '', payload.feature_slug || null, loggedBy)
        .run();
      details = { decision_id: did };
    } else if (row.action_type === 'close_bug') {
      const bugId = payload.bug_id;
      if (!bugId) throw new Error('bug_id missing');
      const now = Math.floor(Date.now() / 1000);
      const res = await context.env.submoacontent_db
        .prepare(`UPDATE bug_reports SET status = 'closed', closed_at = ?, closed_in_task_id = ?, notes = COALESCE(?, notes) WHERE id = ?`)
        .bind(now, payload.closed_in_task_id || null, payload.notes || null, bugId)
        .run();
      if (!res.meta?.changes) throw new Error('Bug not found');
      details = { bug_id: bugId, closed_at: now };
    } else if (row.action_type === 'create_task') {
      const taskId = payload.id || generateId();
      await context.env.submoacontent_db
        .prepare(`
          INSERT INTO agent_tasks (id, conversation_id, title, prompt, status)
          VALUES (?, ?, ?, ?, 'pending_execution')
        `)
        .bind(taskId, row.conversation_id, payload.title || 'Untitled', payload.prompt || '')
        .run();
      details = { task_id: taskId };
    } else {
      throw new Error(`Unknown action type: ${row.action_type}`);
    }

    await context.env.submoacontent_db
      .prepare(`UPDATE agent_actions SET status = 'confirmed', confirmed_at = unixepoch(), result = ? WHERE id = ?`)
      .bind(JSON.stringify(details), id)
      .run();

    return json({ ok: true, result: 'success', details });
  } catch (e: any) {
    await context.env.submoacontent_db
      .prepare(`UPDATE agent_actions SET status = 'failed', result = ? WHERE id = ?`)
      .bind(JSON.stringify({ error: e.message }), id)
      .run();
    return json({ error: e.message }, 500);
  }
}
