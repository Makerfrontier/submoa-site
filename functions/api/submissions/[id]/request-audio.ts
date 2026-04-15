// POST /api/submissions/:id/request-audio
// User-initiated TTS for an already-generated article.
// Mirrors the R2 write path and OpenAI call shape of
// functions/api/admin/articles/generate-audio.ts so both produce audio
// at the same canonical key: projects/{id}/audio/audio.mp3.

import { json, getSessionUser } from '../../_utils';

const TTS_CHAR_LIMIT = 4096;

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

function parseSubmissionId(pathname: string): string | null {
  const parts = pathname.split('/').filter(Boolean);
  const idx = parts.indexOf('submissions');
  return idx >= 0 ? parts[idx + 1] ?? null : null;
}

export async function onRequest(context: any) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);

  const url = new URL(request.url);
  const submissionId = parseSubmissionId(url.pathname);
  if (!submissionId) return json({ error: 'Missing submission id' }, 400);

  const sub: any = await env.submoacontent_db.prepare(
    `SELECT id, account_id, status, generate_audio, article_content
       FROM submissions WHERE id = ? AND account_id = ?`
  ).bind(submissionId, user.account_id).first();

  if (!sub) return json({ error: 'Not found' }, 404);

  if (sub.status !== 'article_done' && sub.status !== 'published') {
    return json({ error: 'article_not_ready', status: sub.status }, 400);
  }
  if (Number(sub.generate_audio) === 1) {
    return json({ error: 'already_requested' }, 400);
  }
  if (!sub.article_content) {
    return json({ error: 'no_content' }, 400);
  }

  try {
    const input = stripHtml(sub.article_content);
    if (!input) return json({ error: 'no_content' }, 400);

    if (!env.OPENAI_API_KEY) return json({ error: 'OPENAI_API_KEY not set' }, 500);

    const ttsRes = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: 'tts-1', input, voice: 'onyx', response_format: 'mp3' }),
    });

    if (!ttsRes.ok) {
      const errBody = await ttsRes.text().catch(() => '');
      return json({ error: `tts_error_${ttsRes.status}`, detail: errBody.slice(0, 200) }, 500);
    }

    const audioBuffer = await ttsRes.arrayBuffer();

    await env.SUBMOA_IMAGES.put(`projects/${submissionId}/audio/audio.mp3`, audioBuffer, {
      httpMetadata: { contentType: 'audio/mpeg' },
      customMetadata: { placeholder: 'false', submissionId },
    });

    await env.submoacontent_db.prepare(
      `UPDATE submissions
          SET generate_audio = 1,
              audio_requested = 1,
              updated_at = ?
        WHERE id = ?`
    ).bind(Date.now(), submissionId).run();

    return json({ success: true });
  } catch (err: any) {
    return json({ error: err?.message ?? 'unknown_error' }, 500);
  }
}
