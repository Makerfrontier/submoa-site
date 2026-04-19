import { getSessionUser, json } from '../_utils';
import type { Env } from '../_utils';
import { sanitizeContent, EM_DASH_GUARD } from '../../../src/content-utils';

// POST /api/comp-studio/master-prompt
// Dedicated full-page restyle endpoint. Uses anthropic/claude-sonnet-4-5 via
// OpenRouter because gemini-flash was too eager to invent new content and
// drop the user's existing markup. Hard rules are in the SYSTEM prompt so
// they carry more weight than the copyWrapper "user instruction" format.
//
// Body: { category, templateName, styleDirection, strippedHtml, lockedIds[], pageTopic? }
// Returns: { html, warnings? } on success, { error, code, ...context } on failure.
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

  const category = String(body.category || 'general').slice(0, 80);
  const templateName = String(body.templateName || 'page').slice(0, 120);
  const styleDirection = String(body.styleDirection || '').slice(0, 4000).trim();
  const strippedHtml = String(body.strippedHtml || '').slice(0, 80000);
  const lockedIds: string[] = Array.isArray(body.lockedIds) ? body.lockedIds.filter((x: any) => typeof x === 'string').slice(0, 200) : [];
  const pageTopic = String(body.pageTopic || '').slice(0, 240).trim();

  if (!styleDirection) return json({ error: 'styleDirection required', code: 'no_direction' }, 400);
  if (!strippedHtml || strippedHtml.length < 40) return json({ error: 'strippedHtml missing', code: 'no_html' }, 400);

  const systemPrompt = [
    'You are a senior front-end designer restyling an EXISTING live webpage. Your single job is to apply a new visual style to HTML that already exists. You do not invent new copy, you do not change the subject matter, and you never replace real content with lorem-ipsum.',
    '',
    'HARD RULES (non-negotiable):',
    '1. Preserve EVERY piece of visible text exactly: every headline, paragraph, link label, nav item, list item, caption, and article body. Never paraphrase, shorten, or translate.',
    '2. Preserve EVERY image src, alt, href, and data-* attribute. Never invent new placeholder images.',
    `3. Preserve EVERY "[[LOCKED_BLOCK:id]]" placeholder token EXACTLY as written, on its own line, surrounded by a container element. There are ${lockedIds.length} locked placeholder${lockedIds.length === 1 ? '' : 's'} in the input. Your output MUST contain all of them verbatim.`,
    '4. Preserve EVERY ad-placeholder element (any element with data-ad, class containing "ad", or an ad-sized placeholder). Do not remove or restyle it in a way that changes its footprint.',
    pageTopic ? `5. The page topic is "${pageTopic}". Under no circumstance drift from this topic.` : '',
    '',
    'WHAT YOU MAY CHANGE:',
    '- Colors, typography, spacing, layout structure, grid, decorative elements, backgrounds, border treatments, section ordering (as long as reading order is preserved).',
    '- Add an embedded <style> block with the new CSS.',
    '- Wrap content in new structural elements (sections, grids) as long as content remains intact.',
    '',
    'OUTPUT CONTRACT:',
    '- Return one complete HTML document starting with <!DOCTYPE html>.',
    '- No external scripts. No external CSS. No markdown code fences. No preamble. No explanation.',
    '- Every "[[LOCKED_BLOCK:...]]" placeholder from the input appears in the output verbatim.',
    '- If you cannot satisfy the rules above, return the INPUT HTML unchanged.',
    EM_DASH_GUARD,
  ].filter(Boolean).join('\n');

  const userPrompt = [
    `TEMPLATE: ${templateName}`,
    `CATEGORY: ${category}`,
    pageTopic ? `PAGE TOPIC: ${pageTopic}` : '',
    '',
    'STYLE DIRECTION FROM USER:',
    styleDirection,
    '',
    'EXISTING HTML (this is what you restyle — preserve its content):',
    strippedHtml,
  ].filter(Boolean).join('\n');

  let modelResponseText = '';
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://www.submoacontent.com',
        'X-Title': 'SubMoa Comp Studio Master Prompt',
      },
      body: JSON.stringify({
        model: 'anthropic/claude-sonnet-4-5',
        max_tokens: 16000,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      return json({ error: `OpenRouter HTTP ${res.status}`, code: 'upstream_error', detail: errBody.slice(0, 300) }, 502);
    }
    const data: any = await res.json();
    modelResponseText = String(data?.choices?.[0]?.message?.content ?? '').trim();
  } catch (err: any) {
    return json({ error: err?.message || 'Server error', code: 'fetch_failed' }, 500);
  }

  // Strip markdown code fences the model sometimes wraps HTML in despite instructions.
  let html = modelResponseText
    .replace(/^```(?:html|HTML)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  const warnings: string[] = [];

  // GUARD 1: empty/too-short response. Keep original, surface error.
  if (!html || html.length < 200) {
    return json({
      error: 'Model returned empty or unusably-short response',
      code: 'empty_response',
      raw_length: html.length,
    }, 502);
  }

  // GUARD 2: must look like HTML.
  if (!/<\s*html/i.test(html) && !/<\s*body/i.test(html) && !/<\s*div/i.test(html)) {
    return json({
      error: 'Model returned content that is not HTML',
      code: 'invalid_html',
      preview: html.slice(0, 300),
    }, 502);
  }

  // GUARD 3: verify all locked-block placeholders are present verbatim.
  // If any are missing, the model violated the contract — reject the output
  // so the client can keep the original comp. We do NOT try to re-inject
  // here because we can't know the correct position.
  const missing: string[] = [];
  for (const id of lockedIds) {
    const token = `[[LOCKED_BLOCK:${id}]]`;
    if (!html.includes(token)) missing.push(id);
  }
  if (missing.length > 0 && missing.length === lockedIds.length && lockedIds.length > 0) {
    return json({
      error: 'Model dropped all locked-block placeholders',
      code: 'locked_blocks_missing',
      missing,
    }, 502);
  }
  if (missing.length > 0) {
    warnings.push(`Model dropped ${missing.length} locked-block placeholder(s); they will be re-injected by the client.`);
  }

  html = sanitizeContent(html);

  return json({ html, warnings: warnings.length ? warnings : undefined });
}
