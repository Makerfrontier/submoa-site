// functions/api/submissions/[id]/images.ts
// POST /api/submissions/:id/images
// Accepts multipart form with one or more 'images' fields.
// Validates type (jpeg/png/webp) and size (≤5MB each).
// Uploads to R2 at images/{id}/N.ext, appends keys to submissions.image_urls.
// Returns { ok: true, keys: string[], total: number }

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

export async function onRequestPost({ request, env, params }) {
  const session = getCookieValue(request, 'submoa_session');
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const user = await env.submoacontent_db
    .prepare(
      `SELECT id, account_id FROM users
       WHERE id = (SELECT user_id FROM sessions WHERE id = ? AND expires_at > ?)
       LIMIT 1`
    )
    .bind(session, Date.now())
    .first<{ id: string; account_id: string }>();

  if (!user) return json({ error: 'Unauthorized' }, 401);

  const { id } = params;

  const sub = await env.submoacontent_db
    .prepare(`SELECT id, image_urls FROM submissions WHERE id = ? AND account_id = ?`)
    .bind(id, user.account_id)
    .first<{ id: string; image_urls: string | null }>();

  if (!sub) return json({ error: 'Not found' }, 404);

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return json({ error: 'Invalid form data' }, 400);
  }

  const files = formData.getAll('images');
  if (!files.length) return json({ error: 'No images provided' }, 400);

  // Validate all files before uploading any
  for (const file of files) {
    if (!(file instanceof File)) return json({ error: 'Invalid file entry' }, 400);
    if (!ALLOWED_TYPES.includes(file.type)) {
      return json({ error: `Unsupported image type: ${file.type}. Use JPEG, PNG, or WebP.` }, 400);
    }
    if (file.size > MAX_SIZE) {
      return json({ error: `File "${file.name}" exceeds 5 MB limit.` }, 400);
    }
  }

  // Existing keys (append mode)
  const existingKeys: string[] = sub.image_urls ? JSON.parse(sub.image_urls) : [];
  const newKeys: string[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i] as File;
    const ext =
      file.type === 'image/webp' ? 'webp' :
      file.type === 'image/png'  ? 'png'  : 'jpg';
    const key = `images/${id}/${existingKeys.length + i + 1}.${ext}`;

    await env.SUBMOA_IMAGES.put(key, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type },
    });

    newKeys.push(key);
  }

  const allKeys = [...existingKeys, ...newKeys];

  // Mirror to image_r2_keys so the queue consumer can pick them up for SEO processing.
  // Same R2 keys, just stored under the new column the image-processor reads from.
  await env.submoacontent_db
    .prepare(
      `UPDATE submissions
       SET image_urls = ?, image_r2_keys = ?, updated_at = ?
       WHERE id = ?`
    )
    .bind(JSON.stringify(allKeys), JSON.stringify(allKeys), Date.now(), id)
    .run();

  return json({ ok: true, keys: allKeys, total: allKeys.length });
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function getCookieValue(request: Request, name: string): string | null {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}
