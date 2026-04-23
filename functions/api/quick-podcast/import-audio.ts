// POST /api/quick-podcast/import-audio
// Creates a quick-podcast episode row directly from an externally-sourced
// audio URL. Bypasses the normal generation pipeline because the audio
// already exists — this is the Save-to-Quark-Cast path from the Atomic
// Reactor. Downloads the bytes to R2 so the audio survives if the upstream
// URL expires.

import { getSessionUser, json, generateId } from '../_utils';

interface Env {
  submoacontent_db: any;
  SUBMOA_IMAGES: any;
}

export async function onRequest(context: { request: Request; env: Env }) {
  const { request, env } = context;
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);

  const body: any = await request.json().catch(() => ({}));
  const audioUrl = String(body?.audio_url || '').trim();
  const topic = String(body?.topic || '').trim() || 'Imported audio';
  if (!audioUrl) return json({ error: 'audio_url required' }, 400);

  const accountId = (user as any).account_id || 'makerfrontier';
  const now = Math.floor(Date.now() / 1000);

  // Reuse or create the hidden Quick Podcasts system series for this account.
  let systemSeries: any = await env.submoacontent_db
    .prepare(`SELECT id, episode_count FROM podcasts WHERE account_id = ? AND is_system_series = 1 LIMIT 1`)
    .bind(accountId).first();
  if (!systemSeries) {
    const podId = generateId();
    await env.submoacontent_db.prepare(
      `INSERT INTO podcasts (id, account_id, name, description, series_type, episode_count, status, is_system_series)
       VALUES (?, ?, 'Quick Podcasts', 'On-demand topic podcasts.', 'ongoing', 0, 'active', 1)`
    ).bind(podId, accountId).run();
    systemSeries = { id: podId, episode_count: 0 };
  }

  // Download bytes to R2 so the episode survives if the source URL rots.
  let audioKey: string | null = null;
  try {
    const res = await fetch(audioUrl);
    if (res.ok) {
      const buf = await res.arrayBuffer();
      const episodeId = generateId();
      audioKey = `users/${user.id}/quick-episodes/${episodeId}.audio`;
      await env.SUBMOA_IMAGES.put(audioKey, buf, {
        httpMetadata: { contentType: res.headers.get('content-type') || 'audio/mpeg' },
      });
      // Fall through — we'll insert the episode row next using this key.
      const episodeNumber = (Number(systemSeries.episode_count) || 0) + 1;
      await env.submoacontent_db.prepare(
        `INSERT INTO podcast_episodes (
          id, podcast_id, account_id, user_id, episode_number, topic, brief, status,
          source, audio_r2_key, target_length_minutes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'audio_ready', 'reactor-import', ?, 0, ?, ?)`
      ).bind(
        episodeId, systemSeries.id, accountId, user.id,
        episodeNumber, topic.slice(0, 200), topic.slice(0, 500),
        audioKey, now, now,
      ).run();
      await env.submoacontent_db.prepare(
        `UPDATE podcasts SET episode_count = episode_count + 1 WHERE id = ?`
      ).bind(systemSeries.id).run();
      return json({ episode_id: episodeId, audio_r2_key: audioKey, status: 'audio_ready' });
    }
    return json({ error: `Upstream audio fetch failed: ${res.status}` }, 502);
  } catch (e: any) {
    return json({ error: e?.message || 'Audio import failed' }, 500);
  }
}
