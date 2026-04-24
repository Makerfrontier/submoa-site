// POST /api/transcripts/upload-url
// Creates a shell transcript row with status='uploading' and returns the
// R2 key the browser should PUT the file to. Because workers-r2 doesn't
// expose true presigned URLs over HTTPS yet, we hand the browser back a
// key + dedicated ingest endpoint (POST /api/transcripts/:id/upload-chunk)
// and the upload routes through the Pages Function. For files up to ~95MB
// this is fine inside a single PUT; larger files chunk via repeated calls.
//
// Response shape matches a presigned-URL flow so the client stays identical
// regardless of which storage path we end up with later.

import { getSessionUser, json, generateId } from '../_utils';

export async function onRequest(context: { request: Request; env: any }) {
  const { request, env } = context;
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);

  const body: any = await request.json().catch(() => ({}));
  const filename = String(body?.filename || 'upload').slice(0, 240);
  const contentType = String(body?.content_type || 'application/octet-stream').slice(0, 100);
  const sizeBytes = Number(body?.size_bytes || 0);
  if (sizeBytes > 2 * 1024 * 1024 * 1024) return json({ error: 'File exceeds 2GB limit' }, 413);

  const transcriptId = generateId();
  const ext = (filename.match(/\.([a-zA-Z0-9]+)$/)?.[1] || 'bin').toLowerCase();
  const r2Key = `transcripts/${transcriptId}/source.${ext}`;
  const now = Math.floor(Date.now() / 1000);

  await env.submoacontent_db.prepare(
    `INSERT INTO transcripts (id, user_id, source_type, source_filename, source_r2_key,
      status, current_step, progress_percent, created_at, updated_at)
     VALUES (?, ?, 'upload', ?, ?, 'uploading', 'UPLOAD', 0, ?, ?)`
  ).bind(transcriptId, user.id, filename, r2Key, now, now).run();

  return json({
    transcript_id: transcriptId,
    r2_key: r2Key,
    upload_url: `/api/transcripts/${transcriptId}/upload-chunk`,
    content_type: contentType,
  });
}
