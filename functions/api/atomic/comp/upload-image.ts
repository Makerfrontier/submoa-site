import { getSessionUser, json, generateId } from '../../_utils';
import type { Env } from '../../_utils';

// POST /api/atomic/comp/upload-image
// Fix 0: block-image uploads go to R2 instead of base64 in the D1 row.
// Accepts multipart/form-data with field "image" (max 10 MB). Returns
// { url } — the URL is served publicly by /api/atomic/comp/image/[...key].
const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPTED = /^image\//;

export async function onRequestPost(context: { request: Request; env: Env }) {
  const user = await getSessionUser(context.request, context.env);
  if (!user) return json({ error: 'Not authenticated' }, 401);
  const account_id = user.account_id || 'makerfrontier';

  let form: FormData;
  try { form = await context.request.formData(); }
  catch { return json({ error: 'Expected multipart/form-data' }, 400); }

  const file = form.get('image');
  if (!(file instanceof File)) return json({ error: 'Missing "image" file' }, 400);
  if (file.size === 0) return json({ error: 'Empty file' }, 400);
  if (file.size > MAX_BYTES) return json({ error: `File too large (max ${MAX_BYTES / 1024 / 1024} MB)` }, 413);
  const mime = (file.type || 'image/jpeg').toLowerCase();
  if (!ACCEPTED.test(mime)) return json({ error: 'Only image/* content types accepted' }, 415);

  // Name + extension. Ignore path components so users can't smuggle keys.
  const nameOnly = String(file.name || '').split(/[\\/]/).pop() || '';
  const extMatch = nameOnly.match(/\.([A-Za-z0-9]{2,5})$/);
  const ext = (extMatch ? extMatch[1] : mime.split('/')[1] || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
  const safeExt = ext || 'jpg';
  const key = `atomic-comp/${account_id}/images/${generateId()}.${safeExt}`;

  try {
    await context.env.SUBMOA_IMAGES.put(key, await file.arrayBuffer(), {
      httpMetadata: { contentType: mime },
    });
  } catch (err: any) {
    return json({ error: `R2 write failed: ${err?.message || err}` }, 500);
  }

  return json({ url: `/api/atomic/comp/image/${key}`, key });
}
