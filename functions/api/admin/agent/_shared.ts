import { json, getSessionUser, isAdmin, isSuperAdmin, generateId } from '../../_utils';

export async function requireAgentAdmin(request: Request, env: any) {
  const user = await getSessionUser(request, env);
  if (!user) return { ok: false as const, response: json({ error: 'Unauthorized' }, 401) };
  if (!isAdmin(user) && !isSuperAdmin(user)) return { ok: false as const, response: json({ error: 'Forbidden' }, 403) };
  return { ok: true as const, user };
}

export async function getOrCreateConversation(env: any, accountId: string) {
  const row: any = await env.submoacontent_db
    .prepare(`SELECT * FROM agent_conversations WHERE account_id = ? ORDER BY updated_at DESC LIMIT 1`)
    .bind(accountId)
    .first();
  if (row) return row;
  const id = generateId();
  await env.submoacontent_db
    .prepare(`INSERT INTO agent_conversations (id, account_id, messages) VALUES (?, ?, '[]')`)
    .bind(id, accountId)
    .run();
  return { id, account_id: accountId, messages: '[]' };
}

export async function appendMessage(env: any, conversationId: string, msg: any) {
  const row: any = await env.submoacontent_db
    .prepare(`SELECT messages FROM agent_conversations WHERE id = ?`)
    .bind(conversationId)
    .first();
  const messages = row?.messages ? JSON.parse(row.messages) : [];
  messages.push(msg);
  const trimmed = messages.slice(-100);
  await env.submoacontent_db
    .prepare(`UPDATE agent_conversations SET messages = ?, updated_at = unixepoch() WHERE id = ?`)
    .bind(JSON.stringify(trimmed), conversationId)
    .run();
}
