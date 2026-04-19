import { requireAdmin } from '../brand-bible/_shared';
import { renderStateMd } from './_render';

// GET /api/admin/features/state-md — returns State.md as text/markdown attachment
export async function onRequest(context: any) {
  if (context.request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
  const auth = await requireAdmin(context.request, context.env);
  if (!auth.ok) return auth.response;

  const md = await renderStateMd(context.env);
  const filename = `submoa-state-${new Date().toISOString().slice(0, 10)}.md`;
  return new Response(md, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
