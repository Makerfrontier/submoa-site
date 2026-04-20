// GET /api/quick-podcast/:id/audio — streams the stitched MP3
//
// PUBLIC endpoint: no auth. Apple Podcasts (and every podcast app) fetches
// enclosure URLs from RSS feeds unauthenticated. Episode IDs are 32-char
// unguessable hex — security-through-obscurity acceptable for podcast audio,
// same model used by every public podcast on the internet.
//
// Range-request support is required for CarPlay / Apple Podcasts scrubbing.
export async function onRequest(context: any) {
  if (context.request.method !== 'GET' && context.request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405 });
  }
  const id = context.params.id;

  const ep: any = await context.env.submoacontent_db
    .prepare(`SELECT id, audio_r2_key, status FROM podcast_episodes WHERE id = ? AND source = 'quick'`)
    .bind(id).first();
  if (!ep) return new Response('Not found', { status: 404 });
  if (!ep.audio_r2_key) return new Response('Audio not ready', { status: 404 });
  if (ep.status !== 'audio_ready') return new Response('Audio not ready', { status: 404 });

  const range = context.request.headers.get('Range');
  if (range) {
    const head = await context.env.SUBMOA_IMAGES.head(ep.audio_r2_key);
    if (!head) return new Response('Audio file missing', { status: 404 });
    const total = head.size;

    const match = range.match(/bytes=(\d+)-(\d*)/);
    if (!match) return new Response('Range not satisfiable', { status: 416 });
    const start = parseInt(match[1], 10);
    const end = match[2] ? Math.min(parseInt(match[2], 10), total - 1) : total - 1;
    if (isNaN(start) || start < 0 || start >= total || end < start) {
      return new Response('Range not satisfiable', {
        status: 416,
        headers: { 'Content-Range': `bytes */${total}` },
      });
    }
    const length = end - start + 1;

    const rangedObj = await context.env.SUBMOA_IMAGES.get(ep.audio_r2_key, {
      range: { offset: start, length },
    });
    if (!rangedObj) return new Response('Range not satisfiable', { status: 416 });

    return new Response(rangedObj.body, {
      status: 206,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(length),
        'Content-Range': `bytes ${start}-${end}/${total}`,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  }

  const obj = await context.env.SUBMOA_IMAGES.get(ep.audio_r2_key);
  if (!obj) return new Response('Audio file missing', { status: 404 });

  return new Response(obj.body, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Length': String(obj.size),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
