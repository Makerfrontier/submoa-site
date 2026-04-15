// functions/api/admin/articles/generate-audio.ts
// POST /api/admin/articles/generate-audio
// Manually triggers TTS generation for all submissions that have:
//   - generate_audio = 1
//   - article_content present
//   - no audio.mp3 in R2 yet
// Writes audio to packages/{id}/audio.mp3 and projects/{id}/audio/audio.mp3.
// Sets package_status = 'ready' so the dashboard player activates.
// Optional body: { submission_id: "..." } to target a single submission.

import { json, getSessionUser, isAdmin } from '../../_utils';
import type { Env } from '../../_utils';

const TTS_CHAR_LIMIT = 4096;
const ALLOWED_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, TTS_CHAR_LIMIT);
}

export async function onRequestPost(context: { request: Request; env: Env }) {
  const { request, env } = context;

  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);
  if (!isAdmin(user)) return json({ error: 'Forbidden' }, 403);

  // Optional: target a single submission
  let targetId: string | null = null;
  try {
    const body = await request.json() as any;
    targetId = body?.submission_id ?? null;
  } catch {}

  // Fetch qualifying submissions
  let submissions: any[];
  if (targetId) {
    const row = await env.submoacontent_db.prepare(
      `SELECT id, topic, article_content, package_status
       FROM submissions WHERE id = ? AND generate_audio = 1 AND article_content IS NOT NULL`
    ).bind(targetId).first();
    submissions = row ? [row] : [];
  } else {
    const { results } = await env.submoacontent_db.prepare(
      `SELECT id, topic, article_content, package_status
       FROM submissions WHERE generate_audio = 1 AND article_content IS NOT NULL AND status = 'article_done'
       ORDER BY created_at ASC`
    ).all();
    submissions = results as any[];
  }

  if (submissions.length === 0) {
    return json({ message: 'No qualifying submissions found', results: [] });
  }

  const results: Array<{ id: string; topic: string; status: string; skipped?: boolean }> = [];

  for (const sub of submissions) {
    const audioKey = `projects/${sub.id}/audio/audio.mp3`;
    const legacyAudioKey = `packages/${sub.id}/audio.mp3`;

    // Skip if audio already exists at either canonical or legacy path
    const existing = (await env.SUBMOA_IMAGES.head(audioKey)) || (await env.SUBMOA_IMAGES.head(legacyAudioKey));
    if (existing) {
      results.push({ id: sub.id, topic: sub.topic, status: 'already_exists', skipped: true });
      continue;
    }

    try {
      const input = stripHtml(sub.article_content);
      if (!input) {
        results.push({ id: sub.id, topic: sub.topic, status: 'empty_content', skipped: true });
        continue;
      }

      const rawVoice = sub.tts_voice_id ?? 'onyx';
      const voice = ALLOWED_VOICES.includes(rawVoice) ? rawVoice : 'onyx';

      if (!env.OPENAI_API_KEY) {
        results.push({ id: sub.id, topic: sub.topic, status: 'OPENAI_API_KEY not set on Pages' });
        continue;
      }
      const ttsRes = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: 'tts-1', input, voice, response_format: 'mp3' }),
      });

      if (!ttsRes.ok) {
        const errBody = await ttsRes.text().catch(() => '');
        results.push({ id: sub.id, topic: sub.topic, status: `tts_error_${ttsRes.status}: ${errBody.slice(0, 100)}` });
        continue;
      }

      const audioBuffer = await ttsRes.arrayBuffer();

      // Canonical R2 path — audio endpoint reads here first.
      await env.SUBMOA_IMAGES.put(`projects/${sub.id}/audio/audio.mp3`, audioBuffer, {
        httpMetadata: { contentType: 'audio/mpeg' },
        customMetadata: { placeholder: 'false', submissionId: sub.id },
      });

      // Activate the dashboard player — set package_status = 'ready'
      await env.submoacontent_db.prepare(
        `UPDATE submissions SET package_status = 'ready', updated_at = ? WHERE id = ?`
      ).bind(Date.now(), sub.id).run();

      results.push({ id: sub.id, topic: sub.topic, status: 'generated', skipped: false });

    } catch (err: any) {
      results.push({ id: sub.id, topic: sub.topic, status: `error: ${err.message}` });
    }
  }

  const generated = results.filter(r => r.status === 'generated').length;
  const skipped = results.filter(r => r.skipped).length;
  const failed = results.filter(r => !r.skipped && r.status !== 'generated').length;

  return json({ generated, skipped, failed, results });
}
