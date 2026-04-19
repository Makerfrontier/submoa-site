import { json, getSessionUser } from '../../_utils';

// GET /api/quick-podcast/:id/sources — citation list for the View Sources panel
export async function onRequest(context: any) {
  if (context.request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  const user = await getSessionUser(context.request, context.env);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const accountId = user.account_id || 'makerfrontier';
  const id = context.params.id;

  const ep: any = await context.env.submoacontent_db
    .prepare(`SELECT research_sources, research_query FROM podcast_episodes WHERE id = ? AND account_id = ? AND source = 'quick'`)
    .bind(id, accountId).first();
  if (!ep) return json({ error: 'Not found' }, 404);
  let sources: any[] = [];
  try { sources = JSON.parse(ep.research_sources || '[]'); } catch {}
  return json({ sources, query: ep.research_query });
}
