import { json, getSessionUser } from '../../_utils';

// GET /api/podcasts/episodes/:ep_id — episode detail + parent podcast meta + hosts,
// looked up by episode_id alone. Used by the one-off detail page where the URL
// only carries the episode id.
export async function onRequest(context: any) {
  if (context.request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  const user = await getSessionUser(context.request, context.env);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const accountId = user.account_id || 'makerfrontier';
  const epId = context.params.ep_id;

  const ep: any = await context.env.submoacontent_db
    .prepare(`SELECT * FROM podcast_episodes WHERE id = ? AND account_id = ?`)
    .bind(epId, accountId).first();
  if (!ep) return json({ error: 'Episode not found' }, 404);

  const pod: any = await context.env.submoacontent_db
    .prepare(`SELECT * FROM podcasts WHERE id = ? AND account_id = ?`)
    .bind(ep.podcast_id, accountId).first();
  if (!pod) return json({ error: 'Parent podcast missing' }, 404);

  const hosts = await context.env.submoacontent_db
    .prepare(`
      SELECT eh.id, eh.host_id, eh.position_preset, eh.position_direction, eh.speaker_order,
             h.name, h.voice_id, h.personality, h.recurring_viewpoint, h.vocal_direction, h.catchphrases, h.tagline
      FROM episode_hosts eh
      JOIN hosts h ON h.id = eh.host_id
      WHERE eh.episode_id = ?
      ORDER BY eh.speaker_order
    `).bind(epId).all();

  const parseScript = (v: any) => { try { return JSON.parse(v || '[]'); } catch { return []; } };

  return json({
    podcast: pod,
    episode: { ...ep, script: parseScript(ep.script_json), generation_log: parseScript(ep.generation_log) },
    hosts: (hosts.results || []).map((h: any) => {
      try { h.catchphrases = JSON.parse(h.catchphrases || '[]'); } catch { h.catchphrases = []; }
      return h;
    }),
  });
}
