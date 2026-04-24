// GET /api/transcripts/:id/media
// Streams the stored audio/video for HTML5 <video> or <audio> playback on
// the display page. Owner-scoped. Range requests supported via R2.

import { getSessionUser } from '../../_utils';

export async function onRequest(context: { request: Request; env: any; params: { id: string } }) {
  const { request, env, params } = context;
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
  const user = await getSessionUser(request, env);
  if (!user) return new Response('Not authenticated', { status: 401 });

  const row: any = await env.submoacontent_db
    .prepare(`SELECT user_id, source_r2_key FROM transcripts WHERE id = ?`)
    .bind(params.id).first();
  if (!row) return new Response('Not found', { status: 404 });
  if (row.user_id !== user.id) return new Response('Forbidden', { status: 403 });
  if (!row.source_r2_key) return new Response('No media on this transcript (URL source)', { status: 404 });

  const range = request.headers.get('range');
  const obj = range
    ? await env.SUBMOA_IMAGES.get(row.source_r2_key, { range: parseRange(range) })
    : await env.SUBMOA_IMAGES.get(row.source_r2_key);
  if (!obj) return new Response('Media missing', { status: 404 });

  const headers: Record<string, string> = {
    'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=300',
  };
  if (typeof obj.size === 'number') headers['Content-Length'] = String(obj.size);
  if (request.method === 'HEAD') return new Response(null, { headers });
  return new Response(obj.body, { headers, status: range ? 206 : 200 });
}

function parseRange(header: string): { offset: number; length?: number } | undefined {
  const m = header.match(/bytes=(\d+)-(\d+)?/);
  if (!m) return undefined;
  const start = parseInt(m[1], 10);
  const end = m[2] ? parseInt(m[2], 10) : undefined;
  return { offset: start, length: end != null ? end - start + 1 : undefined };
}
