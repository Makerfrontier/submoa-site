// GET /api/legislative/chat/download?chat_id=X — serves the stored HTML export.
import { getSessionUser, json } from '../../_utils';

export async function onRequest(context: { request: Request; env: any }) {
  const { request, env } = context;
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);

  const url = new URL(request.url);
  const chatId = url.searchParams.get('chat_id');
  if (!chatId) return json({ error: 'chat_id required' }, 400);

  const chat: any = await env.submoacontent_db
    .prepare('SELECT legislation_id FROM legislative_chats WHERE id = ? AND user_id = ?')
    .bind(chatId, user.id).first();
  if (!chat) return json({ error: 'Chat not found' }, 404);

  const key = `legislation/${chat.legislation_id || chatId}/narrative-${chatId}.html`;
  try {
    const obj = await env.SUBMOA_IMAGES.get(key);
    if (!obj) return json({ error: 'Export not found — re-run export first' }, 404);
    const body = await obj.text();
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `attachment; filename="narrative-${chatId}.html"`,
      },
    });
  } catch (e: any) {
    return json({ error: e?.message || 'Server error' }, 500);
  }
}
