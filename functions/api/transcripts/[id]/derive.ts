// POST /api/transcripts/:id/derive
// Body: { asset_type, options? }
//
// Blocking. Creates the derived_assets row containing pre-fill payload for
// the target feature, then returns the destination URL with
// ?source_transcript=:id&source_derivation=:derivation_id so the target
// page can fetch the draft and render the SourceBanner.
//
// Asset types supported for v1:
//   article, press-release, brief, quark-cast, email, powerpoint,
//   atomic-flash, quote-graphic, infographic, atomic-politics,
//   ask-reactor, prompt-builder,
//   extract-quotes, key-takeaways, translate  (these three are "pull from this" — return data inline)

import { getSessionUser, json, generateId } from '../../_utils';

const DESTINATION_ROUTE: Record<string, string> = {
  'article':          '/author',
  'press-release':    '/press-release',
  'brief':            '/brief-builder',
  'quark-cast':       '/listen',
  'email':            '/brief/email',
  'powerpoint':       '/brief/presentation',
  'atomic-flash':     '/atomic/images',
  'quote-graphic':    '/atomic/comp',
  'infographic':      '/brief/infographic',
  'atomic-politics':  '/legislative-intelligence',
  'ask-reactor':      '/reactor',
  'prompt-builder':   '/prompt-builder',
};

async function callClaude(env: any, system: string, userMsg: string, maxTokens = 800): Promise<string> {
  if (!env.OPENROUTER_API_KEY) return '';
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://submoacontent.com',
      'X-Title': 'SubMoa Atomic Transcription · derive',
    },
    body: JSON.stringify({
      model: 'anthropic/claude-sonnet-4-5',
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userMsg },
      ],
    }),
  });
  if (!res.ok) return '';
  const data: any = await res.json();
  return String(data?.choices?.[0]?.message?.content || '').trim();
}

function parseJsonFromLlm(raw: string): any {
  if (!raw) return null;
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  try { return JSON.parse(cleaned); } catch { return null; }
}

export async function onRequest(context: { request: Request; env: any; params: { id: string } }) {
  const { request, env, params } = context;
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);

  const t: any = await env.submoacontent_db
    .prepare(`SELECT * FROM transcripts WHERE id = ?`)
    .bind(params.id).first();
  if (!t) return json({ error: 'Not found' }, 404);
  if (t.user_id !== user.id) return json({ error: 'Forbidden' }, 403);
  if (t.status !== 'ready') return json({ error: 'Transcript not yet ready' }, 409);

  const body: any = await request.json().catch(() => ({}));
  const assetType = String(body?.asset_type || '').trim();
  const opts = body?.options || {};
  if (!assetType) return json({ error: 'asset_type required' }, 400);

  const transcriptText = String(t.transcript_text || '').slice(0, 15000);
  const videoTitle = t.video_title || 'Untitled';

  // Utility endpoints that return inline data (no redirect, no derivation row).
  if (assetType === 'extract-quotes') {
    const raw = await callClaude(
      env,
      'You extract the 5 most quotable, self-contained moments from a transcript. Return ONLY JSON — an array of objects with keys `quote` (verbatim), `speaker` (best guess), `timestamp_seconds` (integer, best guess).',
      `Video: "${videoTitle}"\n\nTranscript:\n${transcriptText}`,
      1200,
    );
    const parsed = parseJsonFromLlm(raw) || [];
    return json({ inline: true, quotes: Array.isArray(parsed) ? parsed.slice(0, 5) : [] });
  }
  if (assetType === 'key-takeaways') {
    const raw = await callClaude(
      env,
      'Summarize this video in 3–5 short bullet takeaways. Return ONLY JSON — an array of strings.',
      `Video: "${videoTitle}"\n\nTranscript:\n${transcriptText}`,
      600,
    );
    const parsed = parseJsonFromLlm(raw) || [];
    return json({ inline: true, takeaways: Array.isArray(parsed) ? parsed.slice(0, 6) : [] });
  }
  if (assetType === 'translate') {
    const target = String(opts?.target_language || 'Spanish').slice(0, 40);
    const raw = await callClaude(
      env,
      `Translate the transcript into ${target}. Preserve speaker turns and the original meaning. Return ONLY the translated text with the same paragraph breaks.`,
      transcriptText,
      3000,
    );
    return json({ inline: true, translated_text: raw, target_language: target });
  }

  // Route destinations — create a derivation row with pre-fill payload.
  const route = DESTINATION_ROUTE[assetType];
  if (!route) return json({ error: `Unsupported asset_type: ${assetType}` }, 400);

  // Generate a tailored angle suggestion for the destination. Cheap one-call.
  const angleSystem = `You generate a brief "suggested angle" for a ${assetType} derived from a video transcript. One sentence. No fluff. No headers.`;
  const angle = await callClaude(env, angleSystem, `Video: "${videoTitle}"\n\nTranscript excerpt:\n${transcriptText.slice(0, 4000)}`, 120);

  // Targeted keywords for SEO/pre-fill.
  const kwRaw = await callClaude(
    env,
    'Extract up to 6 target keywords (2–4 words each) from this transcript. Return ONLY a JSON array of strings.',
    transcriptText.slice(0, 6000),
    200,
  );
  const keywords = Array.isArray(parseJsonFromLlm(kwRaw)) ? parseJsonFromLlm(kwRaw) : [];

  const derivationId = generateId();
  const now = Math.floor(Date.now() / 1000);
  const derivationData = {
    video_title: videoTitle,
    source_url: t.source_url,
    thumbnail: t.video_thumbnail_url,
    duration_seconds: t.video_duration_seconds,
    angle: String(angle || '').slice(0, 400),
    keywords: keywords.slice(0, 6),
    transcript_preview: transcriptText.slice(0, 2000),
    options: opts,
  };

  await env.submoacontent_db.prepare(
    `INSERT INTO transcript_derived_assets (id, transcript_id, asset_type, asset_id, derivation_data, created_at)
     VALUES (?, ?, ?, '', ?, ?)`
  ).bind(derivationId, params.id, assetType, JSON.stringify(derivationData), now).run();

  const sep = route.includes('?') ? '&' : '?';
  const redirectUrl = `${route}${sep}source_transcript=${encodeURIComponent(params.id)}&source_derivation=${encodeURIComponent(derivationId)}`;

  return json({
    redirect_url: redirectUrl,
    source_transcript: params.id,
    source_derivation_id: derivationId,
    derivation_data: derivationData,
  });
}
