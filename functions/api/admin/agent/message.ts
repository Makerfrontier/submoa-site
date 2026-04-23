import { json, generateId } from '../../_utils';
import { requireAgentAdmin, getOrCreateConversation, appendMessage } from './_shared';

// POST /api/admin/agent/message
// Body: { message, current_page, conversation_id? }
//
// Capture-only mode. Every inbound user message is logged verbatim as a new
// bug_reports row — no LLM classification, no summarization, no confirm-then-
// write flows. The assistant only acknowledges "Logged" after the DB write
// succeeds; on failure it surfaces the actual error so users are never
// misled about whether capture happened.
//
// Category / severity / feature assignment are intentionally stored as
// sentinel defaults here; triage happens later in the admin bug list.
export async function onRequest(context: any) {
  if (context.request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const auth = await requireAgentAdmin(context.request, context.env);
  if (!auth.ok) return auth.response;

  const body: any = await context.request.json().catch(() => ({}));
  const userMessage: string = String(body?.message || '').trim();
  if (!userMessage) return json({ error: 'message required' }, 400);
  const currentPage: string = String(body?.current_page || '');
  const accountId = auth.user.account_id || 'makerfrontier';

  let conversationId: string = body?.conversation_id || '';
  if (!conversationId) {
    const conv = await getOrCreateConversation(context.env, accountId);
    conversationId = conv.id;
  }

  const now = Math.floor(Date.now() / 1000);
  await appendMessage(context.env, conversationId, {
    role: 'user', content: userMessage, current_page: currentPage, ts: now,
  });

  const bugId = generateId();
  // Title is the first line / first 120 chars so the bug list remains
  // scannable; full verbatim text goes in description.
  const firstLine = userMessage.split('\n')[0] || userMessage;
  const title = firstLine.slice(0, 120);

  let reply: string;
  try {
    await context.env.submoacontent_db
      .prepare(`
        INSERT INTO bug_reports (id, feature_slug, title, description, expected, severity, status, logged_from_url, logged_by, opened_at)
        VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)
      `)
      .bind(
        bugId,
        'general-uncategorized',
        title,
        userMessage,
        '',
        'minor',
        currentPage,
        auth.user.id,
        now,
      )
      .run();
    reply = 'Logged';
  } catch (e: any) {
    const detail = e?.message || String(e);
    reply = `Log failed: ${detail}`;
    await appendMessage(context.env, conversationId, {
      role: 'assistant', content: reply, intent: 'capture', actions: [], ts: Math.floor(Date.now() / 1000),
    });
    return json({ reply, intent: 'capture', actions: [], conversation_id: conversationId, error: detail }, 500);
  }

  await appendMessage(context.env, conversationId, {
    role: 'assistant', content: reply, intent: 'capture', actions: [], ts: Math.floor(Date.now() / 1000), bug_id: bugId,
  });

  return json({ reply, intent: 'capture', actions: [], conversation_id: conversationId, bug_id: bugId });
}
