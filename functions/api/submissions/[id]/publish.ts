// functions/api/submissions/[id]/publish.ts
// PATCH /api/submissions/:id/publish — mark article as published, save live URL

import { json, getSessionUser, isAdmin } from '../../_utils';
import { emailArticlePublished } from '../../discord-notifications';

export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'PATCH, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (context.request.method !== 'PATCH') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const user = await getSessionUser(context.request, context.env);
  if (!user) return json({ error: 'Not authenticated' }, 401);

  const { id } = context.params;
  if (!id) return json({ error: 'Missing submission id' }, 400);

  try {
    const sub = await context.env.submoacontent_db
      .prepare('SELECT * FROM submissions WHERE id = ?')
      .bind(id)
      .first();

    if (!sub) return json({ error: 'Not found' }, 404);
    if (sub.user_id !== user.id && !isAdmin(user)) return json({ error: 'Forbidden' }, 403);

    let live_url: string | null = null;
    try {
      const body = await context.request.json();
      live_url = body.live_url || null;
    } catch { /* no body or empty body is fine */ }

    await context.env.submoacontent_db
      .prepare('UPDATE submissions SET status = ?, live_url = ?, updated_at = ? WHERE id = ?')
      .bind('published', live_url, Date.now(), id)
      .run();

    if (sub.email) {
      emailArticlePublished(context.env, sub.email, { id: sub.id, title: sub.topic })
        .catch(e => console.error('emailArticlePublished failed:', e));
    }

    return json({ success: true });

  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
