import { json } from '../../_utils';
import { requireAgentAdmin, getOrCreateConversation } from './_shared';

// GET /api/admin/agent/conversation — returns current super admin's conversation
// POST with { clear: true } — wipes conversation (creates fresh one)
export async function onRequest(context: any) {
  const auth = await requireAgentAdmin(context.request, context.env);
  if (!auth.ok) return auth.response;

  const accountId = auth.user.account_id || 'makerfrontier';

  if (context.request.method === 'GET') {
    const conv = await getOrCreateConversation(context.env, accountId);
    let messages: any[] = [];
    try { messages = conv.messages ? JSON.parse(conv.messages) : []; } catch {}
    return json({ id: conv.id, messages });
  }

  if (context.request.method === 'POST') {
    const body: any = await context.request.json().catch(() => ({}));
    if (body?.clear) {
      await context.env.submoacontent_db
        .prepare(`UPDATE agent_conversations SET messages = '[]', updated_at = unixepoch() WHERE account_id = ?`)
        .bind(accountId)
        .run();
      return json({ ok: true });
    }
    return json({ error: 'Unsupported operation' }, 400);
  }

  return json({ error: 'Method not allowed' }, 405);
}
