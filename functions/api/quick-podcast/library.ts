import { json, getSessionUser } from '../_utils';

// GET /api/quick-podcast/library — list this user's quick podcasts, newest first
export async function onRequest(context: any) {
  if (context.request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  const user = await getSessionUser(context.request, context.env);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const accountId = user.account_id || 'makerfrontier';

  const rows = await context.env.submoacontent_db
    .prepare(`
      SELECT id, topic, status, audio_duration_seconds, target_length_minutes, mode,
             created_at, updated_at, audio_r2_key,
             (SELECT COUNT(*) FROM episode_hosts WHERE episode_id = podcast_episodes.id) AS host_count
      FROM podcast_episodes
      WHERE account_id = ? AND source = 'quick'
      ORDER BY created_at DESC
      LIMIT 100
    `).bind(accountId).all();
  const base = new URL(context.request.url).origin;
  const items = (rows.results || []).map((r: any) => ({
    id: r.id,
    topic: r.topic,
    status: r.status,
    audio_duration_seconds: r.audio_duration_seconds,
    target_length_minutes: r.target_length_minutes,
    mode: r.mode,
    host_count: r.host_count,
    created_at: r.created_at,
    updated_at: r.updated_at,
    audio_url: r.audio_r2_key ? `${base}/api/quick-podcast/${r.id}/audio` : null,
  }));
  return json({ episodes: items });
}
