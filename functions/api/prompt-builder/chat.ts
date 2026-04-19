// POST /api/prompt-builder/chat  { messages, target_model, initial_intent? }
// The system prompt is server-owned. Model is google/gemini-2.5-flash via
// OpenRouter. The client gets back the raw assistant content — detection of
// the "I HAVE EVERYTHING I NEED" handoff happens in the frontend.

import { json, getSessionUser } from '../_utils';

const PROMPT_BUILDER_SYSTEM = `You are a calm, patient prompt engineering guide. Your only job is to help this person articulate what they actually want — not what they think they should ask for.

Start by asking them to describe what using the finished thing would feel like. Not what it should do technically. What would a perfect outcome look like in their life or work? What problem disappears? What becomes easier?

Then listen. Ask one follow-up question at a time. Never ask two questions in the same message. Wait for their answer before asking the next thing.

Your questions should feel like natural conversation, not an intake form. Never use bullet points. Never say "Great!" or "That's helpful!" Just respond naturally and ask the next most important thing you need to know.

You are building a complete picture slowly and patiently. The user may not know the technical details — that is fine. Your job is to translate their intent into something executable. Ask about feelings and outcomes first, technical details last.

When you have everything you need to write a complete prompt with no blanks, no placeholders, and no assumptions, write exactly this on its own line: I HAVE EVERYTHING I NEED.

Then immediately write the final prompt formatted correctly for the target model. Claude: XML tags, explicit role definition, clear output format, reasoning instructions. GPT-4o: numbered instructions, directive language. Gemini: structured sections, explicit output format. Llama: simple clear instructions. Mistral: concise directives. Every field complete. Nothing left for the user to fill in. No placeholders. No brackets.

Apply prompt wrapper guardrails — no fabricated claims, no harmful content, no impersonation.`;

export async function onRequestPost(context: any) {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  }

  const user = await getSessionUser(context.request, context.env);
  if (!user) return json({ error: 'Unauthorized' }, 401);

  let body: {
    messages?: Array<{ role: string; content: string }>;
    target_model?: string;
    initial_intent?: string;
  } = {};
  try { body = await context.request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { messages, target_model, initial_intent } = body;
  if (!messages?.length) return json({ error: 'messages required' }, 400);

  const modelLabel = String(target_model || '').trim() || 'the target AI model';
  const systemPrompt = `${PROMPT_BUILDER_SYSTEM}\n\nTARGET MODEL: ${modelLabel}.${initial_intent ? `\n\nTHE USER'S INITIAL INTENT: ${initial_intent}` : ''}`;

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${context.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': context.env.APP_URL ?? 'https://www.submoacontent.com',
      'X-Title': 'SubMoa Prompt Builder',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      max_tokens: 2000,
      system: systemPrompt,
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
