// GET /api/reactor/conversation/:id — returns conversation metadata + messages.
// Owner-scoped so users can only load their own conversations.

import { getSessionUser, json } from '../../_utils';

export async function onRequest(context: { request: Request; env: any; params: { id: string } }) {
  const { request, env, params } = context;
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);

  const conv: any = await env.submoacontent_db
    .prepare(`SELECT id, user_id, title, created_at, updated_at, message_count FROM reactor_conversations WHERE id = ? AND user_id = ?`)
    .bind(params.id, user.id).first();
  if (!conv) return json({ error: 'Not found' }, 404);

  const msgs: any = await env.submoacontent_db
    .prepare(`SELECT id, role, content, model_used, task_type, artifact_url, saved_to_feature, saved_to_id, created_at
              FROM reactor_messages WHERE conversation_id = ? ORDER BY created_at ASC`)
    .bind(params.id).all();

  return json({ conversation: conv, messages: msgs.results || [] });
}
