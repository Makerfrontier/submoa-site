// POST /api/transcripts/:id/highlight
// Body: { start_word_index, end_word_index, highlight_text?, note? }

import { getSessionUser, json, generateId } from '../../_utils';

export async function onRequest(context: { request: Request; env: any; params: { id: string } }) {
  const { request, env, params } = context;
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);

  const check: any = await env.submoacontent_db
    .prepare(`SELECT user_id FROM transcripts WHERE id = ?`)
    .bind(params.id).first();
  if (!check) return json({ error: 'Not found' }, 404);
  if (check.user_id !== user.id) return json({ error: 'Forbidden' }, 403);

  const body: any = await request.json().catch(() => ({}));
  const startIdx = Number(body?.start_word_index);
  const endIdx = Number(body?.end_word_index);
  if (!Number.isFinite(startIdx) || !Number.isFinite(endIdx) || endIdx < startIdx) {
    return json({ error: 'start_word_index and end_word_index required' }, 400);
  }
  const text = typeof body?.highlight_text === 'string' ? body.highlight_text.slice(0, 4000) : '';
  const note = typeof body?.note === 'string' ? body.note.slice(0, 1000) : '';
  const id = generateId();
  const now = Math.floor(Date.now() / 1000);

  await env.submoacontent_db.prepare(
    `INSERT INTO transcript_highlights (id, transcript_id, user_id, start_word_index, end_word_index, highlight_text, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, params.id, user.id, startIdx, endIdx, text, note, now).run();

  return json({ id, created_at: now });
}
