import { lookupUserByRssToken } from '../../../../src/rss-token';

// GET /api/quick-podcast/feed-cover/:token.png
// Public, keyed by the user's RSS token (same auth model as the feed XML).
// Falls back to the default static cover when the user has no cover yet.
export async function onRequest(context: any) {
  if (context.request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
  const raw = String(context.params.token || '').replace(/\.png$/i, '');
  if (!raw || raw.length < 16) return new Response('Not found', { status: 404 });

  const user = await lookupUserByRssToken(context.env.submoacontent_db, raw);
  if (!user) return new Response('Not found', { status: 404 });

  const userRow: any = await context.env.submoacontent_db
    .prepare(`SELECT cover_image_r2_key FROM users WHERE id = ?`).bind(user.id).first();

  const key = (userRow?.cover_image_r2_key as string | null) || 'defaults/quick-podcast-cover.png';
  const obj = await context.env.SUBMOA_IMAGES.get(key);
  if (!obj) return new Response('Cover not found', { status: 404 });

  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType ?? 'image/png',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
