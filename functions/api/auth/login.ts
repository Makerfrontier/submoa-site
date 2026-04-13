import { json, setSessionCookie, generateId, verifyPassword, Env } from '../_utils';

export async function onRequest(context: { request: Request; env: Env }) {
  try {
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

    const { email, password } = await context.request.json();

    if (!email || !password) {
      return json({ error: 'Email and password are required' }, 400);
    }

    const user = await context.env.submoacontent_db
      .prepare('SELECT * FROM users WHERE email = ?')
      .bind(email.toLowerCase())
      .first() as any;

    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return json({ error: 'Invalid email or password' }, 401);
    }

    const role = user.role || 'user'
    const isAdmin = role === 'admin'
    const expiresAt = Date.now() + (isAdmin ? 48 : 168) * 60 * 60 * 1000;

    const sessionId = generateId();

    await context.env.submoacontent_db
      .prepare('INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
      .bind(sessionId, user.id, expiresAt, Date.now())
      .run();

    const headers = new Headers();
    headers.set('Content-Type', 'application/json');
    headers.set('Set-Cookie', setSessionCookie(sessionId, expiresAt));
    headers.set('Access-Control-Allow-Origin', '*');

    return new Response(JSON.stringify({
      ok: true,
      user: { id: user.id, email: user.email, name: user.name, role }
    }), { headers });
  } catch (err: any) {
    console.error('Login error:', err.message, err.stack);
    return json({ error: err.message || 'Server error' }, 500);
  }
}
