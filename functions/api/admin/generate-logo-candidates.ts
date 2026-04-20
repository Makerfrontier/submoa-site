import { json, requireWritebackAuth } from '../_utils';
import type { Env } from '../_utils';
import { generateAll } from '../../../scripts/generate-logo-candidates';

// POST /api/admin/generate-logo-candidates
// Admin/writeback-only. Fires 4 Nano Banana generations in parallel (~$0.02
// total) and writes each to R2 under defaults/logo-candidates/{slug}.png.
// Response contains viewer URLs for each candidate plus any per-slug errors.
export async function onRequest(context: { request: Request; env: Env }) {
  if (context.request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const auth = await requireWritebackAuth(context.request, context.env);
  if (!auth.ok) return auth.response;
  if (!context.env.OPENROUTER_API_KEY) return json({ error: 'OPENROUTER_API_KEY not configured' }, 500);

  const baseUrl = new URL(context.request.url).origin;
  const result = await generateAll(context.env as any, baseUrl);
  return json(result);
}
