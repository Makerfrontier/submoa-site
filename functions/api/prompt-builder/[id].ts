// DELETE /api/prompt-builder/:id — remove a saved prompt (owner only).
import { json, getSessionUser } from '../_utils';

export async function onRequest(context: { request: Request; env: any; params: { id?: string } }) {
  const { request, env, params } = context;
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  }
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const accountId = user.account_id || 'makerfrontier';
  const id = String(params.id || '');
  if (!id) return json({ error: 'id required' }, 400);

  const row: any = await env.submoacontent_db
    .prepare('SELECT id FROM saved_prompts WHERE id = ? AND account_id = ?')
    .bind(id, accountId).first();
  if (!row) return json({ error: 'Not found' }, 404);

  if (request.method === 'DELETE') {
    await env.submoacontent_db.prepare('DELETE FROM saved_prompts WHERE id = ?').bind(id).run();
    return json({ success: true });
  }

  if (request.method === 'GET') {
    const full: any = await env.submoacontent_db
      .prepare('SELECT id, target_model, title, prompt_text, conversation_history, created_at FROM saved_prompts WHERE id = ?')
      .bind(id).first();
    try { full.conversation_history = full.conversation_history ? JSON.parse(full.conversation_history) : []; } catch { full.conversation_history = []; }
    return json({ prompt: full });
  }

  return json({ error: 'Method not allowed' }, 405);
}
