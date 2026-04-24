// PUT /api/transcripts/:id/upload-chunk
// Streams the request body directly into the reserved R2 key from the
// shell transcript row. Owner-scoped so only the session that created the
// shell can upload into it.

import { getSessionUser, json } from '../../_utils';

export async function onRequest(context: { request: Request; env: any; params: { id: string } }) {
  const { request, env, params } = context;
  if (request.method !== 'PUT' && request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);

  const row: any = await env.submoacontent_db
    .prepare(`SELECT id, user_id, source_r2_key, status FROM transcripts WHERE id = ?`)
    .bind(params.id).first();
  if (!row) return json({ error: 'Transcript not found' }, 404);
  if (row.user_id !== user.id) return json({ error: 'Forbidden' }, 403);
  if (row.status !== 'uploading') return json({ error: 'Transcript not in uploading state' }, 409);

  const contentType = request.headers.get('content-type') || 'application/octet-stream';
  await env.SUBMOA_IMAGES.put(row.source_r2_key, request.body, {
    httpMetadata: { contentType },
  });

  return json({ ok: true, r2_key: row.source_r2_key });
}
