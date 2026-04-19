// GET /api/prompt-builder — list saved prompts for the caller's account.
import { json, getSessionUser } from '../_utils';

export async function onRequest(context: { request: Request; env: any }) {
  const { request, env } = context;
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const accountId = user.account_id || 'makerfrontier';

  const { results } = await env.submoacontent_db
    .prepare(`SELECT id, target_model, title, prompt_text, conversation_history, created_at
              FROM saved_prompts WHERE account_id = ? ORDER BY created_at DESC LIMIT 100`)
    .bind(accountId).all();
  return json({ prompts: (results || []).map((r: any) => {
    let conv: any[] = [];
    try { conv = r.conversation_history ? JSON.parse(r.conversation_history) : []; } catch {}
    return { ...r, conversation_history: conv };
  }) });
}
