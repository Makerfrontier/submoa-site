// POST /api/legislative/chat/export  { chat_id }
// Serializes a chat into a simple HTML document, stores in R2, returns URL.
// Uses HTML instead of .docx to avoid pulling a new dependency — most DOCX
// libraries blow past the Workers bundle size. The export file ends in .html
// and is named narrative-{chat_id}.html.
import { getSessionUser, json, generateId } from '../../_utils';
import { requirePageAccess, writeAudit, AccessError } from '../../../../src/auth-utils';

function escapeHtml(s: string) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
}

function buildHtml(args: { title: string; bill: any; rep: any; party: string | null; messages: any[] }) {
  const { title, bill, rep, party, messages } = args;
  const billBlock = bill ? `<h2>Bill</h2><p><strong>${escapeHtml(bill.bill_id)}</strong> — ${escapeHtml(bill.title)}</p><p>${escapeHtml(bill.status || '')}</p>` : '';
  const repBlock = rep ? `<h2>Representative</h2><p>${escapeHtml(rep.name)} (${escapeHtml(rep.party || '')}, ${escapeHtml(rep.state || '')}-${escapeHtml(rep.district || '')})</p>` : '';
  const partyBlock = party ? `<h2>Party focus</h2><p>${escapeHtml(party)}</p>` : '';
  const chat = messages.map((m: any) =>
    `<div style="margin:12px 0"><div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#B8872E">${escapeHtml(m.role)}</div><div style="white-space:pre-wrap;font-family:Georgia,serif;font-size:14px;line-height:1.6;color:#221A10">${escapeHtml(m.content)}</div></div>`
  ).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>body{font-family:'DM Sans',sans-serif;background:#FAF7F2;color:#221A10;max-width:720px;margin:40px auto;padding:24px}h1{font-family:'Playfair Display',Georgia,serif;font-size:28px;margin-bottom:8px}h2{font-family:'Playfair Display',Georgia,serif;font-size:18px;margin-top:24px;border-bottom:1px solid #CDC5B4;padding-bottom:4px}</style></head><body><h1>${escapeHtml(title)}</h1>${billBlock}${repBlock}${partyBlock}<h2>Conversation</h2>${chat}</body></html>`;
}

export async function onRequest(context: { request: Request; env: any }) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);
  try { await requirePageAccess(user, env, 'legislative-intelligence', 'export-brief'); }
  catch (e: any) { return json({ error: e.message }, e instanceof AccessError ? e.status : 403); }

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const chat_id = String(body.chat_id || '').trim();
  if (!chat_id) return json({ error: 'chat_id required' }, 400);

  const chat: any = await env.submoacontent_db
    .prepare('SELECT * FROM legislative_chats WHERE id = ? AND user_id = ?')
    .bind(chat_id, user.id).first();
  if (!chat) return json({ error: 'Chat not found' }, 404);

  let bill: any = null;
  if (chat.legislation_id) bill = await env.submoacontent_db.prepare('SELECT * FROM legislation WHERE id = ?').bind(chat.legislation_id).first();
  let rep: any = null;
  if (chat.rep_profile_id) rep = await env.submoacontent_db.prepare('SELECT * FROM rep_profiles WHERE id = ?').bind(chat.rep_profile_id).first();
  let messages: any[] = [];
  try { messages = JSON.parse(chat.messages || '[]'); } catch {}

  const html = buildHtml({ title: chat.title || 'Narrative Draft', bill, rep, party: chat.party, messages });
  const r2Key = `legislation/${bill?.id || chat_id}/narrative-${chat_id}.html`;
  try {
    await env.SUBMOA_IMAGES.put(r2Key, html, { httpMetadata: { contentType: 'text/html; charset=utf-8' } });
  } catch (e: any) {
    return json({ error: `R2 write failed: ${e?.message || e}` }, 500);
  }

  const downloadUrl = `/api/legislative/chat/download?chat_id=${encodeURIComponent(chat_id)}`;
  await writeAudit(env, request, user.id, { action: 'chat-exported', legislation_id: bill?.id || null, details: { chat_id, r2Key } });
  return json({ url: downloadUrl, r2_key: r2Key });
}
