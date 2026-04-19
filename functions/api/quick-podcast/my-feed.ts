import { json, getSessionUser } from '../_utils';
import { getOrCreateRssToken } from '../../../src/rss-token';

// GET /api/quick-podcast/my-feed
// Returns the authenticated user's private RSS URL, lazily minting a token.
export async function onRequest(context: any) {
  if (context.request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  const user = await getSessionUser(context.request, context.env);
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const token = await getOrCreateRssToken(context.env.submoacontent_db, user.id);
  const base = new URL(context.request.url).origin;
  const row: any = await context.env.submoacontent_db
    .prepare(`SELECT rss_token_rotated_at FROM users WHERE id = ?`).bind(user.id).first();
  return json({
    feed_url: `${base}/api/quick-podcast/feed/${token}.xml`,
    rotated_at: row?.rss_token_rotated_at || null,
  });
}
