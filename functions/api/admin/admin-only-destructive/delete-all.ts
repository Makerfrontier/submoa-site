// POST /api/admin/danger/delete-all  { content_type }
// Super-admin only. Deletes every row of the requested content type and
// cascades any R2-backed assets. Every invocation writes a
// legislative_audit_log row with the caller's user id, action, type, count.
import { getSessionUser, json, generateId } from '../../_utils';
import type { Env } from '../../_utils';

// Map content_type → table name + R2 key column(s) to clean up.
const CONFIG: Record<string, { table: string; r2Columns?: string[] }> = {
  submissions:        { table: 'submissions',             r2Columns: ['generated_image_key', 'custom_featured_image_key', 'infographic_r2_key'] },
  itineraries:        { table: 'itinerary_submissions',   r2Columns: ['pdf_r2_key'] },
  comp_drafts:        { table: 'comp_studio_drafts',      r2Columns: ['thumbnail_r2_key'] },
  legislation:        { table: 'legislation' },
  legislative_briefs: { table: 'legislative_briefs' },
  html_templates:     { table: 'html_templates',          r2Columns: ['r2_key'] },
};

async function tableExists(env: Env, name: string): Promise<boolean> {
  try {
    const row: any = await env.submoacontent_db
      .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name = ?")
      .bind(name).first();
    return !!row;
  } catch { return false; }
}

async function writeAudit(env: Env, userId: string, action: string, contentType: string, count: number, targetId?: string, metadata?: any) {
  try {
    const id = generateId();
    await env.submoacontent_db
      .prepare('INSERT INTO legislative_audit_log (id, user_id, action, content_type, count_deleted, target_id, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, unixepoch())')
      .bind(id, userId, action, contentType, count, targetId || null, metadata ? JSON.stringify(metadata) : null)
      .run();
  } catch (e) {
    console.error('[danger] audit write failed:', e);
  }
}

async function cleanR2(env: Env, rows: any[], r2Columns: string[]) {
  for (const row of rows) {
    for (const col of r2Columns) {
      const k = row?.[col];
      if (!k) continue;
      try { await env.SUBMOA_IMAGES.delete(k); } catch {}
    }
  }
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
  const cfg = CONFIG[contentType];
  if (!cfg) return json({ error: 'Unknown content_type' }, 400);
  if (!(await tableExists(env, cfg.table))) {
    return json({ error: `Table ${cfg.table} does not exist in this deployment` }, 400);
  }

  // Collect r2 keys before delete
  if (cfg.r2Columns && cfg.r2Columns.length > 0) {
    try {
      const cols = cfg.r2Columns.join(', ');
      const { results } = await env.submoacontent_db.prepare(`SELECT ${cols} FROM ${cfg.table}`).all();
      await cleanR2(env, results || [], cfg.r2Columns);
    } catch (e) {
      console.error('[danger] r2 cleanup failed:', e);
    }
  }

  // Count then delete
  let countDeleted = 0;
  try {
    const countRow: any = await env.submoacontent_db.prepare(`SELECT COUNT(*) AS c FROM ${cfg.table}`).first();
    countDeleted = Number(countRow?.c ?? 0);
    await env.submoacontent_db.prepare(`DELETE FROM ${cfg.table}`).run();
  } catch (e: any) {
    return json({ error: `DB delete failed: ${e?.message || e}` }, 500);
  }

  await writeAudit(env, user.id, 'delete_all', contentType, countDeleted);
  return json({ success: true, deleted: countDeleted, content_type: contentType });
}
