import { json, Env, generateResetToken } from '../_utils'
import { passwordResetEmail, sendEmail } from '../_email-templates'

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

  const db = context.env.submoacontent_db

  try {
    const { email } = await context.request.json()

    if (!email) {
      return json({ error: 'Email is required' }, 400)
    }

    const userStmt = db.prepare('SELECT * FROM users WHERE email = ?').bind(email.toLowerCase())
    const user = await userStmt.first()

    if (!user) {
      return json({ ok: true })
    }

    await db.prepare('DELETE FROM password_resets WHERE user_id = ?').bind(user.id).run()

    const token = generateResetToken()
    const now = Math.floor(Date.now() / 1000)
    const expiresAt = now + 1800 // 30 minutes

    await db.prepare(
      'INSERT INTO password_resets (id, user_id, token, expires_at, created_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(generateResetToken(), user.id, token, expiresAt, now).run()

    const resetUrl = `${new URL(context.request.url).origin}/reset?token=${encodeURIComponent(token)}`

    const { subject, html } = passwordResetEmail({ name: user.name, resetUrl })
    await sendEmail(context.env, { to: email, subject, html })

    return json({ ok: true })
  } catch (err: any) {
    console.error('Reset email error:', err)
    return json({ error: err.message || 'Failed to send reset email' }, 500)
  }
}
