import { json, getSessionUser, isAdmin, isSuperAdmin, generateId } from '../../_utils';

// Hard-coded default so the server can seed v1 without any UI dependency.
// Keep in sync with src/brand-bible.tsx DEFAULT_BRAND_BIBLE.
export const DEFAULT_BRAND_BIBLE = {
  version_number: 1,
  colors: {
    bg:             { hex: '#EDE8DF', description: 'page background — warm cream' },
    card:           { hex: '#FAF7F2', description: 'card surfaces' },
    'surface-inp':  { hex: '#F0EBE2', description: 'inputs, inset surfaces' },
    green:          { hex: '#3D5A3E', description: 'primary — tile accent for articles' },
    'green-dark':   { hex: '#2B4030', description: 'H1, H2, active states' },
    amber:          { hex: '#B8872E', description: 'eyebrows, accents, primary action' },
    'leather-dark': { hex: '#3A2410', description: 'sidebar, display headlines' },
    text:           { hex: '#221A10', description: 'body text — warm near-black' },
    'text-mid':     { hex: '#6B5744', description: 'secondary text, meta' },
    'text-light':   { hex: '#A09080', description: 'tertiary, disabled' },
    border:         { hex: '#CDC5B4', description: 'default borders' },
  },
  typography: {
    display:        { family: 'Playfair Display', weight: 600, size: 56, lh: 1.05, ls: '-0.02em',  color: 'leather-dark', transform: 'none',      style: 'normal' },
    h1:             { family: 'Playfair Display', weight: 600, size: 40, lh: 1.15, ls: '-0.015em', color: 'green-dark',   transform: 'none',      style: 'normal' },
    h2:             { family: 'Playfair Display', weight: 600, size: 28, lh: 1.2,  ls: '-0.01em',  color: 'green-dark',   transform: 'none',      style: 'normal' },
    h3:             { family: 'Playfair Display', weight: 600, size: 22, lh: 1.3,  ls: 'normal',   color: 'text',         transform: 'none',      style: 'normal' },
    h4:             { family: 'DM Sans',          weight: 600, size: 18, lh: 1.35, ls: 'normal',   color: 'text',         transform: 'none',      style: 'normal' },
    h5:             { family: 'DM Sans',          weight: 600, size: 15, lh: 1.4,  ls: 'normal',   color: 'text',         transform: 'none',      style: 'normal' },
    eyebrow:        { family: 'DM Sans',          weight: 600, size: 11, lh: 1.2,  ls: '0.1em',    color: 'amber',        transform: 'uppercase', style: 'normal' },
    'body-ui':      { family: 'DM Sans',          weight: 400, size: 15, lh: 1.55, ls: 'normal',   color: 'text',         transform: 'none',      style: 'normal' },
    'body-article': { family: 'Crimson Pro',      weight: 400, size: 19, lh: 1.7,  ls: 'normal',   color: 'text',         transform: 'none',      style: 'normal' },
    lead:           { family: 'DM Sans',          weight: 400, size: 18, lh: 1.55, ls: 'normal',   color: 'text-mid',     transform: 'none',      style: 'normal' },
    small:          { family: 'DM Sans',          weight: 400, size: 13, lh: 1.45, ls: 'normal',   color: 'text-mid',     transform: 'none',      style: 'normal' },
    caption:        { family: 'Crimson Pro',      weight: 400, size: 13, lh: 1.45, ls: 'normal',   color: 'text-mid',     transform: 'none',      style: 'italic' },
    button:         { family: 'DM Sans',          weight: 500, size: 14, lh: 1,    ls: 'normal',   color: 'text',         transform: 'none',      style: 'normal' },
    code:           { family: 'ui-monospace, SF Mono, Menlo', weight: 400, size: 13, lh: 1.45, ls: 'normal', color: 'text', transform: 'none', style: 'normal' },
  },
};

export async function ensureSeeded(env: any) {
  const locked = await env.submoacontent_db
    .prepare(`SELECT id FROM brand_bible_versions WHERE status = 'locked' LIMIT 1`)
    .first();
  if (locked) return;
  const id = generateId();
  const now = Math.floor(Date.now() / 1000);
  await env.submoacontent_db
    .prepare(`INSERT INTO brand_bible_versions (id, version_number, status, config_json, locked_at, locked_by, created_at) VALUES (?, 1, 'locked', ?, ?, 'system-seed', ?)`)
    .bind(id, JSON.stringify(DEFAULT_BRAND_BIBLE), now, now)
    .run();
}

export async function requireAdmin(request: Request, env: any) {
  const user = await getSessionUser(request, env);
  if (!user) return { ok: false, response: json({ error: 'Unauthorized' }, 401) };
  if (!isAdmin(user) && !isSuperAdmin(user)) return { ok: false, response: json({ error: 'Forbidden' }, 403) };
  return { ok: true, user };
}
