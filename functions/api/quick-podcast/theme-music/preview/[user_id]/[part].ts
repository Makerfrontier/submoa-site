// GET /api/quick-podcast/theme-music/preview/:user_id/:part
// Public — HTML5 <audio> elements can't send session cookies across origins
// reliably, and the preview URL is baked into the /listen UI anyway. Acts
// as a thin R2 proxy with Range support for scrubbing.
export async function onRequest(context: any) {
  if (context.request.method !== 'GET') return new Response('Method not allowed', { status: 405 });

  const userId = String(context.params.user_id || '');
  const partRaw = String(context.params.part || '').replace(/\.mp3$/i, '').toLowerCase();
  if (!userId || !['intro', 'outro', 'source'].includes(partRaw)) {
    return new Response('Not found', { status: 404 });
  }

  // The row lookup keeps the served key in sync with whatever is persisted —
  // custom uploads may point at a different content-type.
  const col = `theme_music_r2_key_${partRaw}`;
  const row: any = await context.env.submoacontent_db
    .prepare(`SELECT ${col} AS key FROM users WHERE id = ?`).bind(userId).first();
  const key = row?.key as string | null;
  if (!key) return new Response('Not found', { status: 404 });

  const range = context.request.headers.get('Range');
  if (range) {
    const head = await context.env.SUBMOA_IMAGES.head(key);
    if (!head) return new Response('Not found', { status: 404 });
    const total = head.size;
    const match = range.match(/bytes=(\d+)-(\d*)/);
    if (!match) return new Response('Range not satisfiable', { status: 416 });
    const start = parseInt(match[1], 10);
    const end = match[2] ? Math.min(parseInt(match[2], 10), total - 1) : total - 1;
    if (isNaN(start) || start < 0 || start >= total || end < start) {
      return new Response('Range not satisfiable', { status: 416, headers: { 'Content-Range': `bytes */${total}` } });
    }
    const length = end - start + 1;
    const obj = await context.env.SUBMOA_IMAGES.get(key, { range: { offset: start, length } });
    if (!obj) return new Response('Not found', { status: 404 });
    return new Response(obj.body, {
      status: 206,
      headers: {
        'Content-Type': head.httpMetadata?.contentType ?? 'audio/mpeg',
        'Content-Length': String(length),
        'Content-Range': `bytes ${start}-${end}/${total}`,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  }

  const obj = await context.env.SUBMOA_IMAGES.get(key);
  if (!obj) return new Response('Not found', { status: 404 });
  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType ?? 'audio/mpeg',
      'Content-Length': String(obj.size),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
