// POST /api/transcripts/:id/edit
// Accepts { transcript_json, transcript_text } and replaces the stored
// versions. Word-boundary integrity is the client's responsibility —
// the server just persists what comes in.

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
  const transcriptJson = body?.transcript_json ? JSON.stringify(body.transcript_json) : null;
  const transcriptText = typeof body?.transcript_text === 'string' ? body.transcript_text : null;
  if (!transcriptJson && transcriptText == null) return json({ error: 'Nothing to save' }, 400);

  const now = Math.floor(Date.now() / 1000);
  await env.submoacontent_db.prepare(
    `UPDATE transcripts
     SET transcript_json = COALESCE(?, transcript_json),
         transcript_text = COALESCE(?, transcript_text),
         updated_at = ?
     WHERE id = ?`
  ).bind(transcriptJson, transcriptText, now, params.id).run();

  return json({ ok: true });
}
