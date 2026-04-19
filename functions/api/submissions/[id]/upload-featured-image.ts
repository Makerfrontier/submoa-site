// POST /api/submissions/:id/upload-featured-image
// Accepts a multipart file upload and stores it as the custom featured image,
// overriding any AI-generated image on the content render page and dashboard.

import { json, getSessionUser } from '../../_utils';

const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

export async function onRequest(context: any) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' },
    });
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);

  const url = new URL(request.url);
  const parts = url.pathname.split('/').filter(Boolean);
  const id = parts[parts.length - 2]; // /api/submissions/:id/upload-featured-image
  if (!id) return json({ error: 'Missing submission id' }, 400);

  const account_id = user.account_id || 'makerfrontier';
  const isAdmin = user.role === 'admin' || user.role === 'super_admin';

  const row: any = isAdmin
    ? await env.submoacontent_db.prepare('SELECT id FROM submissions WHERE id = ?').bind(id).first()
    : await env.submoacontent_db.prepare('SELECT id FROM submissions WHERE id = ? AND account_id = ?').bind(id, account_id).first();
  if (!row) return json({ error: 'Not found' }, 404);

  const formData = await request.formData();
  const file = formData.get('featured_image') as File | null;
  if (!file) return json({ error: 'No file provided (field: featured_image)' }, 400);

  const mime = file.type;
  const ext = ALLOWED_TYPES[mime];
  if (!ext) return json({ error: `Unsupported file type: ${mime}. Use JPEG, PNG, or WebP.` }, 400);
  if (file.size > MAX_SIZE) return json({ error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 10 MB.` }, 400);

  const buffer = await file.arrayBuffer();
  const r2Key = `projects/${id}/images/featured-custom.${ext}`;

  await env.SUBMOA_IMAGES.put(r2Key, buffer, {
    httpMetadata: { contentType: mime },
  });

  await env.submoacontent_db.prepare(
    `UPDATE submissions SET custom_featured_image_key = ?, updated_at = ? WHERE id = ?`
  ).bind(r2Key, Date.now(), id).run();

  return json({ custom_featured_image_key: r2Key });
}
