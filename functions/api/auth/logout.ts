import { json, deleteSessionCookie, getAuthToken, Env } from '../_utils';

export async function onRequest(context: { request: Request; env: Env }) {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  const token = getAuthToken(context.request);

  if (token) {
    await context.env.submoacontent_db
      .prepare('DELETE FROM sessions WHERE id = ?')
      .bind(token)
      .run();
  }

  const headers = new Headers();
  headers.set('Content-Type', 'application/json');
  headers.set('Set-Cookie', deleteSessionCookie());
  headers.set('Access-Control-Allow-Origin', '*');

  return new Response(JSON.stringify({ ok: true }), { headers });
}
