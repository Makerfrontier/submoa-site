// DELETE /api/admin/submissions/:id — admin-only.
// Removes submission row, cascades related rows, deletes every R2 object
// under projects/{id}/ recursively, and writes an audit log entry.
import { getSessionUser, isAdmin, json, generateId } from '../../_utils';
import { writeAudit } from '../../../../src/auth-utils';

export async function onRequest(context: { request: Request; env: any; params: { id?: string } }) {
  const { request, env, params } = context;
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  }
  if (request.method !== 'DELETE') return json({ error: 'Method not allowed' }, 405);

  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);
  if (!isAdmin(user)) return json({ error: 'Forbidden — admin only' }, 403);

  const id = String(params.id || '').trim();
  if (!id) return json({ error: 'Missing id' }, 400);

  // Confirm the submission exists so we don't nuke R2 for a bogus id.
  const row: any = await env.submoacontent_db
    .prepare('SELECT id FROM submissions WHERE id = ?').bind(id).first();
  if (!row) return json({ error: 'Submission not found' }, 404);

  // Cascade related tables that reference submission_id.
  const cascadeTables = [
    'grades', 'revision_reviews', 'article_flags', 'article_feedback',
    'flag_analytics', 'email_submissions', 'presentation_submissions',
    'infographic_submissions', 'email_assets', 'share_links', 'notifications',
  ];
  for (const t of cascadeTables) {
    try { await env.submoacontent_db.prepare(`DELETE FROM ${t} WHERE submission_id = ?`).bind(id).run(); } catch {}
  }
  try { await env.submoacontent_db.prepare('DELETE FROM submissions WHERE id = ?').bind(id).run(); }
  catch (e: any) { return json({ error: `DB delete failed: ${e?.message || e}` }, 500); }

  // Recursive R2 sweep under projects/{id}/
  let deleted = 0;
  try {
    let cursor: string | undefined = undefined;
    for (let i = 0; i < 20; i++) { // safety cap — R2 list returns up to 1000 per page
      const list: any = await env.SUBMOA_IMAGES.list({ prefix: `projects/${id}/`, cursor });
      const objs = list?.objects || [];
      for (const o of objs) {
        try { await env.SUBMOA_IMAGES.delete(o.key); deleted++; } catch {}
      }
      if (!list?.truncated) break;
      cursor = list.cursor;
    }
  } catch (e) {
    console.error('[admin/submissions DELETE] r2 sweep failed:', e);
  }

  await writeAudit(env, request, user.id, { action: 'submission-deleted', details: { submission_id: id, r2_deleted: deleted } });
  return json({ success: true, r2_deleted: deleted });
}
