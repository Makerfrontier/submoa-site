import { json, getSessionUser, generateId } from '../_utils';
import { isUrlInput } from '../../../src/quick-podcast-research';

// POST /api/quick-podcast/generate
// Body: { topic, length_minutes?, mode?: 'conversation'|'solo' }
// Creates a quick-episode row attached to the user's hidden "Quick Podcasts"
// system series, enqueues a podcast_audio-style pipeline job, returns
// { episode_id, status: 'researching' } immediately.
export async function onRequest(context: any) {
  if (context.request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const user = await getSessionUser(context.request, context.env);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const accountId = user.account_id || 'makerfrontier';

  const body: any = await context.request.json().catch(() => ({}));
  const topic = String(body?.topic || '').trim();
  if (!topic) return json({ error: 'topic required' }, 400);
  const lengthMinutes = [5, 10, 15, 20].includes(Number(body?.length_minutes)) ? Number(body.length_minutes) : 10;
  const mode = body?.mode === 'solo' ? 'solo' : 'conversation';

  // Lazy-create the hidden system series for this account on first quick episode.
  let systemSeries: any = await context.env.submoacontent_db
    .prepare(`SELECT id, episode_count FROM podcasts WHERE account_id = ? AND is_system_series = 1 LIMIT 1`)
    .bind(accountId).first();
  if (!systemSeries) {
    const podId = generateId();
    await context.env.submoacontent_db
      .prepare(`
        INSERT INTO podcasts (id, account_id, name, description, series_type, episode_count, status, is_system_series)
        VALUES (?, ?, 'Quick Podcasts', 'On-demand topic podcasts.', 'ongoing', 0, 'active', 1)
      `)
      .bind(podId, accountId).run();
    systemSeries = { id: podId, episode_count: 0 };
  }

  const episodeId = generateId();
  const now = Math.floor(Date.now() / 1000);
  const isUrl = isUrlInput(topic);

  await context.env.submoacontent_db
    .prepare(`
      INSERT INTO podcast_episodes (
        id, podcast_id, account_id, episode_number, topic, brief, status,
        source, research_query, research_sources, target_length_minutes, mode,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, '', 'researching', 'quick', ?, '[]', ?, ?, ?, ?)
    `)
    .bind(
      episodeId, systemSeries.id, accountId,
      (Number(systemSeries.episode_count) || 0) + 1,
      topic,
      isUrl ? `URL: ${topic}` : topic,
      lengthMinutes,
      mode,
      now, now,
    )
    .run();

  if (!context.env.GENERATION_QUEUE) {
    // No queue binding — mark failed so caller sees it; they can retry after deploy.
    await context.env.submoacontent_db
      .prepare(`UPDATE podcast_episodes SET status = 'failed', updated_at = unixepoch() WHERE id = ?`)
      .bind(episodeId).run();
    return json({ error: 'Queue binding missing — Pages/consumer deploy required' }, 500);
  }

  await context.env.GENERATION_QUEUE.send({
    type: 'quick_podcast',
    episode_id: episodeId,
    queued_at: Date.now(),
  });

  return json({ episode_id: episodeId, status: 'researching' });
}
