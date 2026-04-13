/**
 * Shared auth utilities for SubMoa Content API
 * Used by all API routes
 */

export interface Env {
  submoacontent_db: D1Database;
  SUBMOA_IMAGES: R2Bucket;
  DISCORD_WEBHOOK_URL: string;
  DISCORD_BOT_TOKEN: string;
  RESEND_API_KEY: string;
  OPENROUTER_API_KEY: string;
  OPENROUTER_DEFAULT_MODEL: string;
  OPENROUTER_VISION_MODEL: string;
  DATAFORSEO_LOGIN: string;
  DATAFORSEO_PASSWORD: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  YOUTUBE_API_KEY: string;
  GENERATION_QUEUE: Queue;
  AI: Ai;
  hashPassword(password: string): Promise<string>;
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

export function generateResetToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const passwordData = encoder.encode(password);
  const baseKey = await crypto.subtle.importKey('raw', passwordData, 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt, iterations: 100000, hash: 'SHA-256' },
    baseKey, 256
  );
  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
  const hashHex = Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
  return saltHex + ':' + hashHex + ':pbkdf2_v1';
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (stored.endsWith(':pbkdf2_v1')) {
    const [saltHex, hashHex] = stored.split(':');
    const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map(b => parseInt(b, 16)));
    const encoder = new TextEncoder();
    const passwordData = encoder.encode(password);
    const baseKey = await crypto.subtle.importKey('raw', passwordData, 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
      baseKey, 256
    );
    const computedHash = Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
    return computedHash === hashHex;
  }
  // Legacy — fall back to old hash for existing passwords
  const encoder = new TextEncoder();
  const data = encoder.encode(password + 'submoa_salt_2026');
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    hash = ((hash << 5) - hash) + password.charCodeAt(i);
    hash = hash & hash;
  }
  const legacy = Math.abs(hash).toString(16).padStart(16, '0') + 'submoa_v1';
  return legacy === stored;
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

export function setSessionCookie(token: string, expiresAt: number): string {
  const expires = new Date(expiresAt).toUTCString();
  return `submoa_session=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${expires}; Secure`;
}

export function deleteSessionCookie() {
  return 'submoa_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';
}

export function requireAuth(request: Request, env: Env): Promise<User | null> {
  return getSessionUser(request, env);
}

export async function scrapeProductPage(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SubMoaBot/1.0)',
      },
      redirect: 'follow'
    });
    if (!response.ok) return '';
    const html = await response.text();

    // Age gate detection — return null if page is age-restricted
    const text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (text.length < 200) return '';

    const ageGatePatterns = [
      'verify your age', "you must be 18", 'age verification',
      'date of birth', 'are you of legal age', 'age gate',
      'confirm your age', 'adult verification', 'you must be of legal age',
    ];
    const lower = text.toLowerCase();
    if (ageGatePatterns.some(p => lower.includes(p))) {
      console.log('[scrapeProductPage] Age gate detected for:', url);
      return '';
    }

    return text.slice(0, 5000);
  } catch {
    return '';
  }
}
