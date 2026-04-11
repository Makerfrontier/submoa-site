import { json, Env, hashPassword } from '../_utils'

function generateId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

export async function onRequest(context: { request: Request; env: Env }) {
  const { token, password } = await context.request.json()

  if (!token || !password) {
    return json({ error: 'Token and new password are required' }, 400)
  }

  if (password.length < 8) {
    return json({ error: 'Password must be at least 8 characters' }, 400)
  }

  const db = context.env.submoacontent_db
  const now = Math.floor(Date.now() / 1000)

  const resetStmt = db.prepare(
    'SELECT * FROM password_resets WHERE token = ? AND expires_at > ?'
  ).bind(token, now)
  const reset = await resetStmt.first()

  if (!reset) {
    return json({ error: 'Reset token is invalid or expired' }, 400)
  }

  const passwordHash = hashPassword(password)

  await db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
    .bind(passwordHash, now, reset.user_id).run()

  await db.prepare('DELETE FROM password_resets WHERE token = ?').bind(token).run()

  return json({ ok: true })
}

function hashPassword(password: string): string {
  const encoder = new TextEncoder()
  const data = encoder.encode(password + 'submoa_salt_2026')
  let hash = 0
  const str = password
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash).toString(16)
}
