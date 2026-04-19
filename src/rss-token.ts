// src/rss-token.ts
// Private-feed token lifecycle. Tokens live on users.rss_token (no accounts
// table in this schema — the SubMoa model is one user = one account).
// 128 bits of entropy, unguessable. Lazy-created on first need.

export function generateRssToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function getOrCreateRssToken(db: any, userId: string): Promise<string> {
  const row: any = await db.prepare(`SELECT rss_token FROM users WHERE id = ?`).bind(userId).first();
  if (row?.rss_token) return row.rss_token as string;
  const token = generateRssToken();
  await db.prepare(`UPDATE users SET rss_token = ?, rss_token_rotated_at = unixepoch() WHERE id = ?`)
    .bind(token, userId).run();
  return token;
}

export async function rotateRssToken(db: any, userId: string): Promise<string> {
  const token = generateRssToken();
  await db.prepare(`UPDATE users SET rss_token = ?, rss_token_rotated_at = unixepoch() WHERE id = ?`)
    .bind(token, userId).run();
  return token;
}

export async function lookupUserByRssToken(db: any, token: string): Promise<any | null> {
  if (!token || token.length < 16) return null;
  return await db.prepare(`SELECT id, name, email, account_id, rss_token_rotated_at FROM users WHERE rss_token = ?`)
    .bind(token).first();
}
