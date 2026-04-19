import { json, getSessionUser } from '../_utils';
import { rotateRssToken } from '../../../src/rss-token';

// POST /api/quick-podcast/rotate-feed
// Generates a fresh token and invalidates the old one immediately. Used when
// the feed URL leaked and the user wants to lock out current subscribers.
export async function onRequest(context: any) {
  if (context.request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const user = await getSessionUser(context.request, context.env);
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const token = await rotateRssToken(context.env.submoacontent_db, user.id);
  const base = new URL(context.request.url).origin;
  return json({
    feed_url: `${base}/api/quick-podcast/feed/${token}.xml`,
    rotated_at: Math.floor(Date.now() / 1000),
    message: 'Old URL is now invalid. Re-add the new URL to Apple Podcasts.',
  });
}
