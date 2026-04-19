// POST /api/press-release/generate  { id? OR full form fields }
// If `id` is provided, uses the existing draft. Otherwise inserts a new one.
// Calls OpenRouter gemini-2.5-flash with the PR copywriter system prompt.
// Writes `generated_content` + sets status='ready'. Returns the full row.
import { json, getSessionUser, generateId } from '../_utils';
import { sanitizeContent, EM_DASH_GUARD } from '../../../src/content-utils';

const SYSTEM = `You are a professional PR copywriter with 20 years of experience writing press releases for major brands and agencies. Write a complete, properly formatted press release based on the provided information. Follow standard AP style press release format: FOR IMMEDIATE RELEASE header, dateline, headline, subhead, three to five body paragraphs, boilerplate, media contact block. The release must be newsworthy, factual, and written in third person. Include the provided quote naturally in the body. Never fabricate statistics, claims, or quotes not provided. Match the author voice guide if provided. ${EM_DASH_GUARD}`;

export async function onRequest(context: { request: Request; env: any }) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const accountId = user.account_id || 'makerfrontier';

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  // Resolve or create the draft row.
  let id = String(body.id || '').trim();
  if (!id) {
    id = generateId();
    await env.submoacontent_db.prepare(
      `INSERT INTO press_releases
        (id, account_id, product_or_news, links, business_name, business_location, business_website,
         cited_quotes, pr_contact, about_brand, emotional_context, brand_brief_r2_key,
         status, author_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'generating', ?, unixepoch(), unixepoch())`
    ).bind(
      id, accountId,
      String(body.product_or_news || '').slice(0, 2000),
      String(body.links || '').slice(0, 4000),
      String(body.business_name || '').slice(0, 200),
      String(body.business_location || '').slice(0, 200),
      String(body.business_website || '').slice(0, 400),
      String(body.cited_quotes || '').slice(0, 2000),
      String(body.pr_contact || '').slice(0, 1000),
      String(body.about_brand || '').slice(0, 2000),
      String(body.emotional_context || '').slice(0, 2000) || null,
      body.brand_brief_r2_key || null,
      body.author_id || null,
    ).run();
  } else {
    await env.submoacontent_db
      .prepare(`UPDATE press_releases SET status = 'generating', updated_at = unixepoch() WHERE id = ? AND account_id = ?`)
      .bind(id, accountId).run();
  }

  const row: any = await env.submoacontent_db
    .prepare('SELECT * FROM press_releases WHERE id = ? AND account_id = ?')
    .bind(id, accountId).first();
  if (!row) return json({ error: 'Press release not found' }, 404);

  // Author voice guide (best effort).
  let voiceGuide = '';
  if (row.author_id) {
    try {
      const a: any = await env.submoacontent_db.prepare('SELECT name, style_guide FROM author_profiles WHERE slug = ?').bind(row.author_id).first();
      if (a?.style_guide) voiceGuide = `\n\nAUTHOR VOICE GUIDE (${a.name || row.author_id}):\n${a.style_guide}`;
    } catch {}
  }

  const userPrompt = [
    `Business: ${row.business_name || '(unknown)'}`,
    row.business_location ? `Location: ${row.business_location}` : '',
    row.business_website ? `Website: ${row.business_website}` : '',
    '',
    `PRODUCT OR NEWS:\n${row.product_or_news || '(none)'}`,
    '',
    row.emotional_context ? `WHY THIS MATTERS:\n${row.emotional_context}\n` : '',
    row.cited_quotes ? `QUOTE:\n${row.cited_quotes}\n` : '',
    row.about_brand ? `ABOUT THE BRAND:\n${row.about_brand}\n` : '',
    row.pr_contact ? `PR CONTACT:\n${row.pr_contact}\n` : '',
    row.links ? `RELEVANT LINKS:\n${row.links}` : '',
  ].filter(Boolean).join('\n');

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://www.submoacontent.com',
        'X-Title': 'SubMoa Press Release',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        max_tokens: 2400,
        messages: [
          { role: 'system', content: SYSTEM + voiceGuide },
          { role: 'user', content: userPrompt },
        ],
      }),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      await env.submoacontent_db.prepare(`UPDATE press_releases SET status = 'failed', updated_at = unixepoch() WHERE id = ?`).bind(id).run();
      return json({ error: `OpenRouter HTTP ${res.status}`, detail: err.slice(0, 300) }, 502);
    }
    const data: any = await res.json();
    const raw = String(data?.choices?.[0]?.message?.content || '').trim();
    if (!raw) {
      await env.submoacontent_db.prepare(`UPDATE press_releases SET status = 'failed', updated_at = unixepoch() WHERE id = ?`).bind(id).run();
      return json({ error: 'Empty model output' }, 502);
    }
    const sanitized = sanitizeContent(raw);
    await env.submoacontent_db.prepare(
      `UPDATE press_releases SET generated_content = ?, status = 'ready', updated_at = unixepoch() WHERE id = ?`
    ).bind(sanitized, id).run();

    const updated = await env.submoacontent_db.prepare('SELECT * FROM press_releases WHERE id = ?').bind(id).first();
    return json({ press_release: updated });
  } catch (e: any) {
    await env.submoacontent_db.prepare(`UPDATE press_releases SET status = 'failed', updated_at = unixepoch() WHERE id = ?`).bind(id).run();
    return json({ error: e?.message || 'Server error' }, 500);
  }
}
