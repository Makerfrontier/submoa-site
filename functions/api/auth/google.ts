import { json, Env } from '../_utils';

// Google OAuth entry point — redirects to Google's consent screen
export async function onRequest(context: { request: Request; env: Env }) {
  const url = new URL(context.request.url);

  const clientId = context.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return json({ error: 'Google OAuth not configured. Set GOOGLE_CLIENT_ID in your environment.' }, 503);
  }

  // Preserve invite_code through the OAuth flow via a cookie
  const inviteCode = url.searchParams.get('invite_code') || '';
  const cookieName = 'submoa_oauth_state';
  const state = inviteCode ? `invite:${inviteCode}` : 'none';
  const cookieHeader = `${cookieName}=${encodeURIComponent(state)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`;

  const redirectUri = `${url.origin}/api/auth/google/callback`;
  const scope = encodeURIComponent('email profile');

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&state=${encodeURIComponent(state)}&access_type=offline&prompt=select_account`;

  const headers = new Headers();
  headers.set('Location', authUrl);
  headers.set('Set-Cookie', cookieHeader);

  return new Response(null, { status: 302, headers });
}