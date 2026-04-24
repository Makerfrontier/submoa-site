// POST /api/transcripts/start
// Two paths:
//   1. URL mode: body { source_type: 'url', url, options }
//      → creates a new row and dispatches a transcribe job to the queue.
//   2. Upload follow-up: body { transcript_id, options }
//      → flips an already-created uploading row to 'queued' and dispatches.
//
// Options: { tier: 'best'|'fast', speakers: 'auto'|1|2|3, timestamps: 'word'|'para'|'off' }

import { getSessionUser, json, generateId } from '../_utils';

function detectPlatform(url: string): string {
  const lc = url.toLowerCase();
  if (/youtube\.com|youtu\.be/.test(lc)) return 'youtube';
  if (/vimeo\.com/.test(lc)) return 'vimeo';
  if (/tiktok\.com/.test(lc)) return 'tiktok';
  if (/x\.com|twitter\.com/.test(lc)) return 'x';
  if (/loom\.com/.test(lc)) return 'loom';
  return 'other';
}

export async function onRequest(context: { request: Request; env: any }) {
  const { request, env } = context;
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);

  if (env.ATOMIC_TRANSCRIPTION_ENABLED !== 'true' && env.ATOMIC_TRANSCRIPTION_ENABLED !== true) {
    return json({ error: 'Atomic Transcription is not yet enabled' }, 503);
  }

  const body: any = await request.json().catch(() => ({}));
  const options = body?.options || {};
  const tier = options.tier === 'fast' ? 'fast' : 'best';
  const speakers = ['1', '2', '3'].includes(String(options.speakers)) ? Number(options.speakers) : null; // null == auto
  const timestamps = options.timestamps === 'para' ? 'para' : options.timestamps === 'off' ? 'off' : 'word';
  const now = Math.floor(Date.now() / 1000);

  let transcriptId: string;

  if (body?.transcript_id) {
    // Upload follow-up.
    const existing: any = await env.submoacontent_db
      .prepare(`SELECT id, user_id, status, source_r2_key FROM transcripts WHERE id = ?`)
      .bind(body.transcript_id).first();
    if (!existing) return json({ error: 'Transcript not found' }, 404);
    if (existing.user_id !== user.id) return json({ error: 'Forbidden' }, 403);
    if (existing.status !== 'uploading') return json({ error: 'Transcript not in uploading state' }, 409);
    transcriptId = existing.id;
    await env.submoacontent_db.prepare(
      `UPDATE transcripts SET status='queued', current_step='FETCH', progress_percent=0,
              transcription_tier=?, speaker_count=?, updated_at=?
       WHERE id = ?`
    ).bind(tier, speakers, now, transcriptId).run();
  } else {
    // URL mode.
    const url = String(body?.url || '').trim();
    if (!url) return json({ error: 'url required' }, 400);
    const platform = detectPlatform(url);
    transcriptId = generateId();
    await env.submoacontent_db.prepare(
      `INSERT INTO transcripts (id, user_id, source_type, source_url, status, current_step,
         progress_percent, transcription_tier, transcription_provider, speaker_count,
         detected_language, video_title, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'queued', 'FETCH', 0, ?, 'assemblyai', ?, NULL, ?, ?, ?)`
    ).bind(
      transcriptId, user.id,
      `url:${platform}`, url,
      tier, speakers,
      `Transcribing ${platform}…`,
      now, now,
    ).run();
  }

  if (!env.GENERATION_QUEUE) {
    await env.submoacontent_db.prepare(
      `UPDATE transcripts SET status='failed', error_message='Queue binding missing', updated_at=? WHERE id = ?`
    ).bind(now, transcriptId).run();
    return json({ error: 'Queue binding missing — consumer deploy required' }, 500);
  }

  await env.GENERATION_QUEUE.send({
    type: 'transcribe',
    transcript_id: transcriptId,
    options: { tier, speakers, timestamps },
    queued_at: Date.now(),
  });

  return json({ transcript_id: transcriptId, status: 'queued' });
}
