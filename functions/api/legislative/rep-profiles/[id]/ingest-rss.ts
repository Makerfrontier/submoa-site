// POST /api/legislative/rep-profiles/:id/ingest-rss  { rss_url }
// Fetches the RSS feed, extracts text, calls OpenRouter to derive voice guide
// + tone tags + sample phrases + policy positions.
import { getSessionUser, json } from '../../../_utils';
import { requirePageAccess, writeAudit, AccessError } from '../../../../../src/auth-utils';

function extractText(raw: string): string {
  let text = raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  text = text.replace(/<[^>]+>/g, ' ');
  text = text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&[a-z]+;/g, ' ');
  return text.replace(/\s+/g, ' ').trim();
}

async function analyzeVoice(env: any, corpus: string) {
  const system =
    "You analyze a legislator's public writing to produce a voice guide. Return ONLY valid JSON: {voice_guide, tone_tags (array of 3-6), sample_phrases (array of 4-6), policy_positions (object mapping topic → stance)}. No fabrication.";
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
      'HTTP-Referer': 'https://www.submoacontent.com',
      'X-Title': 'SubMoa Rep Profile Voice',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      max_tokens: 2000,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: corpus.slice(0, 14000) },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter HTTP ${res.status}`);
  const data: any = await res.json();
  const raw = String(data?.choices?.[0]?.message?.content || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  try { return JSON.parse(raw); } catch { return null; }
}

export async function onRequest(context: { request: Request; env: any; params: { id?: string } }) {
  const { request, env, params } = context;
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);
  try { await requirePageAccess(user, env, 'legislative-intelligence', 'manage-rep-profiles'); }
  catch (e: any) { return json({ error: e.message }, e instanceof AccessError ? e.status : 403); }

  const id = String(params.id || '').trim();
  if (!id) return json({ error: 'Missing id' }, 400);

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const rssUrl = String(body.rss_url || '').trim();
  if (!rssUrl) return json({ error: 'rss_url required' }, 400);

  try {
    const feedRes = await fetch(rssUrl);
    if (!feedRes.ok) return json({ error: `Feed fetch HTTP ${feedRes.status}` }, 502);
    const feedXml = await feedRes.text();
    const items = Array.from(feedXml.matchAll(/<item>([\s\S]*?)<\/item>/g)).slice(0, 30).map(m => extractText(m[1])).join('\n\n');
    if (!items) return json({ error: 'No items in feed' }, 400);

    const analysis = await analyzeVoice(env, items);
    if (!analysis) return json({ error: 'Voice analysis failed' }, 502);

    await env.submoacontent_db.prepare(
      `UPDATE rep_profiles SET
        voice_guide = ?, tone_tags = ?, sample_phrases = ?, policy_positions = ?,
        rss_url = ?, documents_ingested = COALESCE(documents_ingested, 0) + 1,
        updated_at = unixepoch() WHERE id = ?`
    ).bind(
      analysis.voice_guide || '',
      JSON.stringify(analysis.tone_tags || []),
      JSON.stringify(analysis.sample_phrases || []),
      JSON.stringify(analysis.policy_positions || {}),
      rssUrl, id,
    ).run();

    await writeAudit(env, request, user.id, { action: 'rep-profile-updated', rep_profile_id: id, details: { source: 'rss' } });
    const row = await env.submoacontent_db.prepare('SELECT * FROM rep_profiles WHERE id = ?').bind(id).first();
    return json({ profile: row });
  } catch (e: any) {
    return json({ error: e?.message || 'Server error' }, 500);
  }
}
