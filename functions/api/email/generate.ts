// POST /api/email/generate
// Generates token values via OpenRouter, fills the selected baseline's HTML,
// applies the user's accent + background colors, derives text color from
// background luminance. Returns { html }.
//
// Body: { template_id, topic, subject, preheader, purpose, audience, author,
//         primary_color, background_color }

import { json, getSessionUser } from '../_utils';
import { EMAIL_TEMPLATES, textColorForBackground, fillTokens } from '../../../src/template-baselines';
import { sanitizeContent, EM_DASH_GUARD } from '../../../src/content-utils';

// Token sets the model needs to produce per template. Anything missing gets
// a sensible default so placeholders never leak into the final HTML.
function tokenSpec(templateId: string): string[] {
  switch (templateId) {
    case 'newsletter':
      return ['HEADLINE', 'SUBHEADLINE', 'BODY_1', 'CTA_TEXT', 'ARTICLE_1_TITLE', 'ARTICLE_1_EXCERPT', 'ARTICLE_2_TITLE', 'ARTICLE_2_EXCERPT'];
    case 'announcement':
      return ['HEADLINE', 'BODY_1', 'BODY_2', 'CTA_TEXT', 'FEATURE_1', 'FEATURE_2', 'FEATURE_3'];
    case 'roundup_digest':
      return ['HEADLINE', 'BODY_1', 'ITEM_1_TITLE', 'ITEM_1_EXCERPT', 'ITEM_2_TITLE', 'ITEM_2_EXCERPT', 'ITEM_3_TITLE', 'ITEM_3_EXCERPT', 'ITEM_4_TITLE', 'ITEM_4_EXCERPT', 'ITEM_5_TITLE', 'ITEM_5_EXCERPT'];
    case 'promotional':
      return ['HEADLINE', 'SUBHEADLINE', 'CTA_TEXT', 'PRODUCT_1_CATEGORY', 'PRODUCT_1_TITLE', 'PRODUCT_1_PRICE', 'PRODUCT_1_ORIGINAL', 'PRODUCT_2_CATEGORY', 'PRODUCT_2_TITLE', 'PRODUCT_2_PRICE', 'PRODUCT_2_ORIGINAL', 'FINE_PRINT'];
    case 'welcome':
      return ['HEADLINE', 'BODY_1', 'CTA_TEXT', 'FEATURE_1', 'FEATURE_2', 'FEATURE_3'];
    case 'transactional':
      return ['EYEBROW', 'HEADLINE', 'BODY_1', 'BODY_2', 'CTA_TEXT', 'ITEM_COST', 'SHIPPING_COST', 'TAX_COST', 'TOTAL_COST'];
    case 'reengagement':
      return ['HEADLINE', 'BODY_1', 'BODY_2', 'PULL_QUOTE', 'CTA_TEXT'];
    default:
      return ['HEADLINE', 'BODY_1', 'CTA_TEXT'];
  }
}

export async function onRequest(context: { request: Request; env: any }) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Unauthorized' }, 401);

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const templateId = String(body.template_id || '').trim();
  const template = (EMAIL_TEMPLATES as any)[templateId];
  if (!template) return json({ error: `Unknown template_id: ${templateId}` }, 400);

  const topic = String(body.topic || '').slice(0, 400);
  const subject = String(body.subject || '').slice(0, 200);
  const preheader = String(body.preheader || '').slice(0, 200);
  const purpose = String(body.purpose || '').slice(0, 1000);
  const audience = String(body.audience || '').slice(0, 1000);
  const authorSlug = String(body.author || '').slice(0, 120);
  const accent = String(body.primary_color || template.accentColor || '#B8872E');
  const background = String(body.background_color || '#EDE8DF');

  let voice = '';
  if (authorSlug) {
    try {
      const a: any = await env.submoacontent_db.prepare('SELECT style_guide FROM author_profiles WHERE slug = ?').bind(authorSlug).first();
      if (a?.style_guide) voice = a.style_guide;
    } catch {}
  }

  // Ask the model for a JSON object with exactly the tokens this template needs.
  const tokens = tokenSpec(templateId);
  const system = `You are an email copywriter. You will produce copy that will be dropped into a pre-designed HTML template. Return ONLY valid JSON — no preamble, no markdown fences. Keep every value concise: headlines under 10 words, body paragraphs 2-3 sentences, excerpts under 25 words, CTA text under 4 words, stats/prices short. ${EM_DASH_GUARD}${voice ? `\n\nAUTHOR VOICE GUIDE:\n${voice}` : ''}`;
  const userPrompt = `Template: ${template.name}. Topic: ${topic}. Purpose: ${purpose || '(not given)'}. Audience: ${audience || '(not given)'}. Subject line: ${subject}.\n\nReturn a JSON object with these fields and nothing else: ${tokens.map(t => `"${t}"`).join(', ')}.`;

  let values: Record<string, string> = {};
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://www.submoacontent.com',
        'X-Title': 'SubMoa Email Generate',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        max_tokens: 1600,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userPrompt },
        ],
      }),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      return json({ error: `OpenRouter HTTP ${res.status}`, detail: err.slice(0, 300) }, 502);
    }
    const data: any = await res.json();
    const raw = String(data?.choices?.[0]?.message?.content || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    try { values = JSON.parse(raw); } catch { return json({ error: 'Model returned non-JSON', raw: raw.slice(0, 400) }, 502); }
  } catch (e: any) {
    return json({ error: e?.message || 'Server error' }, 500);
  }

  // Sanitize every value (strip em-dashes) before token substitution.
  for (const k of Object.keys(values)) values[k] = sanitizeContent(String(values[k] ?? ''));

  // Merge in the chrome tokens: accent, background, text color, brand name,
  // footer address, CTA URL fallbacks, unsubscribe URL, etc.
  const merged: Record<string, string> = {
    ...values,
    ACCENT_COLOR: accent,
    BACKGROUND_COLOR: background,
    TEXT_COLOR: textColorForBackground(background),
    BRAND_NAME: values.BRAND_NAME || 'Your Brand',
    FOOTER_ADDRESS: values.FOOTER_ADDRESS || '',
    CTA_URL: values.CTA_URL || '#',
    ARTICLE_1_URL: values.ARTICLE_1_URL || '#',
    ARTICLE_2_URL: values.ARTICLE_2_URL || '#',
    ITEM_1_URL: values.ITEM_1_URL || '#',
    ITEM_2_URL: values.ITEM_2_URL || '#',
    ITEM_3_URL: values.ITEM_3_URL || '#',
    ITEM_4_URL: values.ITEM_4_URL || '#',
    ITEM_5_URL: values.ITEM_5_URL || '#',
    ISSUE_NUMBER: values.ISSUE_NUMBER || '—',
    UNSUBSCRIBE_URL: values.UNSUBSCRIBE_URL || '#',
  };

  const html = fillTokens(template.htmlBaseline, merged);
  return json({ html, template_id: templateId, values: merged });
}
