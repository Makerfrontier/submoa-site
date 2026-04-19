// Shared access-control helpers used by server endpoints and (via the /api/auth/me
// response) the client. Keep this file thin — no DB writes, no business logic.
//
// The rules are:
//   1. A user with users.super_admin = 1 bypasses every check.
//   2. Everyone else is subject to page_access rows. A row exists per
//      (user_id, page_key, action_key). `granted = 1 AND revoked_at IS NULL`
//      is the only allowed shape.
//   3. PAGE_KEYS is the canonical inventory of what can be granted. Endpoints
//      must validate inputs against it — no freeform page/action keys.

export type PageKey =
  | 'admin'
  | 'admin-authors'
  | 'admin-llm-config'
  | 'admin-templates'
  | 'admin-submissions'
  | 'admin-users'
  | 'admin-skill-versions'
  | 'legislative-intelligence';

export const PAGE_KEYS: Record<PageKey, string[]> = {
  'admin':                    ['view'],
  'admin-authors':            ['view', 'create', 'edit', 'deactivate', 'delete'],
  'admin-llm-config':         ['view', 'edit'],
  'admin-templates':          ['view', 'create', 'edit', 'delete', 'chat'],
  'admin-submissions':        ['view', 'delete', 'requeue'],
  // admin-users is super-admin-only; it never appears in page_access rows.
  'admin-users':              ['view', 'edit', 'grant-access', 'revoke-access'],
  'admin-skill-versions':     ['view', 'edit'],
  'legislative-intelligence': ['view', 'pull-brief', 'analyze-bill', 'run-fec', 'export-brief', 'narrative-craft', 'manage-rep-profiles'],
};

export function isValidPageAction(pageKey: string, actionKey: string): boolean {
  const actions = (PAGE_KEYS as any)[pageKey];
  return Array.isArray(actions) && actions.includes(actionKey);
}

// Read a user row's super_admin flag. User objects coming out of getSessionUser
// don't yet carry it, so we query once — cache key is the user id.
const superAdminCache = new Map<string, { value: boolean; at: number }>();
const SUPER_ADMIN_CACHE_TTL_MS = 30_000;

export async function isSuperAdmin(env: any, userId: string): Promise<boolean> {
  if (!userId) return false;
  const cached = superAdminCache.get(userId);
  if (cached && Date.now() - cached.at < SUPER_ADMIN_CACHE_TTL_MS) return cached.value;
  try {
    const row: any = await env.submoacontent_db
      .prepare('SELECT super_admin FROM users WHERE id = ?')
      .bind(userId).first();
    const value = !!(row && Number(row.super_admin) === 1);
    superAdminCache.set(userId, { value, at: Date.now() });
    return value;
  } catch {
    return false;
  }
}

export async function checkPageAccess(
  env: any,
  userId: string,
  pageKey: string,
  actionKey: string = 'view',
): Promise<boolean> {
  if (!userId) return false;
  if (await isSuperAdmin(env, userId)) return true;
  // admin-users is super-admin-only and never resolves through page_access.
  if (pageKey === 'admin-users') return false;
  try {
    const row: any = await env.submoacontent_db
      .prepare(
        'SELECT 1 AS ok FROM page_access WHERE user_id = ? AND page_key = ? AND action_key = ? AND granted = 1 AND revoked_at IS NULL LIMIT 1'
      )
      .bind(userId, pageKey, actionKey)
      .first();
    return !!row;
  } catch {
    return false;
  }
}

export class AccessError extends Error {
  status: number;
  constructor(message: string, status = 403) {
    super(message);
    this.status = status;
  }
}

export async function requireSuperAdmin(user: any, env: any): Promise<void> {
  if (!user) throw new AccessError('Not authenticated', 401);
  const ok = await isSuperAdmin(env, user.id);
  if (!ok) throw new AccessError('Forbidden — super_admin only', 403);
}

export async function requirePageAccess(
  user: any,
  env: any,
  pageKey: string,
  actionKey: string = 'view',
): Promise<void> {
  if (!user) throw new AccessError('Not authenticated', 401);
  const ok = await checkPageAccess(env, user.id, pageKey, actionKey);
  if (!ok) throw new AccessError(`Forbidden — missing ${pageKey}:${actionKey}`, 403);
}

// ─── Audit logging helper ───────────────────────────────────────────────────
// Every legislative-intelligence action and every access grant/revoke should
// write an audit row. Failures are swallowed — auditing must never break the
// user-facing flow.

export interface AuditArgs {
  action: string;
  legislation_id?: string | null;
  brief_id?: string | null;
  rep_profile_id?: string | null;
  details?: any;
}

export async function writeAudit(
  env: any,
  request: Request,
  userId: string,
  args: AuditArgs,
): Promise<void> {
  try {
    const id = crypto.randomUUID();
    const ip =
      request.headers.get('CF-Connecting-IP') ||
      request.headers.get('X-Forwarded-For') ||
      null;
    await env.submoacontent_db
      .prepare(
        `INSERT INTO legislative_audit_log
          (id, user_id, action, legislation_id, brief_id, rep_profile_id, details, ip_address, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, unixepoch())`
      )
      .bind(
        id,
        userId,
        args.action,
        args.legislation_id || null,
        args.brief_id || null,
        args.rep_profile_id || null,
        args.details ? JSON.stringify(args.details) : null,
        ip,
      )
      .run();
  } catch (e) {
    console.error('[audit] write failed:', e);
  }
}
