// GET /api/submissions/:id/download/featured-image — stream the featured image as an attachment.

import { json, getSessionUser, isAdmin } from '../../../_utils';

function parseSubmissionId(pathname: string): string | null {
  const parts = pathname.split('/').filter(Boolean);
  const idx = parts.indexOf('submissions');
  return idx >= 0 ? parts[idx + 1] ?? null : null;
}

function filenameFromTopic(topic: string | null | undefined, suffix: string): string {
  const base = (topic || 'image').replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 80) || 'image';
  return `${base}-${suffix}`;
}

export async function onRequest(context: any) {
  const { request, env } = context;
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);

  const url = new URL(request.url);
  const id = parseSubmissionId(url.pathname);
  if (!id) return json({ error: 'Missing id' }, 400);

  const row: any = isAdmin(user)
    ? await env.submoacontent_db.prepare('SELECT id, topic, generated_image_key FROM submissions WHERE id = ?').bind(id).first()
    : await env.submoacontent_db.prepare('SELECT id, topic, generated_image_key FROM submissions WHERE id = ? AND account_id = ?').bind(id, user.account_id || 'makerfrontier').first();
  if (!row) return json({ error: 'Not found' }, 404);
  if (!row.generated_image_key) return json({ error: 'No featured image' }, 404);

  const obj = await env.SUBMOA_IMAGES.get(row.generated_image_key);
  if (!obj) return json({ error: 'Image missing' }, 404);

  const contentType = obj.httpMetadata?.contentType || 'image/jpeg';
  const ext = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';

  return new Response(obj.body, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filenameFromTopic(row.topic, `featured.${ext}`)}"`,
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
