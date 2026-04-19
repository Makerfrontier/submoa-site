import { json, getSessionUser } from '../../_utils';

// GET /api/quick-podcast/:id/audio — streams the stitched MP3
export async function onRequest(context: any) {
  if (context.request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  const user = await getSessionUser(context.request, context.env);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const accountId = user.account_id || 'makerfrontier';
  const id = context.params.id;

  const ep: any = await context.env.submoacontent_db
    .prepare(`SELECT audio_r2_key FROM podcast_episodes WHERE id = ? AND account_id = ? AND source = 'quick'`)
    .bind(id, accountId).first();
  if (!ep?.audio_r2_key) return json({ error: 'No audio yet' }, 404);
  const obj = await context.env.SUBMOA_IMAGES.get(ep.audio_r2_key);
  if (!obj) return json({ error: 'Audio missing from storage' }, 404);
  return new Response(obj.body, {
    headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'private, max-age=3600', 'Accept-Ranges': 'bytes' },
  });
}
