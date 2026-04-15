// POST /api/planner/recap
// Returns a plain-English confirmation summary; called repeatedly in the confirmation loop.

import { json, getSessionUser } from '../_utils';

const MODEL = 'google/gemini-2.5-flash';

export async function onRequest(context: any) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const { situation, answers = {}, existing_recap = null, additions = [] } = body;
  if (!situation) return json({ error: 'situation required' }, 400);

  const systemPrompt =
    'You are a planning assistant confirming your understanding of a planning request. ' +
    'Write a clear plain English summary of exactly what you understood the user needs. ' +
    'Be specific — include dates, budget levels, party size, constraints, and all key details mentioned. ' +
    'Start with "Here\'s what I\'ve got:" and write 3 to 5 sentences. ' +
    'Do not ask questions. Do not say what you will do. Just confirm the facts.';

  const parts: string[] = [
    `=== ORIGINAL REQUEST ===`,
    situation,
    ``,
    `=== ANSWERS ===`,
    ...Object.entries(answers).map(([k, v]) => `${k}: ${String(v)}`),
  ];
  if (existing_recap) {
    parts.push(``, `=== PREVIOUS RECAP ===`, existing_recap);
  }
  if (Array.isArray(additions) && additions.length) {
    parts.push(``, `=== ADDITIONAL DETAILS THE USER JUST ADDED ===`);
    additions.forEach((a: string, i: number) => parts.push(`${i + 1}. ${a}`));
    parts.push(``, 'Incorporate these additions into the recap.');
  }

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://www.submoacontent.com',
        'X-Title': 'SubMoa Planner',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 600,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: parts.join('\n') },
        ],
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      return json({ error: `Model HTTP ${res.status}`, detail: t.slice(0, 300) }, 502);
    }
    const data: any = await res.json();
    const recap = (data?.choices?.[0]?.message?.content ?? '').trim();
    return json({ recap });
  } catch (e: any) {
    return json({ error: 'Failed to generate recap', detail: e?.message ?? String(e) }, 500);
  }
}
