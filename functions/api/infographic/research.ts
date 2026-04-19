// POST /api/infographic/research
// Research-first flow: user states intent, we search for verified data sources.
// Returns a JSON object listing verifiable claims/sources. If fewer than 3
// high-confidence results, the client surfaces the "broaden topic or supply
// additional data" message.
import { getSessionUser, json } from '../_utils';
import type { Env } from '../_utils';

interface ResearchSource {
  claim: string;
  source_name: string;
  source_url: string;
  year: string;
  confidence: 'high' | 'medium' | 'low';
}

interface ResearchResult {
  sources: ResearchSource[];
  total_found: number;
}

function parseModelOutput(raw: string): ResearchResult | null {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const sources: ResearchSource[] = Array.isArray(parsed.sources)
      ? parsed.sources.filter((s: any) => s && typeof s.claim === 'string' && typeof s.source_url === 'string').map((s: any) => ({
          claim: String(s.claim).slice(0, 800),
          source_name: String(s.source_name || '').slice(0, 300),
          source_url: String(s.source_url).slice(0, 1000),
          year: String(s.year || '').slice(0, 10),
          confidence: (['high', 'medium', 'low'].includes(s.confidence) ? s.confidence : 'medium'),
        }))
      : [];
    const total_found = typeof parsed.total_found === 'number' ? parsed.total_found : sources.length;
    return { sources, total_found };
  } catch {
    return null;
  }
}

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

  const intent = String(body.intent || '').trim().slice(0, 4000);
  const broaden = !!body.broaden;
  if (!intent) return json({ error: 'intent is required' }, 400);

  const system =
    "You are a research assistant finding verified statistical data for infographic creation. Search for real statistics, studies, and data points that support the user's stated angle. Return ONLY valid JSON: {\"sources\": [{\"claim\": \"specific statistic or data point\", \"source_name\": \"publication or organization name\", \"source_url\": \"URL\", \"year\": \"year of data\", \"confidence\": \"high/medium/low\"}], \"total_found\": N}. Find as many high-confidence sources as possible. Only include sources with real verifiable URLs.";
  const userPrompt = broaden
    ? `Broaden this topic to surface more verifiable data points. User's original intent: ${intent}. Widen the scope — adjacent claims, longer timeframes, comparable cohorts, industry-standard studies. Still only include sources with real verifiable URLs.`
    : `User intent: ${intent}`;

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://www.submoacontent.com',
        'X-Title': 'SubMoa Infographic Research',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        max_tokens: 2400,
        // Enable web search tool on OpenRouter — Gemini models honor this plugin
        // to do their own web lookups before composing the response.
        plugins: [{ id: 'web' }],
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userPrompt },
        ],
      }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      return json({ error: `OpenRouter HTTP ${res.status}`, detail: errBody.slice(0, 300) }, 502);
    }
    const data: any = await res.json();
    const raw = data?.choices?.[0]?.message?.content ?? '';
    const parsed = parseModelOutput(raw);
    if (!parsed) return json({ error: 'Model returned unparseable output', raw: String(raw).slice(0, 800) }, 502);
    return json(parsed);
  } catch (err: any) {
    return json({ error: err?.message || 'Server error' }, 500);
  }
}
