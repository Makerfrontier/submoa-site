// GET /api/quick-podcast/:id/cover
// Public: Apple Podcasts and every other podcast app crawls enclosure-referenced
// assets (covers, audio) without auth. Episode IDs are 32-char unguessable hex,
// same security-through-obscurity model as the audio endpoint.
//
// Fallback chain: episode cover → owner user's feed cover → default static PNG.
export async function onRequest(context: any) {
  if (context.request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
  const id = context.params.id;

  const row: any = await context.env.submoacontent_db.prepare(`
    SELECT e.cover_image_r2_key AS ep_key, u.cover_image_r2_key AS user_key
    FROM podcast_episodes e
    LEFT JOIN users u ON u.account_id = e.account_id
    WHERE e.id = ? AND e.source = 'quick'
    ORDER BY u.created_at ASC
    LIMIT 1
  `).bind(id).first();
  if (!row) return new Response('Not found', { status: 404 });

  const key = (row.ep_key as string | null) || (row.user_key as string | null) || 'defaults/quick-podcast-cover.png';
  const obj = await context.env.SUBMOA_IMAGES.get(key);
  if (!obj) return new Response('Cover not found', { status: 404 });

  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType ?? 'image/png',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
