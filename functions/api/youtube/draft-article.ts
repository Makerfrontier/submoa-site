// POST /api/youtube/draft-article
// Given a transcript + author + optional topic focus, generate a blog-ready
// article draft using the slot 1 LLM from llm_config.
import { getSessionUser, json } from '../_utils';
import type { Env } from '../_utils';

export async function onRequest(context: { request: Request; env: Env }) {
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

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const transcript = String(body.transcript || '').trim().slice(0, 30000);
  const topic = String(body.topic || '').trim().slice(0, 1000);
  const authorSlug = String(body.author || '').trim().slice(0, 120);
  if (!transcript) return json({ error: 'transcript is required' }, 400);

  // Pull the slot 1 model + author voice guide.
  let model = 'anthropic/claude-sonnet-4-5';
  try {
    const slot1: any = await env.submoacontent_db
      .prepare('SELECT model_string FROM llm_config WHERE slot = 1')
      .first();
    if (slot1?.model_string) model = slot1.model_string;
  } catch {}

  let authorVoice = '';
  let authorName = '';
  if (authorSlug) {
    try {
      const a: any = await env.submoacontent_db
        .prepare('SELECT name, style_guide FROM author_profiles WHERE slug = ?')
        .bind(authorSlug).first();
      if (a) { authorVoice = a.style_guide || ''; authorName = a.name || ''; }
    } catch {}
  }

  const system =
    "You are a professional long-form writer. Produce a publication-ready blog article draft based on the supplied YouTube transcript. Do not fabricate facts not present in the transcript. Honor the provided author voice guide exactly. Return plain markdown starting with an H1 title. No preamble. Never use em-dashes (—) in any output. Use a comma, a period, or restructure the sentence instead." +
    (authorVoice ? `\n\nAuthor: ${authorName}\n\nVoice guide:\n${authorVoice}` : '');
  const userPrompt = `${topic ? `Article angle: ${topic}\n\n` : ''}Transcript:\n${transcript}`;

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://www.submoacontent.com',
        'X-Title': 'SubMoa YouTube Draft',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4000,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userPrompt },
        ],
      }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      return json({ error: `OpenRouter HTTP ${res.status}`, detail: errBody.slice(0, 400) }, 502);
    }
    const data: any = await res.json();
    const { sanitizeContent } = await import('../../../src/content-utils');
    const draft = sanitizeContent((data?.choices?.[0]?.message?.content ?? '').trim());
    if (!draft) return json({ error: 'Empty model output' }, 502);
    return json({ draft, model });
  } catch (err: any) {
    return json({ error: err?.message || 'Server error' }, 500);
  }
}
