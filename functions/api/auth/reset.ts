import { json, Env } from '../_utils'

function generateId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

export async function onRequest(context: { request: Request; env: Env }) {
  const { email } = await context.request.json()

  if (!email) {
    return json({ error: 'Email is required' }, 400)
  }

  const db = context.env.submoacontent_db

  // Look up user
  const userStmt = db.prepare('SELECT * FROM users WHERE email = ?').bind(email.toLowerCase())
  const user = await userStmt.first()

  if (!user) {
    // Silent success to prevent email enumeration
    return json({ ok: true })
  }

  // Delete any existing reset tokens for this user
  await db.prepare('DELETE FROM password_resets WHERE user_id = ?').bind(user.id).run()

  // Generate reset token
  const token = generateId()
  const now = Math.floor(Date.now() / 1000)
  const expiresAt = now + 1800 // 30 minutes

  await db.prepare(
    'INSERT INTO password_resets (id, user_id, token, expires_at, created_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(generateId(), user.id, token, expiresAt, now).run()

  const resetUrl = `${new URL(context.request.url).origin}/reset?token=${token}`

  const resendApiKey = context.env.RESEND_API_KEY
  if (!resendApiKey) {
    return json({ error: 'Email service not configured' }, 503)
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'SubMoa Content <onboarding@resend.dev>',
      to: email,
      subject: 'Reset your SubMoa Content password',
      html: `
        <p>Hi ${user.name || 'there'},</p>
        <p>Click the link below to reset your password. It expires in 30 minutes:</p>
        <p><a href="${resetUrl}">${resetUrl}</a></p>
        <p>If you didn't request this, ignore this email.</p>
      `,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    return json({ error: 'Failed to send email', detail: body }, 500)
  }

  return json({ ok: true })
}
