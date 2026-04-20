// Shared helpers for block render() functions. Keeps the individual
// definitions compact and guarantees a consistent look across the 20
// block types (typography scale, button shape, section rhythm).

import type { BrandConfig } from '../brand/BrandConfig';

// Strips `<tag ...>` fragments that Claude occasionally leaks into plain
// text fields. Standalone "<" or ">" (as in "A > B" comparisons) survive
// because the regex requires both delimiters to form a tag.
export function stripHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function escapeHtml(s: unknown): string {
  // stripHtml first — covers existing dirty drafts where a text field
  // contains "<h1 style="...">Headline" strings that would otherwise
  // render as visible tag text once escaped.
  return stripHtml(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function escapeAttr(s: unknown): string {
  return String(s ?? '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

export function generateId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = 'b-';
  for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

// Safe JSON parse — field JSON blobs are user-edited strings; bad input
// must never throw during render.
export function parseJsonSafe<T>(value: string | undefined, fallback: T): T {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

// Primary CTA button in brand color.
export function btnPrimary(text: string, url: string, brand: BrandConfig): string {
  if (!text) return '';
  return `<a href="${escapeAttr(url || '#')}" style="
    display:inline-block;
    background:${brand.primary};
    color:#ffffff;
    font-family:${brand.bodyFont};
    font-size:1rem;
    font-weight:600;
    padding:14px 32px;
    border-radius:6px;
    text-decoration:none;
    letter-spacing:0.01em;
    transition:transform 0.1s;
  ">${escapeHtml(text)}</a>`;
}

// Secondary outlined button — sits next to a primary CTA.
export function btnOutlineLight(text: string, url: string, brand: BrandConfig): string {
  if (!text) return '';
  return `<a href="${escapeAttr(url || '#')}" style="
    display:inline-block;
    background:transparent;
    color:#ffffff;
    font-family:${brand.bodyFont};
    font-size:1rem;
    font-weight:600;
    padding:13px 30px;
    border:2px solid rgba(255,255,255,0.75);
    border-radius:6px;
    text-decoration:none;
    letter-spacing:0.01em;
    margin-left:12px;
  ">${escapeHtml(text)}</a>`;
}

// Text link with trailing arrow — used on cards.
export function linkArrow(text: string, url: string, brand: BrandConfig): string {
  if (!text) return '';
  return `<a href="${escapeAttr(url || '#')}" style="
    display:inline-flex;
    align-items:center;
    gap:6px;
    color:${brand.primary};
    font-family:${brand.bodyFont};
    font-size:0.95rem;
    font-weight:600;
    text-decoration:none;
    letter-spacing:0.01em;
  ">${escapeHtml(text)}<span style="font-size:1.1em;transform:translateY(-1px);">→</span></a>`;
}

// Section eyebrow — small uppercase label used above most section headlines.
export function eyebrowEl(text: string, color: string, bodyFont: string): string {
  if (!text) return '';
  return `<div style="
    font-family:${bodyFont};
    font-size:0.75rem;
    font-weight:700;
    letter-spacing:0.14em;
    text-transform:uppercase;
    color:${color};
    margin-bottom:10px;
  ">${escapeHtml(text)}</div>`;
}

// Container that caps section content to a readable max-width.
export function sectionContainer(inner: string, maxWidth = 1180): string {
  return `<div style="max-width:${maxWidth}px;margin:0 auto;padding:0 24px;">${inner}</div>`;
}
