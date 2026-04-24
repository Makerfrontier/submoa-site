// GET /api/transcripts/:id — full transcript + speakers + chapters.
// Owner-scoped.

import { getSessionUser, json } from '../_utils';

export async function onRequest(context: { request: Request; env: any; params: { id: string } }) {
  const { request, env, params } = context;
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);

  const t: any = await env.submoacontent_db
    .prepare(`SELECT * FROM transcripts WHERE id = ?`)
    .bind(params.id).first();
  if (!t) return json({ error: 'Not found' }, 404);
  if (t.user_id !== user.id) return json({ error: 'Forbidden' }, 403);

  const speakers: any = await env.submoacontent_db
    .prepare(`SELECT id, speaker_key, display_name, word_count, total_seconds FROM transcript_speakers WHERE transcript_id = ?`)
    .bind(params.id).all();

  const highlights: any = await env.submoacontent_db
    .prepare(`SELECT id, start_word_index, end_word_index, highlight_text, note, created_at FROM transcript_highlights WHERE transcript_id = ? ORDER BY created_at ASC`)
    .bind(params.id).all();

  let transcript_json: any = [];
  try { transcript_json = JSON.parse(t.transcript_json || '[]'); } catch {}
  let chapters: any = [];
  try { chapters = JSON.parse(t.chapters_json || '[]'); } catch {}

  return json({
    transcript: {
      id: t.id,
      source_type: t.source_type,
      source_url: t.source_url,
      source_filename: t.source_filename,
      source_r2_key: t.source_r2_key,
      video_title: t.video_title,
      video_thumbnail_url: t.video_thumbnail_url,
      video_duration_seconds: t.video_duration_seconds,
      detected_language: t.detected_language,
      transcription_provider: t.transcription_provider,
      transcription_tier: t.transcription_tier,
      status: t.status,
      current_step: t.current_step,
      progress_percent: t.progress_percent,
      error_message: t.error_message,
      created_at: t.created_at,
      updated_at: t.updated_at,
      transcript_json,
      transcript_text: t.transcript_text || '',
      chapters,
    },
    speakers: speakers.results || [],
    highlights: highlights.results || [],
  });
}
