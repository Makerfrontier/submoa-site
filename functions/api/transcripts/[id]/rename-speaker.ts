// POST /api/transcripts/:id/rename-speaker
// Body: { speaker_key, display_name }

import { getSessionUser, json } from '../../_utils';

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
  const speakerKey = String(body?.speaker_key || '').trim();
  const displayName = String(body?.display_name || '').trim().slice(0, 80);
  if (!speakerKey || !displayName) return json({ error: 'speaker_key and display_name required' }, 400);

  await env.submoacontent_db.prepare(
    `UPDATE transcript_speakers SET display_name = ? WHERE transcript_id = ? AND speaker_key = ?`
  ).bind(displayName, params.id, speakerKey).run();

  return json({ ok: true });
}
