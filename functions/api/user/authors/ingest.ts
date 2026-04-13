// Thin wrapper — forces scope = 'user', pulls account_id from session
import { json, getSessionUser } from '../../_utils';
import type { Env } from '../../_utils';

export async function onRequest(context: { request: Request; env: Env }) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  // Require user session
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);

  try {
    const body = await request.json();
    body.scope = 'user';
    body.account_id = user.account_id || 'makerfrontier';

    // Forward to admin ingest handler by reconstructing request with modified body
    const newRequest = new Request(request.url, {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify(body),
    });

    // Import and call the admin ingest handler
    const { onRequest: adminIngest } = await import('../../admin/authors/ingest');
    return adminIngest({ request: newRequest, env });
  } catch (err: any) {
    console.error('User ingest error:', err);
    return json({ error: err.message || 'Server error' }, 500);
  }
}
