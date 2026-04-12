import { json, setSessionCookie, generateId, hashPassword, Env } from '../_utils';
import { registrationEmail, sendEmail } from '../_email-templates';

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

  try {
    const { name, email, password, invite_code } = await context.request.json();

    if (!name || !email || !password) {
      return json({ error: 'Name, email, and password are required' }, 400);
    }

    if (!invite_code) {
      return json({ error: 'An invite code is required to create an account' }, 400);
    }

    if (password.length < 8) {
      return json({ error: 'Password must be at least 8 characters' }, 400);
    }

    // Validate invite code
    const invite = await context.env.submoacontent_db
      .prepare('SELECT * FROM invites WHERE code = ?')
      .bind(invite_code.toUpperCase())
      .first() as any;

    if (!invite) {
      return json({ error: 'Invalid invite code' }, 403);
    }

    if (invite.expires_at && invite.expires_at < Date.now()) {
      return json({ error: 'This invite link has expired' }, 403);
    }

    if (invite.max_uses <= 1 && invite.used_by) {
      return json({ error: 'This invite code has already been used' }, 403);
    }

    // Check if user exists
    const existing = await context.env.submoacontent_db
      .prepare('SELECT id FROM users WHERE email = ?')
      .bind(email.toLowerCase())
      .first();

    if (existing) {
      return json({ error: 'An account with this email already exists' }, 409);
    }

    const userId = generateId();
    const passwordHash = hashPassword(password);
    const now = Date.now();

    await context.env.submoacontent_db
      .prepare('INSERT INTO users (id, email, name, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(userId, email.toLowerCase(), name, passwordHash, now, now)
      .run();

    // Mark invite as used
    await context.env.submoacontent_db
      .prepare('UPDATE invites SET used_by = ?, used_at = ? WHERE code = ?')
      .bind(email.toLowerCase(), now, invite_code.toUpperCase())
      .run();

    // Create session
    const sessionId = generateId();
    const expiresAt = now + 30 * 24 * 60 * 60 * 1000;

    await context.env.submoacontent_db
      .prepare('INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
      .bind(sessionId, userId, expiresAt, now)
      .run();

    const headers = new Headers();
    headers.set('Content-Type', 'application/json');
    headers.set('Set-Cookie', setSessionCookie(sessionId, expiresAt));
    headers.set('Access-Control-Allow-Origin', '*');

    try {
      const { subject, html } = registrationEmail({ name, email: email.toLowerCase(), loginUrl: `${new URL(context.request.url).origin}/login` })
      await sendEmail(context.env, { to: email.toLowerCase(), subject, html })
    } catch (emailErr) {
      console.error('Failed to send registration email:', emailErr.message)
    }

    return new Response(JSON.stringify({ ok: true, user: { id: userId, email: email.toLowerCase(), name, role: 'user' } }), {
      status: 201,
      headers,
    });
  } catch (err: any) {
    return json({ error: err.message || 'Server error' }, 500);
  }
}
