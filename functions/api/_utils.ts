/**
 * Shared auth utilities for SubMoa Content API
 * Used by all API routes
 */

export interface Env {
  submoacontent_db: D1Database;
  DISCORD_WEBHOOK_URL: string;
  RESEND_API_KEY: string;
  hashPassword(password: string): string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  role: string;
  created_at: number;
  updated_at: number;
}

export interface Submission {
  id: string;
  user_id: string;
  topic: string;
  author: string;
  article_format: string;
  vocal_tone: string | null;
  min_word_count: string;
  product_link: string | null;
  target_keywords: string | null;
  seo_research: number;
  human_observation: string;
  anecdotal_stories: string | null;
  email: string;
  status: string;
  created_at: number;
  updated_at: number;
  content_path: string | null;
  article_content: string | null;
  revision_notes: string | null;
  is_hidden: number;
  is_deleted: number;
}

export function generateId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function hashPassword(password: string): string {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + 'submoa_salt_2026');
  let hash = 0;
  const str = password;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(16, '0') + 'submoa_v1';
}

export function verifyPassword(password: string, hash: string): boolean {
  return hashPassword(password) === hash;
}

export function getAuthToken(request: Request): string | null {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/submoa_session=([^;]+)/);
  return match ? match[1] : null;
}

export async function getSessionUser(request: Request, env: Env): Promise<User | null> {
  const token = getAuthToken(request);
  if (!token) return null;

  const sessions = await env.submoacontent_db
    .prepare('SELECT s.*, u.id as uid, u.email, u.name, u.password_hash, u.role, u.created_at, u.updated_at FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.id = ? AND s.expires_at > ?')
    .bind(token, Date.now())
    .all();

  if (!sessions.results || sessions.results.length === 0) return null;

  const row = sessions.results[0] as any;
  return {
    id: row.uid,
    email: row.email,
    name: row.name,
    password_hash: row.password_hash,
    role: row.role || 'user',
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

export function setSessionCookie(token: string, expiresAt: number) {
  return `submoa_session=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${new Date(expiresAt).toUTCString()}`;
}

export function deleteSessionCookie() {
  return 'submoa_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';
}

export function requireAuth(request: Request, env: Env): Promise<User | null> {
  return getSessionUser(request, env);
}
