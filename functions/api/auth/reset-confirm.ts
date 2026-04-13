import { json, Env, hashPassword } from '../_utils'

export async function onRequest(context: { request: Request; env: Env }) {
  // Only accept POST
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

  const db = context.env.submoacontent_db
  const now = Math.floor(Date.now() / 1000)

  try {
    const { token, password } = await context.request.json()

    if (!token || !password) {
      return json({ error: 'Token and new password are required' }, 400)
    }

    if (password.length < 8) {
      return json({ error: 'Password must be at least 8 characters' }, 400)
    }

    console.log('Password reset debug:', {
      tokenLength: token?.length,
      tokenPrefix: token?.substring(0, 8),
      now,
      expiresAtInQuery: now + 1800
    })

    // Check if token exists at all (regardless of expiry)
    const anyTokenStmt = db.prepare('SELECT * FROM password_resets WHERE token = ?').bind(token)
    const anyTokenRow = await anyTokenStmt.first()
    console.log('Token exists (any expiry):', !!anyTokenRow, anyTokenRow ? { expires_at: anyTokenRow.expires_at, created_at: anyTokenRow.created_at } : null)

    const resetStmt = db.prepare(
      'SELECT * FROM password_resets WHERE token = ? AND expires_at > ?'
    ).bind(token, now)
    const reset = await resetStmt.first()

    if (!reset) {
      if (anyTokenRow) {
        console.log('Token found but expired:', { tokenExpiresAt: anyTokenRow.expires_at, now, diff: anyTokenRow.expires_at - now })
        return json({ error: 'Reset token has expired', detail: { expires_at: anyTokenRow.expires_at, now, diff: anyTokenRow.expires_at - now } }, 400)
      }
      return json({ error: 'Reset token is invalid or expired', detail: { tokenReceived: token?.substring(0, 8) + '...' } }, 400)
    }

    console.log('Token valid, resetting password for user:', reset.user_id)

    const passwordHash = await hashPassword(password)

    await db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
      .bind(passwordHash, now, reset.user_id).run()

    await db.prepare('DELETE FROM password_resets WHERE token = ?').bind(token).run()

    return json({ ok: true })
  } catch (err: any) {
    console.error('Password reset error:', err)
    return json({ error: err.message || 'Unknown error' }, 500)
  }
}
