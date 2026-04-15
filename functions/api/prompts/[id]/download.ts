// functions/api/prompts/[id]/download.ts
// GET /api/prompts/:id/download?format=txt|md

import { getSessionUser } from '../../_utils';

export async function onRequestGet(context: any) {
  const user = await getSessionUser(context.request, context.env);
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { id } = context.params;
  const prompt = await context.env.submoacontent_db.prepare(
    `SELECT * FROM prompts WHERE id = ? AND account_id = ?`
  ).bind(id, user.account_id).first<{
    id: string;
    desired_outcome: string;
    llm: string;
    prompt_content: string;
    created_at: number;
  }>();

  if (!prompt) return new Response('Not found', { status: 404 });

  const url = new URL(context.request.url);
  const format = url.searchParams.get('format') ?? 'txt';
  const date = new Date(prompt.created_at).toISOString().split('T')[0];
  const filename = `prompt-${prompt.id.slice(0, 8)}-${date}.${format}`;

  let content = prompt.prompt_content;

  if (format === 'md') {
    content = [
      `# Prompt — ${prompt.desired_outcome ?? 'Untitled'}`,
      ``,
      `**LLM:** ${prompt.llm ?? 'Not specified'}`,
      `**Created:** ${date}`,
      ``,
      `---`,
      ``,
      prompt.prompt_content,
    ].join('\n');
  }

  return new Response(content, {
    headers: {
      'Content-Type': format === 'md' ? 'text/markdown' : 'text/plain',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
