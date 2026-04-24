// GET /api/transcripts — index of the current user's transcripts, newest first.
// Used by the /atomic/transcription landing's "Recent transcripts" grid.

import { getSessionUser, json } from '../_utils';

export async function onRequest(context: { request: Request; env: any }) {
  const { request, env } = context;
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);

  const url = new URL(request.url);
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '24', 10)));

  const rows: any = await env.submoacontent_db
    .prepare(
      `SELECT id, source_type, video_title, video_thumbnail_url, video_duration_seconds,
              detected_language, speaker_count, status, current_step, progress_percent,
              created_at
       FROM transcripts
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .bind(user.id, limit)
    .all();

  return json({ transcripts: rows.results || [] });
}
