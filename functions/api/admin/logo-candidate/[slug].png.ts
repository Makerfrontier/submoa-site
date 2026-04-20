// GET /api/admin/logo-candidate/:slug.png
// Public — no auth. Serves a logo candidate PNG for visual review.
// These are just product-logo options; not sensitive.
export async function onRequest(context: any) {
  if (context.request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
  const slug = String(context.params.slug || '').replace(/\.png$/i, '');
  if (!/^[a-z0-9_\-]+$/i.test(slug)) return new Response('Invalid slug', { status: 400 });
  const key = `defaults/logo-candidates/${slug}.png`;
  const obj = await context.env.SUBMOA_IMAGES.get(key);
  if (!obj) return new Response('Not found', { status: 404 });
  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType ?? 'image/png',
      'Cache-Control': 'public, max-age=60',
    },
  });
}
