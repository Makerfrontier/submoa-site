// POST /api/content/edit-selection  { selected_text, surrounding_context, action_type, submission_type?, author_id?, custom_instruction? }
// Runs a single inline edit via OpenRouter + copyWrapper guardrails and
// returns { edited_text } for direct replacement in the client.
import { json, getSessionUser } from '../_utils';
import { PROMPT_WRAPPERS } from '../../../src/comp-utils';
import { sanitizeContent, EM_DASH_GUARD } from '../../../src/content-utils';

const INSTRUCTION: Record<string, string> = {
  rewrite: 'Rewrite this section to be more compelling while keeping the same facts and tone.',
  strengthen: 'Strengthen this — make it more impactful, specific, and authoritative.',
  shorten: 'Shorten this while preserving all key information.',
};

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
  const selected = String(body.selected_text || '').slice(0, 6000);
  const surrounding = String(body.surrounding_context || '').slice(0, 6000);
  const action = String(body.action_type || 'rewrite');
  const submissionType = String(body.submission_type || 'content');
  const custom = String(body.custom_instruction || '').slice(0, 2000);
  if (!selected) return json({ error: 'selected_text required' }, 400);

  let instruction = INSTRUCTION[action];
  if (action === 'custom' || !instruction) instruction = custom || INSTRUCTION.rewrite;

  const messages = PROMPT_WRAPPERS.copyWrapper({
    category: submissionType,
    blockType: 'selection',
    blockLabel: 'inline edit',
    surroundingContext: `Selected text: "${selected}"\n\nSurrounding context: ${surrounding}`,
    userInstruction: `${instruction} ${EM_DASH_GUARD}`,
  });

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://www.submoacontent.com',
        'X-Title': 'SubMoa Inline Edit',
      },
      body: JSON.stringify({ model: 'google/gemini-2.5-flash', max_tokens: 1200, messages }),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      return json({ error: `OpenRouter HTTP ${res.status}`, detail: err.slice(0, 300) }, 502);
    }
    const data: any = await res.json();
    const raw = String(data?.choices?.[0]?.message?.content || '').trim();
    if (!raw) return json({ error: 'Empty model output' }, 502);
    const edited = sanitizeContent(raw.replace(/^["']|["']$/g, ''));
    return json({ edited_text: edited });
  } catch (e: any) {
    return json({ error: e?.message || 'Server error' }, 500);
  }
}
