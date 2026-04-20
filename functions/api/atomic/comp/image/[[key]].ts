import type { Env } from '../../../_utils';

// GET /api/atomic/comp/image/*  — public R2 proxy for block images.
// Public so the share page (unauthenticated /c/:token) can render images.
// Uses a catch-all route so nested keys like
// atomic-comp/{account}/images/{id}.jpg resolve as one path segment.
export async function onRequestGet(context: { request: Request; env: Env; params: { key?: string | string[] } }) {
  const raw = context.params.key;
  const fullKey = Array.isArray(raw) ? raw.join('/') : String(raw || '');
  if (!fullKey) return new Response('Not found', { status: 404 });

  // Guard: only allow reads under the atomic-comp/ prefix we write to.
  if (!fullKey.startsWith('atomic-comp/')) return new Response('Not found', { status: 404 });

  const obj = await context.env.SUBMOA_IMAGES.get(fullKey);
  if (!obj) return new Response('Not found', { status: 404 });

  return new Response(obj.body, {
    status: 200,
    headers: {
      'Content-Type': obj.httpMetadata?.contentType || 'image/jpeg',
      'Content-Length': String(obj.size),
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
