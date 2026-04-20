import { getSessionUser, json } from '../../../_utils';
import type { Env } from '../../../_utils';

// POST /api/atomic/comp/:id/share — generate (or return existing) share token
// and flip share_enabled = 1. Returns { share_url, token }.
export async function onRequestPost(context: { request: Request; env: Env; params: { id?: string } }) {
  const { request, env, params } = context;

  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);
  const account_id = user.account_id || 'makerfrontier';

  const id = String(params.id || '');
  if (!id) return json({ error: 'Missing id' }, 400);

  const row: any = await env.submoacontent_db
    .prepare(`SELECT id, share_token FROM atomic_comp_drafts WHERE id = ? AND account_id = ?`)
    .bind(id, account_id).first();
  if (!row) return json({ error: 'Not found' }, 404);

  const token = row.share_token || generateShareToken();
  await env.submoacontent_db
    .prepare(`UPDATE atomic_comp_drafts SET share_token = ?, share_enabled = 1, updated_at = unixepoch() WHERE id = ?`)
    .bind(token, id).run();

  const origin = new URL(request.url).origin;
  return json({ share_url: `${origin}/c/${token}`, token });
}

// DELETE /api/atomic/comp/:id/share — disable sharing (keeps the token so
// a later re-enable preserves any outstanding links).
export async function onRequestDelete(context: { request: Request; env: Env; params: { id?: string } }) {
  const user = await getSessionUser(context.request, context.env);
  if (!user) return json({ error: 'Not authenticated' }, 401);
  const account_id = user.account_id || 'makerfrontier';
  const id = String(context.params.id || '');
  if (!id) return json({ error: 'Missing id' }, 400);
  await context.env.submoacontent_db
    .prepare(`UPDATE atomic_comp_drafts SET share_enabled = 0, updated_at = unixepoch()
              WHERE id = ? AND account_id = ?`)
    .bind(id, account_id).run();
  return json({ ok: true });
}

function generateShareToken(): string {
  // 12-char URL-safe token. 36^12 = ~4.7e18 — collision risk negligible.
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < 12; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}
