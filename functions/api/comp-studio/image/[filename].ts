import { getSessionUser, json } from '../../_utils';
import type { Env } from '../../_utils';

// GET /api/comp-studio/image/:filename
// Serves generated images from R2 scoped to the caller's account.
export async function onRequest(context: { request: Request; env: Env; params: { filename?: string } }) {
  const { request, env, params } = context;
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);

  const filename = String(params.filename || '');
  if (!/^[a-f0-9]{32}\.jpg$/i.test(filename)) {
    return json({ error: 'Invalid filename' }, 400);
  }

  const account_id = user.account_id || 'makerfrontier';
  const r2Key = `projects/comp-studio/${account_id}/generated/${filename}`;

  const obj = await env.SUBMOA_IMAGES.get(r2Key);
  if (!obj) return json({ error: 'Image not found' }, 404);

  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType || 'image/jpeg',
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
