// POST /api/legislative/fact-check  { brief_id, flag_id, selected_text, context }
// Runs an OpenRouter gemini-2.5-flash call with web search enabled, stores the
// verdict back onto the flag row.
import { getSessionUser, json } from '../_utils';
import { requirePageAccess, writeAudit, AccessError } from '../../../src/auth-utils';
import { sanitizeContent, EM_DASH_GUARD } from '../../../src/content-utils';

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
  const brief_id = String(body.brief_id || '');
  const flag_id = String(body.flag_id || '');
  const selected_text = String(body.selected_text || '').slice(0, 4000);
  const ctx = String(body.context || '').slice(0, 12000);
  if (!flag_id || !selected_text) return json({ error: 'flag_id and selected_text required' }, 400);

  const system =
    `You are a legislative fact-checker. Verify the following claim against the bill text provided and current public records. Return ONLY valid JSON with these fields: verdict (one of: Verified, Inaccurate, Unverifiable), summary (one sentence), source_url (single best URL), bill_section_reference (string or null). ${EM_DASH_GUARD}`;
  const userMsg = `Claim: ${selected_text}\n\nBill context:\n${ctx}`;

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://www.submoacontent.com',
        'X-Title': 'SubMoa Legislative Fact-Check',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        max_tokens: 900,
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
    const parsed: any = safeParseJson(raw) || { verdict: 'Unverifiable', summary: raw.slice(0, 300), source_url: null, bill_section_reference: null };

    await env.submoacontent_db.prepare(
      `UPDATE legislative_flags
       SET fact_check_verdict = ?, fact_check_result = ?, fact_check_sources = ?, status = 'checked'
       WHERE id = ?`
    ).bind(
      parsed.verdict || 'Unverifiable',
      JSON.stringify(parsed),
      JSON.stringify(parsed.source_url ? [parsed.source_url] : []),
      flag_id,
    ).run();

    await writeAudit(env, request, user.id, { action: 'fact-check-run', brief_id, details: { flag_id, verdict: parsed.verdict } });
    return json({ verdict: parsed.verdict, summary: parsed.summary, source_url: parsed.source_url, bill_section_reference: parsed.bill_section_reference, raw });
  } catch (e: any) {
    return json({ error: e?.message || 'Server error' }, 500);
  }
}
