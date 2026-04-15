// functions/api/prompt-builder/chat.ts
// POST /api/prompt-builder/chat — proxy to Claude Sonnet 4.6 via OpenRouter

import { json, getSessionUser } from '../_utils';

export async function onRequestPost(context: any) {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  const user = await getSessionUser(context.request, context.env);
  if (!user) return json({ error: 'Unauthorized' }, 401);

  let body: { system?: string; messages?: Array<{ role: string; content: string }> } = {};
  try {
    body = await context.request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const { system, messages } = body;
  if (!messages?.length) return json({ error: 'messages required' }, 400);

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${context.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': context.env.APP_URL ?? 'https://www.submoacontent.com',
      'X-Title': 'SubMoa Prompt Builder',
    },
    body: JSON.stringify({
      model: 'anthropic/claude-sonnet-4-6',
      max_tokens: 2000,
      system,
      messages: messages.map((m: any) => ({ role: m.role, content: m.content })),
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('OpenRouter prompt-builder error:', res.status, err);
    return json({ error: 'LLM call failed' }, 502);
  }

  const data: any = await res.json();
  const content = data.choices?.[0]?.message?.content ?? null;
  return json({ content });
}
