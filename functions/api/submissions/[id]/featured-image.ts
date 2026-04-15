import { getSessionUser, json } from '../../_utils';

// GET /api/submissions/:id/featured-image — stream the generated featured image from R2
export async function onRequest(context) {
  if (context.request.method !== 'GET') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const user = await getSessionUser(context.request, context.env);
  if (!user) return json({ error: 'Not authenticated' }, 401);

  const url = new URL(context.request.url);
  const parts = url.pathname.split('/').filter(Boolean);
  // /api/submissions/:id/featured-image → parts = ['api','submissions',':id','featured-image']
  const id = parts[parts.length - 2];
  if (!id) return json({ error: 'Missing submission id' }, 400);

  const isAdmin = user.role === 'admin' || user.role === 'super_admin';

  const row = isAdmin
    ? await context.env.submoacontent_db
        .prepare(`SELECT id, generated_image_key FROM submissions WHERE id = ?`)
        .bind(id).first<{ id: string; generated_image_key: string | null }>()
    : await context.env.submoacontent_db
        .prepare(`SELECT id, generated_image_key FROM submissions WHERE id = ? AND account_id = ?`)
        .bind(id, user.account_id).first<{ id: string; generated_image_key: string | null }>();

  if (!row) return json({ error: 'Not found' }, 404);
  if (!row.generated_image_key) return json({ error: 'No generated image' }, 404);

  const obj = await context.env.SUBMOA_IMAGES.get(row.generated_image_key);
  if (!obj) return json({ error: 'Image missing from storage' }, 404);

  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType || 'image/png',
      'Cache-Control': 'private, max-age=86400',
    },
  });
}
