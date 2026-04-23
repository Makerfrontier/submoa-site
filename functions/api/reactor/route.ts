// POST /api/reactor/route
// Auto-routes a user message to the best-fit OpenRouter model (or dispatches
// to the manually chosen model when auto_route=false), persists both the
// user and assistant messages on the conversation, and returns the reply
// plus routing metadata. Non-streamed first pass — streaming can be layered
// on once the baseline is solid.
//
// Classifier cost control: the classifier pass is cached in KV by SHA-256 of
// the first 200 chars of the user message for 24h, so repeated phrasings
// don't burn a second LLM call per request.

import { getSessionUser, json, generateId } from '../_utils';

interface Env {
  submoacontent_db: any;
  OPENROUTER_API_KEY: string;
  REACTOR_CLASSIFIER_CACHE?: KVNamespace;
}
// Pages Functions KV namespace shape.
interface KVNamespace {
  get(key: string, opts?: any): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
}

type TaskType = 'text' | 'image' | 'audio' | 'code' | 'document';

interface ClassifierOutput {
  task_type: TaskType;
  selected_model: string;
  reasoning: string;
}

const OPENROUTER_MODEL_IDS: Record<string, string> = {
  'claude-sonnet-4-7':     'anthropic/claude-sonnet-4-5',
  'claude-haiku-4-5':      'anthropic/claude-haiku-4-5',
  'claude-opus-4-6':       'anthropic/claude-opus-4',
  'gemini-2.5-pro':        'google/gemini-2.5-pro',
  'gemini-2.5-flash':      'google/gemini-2.5-flash',
  'gemini-2.5-flash-image':'google/gemini-2.5-flash-image',
  'gpt-4-1':               'openai/gpt-4.1',
  'gpt-4-turbo':           'openai/gpt-4-turbo',
  'ideogram-v2':           'ideogram/ideogram-v2',
};
const CLASSIFIER_MODEL = 'google/gemini-2.5-flash';

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function classify(env: Env, message: string): Promise<ClassifierOutput> {
  const cacheKey = `classify:${await sha256Hex(message.slice(0, 200))}`;
  if (env.REACTOR_CLASSIFIER_CACHE) {
    const cached = await env.REACTOR_CLASSIFIER_CACHE.get(cacheKey);
    if (cached) {
      try { return JSON.parse(cached) as ClassifierOutput; } catch {}
    }
  }

  const system = `Classify the user's request and pick the best model.

Output STRICT JSON only (no prose, no code fences):
{
  "task_type": "text" | "image" | "audio" | "code" | "document",
  "selected_model": "claude-sonnet-4-7" | "claude-haiku-4-5" | "gemini-2.5-flash" | "gemini-2.5-flash-image" | "gpt-4-1" | "ideogram-v2",
  "reasoning": "one short sentence"
}

Rules:
- Image generation requests → "gemini-2.5-flash-image" (or "ideogram-v2" for logos/brand marks).
- Long-form writing, structured analysis, code → "claude-sonnet-4-7".
- Quick factual questions → "claude-haiku-4-5" or "gemini-2.5-flash".
- Audio generation requests → "claude-sonnet-4-7" (scripts); the audio render happens downstream.`;

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://submoacontent.com',
      'X-Title': 'SubMoa Atomic Reactor · classifier',
    },
    body: JSON.stringify({
      model: CLASSIFIER_MODEL,
      messages: [{ role: 'system', content: system }, { role: 'user', content: message }],
      max_tokens: 200,
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) {
    // Fallback — default to a safe long-form model so the user still gets an answer.
    return { task_type: 'text', selected_model: 'claude-sonnet-4-7', reasoning: 'classifier unavailable' };
  }
  const data: any = await res.json();
  let parsed: ClassifierOutput;
  try {
    parsed = JSON.parse(String(data?.choices?.[0]?.message?.content || '{}'));
  } catch {
    parsed = { task_type: 'text', selected_model: 'claude-sonnet-4-7', reasoning: 'classifier parse fallback' };
  }
  if (!parsed.selected_model || !OPENROUTER_MODEL_IDS[parsed.selected_model]) {
    parsed = { ...parsed, selected_model: 'claude-sonnet-4-7', task_type: parsed.task_type || 'text' };
  }

  if (env.REACTOR_CLASSIFIER_CACHE) {
    // 24h TTL per spec.
    await env.REACTOR_CLASSIFIER_CACHE.put(cacheKey, JSON.stringify(parsed), { expirationTtl: 86400 }).catch(() => {});
  }
  return parsed;
}

async function dispatch(
  env: Env,
  model: string,
  history: Array<{ role: string; content: string }>,
  taskType: TaskType,
): Promise<{ content: string; artifact_url: string | null }> {
  const openrouterId = OPENROUTER_MODEL_IDS[model] || OPENROUTER_MODEL_IDS['claude-sonnet-4-7'];

  // Image models return image URLs via the multimodal response.
  const isImage = taskType === 'image' || openrouterId.includes('flash-image') || openrouterId.includes('ideogram');

  const body: any = {
    model: openrouterId,
    messages: history,
    max_tokens: isImage ? 1500 : 3000,
  };
  if (isImage) {
    body.modalities = ['image', 'text'];
    body.image_config = { aspect_ratio: '1:1' };
  }

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://submoacontent.com',
      'X-Title': 'SubMoa Atomic Reactor',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`OpenRouter ${res.status}: ${err.slice(0, 200)}`);
  }
  const data: any = await res.json();
  const msg = data?.choices?.[0]?.message || {};
  const textPart = String(msg.content || '').trim();
  let artifactUrl: string | null = null;
  const imgUrl =
    msg.images?.[0]?.image_url?.url ??
    (Array.isArray(msg.content)
      ? msg.content.find((c: any) => c?.type === 'image_url')?.image_url?.url
      : null) ?? null;
  if (imgUrl) artifactUrl = imgUrl;
  return { content: textPart || (imgUrl ? '(generated image)' : ''), artifact_url: artifactUrl };
}

export async function onRequest(context: { request: Request; env: Env }) {
  const { request, env } = context;
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);
  if (!env.OPENROUTER_API_KEY) return json({ error: 'OPENROUTER_API_KEY not configured' }, 500);

  const body: any = await request.json().catch(() => ({}));
  const message = String(body?.message || '').trim();
  if (!message) return json({ error: 'message required' }, 400);
  const autoRoute = body?.auto_route !== false; // default on
  const selectedModel = body?.selected_model ? String(body.selected_model) : null;
  let conversationId: string | null = body?.conversation_id ? String(body.conversation_id) : null;

  const now = Math.floor(Date.now() / 1000);

  if (!conversationId) {
    conversationId = generateId();
    await env.submoacontent_db.prepare(
      `INSERT INTO reactor_conversations (id, user_id, title, created_at, updated_at, message_count)
       VALUES (?, ?, ?, ?, ?, 0)`
    ).bind(conversationId, user.id, message.slice(0, 80), now, now).run();
  } else {
    const row = await env.submoacontent_db
      .prepare(`SELECT id FROM reactor_conversations WHERE id = ? AND user_id = ?`)
      .bind(conversationId, user.id).first();
    if (!row) return json({ error: 'Conversation not found' }, 404);
  }

  // Pull existing history so assistant replies stay contextual.
  const histRows: any = await env.submoacontent_db
    .prepare(`SELECT role, content FROM reactor_messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT 40`)
    .bind(conversationId).all();
  const history = (histRows.results || []).map((m: any) => ({ role: m.role, content: String(m.content || '') }));
  history.push({ role: 'user', content: message });

  let taskType: TaskType = 'text';
  let model = 'claude-sonnet-4-7';
  let reasoning = 'manual';
  if (autoRoute) {
    const c = await classify(env, message);
    taskType = c.task_type;
    model = c.selected_model;
    reasoning = c.reasoning;
  } else if (selectedModel && OPENROUTER_MODEL_IDS[selectedModel]) {
    model = selectedModel;
    // Infer task type from the chosen model so save-to actions line up.
    if (selectedModel.includes('image') || selectedModel === 'ideogram-v2') taskType = 'image';
  }

  await env.submoacontent_db.prepare(
    `INSERT INTO reactor_messages (id, conversation_id, role, content, created_at)
     VALUES (?, ?, 'user', ?, ?)`
  ).bind(generateId(), conversationId, message, now).run();

  let reply = '';
  let artifactUrl: string | null = null;
  try {
    const out = await dispatch(env, model, history, taskType);
    reply = out.content;
    artifactUrl = out.artifact_url;
  } catch (e: any) {
    reply = `Model call failed: ${e?.message || e}`;
  }

  const assistantId = generateId();
  await env.submoacontent_db.prepare(
    `INSERT INTO reactor_messages (id, conversation_id, role, content, model_used, task_type, artifact_url, created_at)
     VALUES (?, ?, 'assistant', ?, ?, ?, ?, ?)`
  ).bind(assistantId, conversationId, reply, model, taskType, artifactUrl, Math.floor(Date.now() / 1000)).run();

  await env.submoacontent_db.prepare(
    `UPDATE reactor_conversations SET updated_at = ?, message_count = message_count + 2 WHERE id = ?`
  ).bind(Math.floor(Date.now() / 1000), conversationId).run();

  // Analytics log — best-effort.
  try {
    await env.submoacontent_db.prepare(
      `INSERT INTO reactor_routing_logs (id, user_id, message, task_type, selected_model, routing_reason, auto_route, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(generateId(), user.id, message.slice(0, 500), taskType, model, reasoning, autoRoute ? 1 : 0, now).run();
  } catch {}

  return json({
    conversation_id: conversationId,
    message_id: assistantId,
    reply,
    task_type: taskType,
    model_used: model,
    artifact_url: artifactUrl,
    routing: { auto_route: autoRoute, reasoning },
  });
}
