// functions/api/prompts.ts
// POST /api/prompts — save a completed prompt to DB
// GET  /api/prompts — list saved prompts for current user

import { json, getSessionUser } from '../_utils';

export async function onRequestPost(context: any) {
  const user = await getSessionUser(context.request, context.env);
  if (!user) return json({ error: 'Unauthorized' }, 401);

  let body: { desired_outcome?: string; llm?: string; prompt_content?: string; conversation?: any } = {};
  try {
    body = await context.request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const { desired_outcome, llm, prompt_content, conversation } = body;
  if (!prompt_content?.trim()) return json({ error: 'prompt_content required' }, 400);

  const id = crypto.randomUUID();
  const now = Date.now();

  await context.env.submoacontent_db.prepare(
    `INSERT INTO prompts (id, account_id, desired_outcome, llm, prompt_content, conversation, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id,
    user.account_id,
    desired_outcome ?? null,
    llm ?? null,
    prompt_content,
    conversation ? JSON.stringify(conversation) : null,
    now
  ).run();

  return json({ id }, 201);
}

export async function onRequestGet(context: any) {
  const user = await getSessionUser(context.request, context.env);
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const { results } = await context.env.submoacontent_db.prepare(
    `SELECT id, desired_outcome, llm, prompt_content, created_at
     FROM prompts
     WHERE account_id = ?
     ORDER BY created_at DESC`
  ).bind(user.account_id).all();

  return json(results);
}
