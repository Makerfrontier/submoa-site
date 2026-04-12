import { json, generateId, Env } from './_utils';
import { invitationEmail, sendEmail } from './_email-templates';

// POST /api/request-access
// User submits name + email → system generates a single-use invite link and emails it
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
    const { name, email } = await context.request.json();

    if (!name || !email) {
      return json({ error: 'Name and email are required' }, 400);
    }

    const normalizedEmail = email.toLowerCase();
    const now = Math.floor(Date.now() / 1000);

    // Check if user already exists
    const existing = await context.env.submoacontent_db
      .prepare('SELECT id FROM users WHERE email = ?')
      .bind(normalizedEmail)
      .first();

    if (existing) {
      return json({ error: 'An account with this email already exists. Try logging in instead.' }, 409);
    }

    // Check for existing pending invite for this email
    const existingInvite = await context.env.submoacontent_db
      .prepare('SELECT id FROM invites WHERE email = ? AND status = ? AND expires_at > ?')
      .bind(normalizedEmail, 'pending', now)
      .first();

    if (existingInvite) {
      return json({ error: 'An invite has already been sent to this email. Check your inbox or try again later.' }, 429);
    }

    // Generate single-use invite token (256-bit)
    const tokenBytes = new Uint8Array(32);
    crypto.getRandomValues(tokenBytes);
    const token = Array.from(tokenBytes).map(b => b.toString(16).padStart(2, '0')).join('');

    // Invite expires in 48 hours
    const expiresAt = now + 48 * 60 * 60;

    // Store invite
    const inviteId = generateId();
    await context.env.submoacontent_db
      .prepare(`INSERT INTO invites (id, email, name, token, max_uses, used_count, expires_at, created_at)
        VALUES (?, ?, ?, ?, 1, 0, ?, ?)`)
      .bind(inviteId, normalizedEmail, name, token, expiresAt, now)
      .run();

    // Build invite URL
    const origin = new URL(context.request.url).origin;
    const inviteUrl = `${origin}/register?invite=${token}&email=${encodeURIComponent(normalizedEmail)}`;

    // Send invite email
    const { subject, html } = invitationEmail({
      name,
      inviteUrl,
      expiresIn: '48 hours',
      loginUrl: `${origin}/login`,
    });

    try {
      await sendEmail(context.env, { to: normalizedEmail, subject, html });
    } catch (emailErr) {
      console.error('Failed to send invite email:', emailErr.message);
      return json({ error: 'Failed to send invite email. Try again or contact support.' }, 500);
    }

    return json({
      ok: true,
      message: `Invite sent to ${normalizedEmail}. Check your inbox.`
    }, 201);

  } catch (err: any) {
    return json({ error: err.message || 'Server error' }, 500);
  }
}
