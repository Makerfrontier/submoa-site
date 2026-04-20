import { json, getSessionUser } from '../_utils';
import type { Env } from '../_utils';

// POST /api/quick-podcast/upload-cover
// Auth required. Accepts multipart form upload (field: "cover"), validates a
// PNG/JPEG <= 5 MB, stores at users/{id}/feed-cover.<ext>. Marks is_custom=1.
// Apple Podcasts wants at least 1400x1400 — we trust the uploader here and
// don't decode the image (Workers has no image library; any real size check
// would need Images binding which isn't wired). Size/mime guard is enough.
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Map<string, string>([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/jpg', 'jpg'],
]);

export async function onRequest(context: { request: Request; env: Env }) {
  if (context.request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const user = await getSessionUser(context.request, context.env);
  if (!user) return json({ error: 'Unauthorized' }, 401);

  let form: FormData;
  try { form = await context.request.formData(); }
  catch { return json({ error: 'Expected multipart/form-data' }, 400); }

  const file = form.get('cover');
  if (!(file instanceof File)) return json({ error: 'Missing "cover" file' }, 400);
  if (file.size === 0) return json({ error: 'Empty file' }, 400);
  if (file.size > MAX_BYTES) return json({ error: `File too large (max ${MAX_BYTES / 1024 / 1024} MB)` }, 413);

  const contentType = (file.type || '').toLowerCase();
  const ext = ALLOWED.get(contentType);
  if (!ext) return json({ error: 'Only PNG or JPEG allowed' }, 415);

  const key = `users/${user.id}/feed-cover.${ext}`;
  const buf = await file.arrayBuffer();
  await (context.env as any).SUBMOA_IMAGES.put(key, buf, { httpMetadata: { contentType } });

  const now = Math.floor(Date.now() / 1000);
  await context.env.submoacontent_db.prepare(
    `UPDATE users SET cover_image_r2_key = ?, cover_image_generated_at = ?, cover_image_is_custom = 1 WHERE id = ?`
  ).bind(key, now, user.id).run();

  return json({ ok: true, cover_image_updated_at: now, is_custom: true, size_bytes: buf.byteLength });
}
