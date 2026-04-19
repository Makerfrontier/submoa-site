// POST /api/admin/danger/delete-item  { content_type, id }
// Super-admin only. Deletes a single row by id. Cascades R2 assets where
// applicable. Writes a legislative_audit_log entry.
import { getSessionUser, json, generateId } from '../../_utils';
import type { Env } from '../../_utils';

const CONFIG: Record<string, { table: string; pk?: string; r2Columns?: string[] }> = {
  submissions:        { table: 'submissions',             pk: 'id', r2Columns: ['generated_image_key', 'custom_featured_image_key', 'infographic_r2_key'] },
  itineraries:        { table: 'itinerary_submissions',   pk: 'id', r2Columns: ['pdf_r2_key'] },
  comp_drafts:        { table: 'comp_studio_drafts',      pk: 'id', r2Columns: ['thumbnail_r2_key'] },
  legislation:        { table: 'legislation',             pk: 'id' },
  legislative_briefs: { table: 'legislative_briefs',      pk: 'id' },
  html_templates:     { table: 'html_templates',          pk: 'id', r2Columns: ['r2_key'] },
};

async function tableExists(env: Env, name: string): Promise<boolean> {
  try {
    const row: any = await env.submoacontent_db
      .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name = ?")
      .bind(name).first();
    return !!row;
  } catch { return false; }
}

async function writeAudit(env: Env, userId: string, action: string, contentType: string, count: number, targetId?: string) {
  try {
    const id = generateId();
    await env.submoacontent_db
      .prepare('INSERT INTO legislative_audit_log (id, user_id, action, content_type, count_deleted, target_id, created_at) VALUES (?, ?, ?, ?, ?, ?, unixepoch())')
      .bind(id, userId, action, contentType, count, targetId || null)
      .run();
  } catch (e) { console.error('[danger] audit write failed:', e); }
}

export async function onRequest(context: { request: Request; env: Env }) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);
  if (user.role !== 'super_admin') return json({ error: 'Forbidden — super_admin only' }, 403);

  if (env.ENVIRONMENT === 'production' && !env.DANGER_ENABLED) {
    return new Response('Danger endpoints disabled in production', { status: 403 });
  }

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const contentType = String(body.content_type || '');
  const itemId = String(body.id || '').trim();
  const cfg = CONFIG[contentType];
  if (!cfg) return json({ error: 'Unknown content_type' }, 400);
  if (!itemId) return json({ error: 'id is required' }, 400);
  if (!(await tableExists(env, cfg.table))) {
    return json({ error: `Table ${cfg.table} does not exist in this deployment` }, 400);
  }

  // Fetch the row first to grab R2 keys
  let row: any = null;
  try {
    row = await env.submoacontent_db.prepare(`SELECT * FROM ${cfg.table} WHERE ${cfg.pk} = ?`).bind(itemId).first();
  } catch (e: any) {
    return json({ error: `DB read failed: ${e?.message || e}` }, 500);
  }
  if (!row) return json({ error: 'Not found' }, 404);

  if (cfg.r2Columns) {
    for (const col of cfg.r2Columns) {
      const k = row?.[col];
      if (!k) continue;
      try { await env.SUBMOA_IMAGES.delete(k); } catch {}
    }
  }

  try {
    await env.submoacontent_db.prepare(`DELETE FROM ${cfg.table} WHERE ${cfg.pk} = ?`).bind(itemId).run();
  } catch (e: any) {
    return json({ error: `DB delete failed: ${e?.message || e}` }, 500);
  }

  await writeAudit(env, user.id, 'delete_item', contentType, 1, itemId);
  return json({ success: true, content_type: contentType, id: itemId });
}
