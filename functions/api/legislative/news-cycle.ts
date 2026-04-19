// POST /api/legislative/news-cycle  { legislation_id }
// Returns news coverage + framing analysis for a bill. Caches 24h.
import { getSessionUser, json, generateId } from '../_utils';
import { requirePageAccess, writeAudit, AccessError } from '../../../src/auth-utils';
import { EM_DASH_GUARD } from '../../../src/content-utils';

function safeParseJson(raw: string) {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  try { return JSON.parse(cleaned); } catch { return null; }
}

export async function onRequest(context: { request: Request; env: any }) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);
  try { await requirePageAccess(user, env, 'legislative-intelligence', 'view'); }
  catch (e: any) { return json({ error: e.message }, e instanceof AccessError ? e.status : 403); }

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const legId = String(body.legislation_id || '').trim();
  if (!legId) return json({ error: 'legislation_id required' }, 400);

  const bill: any = await env.submoacontent_db
    .prepare('SELECT id, bill_id, title FROM legislation WHERE id = ? OR bill_id = ?')
    .bind(legId, legId).first();
  if (!bill) return json({ error: 'Bill not found' }, 404);

  // Cache — last 24h.
  const cached: any = await env.submoacontent_db
    .prepare('SELECT * FROM news_cycle_snapshots WHERE legislation_id = ? AND pulled_at > unixepoch() - 86400 ORDER BY pulled_at DESC LIMIT 1')
    .bind(bill.id).first();
  if (cached) {
    try { cached.articles = JSON.parse(cached.articles || '[]'); } catch { cached.articles = []; }
    return json({ ...cached, source: 'cache' });
  }

  const system =
    `You are a political media analyst. Search for news coverage of this legislation from the last 72 hours. Return ONLY valid JSON with fields: articles (array of {headline, outlet, url, date, political_lean}), dominant_narrative (string), opposition_narrative (string), media_attention_score (1-10 integer), framing_analysis (string). ${EM_DASH_GUARD}`;
  const userMsg = `Legislation: ${bill.bill_id} — ${bill.title}`;

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://www.submoacontent.com',
        'X-Title': 'SubMoa News Cycle',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        max_tokens: 2400,
        plugins: [{ id: 'web' }],
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userMsg },
        ],
      }),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      return json({ error: `OpenRouter HTTP ${res.status}`, detail: err.slice(0, 300) }, 502);
    }
    const data: any = await res.json();
    const raw = String(data?.choices?.[0]?.message?.content || '');
    const parsed: any = safeParseJson(raw) || { articles: [], dominant_narrative: '', opposition_narrative: '', media_attention_score: 0, framing_analysis: raw.slice(0, 800) };

    const id = generateId();
    await env.submoacontent_db.prepare(
      `INSERT INTO news_cycle_snapshots
        (id, legislation_id, articles, framing_analysis, dominant_narrative, opposition_narrative, media_attention_score, pulled_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, unixepoch())`
    ).bind(
      id, bill.id,
      JSON.stringify(parsed.articles || []),
      parsed.framing_analysis || '',
      parsed.dominant_narrative || '',
      parsed.opposition_narrative || '',
      Number(parsed.media_attention_score || 0),
    ).run();

    // Also stamp the latest brief so the UI knows when to show a "fresh cycle" badge.
    try {
      await env.submoacontent_db.prepare(
        `UPDATE legislative_briefs SET news_cycle = ?, news_cycle_pulled_at = unixepoch()
         WHERE legislation_id = ? AND id = (SELECT id FROM legislative_briefs WHERE legislation_id = ? ORDER BY created_at DESC LIMIT 1)`
      ).bind(JSON.stringify(parsed), bill.id, bill.id).run();
    } catch {}

    await writeAudit(env, request, user.id, { action: 'news-cycle-pulled', legislation_id: bill.id });
    return json({ ...parsed, source: 'live', id });
  } catch (e: any) {
    return json({ error: e?.message || 'Server error' }, 500);
  }
}
