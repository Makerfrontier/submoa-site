import { json, getSessionUser } from '../../_utils';

// GET    /api/quick-podcast/:id — full detail (script + hosts + sources + audio_url)
// DELETE /api/quick-podcast/:id — remove from library
export async function onRequest(context: any) {
  const user = await getSessionUser(context.request, context.env);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const accountId = user.account_id || 'makerfrontier';
  const id = context.params.id;

  const ep: any = await context.env.submoacontent_db
    .prepare(`SELECT * FROM podcast_episodes WHERE id = ? AND account_id = ? AND source = 'quick'`)
    .bind(id, accountId).first();
  if (!ep) return json({ error: 'Not found' }, 404);

  if (context.request.method === 'GET') {
    const hosts = await context.env.submoacontent_db
      .prepare(`
        SELECT eh.host_id, eh.position_preset, eh.position_direction, eh.speaker_order,
               h.name, h.voice_id
        FROM episode_hosts eh
        JOIN hosts h ON h.id = eh.host_id
        WHERE eh.episode_id = ?
        ORDER BY eh.speaker_order
      `).bind(id).all();
    const parseJ = (v: any, d: any) => { try { return JSON.parse(v || JSON.stringify(d)); } catch { return d; } };
    const base = new URL(context.request.url).origin;
    return json({
      id: ep.id,
      topic: ep.topic,
      brief: ep.brief,
      status: ep.status,
      source: ep.source,
      mode: ep.mode,
      target_length_minutes: ep.target_length_minutes,
      audio_duration_seconds: ep.audio_duration_seconds,
      audio_url: ep.audio_r2_key ? `${base}/api/quick-podcast/${ep.id}/audio` : null,
      created_at: ep.created_at,
      updated_at: ep.updated_at,
      script: parseJ(ep.script_json, []),
      sources: parseJ(ep.research_sources, []),
      summary: ep.summary,
      hosts: hosts.results || [],
    });
  }

  if (context.request.method === 'DELETE') {
    if (ep.audio_r2_key) {
      try { await context.env.SUBMOA_IMAGES.delete(ep.audio_r2_key); } catch {}
    }
    await context.env.submoacontent_db.prepare(`DELETE FROM episode_hosts WHERE episode_id = ?`).bind(id).run();
    await context.env.submoacontent_db.prepare(`DELETE FROM podcast_episodes WHERE id = ?`).bind(id).run();
    return json({ ok: true });
  }

  return json({ error: 'Method not allowed' }, 405);
}
