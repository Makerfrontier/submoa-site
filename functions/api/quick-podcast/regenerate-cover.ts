import { json, getSessionUser } from '../_utils';
import type { Env } from '../_utils';
import { generateCoverArt, feedCoverPrompt } from '../../../src/cover-art-generator';

// POST /api/quick-podcast/regenerate-cover
// Auth required. Regenerates the current user's feed-level cover via fal.ai.
// Marks is_custom=0 so future auto-regenerations (if we ever add them) know
// this cover is AI-generated, not user-uploaded.
export async function onRequest(context: { request: Request; env: Env }) {
  if (context.request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const user = await getSessionUser(context.request, context.env);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  if (!context.env.OPENROUTER_API_KEY) return json({ error: 'OPENROUTER_API_KEY not configured' }, 500);

  try {
    const prompt = feedCoverPrompt(user.name);
    const { imageBuffer, contentType } = await generateCoverArt(context.env, prompt);
    const key = `users/${user.id}/feed-cover.png`;
    await (context.env as any).SUBMOA_IMAGES.put(key, imageBuffer, { httpMetadata: { contentType } });
    const now = Math.floor(Date.now() / 1000);
    await context.env.submoacontent_db.prepare(
      `UPDATE users SET cover_image_r2_key = ?, cover_image_generated_at = ?, cover_image_is_custom = 0 WHERE id = ?`
    ).bind(key, now, user.id).run();
    return json({ ok: true, cover_image_updated_at: now, is_custom: false });
  } catch (e: any) {
    return json({ error: `Cover regeneration failed: ${e?.message || e}` }, 502);
  }
}
