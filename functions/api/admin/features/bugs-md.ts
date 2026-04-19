import { requireAdmin } from '../brand-bible/_shared';
import { renderBugsMd } from './_render';

// GET /api/admin/features/bugs-md[?include_closed=1] — returns Bugs.md as attachment
export async function onRequest(context: any) {
  if (context.request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
  const auth = await requireAdmin(context.request, context.env);
  if (!auth.ok) return auth.response;

  const url = new URL(context.request.url);
  const includeClosed = url.searchParams.get('include_closed') === '1';
  const md = await renderBugsMd(context.env, includeClosed);
  const filename = `submoa-bugs-${includeClosed ? 'all-' : ''}${new Date().toISOString().slice(0, 10)}.md`;
  return new Response(md, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
