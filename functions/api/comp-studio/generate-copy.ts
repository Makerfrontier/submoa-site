import { getSessionUser, json } from '../_utils';
import type { Env } from '../_utils';
import { PROMPT_WRAPPERS } from '../../../src/comp-utils';
import { sanitizeContent, EM_DASH_GUARD } from '../../../src/content-utils';

// POST /api/comp-studio/generate-copy
// Wraps the user instruction via copyWrapper then calls OpenRouter
// with google/gemini-2.5-flash. Used by the user CompStudio AI Copy flow,
// the admin HTML Templates editor Blocks tab, and the LLM Recreate card.
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
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  const category = String(body.category || 'general').slice(0, 80);
  const blockType = String(body.blockType || 'p').slice(0, 40);
  const blockLabel = String(body.blockLabel || blockType).slice(0, 120);
  const surroundingContext = String(body.surroundingContext || '').slice(0, 6000);
  const userInstruction = String(body.userInstruction || '').slice(0, 4000);

  if (!userInstruction.trim()) return json({ error: 'userInstruction is required' }, 400);

  const messages = PROMPT_WRAPPERS.copyWrapper({
    category, blockType, blockLabel, surroundingContext, userInstruction,
  });
  // Append the em-dash guardrail to the first system message in the chain.
  if (messages[0]?.role === 'system') {
    messages[0].content = `${messages[0].content} ${EM_DASH_GUARD}`;
  }

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://www.submoacontent.com',
        'X-Title': 'SubMoa Comp Studio',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        max_tokens: 1200,
        messages,
      }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      return json({ error: `OpenRouter HTTP ${res.status}`, detail: errBody.slice(0, 300) }, 502);
    }
    const data: any = await res.json();
    const generated_text = sanitizeContent((data?.choices?.[0]?.message?.content ?? '').trim());
    if (!generated_text) return json({ error: 'Empty model output' }, 502);
    return json({ generated_text });
  } catch (err: any) {
    return json({ error: err?.message || 'Server error' }, 500);
  }
}
