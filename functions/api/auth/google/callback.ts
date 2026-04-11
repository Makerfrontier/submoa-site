import { json, setSessionCookie, generateId, Env } from '../../_utils';

interface GoogleTokenResponse {
  access_token: string;
  id_token: string;
  expires_in: number;
  token_type: string;
}

interface GoogleUserInfo {
  id: string;
  email: string;
  name: string;
  picture?: string;
}

function getCookie(request: Request, name: string): string | null {
  const match = (request.headers.get('Cookie') || '').match(new RegExp(`${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

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

  const url = new URL(context.request.url);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) {
    return json({ error: `Google OAuth error: ${error}` }, 400);
  }

  if (!code) {
    return json({ error: 'Missing authorization code' }, 400);
  }

  try {
    const clientId = context.env.GOOGLE_CLIENT_ID;
    const clientSecret = context.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = `${url.origin}/api/auth/google/callback`;

    // Restore invite_code from cookie
    const rawState = getCookie(context.request, 'submoa_oauth_state');
    let inviteCode: string | null = null;
    if (rawState && rawState.startsWith('invite:')) {
      inviteCode = rawState.replace('invite:', '');
    }

    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      return json({ error: 'Token exchange failed' }, 502);
    }

    const tokens: GoogleTokenResponse = await tokenRes.json();

    // Get user info
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userRes.ok) {
      return json({ error: 'Failed to fetch Google user info' }, 502);
    }

    const googleUser: GoogleUserInfo = await userRes.json();

    // Check if user already exists
    const existing = await context.env.submoacontent_db
      .prepare('SELECT * FROM users WHERE email = ?')
      .bind(googleUser.email.toLowerCase())
      .first() as any;

    let userId: string;
    const now = Date.now();

    if (existing) {
      userId = existing.id;
      if (existing.name !== googleUser.name) {
        await context.env.submoacontent_db
          .prepare('UPDATE users SET name = ?, updated_at = ? WHERE id = ?')
          .bind(googleUser.name, now, existing.id)
          .run();
      }
    } else {
      // New Google user — require invite or allow open registration?
      // If invite code was preserved, validate it and create the account
      if (inviteCode) {
        const invite = await context.env.submoacontent_db
          .prepare('SELECT * FROM invites WHERE code = ?')
          .bind(inviteCode.toUpperCase())
          .first() as any;

        if (!invite) {
          return json({ error: 'Invalid invite code associated with this sign-in link.' }, 403);
        }
        if (invite.expires_at && invite.expires_at < now) {
          return json({ error: 'This invite has expired.' }, 403);
        }

        userId = generateId();
        await context.env.submoacontent_db
          .prepare('INSERT INTO users (id, email, name, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
          .bind(userId, googleUser.email.toLowerCase(), googleUser.name || '', 'google_oauth', now, now)
          .run();

        // Mark invite used
        await context.env.submoacontent_db
          .prepare('UPDATE invites SET used_by = ?, used_at = ? WHERE code = ?')
          .bind(googleUser.email.toLowerCase(), now, inviteCode.toUpperCase())
          .run();
      } else {
        // No invite — require one (redirect to request access page)
        const headers = new Headers();
        headers.set('Location', '/#/request');
        return new Response(null, { status: 302, headers });
      }
    }

    // Create session
    const sessionId = generateId();
    const expiresAt = now + 30 * 24 * 60 * 60 * 1000;

    await context.env.submoacontent_db
      .prepare('INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
      .bind(sessionId, userId, expiresAt, now)
      .run();

    const headers = new Headers();
    headers.set('Set-Cookie', `submoa_session=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Expires=${new Date(expiresAt).toUTCString()}`);
    headers.set('Location', '/#/dashboard');

    return new Response(null, { status: 302, headers });

  } catch (err: any) {
    return json({ error: err.message || 'Server error' }, 500);
  }
}