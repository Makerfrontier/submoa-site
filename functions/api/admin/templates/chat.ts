// POST /api/admin/templates/chat
// Admin-only. Chat with Claude Sonnet 4.5 about a specific HTML template.
// Message body: { template_id, message, conversation_history, selected_element? }
// selected_element carries a CSS selector + computed styles if the user clicked
// an element in the template preview before sending.
import { getSessionUser, isAdmin, json } from '../../_utils';
import type { Env } from '../../_utils';

interface Message { role: 'user' | 'assistant' | 'system'; content: string }

const SYSTEM_PROMPT =
  "You are a senior frontend developer working on SubMoa Content Studio, a Cloudflare Pages app using React 19, Vite, D1, R2, and Cloudflare Workers. The design system uses warm cream tokens — --bg:#EDE8DF, --card:#FAF7F2, --green:#3D5A3E, --amber:#B8872E, --leather-dark:#3A2410, --text:#221A10, --border:#CDC5B4. Fonts: Playfair Display (display), DM Sans (UI), Crimson Pro (read), JetBrains Mono (mono). Give precise, actionable changes scoped to the HTML template under discussion. When the user supplies a selected_element block, reference that element explicitly and suggest concrete CSS / HTML adjustments. Return short, directive answers — prefer bullet lists and code fences. Never invent files or endpoints; stay within the HTML template's scope.";

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
  if (!isAdmin(user)) return json({ error: 'Forbidden' }, 403);

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const template_id = String(body.template_id || '').slice(0, 120);
  const message = String(body.message || '').trim().slice(0, 6000);
  const history: Message[] = Array.isArray(body.conversation_history)
    ? body.conversation_history
        .filter((m: any) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .map((m: any) => ({ role: m.role, content: String(m.content).slice(0, 8000) }))
        .slice(-20)
    : [];
  const sel = body.selected_element && typeof body.selected_element === 'object' ? body.selected_element : null;

  if (!message) return json({ error: 'message is required' }, 400);

  // Append selected element context to the user message if provided.
  let finalUser = message;
  if (sel) {
    const selector = String(sel.selector || '').slice(0, 300);
    const tagName = String(sel.tagName || '').slice(0, 40);
    const computedStyles = sel.computedStyles && typeof sel.computedStyles === 'object'
      ? JSON.stringify(sel.computedStyles).slice(0, 2400)
      : '{}';
    finalUser += `\n\n<selected_element>\n  selector: ${selector}\n  tagName: ${tagName}\n  computedStyles: ${computedStyles}\n</selected_element>`;
  }

  // Template identity hint so the model knows which template is in scope.
  const templateHint = template_id ? `\n\nThe conversation is scoped to template id: ${template_id}.` : '';

  const messages = [
    { role: 'system' as const, content: SYSTEM_PROMPT + templateHint },
    ...history,
    { role: 'user' as const, content: finalUser },
  ];

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://www.submoacontent.com',
        'X-Title': 'SubMoa Templates Chat',
      },
      body: JSON.stringify({
        model: 'anthropic/claude-sonnet-4-5',
        max_tokens: 2400,
        messages,
      }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      return json({ error: `OpenRouter HTTP ${res.status}`, detail: errBody.slice(0, 400) }, 502);
    }
    const data: any = await res.json();
    const content = (data?.choices?.[0]?.message?.content ?? '').trim();
    if (!content) return json({ error: 'Empty model output' }, 502);
    return json({ content });
  } catch (err: any) {
    return json({ error: err?.message || 'Server error' }, 500);
  }
}
