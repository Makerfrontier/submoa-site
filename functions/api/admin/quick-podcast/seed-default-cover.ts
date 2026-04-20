import { json, requireWritebackAuth } from '../../_utils';
import type { Env } from '../../_utils';
import { generateCoverArt, feedCoverPrompt } from '../../../../src/cover-art-generator';

// POST /api/admin/quick-podcast/seed-default-cover
// Admin/writeback-only: generates the Quick Podcast fallback cover via fal.ai
// and uploads it to R2 at defaults/quick-podcast-cover.png. The cover-serving
// endpoints fall back to this image when a user has no cover yet.
export async function onRequest(context: { request: Request; env: Env }) {
  if (context.request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const auth = await requireWritebackAuth(context.request, context.env);
  if (!auth.ok) return auth.response;
  if (!context.env.FALAI_API_KEY) return json({ error: 'FALAI_API_KEY not configured' }, 500);

  const prompt = feedCoverPrompt();
  const { imageBuffer, contentType } = await generateCoverArt(context.env, prompt);
  const key = 'defaults/quick-podcast-cover.png';
  await (context.env as any).SUBMOA_IMAGES.put(key, imageBuffer, { httpMetadata: { contentType } });
  return json({ ok: true, key, size_bytes: imageBuffer.byteLength, content_type: contentType });
}
