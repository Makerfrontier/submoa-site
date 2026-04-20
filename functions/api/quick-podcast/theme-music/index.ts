import { json, getSessionUser } from '../../_utils';
import type { Env } from '../../_utils';
import { generateThemeMusic, DEFAULT_THEME_MUSIC_PROMPT } from '../../../../src/theme-music-generator';

// /api/quick-podcast/theme-music
// GET  — current theme-music state (URLs + prompt + custom flag + generated_at)
// POST — regenerate via Lyria ({ prompt?: string } body; falls back to default)
// PUT  — upload custom file (multipart form; field "audio"; MP3 or WAV; <= 10 MB)
// All require a session.
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const UPLOAD_TYPES = new Set(['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/wave', 'audio/x-wav']);

export async function onRequestGet(context: { request: Request; env: Env }) {
  const user = await getSessionUser(context.request, context.env);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const row: any = await context.env.submoacontent_db.prepare(
    `SELECT theme_music_r2_key_intro, theme_music_r2_key_outro, theme_music_r2_key_source, theme_music_prompt, theme_music_is_custom, theme_music_generated_at FROM users WHERE id = ?`
  ).bind(user.id).first();
  const base = new URL(context.request.url).origin;
  const has = !!row?.theme_music_r2_key_intro;
  return json({
    has_music: has,
    intro_url: has ? `${base}/api/quick-podcast/theme-music/preview/${user.id}/intro.mp3` : null,
    outro_url: has ? `${base}/api/quick-podcast/theme-music/preview/${user.id}/outro.mp3` : null,
    source_url: has ? `${base}/api/quick-podcast/theme-music/preview/${user.id}/source.mp3` : null,
    prompt: row?.theme_music_prompt ?? null,
    is_custom: Boolean(row?.theme_music_is_custom),
    generated_at: row?.theme_music_generated_at ?? null,
  });
}

export async function onRequestPost(context: { request: Request; env: Env }) {
  const user = await getSessionUser(context.request, context.env);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  if (!context.env.OPENROUTER_API_KEY) return json({ error: 'OPENROUTER_API_KEY not configured' }, 500);

  let body: any = {};
  try { body = await context.request.json(); } catch {}
  const prompt = typeof body?.prompt === 'string' && body.prompt.trim()
    ? body.prompt.trim().slice(0, 4000)
    : DEFAULT_THEME_MUSIC_PROMPT;

  try {
    const result = await generateThemeMusic(context.env, prompt);
    const introKey = `users/${user.id}/theme-music/intro.mp3`;
    const outroKey = `users/${user.id}/theme-music/outro.mp3`;
    const sourceKey = `users/${user.id}/theme-music/source.mp3`;
    await (context.env as any).SUBMOA_IMAGES.put(introKey, result.introBuffer, { httpMetadata: { contentType: 'audio/mpeg' } });
    await (context.env as any).SUBMOA_IMAGES.put(outroKey, result.outroBuffer, { httpMetadata: { contentType: 'audio/mpeg' } });
    await (context.env as any).SUBMOA_IMAGES.put(sourceKey, result.sourceBuffer, { httpMetadata: { contentType: 'audio/mpeg' } });
    const now = Math.floor(Date.now() / 1000);
    await context.env.submoacontent_db.prepare(
      `UPDATE users SET theme_music_r2_key_intro = ?, theme_music_r2_key_outro = ?, theme_music_r2_key_source = ?, theme_music_prompt = ?, theme_music_is_custom = 0, theme_music_generated_at = ? WHERE id = ?`
    ).bind(introKey, outroKey, sourceKey, prompt, now, user.id).run();
    return json({
      ok: true,
      is_custom: false,
      generated_at: now,
      model_used: result.modelUsed,
      intro_actual_ms: result.introActualMs,
      outro_actual_ms: result.outroActualMs,
    });
  } catch (e: any) {
    return json({ error: `Theme music regen failed: ${e?.message || e}` }, 502);
  }
}

export async function onRequestPut(context: { request: Request; env: Env }) {
  const user = await getSessionUser(context.request, context.env);
  if (!user) return json({ error: 'Unauthorized' }, 401);

  let form: FormData;
  try { form = await context.request.formData(); }
  catch { return json({ error: 'Expected multipart/form-data' }, 400); }
  const file = form.get('audio');
  if (!(file instanceof File)) return json({ error: 'Missing "audio" file' }, 400);
  if (file.size === 0) return json({ error: 'Empty file' }, 400);
  if (file.size > MAX_UPLOAD_BYTES) return json({ error: `File too large (max ${MAX_UPLOAD_BYTES / 1024 / 1024} MB)` }, 413);
  const ct = (file.type || '').toLowerCase();
  if (!UPLOAD_TYPES.has(ct)) return json({ error: 'Only MP3 or WAV accepted' }, 415);

  const buf = await file.arrayBuffer();
  // Custom upload: the user gave us their clip as-is — store it for all three
  // variants. Intro/outro endpoints just return the user's full audio.
  const introKey = `users/${user.id}/theme-music/intro.mp3`;
  const outroKey = `users/${user.id}/theme-music/outro.mp3`;
  const sourceKey = `users/${user.id}/theme-music/source.mp3`;
  await (context.env as any).SUBMOA_IMAGES.put(introKey, buf, { httpMetadata: { contentType: ct } });
  await (context.env as any).SUBMOA_IMAGES.put(outroKey, buf, { httpMetadata: { contentType: ct } });
  await (context.env as any).SUBMOA_IMAGES.put(sourceKey, buf, { httpMetadata: { contentType: ct } });
  const now = Math.floor(Date.now() / 1000);
  await context.env.submoacontent_db.prepare(
    `UPDATE users SET theme_music_r2_key_intro = ?, theme_music_r2_key_outro = ?, theme_music_r2_key_source = ?, theme_music_prompt = NULL, theme_music_is_custom = 1, theme_music_generated_at = ? WHERE id = ?`
  ).bind(introKey, outroKey, sourceKey, now, user.id).run();
  return json({ ok: true, is_custom: true, generated_at: now, size_bytes: buf.byteLength });
}
