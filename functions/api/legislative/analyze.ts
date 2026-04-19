// POST /api/legislative/analyze
// Runs five sequential OpenRouter passes over a bill, producing a
// legislative_briefs row. Mode = 'rep' or 'party'. All five passes use the
// guardrail-wrapped system prompt.
import { getSessionUser, json, generateId } from '../_utils';
import { requirePageAccess, writeAudit, AccessError } from '../../../src/auth-utils';
import { sanitizeContent, EM_DASH_GUARD } from '../../../src/content-utils';

interface Pass {
  name: keyof BriefRow;
  description: string;
  format: string;
}

type BriefRow = {
  pork_analysis: string[];
  talking_points_pro: string[];
  talking_points_opposed: string[];
  verbatim_extracts: string[];
  historical_parallels: string[];
  opposition_alignment: string[];
};

const PASSES: Pass[] = [
  { name: 'pork_analysis',         description: 'Identify any pork-barrel spending, earmarks, unrelated add-ons, or special-interest provisions. Quote the specific section numbers.', format: 'JSON array of { section, text, concern }' },
  { name: 'talking_points_pro',    description: 'Craft 5 on-message talking points FOR this bill from the supplied voice.',                                                        format: 'JSON array of short strings' },
  { name: 'talking_points_opposed',description: 'Craft 5 sharp talking points AGAINST this bill from the supplied voice.',                                                         format: 'JSON array of short strings' },
  { name: 'verbatim_extracts',     description: 'Pull 5-8 verbatim quotes from the bill text that are politically salient. Always keep the section reference alongside the quote.', format: 'JSON array of { section, quote }' },
  { name: 'historical_parallels',  description: 'Identify comparable historical legislation and outcomes. Note what worked, what did not, and what is different now.',             format: 'JSON array of { bill, year, outcome, relevance }' },
];

async function runPass(env: any, pass: Pass, systemCore: string, billText: string, voiceGuide: string): Promise<any[]> {
  const sys =
    `${systemCore}\n\nCONSTRAINTS: No fabricated statistics. No defamatory content. No impersonation of named people. No claims you cannot cite directly from the supplied text. ${EM_DASH_GUARD} Return ONLY valid JSON. No preamble. No commentary. No markdown fences.`;
  const user = `Voice guide: ${voiceGuide.slice(0, 4000)}\n\nBill text (truncated to 20k chars):\n${billText.slice(0, 20000)}\n\nTask: ${pass.description}\nOutput shape: ${pass.format}`;
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
      'HTTP-Referer': 'https://www.submoacontent.com',
      'X-Title': 'SubMoa Legislative Intelligence',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      max_tokens: 2400,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter HTTP ${res.status}`);
  const data: any = await res.json();
  const raw = String(data?.choices?.[0]?.message?.content || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Sanitize every string field before it ever hits storage.
    return parsed.map(item => {
      if (typeof item === 'string') return sanitizeContent(item);
      if (item && typeof item === 'object') {
        const out: any = {};
        for (const [k, v] of Object.entries(item)) out[k] = typeof v === 'string' ? sanitizeContent(v) : v;
        return out;
      }
      return item;
    });
  } catch { return []; }
}

export async function onRequest(context: { request: Request; env: any }) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);
  try { await requirePageAccess(user, env, 'legislative-intelligence', 'analyze-bill'); }
  catch (e: any) { return json({ error: e.message }, e instanceof AccessError ? e.status : 403); }

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const legislation_id = String(body.legislation_id || '').trim();
  const mode = String(body.mode || 'rep');
  const rep_profile_id = body.rep_profile_id || null;
  const party = body.party || null;
  if (!legislation_id) return json({ error: 'legislation_id required' }, 400);

  const bill: any = await env.submoacontent_db
    .prepare('SELECT * FROM legislation WHERE id = ? OR bill_id = ?')
    .bind(legislation_id, legislation_id).first();
  if (!bill) return json({ error: 'Bill not found' }, 404);

  let voiceGuide = '';
  if (mode === 'rep' && rep_profile_id) {
    const rep: any = await env.submoacontent_db.prepare('SELECT voice_guide, name, policy_positions, party FROM rep_profiles WHERE id = ?').bind(rep_profile_id).first();
    if (!rep) return json({ error: 'Rep profile not found' }, 404);
    voiceGuide = `Name: ${rep.name}. Party: ${rep.party || 'n/a'}. Voice guide: ${rep.voice_guide || ''}. Policy positions: ${rep.policy_positions || '{}'}`;
  } else if (mode === 'party' && party) {
    // Aggregate sample party corpus.
    const corpus = await env.submoacontent_db.prepare('SELECT title, content FROM party_corpus WHERE party = ? ORDER BY year DESC LIMIT 5').bind(party).all();
    voiceGuide = `Party: ${party}. Sample corpus:\n` + (corpus.results || []).map((r: any) => `- ${r.title}: ${(r.content || '').slice(0, 400)}`).join('\n');
  } else {
    return json({ error: 'Provide rep_profile_id (rep mode) or party (party mode).' }, 400);
  }

  const systemCore =
    `You are a legislative policy analyst working for a communications staff. Stay strictly grounded in the bill text supplied. Quote verbatim with section citations. Apply the supplied voice guide to tone, word choice, and framing — but never fabricate a position the voice guide does not support.`;

  const billText = bill.full_text || bill.summary || bill.title || '';

  const briefId = generateId();
  const results: Record<string, any[]> = {};
  try {
    for (const pass of PASSES) {
      results[pass.name] = await runPass(env, pass, systemCore, billText, voiceGuide);
    }
    // Opposition alignment — separate pass surfacing bipartisan / cross-aisle alignment cues.
    results.opposition_alignment = await runPass(
      env,
      { name: 'opposition_alignment', description: 'Identify where this bill aligns with or contradicts the OPPOSING party/rep. Cite specific sections.', format: 'JSON array of { section, alignment, note }' },
      systemCore, billText, voiceGuide
    );

    await env.submoacontent_db.prepare(
      `INSERT INTO legislative_briefs
        (id, legislation_id, rep_profile_id, party, mode,
         pork_analysis, talking_points_pro, talking_points_opposed, verbatim_extracts,
         historical_parallels, opposition_alignment, fec_context, news_cycle, status, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', '{}', 'ready', ?, unixepoch())`
    ).bind(
      briefId, bill.id, rep_profile_id, party, mode,
      JSON.stringify(results.pork_analysis),
      JSON.stringify(results.talking_points_pro),
      JSON.stringify(results.talking_points_opposed),
      JSON.stringify(results.verbatim_extracts),
      JSON.stringify(results.historical_parallels),
      JSON.stringify(results.opposition_alignment),
      user.id,
    ).run();

    await writeAudit(env, request, user.id, { action: 'brief-generated', legislation_id: bill.id, brief_id: briefId, rep_profile_id, details: { mode, party } });
    return json({ brief_id: briefId, mode, ...results });
  } catch (e: any) {
    return json({ error: e?.message || 'Server error', partial: results }, 500);
  }
}
