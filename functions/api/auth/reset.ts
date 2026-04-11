import { json, Env } from '../_utils'
import { passwordResetEmail, sendEmail } from '../_email-templates'

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

  const userStmt = db.prepare('SELECT * FROM users WHERE email = ?').bind(email.toLowerCase())
  const user = await userStmt.first()

  if (!user) {
    return json({ ok: true })
  }

  await db.prepare('DELETE FROM password_resets WHERE user_id = ?').bind(user.id).run()

  const token = generateId()
  const now = Math.floor(Date.now() / 1000)
  const expiresAt = now + 1800

  await db.prepare(
    'INSERT INTO password_resets (id, user_id, token, expires_at, created_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(generateId(), user.id, token, expiresAt, now).run()

  const resetUrl = `${new URL(context.request.url).origin}/reset?token=${token}`

  try {
    const { subject, html } = passwordResetEmail({ name: user.name, resetUrl })
    await sendEmail(context.env, { to: email, subject, html })
  } catch (err) {
    return json({ error: 'Failed to send email', detail: err.message }, 500)
  }

  return json({ ok: true })
}
