import { json, getSessionUser, Env } from '../_utils';

export async function onRequest(context: { request: Request; env: Env }) {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  const user = await getSessionUser(context.request, context.env);
  if (!user) return json({ error: 'Not authenticated' }, 401);

  if (context.request.method !== 'GET') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const { id } = (context as any).params;

  const submission = await context.env.submoacontent_db
    .prepare('SELECT * FROM submissions WHERE id = ? AND user_id = ?')
    .bind(id, user.id)
    .first();

  if (!submission) {
    return json({ error: 'Submission not found' }, 404);
  }

  return json({ submission });
}
