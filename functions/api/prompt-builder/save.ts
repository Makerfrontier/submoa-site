// POST /api/prompt-builder/save  { target_model, title, prompt_text, conversation_history }
import { json, getSessionUser, generateId } from '../_utils';

export async function onRequest(context: { request: Request; env: any }) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const accountId = user.account_id || 'makerfrontier';

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const target_model = String(body.target_model || '').trim().slice(0, 80);
  const title = String(body.title || '').trim().slice(0, 200);
  const prompt_text = String(body.prompt_text || '').trim();
  const conversation = Array.isArray(body.conversation_history) ? body.conversation_history : [];
  if (!target_model || !prompt_text) return json({ error: 'target_model and prompt_text required' }, 400);

  const id = generateId();
  await env.submoacontent_db.prepare(
    `INSERT INTO saved_prompts (id, account_id, target_model, title, prompt_text, conversation_history, created_at)
     VALUES (?, ?, ?, ?, ?, ?, unixepoch())`
  ).bind(id, accountId, target_model, title || null, prompt_text, JSON.stringify(conversation)).run();

  const row = await env.submoacontent_db
    .prepare('SELECT id, target_model, title, prompt_text, conversation_history, created_at FROM saved_prompts WHERE id = ?')
    .bind(id).first();
  return json({ prompt: row });
}
