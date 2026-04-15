import { json, getSessionUser, generateId, Env } from '../_utils';

// Generate a random 8-char alphanumeric code
function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => chars[b % chars.length]).join('');
}

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

  if (context.request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  // Require authentication
  const user = await getSessionUser(context.request, context.env);
  if (!user) return json({ error: 'Not authenticated' }, 401);
  if (user.role !== 'super_admin') return json({ error: 'Forbidden — super admin required' }, 403);

  try {
    const { max_uses = 1, expires_in_days = 30 } = await context.request.json();

    const code = generateCode();
    const now = Date.now();
    const expiresAt = expires_in_days ? now + expires_in_days * 24 * 60 * 60 * 1000 : null;

    await context.env.submoacontent_db
      .prepare('INSERT INTO invites (code, created_by, max_uses, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(code, user.id, max_uses, expiresAt, now)
      .run();

    // Build the invite URL
    const origin = new URL(context.request.url).origin;
    const inviteUrl = `${origin}/register?code=${code}`;

    return json({ code, inviteUrl, expires_at: expiresAt });
  } catch (err: any) {
    return json({ error: err.message || 'Server error' }, 500);
  }
}
