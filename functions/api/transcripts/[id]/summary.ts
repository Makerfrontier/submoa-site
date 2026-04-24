// GET /api/transcripts/:id/summary
// Cheap hydration for the SourceBanner on destination features. Returns
// just enough metadata to render the banner + pre-fill form fields without
// pulling the full transcript_json / chapters.

import { getSessionUser, json } from '../../_utils';

export async function onRequest(context: { request: Request; env: any; params: { id: string } }) {
  const { request, env, params } = context;
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);

  const row: any = await env.submoacontent_db
    .prepare(
      `SELECT id, user_id, source_type, source_url, video_title, video_thumbnail_url,
              video_duration_seconds, detected_language, speaker_count, status,
              transcript_text, chapters_json
       FROM transcripts WHERE id = ?`
    )
    .bind(params.id).first();
  if (!row) return json({ error: 'Not found' }, 404);
  if (row.user_id !== user.id) return json({ error: 'Forbidden' }, 403);

  const wordCount = String(row.transcript_text || '').split(/\s+/).filter(Boolean).length;
  let chapters: any = [];
  try { chapters = JSON.parse(row.chapters_json || '[]'); } catch {}

  return json({
    id: row.id,
    source_type: row.source_type,
    source_url: row.source_url,
    video_title: row.video_title,
    video_thumbnail_url: row.video_thumbnail_url,
    video_duration_seconds: row.video_duration_seconds,
    detected_language: row.detected_language,
    speaker_count: row.speaker_count,
    status: row.status,
    word_count: wordCount,
    chapters: chapters.slice(0, 8),
    transcript_preview: String(row.transcript_text || '').slice(0, 4000),
  });
}
