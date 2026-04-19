import { json, getSessionUser, generateId } from '../../_utils';

// POST /api/podcasts/one-off
// One-call create of a one-off podcast + its single episode + episode_hosts.
// Keeps the one-off-is-just-a-podcast-with-one-episode model intact, but the
// UI flow stays a single screen instead of walking the user through the
// series wrapper + episode list.
//
// Body: {
//   topic (required),
//   brief?, format_template?, intro_text?, outro_text?,
//   hosts: [{ host_id, position_preset?, position_direction?, speaker_order? }]
// }
// Returns: { podcast_id, episode_id, redirect_url }
export async function onRequest(context: any) {
  if (context.request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const user = await getSessionUser(context.request, context.env);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const accountId = user.account_id || 'makerfrontier';

  const body: any = await context.request.json().catch(() => ({}));
  const topic = String(body?.topic || '').trim();
  if (!topic) return json({ error: 'topic required' }, 400);

  const brief = String(body?.brief || '');
  const formatTemplate = String(body?.format_template || '');
  const introText = String(body?.intro_text || '');
  const outroText = String(body?.outro_text || '');
  const hosts: any[] = Array.isArray(body?.hosts) ? body.hosts : [];

  const podcastId = generateId();
  const episodeId = generateId();
  const now = Math.floor(Date.now() / 1000);

  try {
    // podcast row — name mirrors topic so any surface that falls back to
    // podcasts.name still reads sensibly for one-offs.
    await context.env.submoacontent_db
      .prepare(`
        INSERT INTO podcasts (id, account_id, name, description, series_type, format_template, intro_text, outro_text, episode_count, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'one_off', ?, ?, ?, 1, 'active', ?, ?)
      `)
      .bind(podcastId, accountId, topic, brief, formatTemplate, introText, outroText, now, now)
      .run();

    // episode row
    await context.env.submoacontent_db
      .prepare(`
        INSERT INTO podcast_episodes (id, podcast_id, account_id, episode_number, topic, brief, status, created_at, updated_at)
        VALUES (?, ?, ?, 1, ?, ?, 'script_draft', ?, ?)
      `)
      .bind(episodeId, podcastId, accountId, topic, brief, now, now)
      .run();

    // episode_hosts — only if the user included any; order preserved.
    let order = 0;
    for (const h of hosts) {
      if (!h?.host_id) continue;
      // Validate the host belongs to this account — prevents cross-account host leakage.
      const owns = await context.env.submoacontent_db
        .prepare(`SELECT id FROM hosts WHERE id = ? AND account_id = ?`)
        .bind(h.host_id, accountId).first();
      if (!owns) continue;
      await context.env.submoacontent_db
        .prepare(`
          INSERT INTO episode_hosts (id, episode_id, host_id, position_preset, position_direction, speaker_order)
          VALUES (?, ?, ?, ?, ?, ?)
        `)
        .bind(
          generateId(),
          episodeId,
          h.host_id,
          h.position_preset || 'curious_moderator',
          h.position_direction || '',
          typeof h.speaker_order === 'number' ? h.speaker_order : order,
        )
        .run();
      order++;
    }

    return json({
      podcast_id: podcastId,
      episode_id: episodeId,
      redirect_url: `/podcast-studio/one-off/${episodeId}`,
    });
  } catch (e: any) {
    return json({ error: 'Create failed', detail: String(e?.message || e).slice(0, 200) }, 500);
  }
}
