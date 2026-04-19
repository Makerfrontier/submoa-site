// GET /api/brief-builder/:id
// PUT  /api/brief-builder/:id — update generated_content / status
// DELETE /api/brief-builder/:id
import { json, getSessionUser } from '../_utils';

export async function onRequest(context: { request: Request; env: any; params: { id?: string } }) {
  const { request, env, params } = context;
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  }
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const accountId = user.account_id || 'makerfrontier';
  const id = String(params.id || '');
  if (!id) return json({ error: 'id required' }, 400);

  const row: any = await env.submoacontent_db
    .prepare('SELECT * FROM briefs WHERE id = ? AND account_id = ?')
    .bind(id, accountId).first();
  if (!row) return json({ error: 'Not found' }, 404);
  try { row.field_data = row.field_data ? JSON.parse(row.field_data) : {}; } catch { row.field_data = {}; }

  if (request.method === 'GET') return json({ brief: row });

  if (request.method === 'PUT') {
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
    const updates: string[] = [];
    const args: any[] = [];
    if (typeof body.generated_content === 'string') { updates.push('generated_content = ?'); args.push(body.generated_content); }
    if (typeof body.status === 'string') { updates.push('status = ?'); args.push(body.status); }
    if (body.field_data && typeof body.field_data === 'object') { updates.push('field_data = ?'); args.push(JSON.stringify(body.field_data)); }
    if (updates.length === 0) return json({ error: 'Nothing to update' }, 400);
    updates.push('updated_at = unixepoch()');
    await env.submoacontent_db.prepare(`UPDATE briefs SET ${updates.join(', ')} WHERE id = ?`).bind(...args, id).run();
    const updated = await env.submoacontent_db.prepare('SELECT * FROM briefs WHERE id = ?').bind(id).first();
    return json({ brief: updated });
  }

  if (request.method === 'DELETE') {
    await env.submoacontent_db.prepare('DELETE FROM briefs WHERE id = ?').bind(id).run();
    return json({ success: true });
  }

  return json({ error: 'Method not allowed' }, 405);
}
