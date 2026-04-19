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
  OPENAI_API_KEY?: string;
  OPENROUTER_DEFAULT_MODEL: string;
  OPENROUTER_VISION_MODEL: string;
  DATAFORSEO_LOGIN: string;
  DATAFORSEO_PASSWORD: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  YOUTUBE_API_KEY: string;
  GENERATION_QUEUE: Queue;
  AI: Ai;
  BROWSER?: Fetcher;
  FALAI_API_KEY?: string;
  CRON_SECRET?: string;
  STAGING_BYPASS_TOKEN?: string;
  CLAUDE_CODE_API_KEY?: string;
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
  account_id?: string;
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

export async function getRealSessionUser(request: Request, env: Env): Promise<User | null> {
  if (env.STAGING_BYPASS_TOKEN) {
    return {
      id: 'staging-admin', email: 'staging@submoacontent.com', name: 'Staging Admin',
      password_hash: '', role: 'admin', created_at: 0, updated_at: 0, account_id: 'staging',
    };
  }
  const token = getAuthToken(request);
  if (!token) return null;
  const sessions = await env.submoacontent_db
    .prepare('SELECT s.*, u.id as uid, u.email, u.name, u.password_hash, u.role, u.created_at, u.updated_at, u.account_id FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.id = ? AND s.expires_at > ?')
    .bind(token, Date.now()).all();
  if (!sessions.results || sessions.results.length === 0) return null;
  const row = sessions.results[0] as any;
  return {
    id: row.uid, email: row.email, name: row.name, password_hash: row.password_hash,
    role: row.role || 'user', created_at: row.created_at, updated_at: row.updated_at, account_id: row.account_id,
    super_admin: Number(row.super_admin) === 1,
    intel_access: Number(row.intel_access) === 1,
  } as any;
}

function getImpersonateTarget(request: Request): string | null {
  const cookie = request.headers.get('Cookie') || '';
  const m = cookie.match(/submoa_impersonate=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export async function getSessionUser(request: Request, env: Env): Promise<User | null> {
  // Staging bypass — if STAGING_BYPASS_TOKEN is set in env (preview only), treat all requests as admin
  if (env.STAGING_BYPASS_TOKEN) {
    return {
      id: 'staging-admin',
      email: 'staging@submoacontent.com',
      name: 'Staging Admin',
      password_hash: '',
      role: 'admin',
      created_at: 0,
      updated_at: 0,
      account_id: 'staging',
    };
  }

  const token = getAuthToken(request);
  if (!token) return null;

  const sessions = await env.submoacontent_db
    .prepare('SELECT s.*, u.id as uid, u.email, u.name, u.password_hash, u.role, u.created_at, u.updated_at, u.account_id, u.super_admin, u.intel_access FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.id = ? AND s.expires_at > ?')
    .bind(token, Date.now())
    .all();

  if (!sessions.results || sessions.results.length === 0) return null;

  const row = sessions.results[0] as any;
  const realUser: User = {
    id: row.uid,
    email: row.email,
    name: row.name,
    password_hash: row.password_hash,
    role: row.role || 'user',
    created_at: row.created_at,
    updated_at: row.updated_at,
    account_id: row.account_id,
    // @ts-ignore — runtime additions read by the client nav
    super_admin: Number(row.super_admin) === 1,
    intel_access: Number(row.intel_access) === 1,
  };

  // Admin impersonation — if the real session user is admin/super_admin AND an
  // impersonation cookie is set, return the target user with tracking fields so
  // the UI keeps admin chrome visible and can stop impersonating.
  const targetId = getImpersonateTarget(request);
  if (targetId && (realUser.role === 'admin' || realUser.role === 'super_admin')) {
    const target: any = await env.submoacontent_db
      .prepare('SELECT id, email, name, password_hash, role, created_at, updated_at, account_id FROM users WHERE id = ?')
      .bind(targetId)
      .first();
    if (target) {
      return {
        ...target,
        role: target.role || 'user',
        // @ts-ignore — runtime fields consumed by client + admin checks
        impersonating: true,
        impersonating_from: { id: realUser.id, name: realUser.name, email: realUser.email, role: realUser.role },
      } as any;
    }
  }

  return realUser;
}

export function isAdmin(user: User | null): boolean {
  return user?.role === 'admin' || user?.role === 'super_admin';
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

// Super admin check — true for super_admin role OR super_admin=1 column OR impersonating session
export function isSuperAdmin(user: User | null): boolean {
  if (!user) return false;
  // @ts-ignore — runtime fields
  return user.role === 'super_admin' || user.super_admin === true || (user as any).super_admin === 1;
}

// Writeback auth — accepts either the super-admin session cookie OR an
// Authorization: Bearer <CLAUDE_CODE_API_KEY> header. Used by endpoints that
// Claude Code itself POSTs back to when running packaged tasks.
export async function requireWritebackAuth(request: Request, env: Env): Promise<{ ok: true; via: 'session' | 'bearer'; user: User | null } | { ok: false; response: Response }> {
  const auth = request.headers.get('Authorization') || '';
  if (auth.startsWith('Bearer ') && env.CLAUDE_CODE_API_KEY) {
    const token = auth.slice(7).trim();
    if (token && token === env.CLAUDE_CODE_API_KEY) {
      return { ok: true, via: 'bearer', user: null };
    }
  }
  const user = await getSessionUser(request, env);
  if (user && (isSuperAdmin(user) || isAdmin(user))) {
    return { ok: true, via: 'session', user };
  }
  return { ok: false, response: json({ error: 'Unauthorized' }, 401) };
}

// Super-admin-only check — cookie session must be super_admin OR admin. Used by
// admin UIs that don't need writeback-bearer support.
export async function requireSuperAdmin(request: Request, env: Env): Promise<{ ok: true; user: User } | { ok: false; response: Response }> {
  const user = await getSessionUser(request, env);
  if (!user) return { ok: false, response: json({ error: 'Unauthorized' }, 401) };
  if (!isSuperAdmin(user) && !isAdmin(user)) return { ok: false, response: json({ error: 'Forbidden' }, 403) };
  return { ok: true, user };
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
