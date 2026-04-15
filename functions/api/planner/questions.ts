// POST /api/planner/questions
// Generate 4-5 clarifying questions for a planning request via OpenRouter.

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
  const situation = (body?.situation || '').toString().trim();
  if (!situation) return json({ error: 'situation required' }, 400);

  const systemPrompt =
    'You are a planning assistant. Generate 4 to 5 targeted clarifying questions to help build a comprehensive actionable plan with specific vendor recommendations, phone numbers, and cost estimates. ' +
    'Return ONLY valid JSON array with no preamble: [{"id":"q1","question":"Question text","type":"choice","options":["A","B","C"]}]. ' +
    'Use type "choice" for multiple choice or type "text" for open text. ' +
    'Focus on budget range, timeline, party size, specific constraints, and key preferences.';

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
        max_tokens: 1200,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Planning request:\n${situation}\n\nGenerate clarifying questions.` },
        ],
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      return json({ error: `Model HTTP ${res.status}`, detail: t.slice(0, 300) }, 502);
    }
    const data: any = await res.json();
    let content = data?.choices?.[0]?.message?.content ?? '[]';
    content = content.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
    const questions = JSON.parse(content);
    if (!Array.isArray(questions)) throw new Error('Model did not return an array');
    return json({ questions });
  } catch (e: any) {
    return json({ error: 'Failed to generate questions', detail: e?.message ?? String(e) }, 500);
  }
}
