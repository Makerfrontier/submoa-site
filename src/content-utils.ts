// Shared content-pipeline helpers.
//
// 1. sanitizeContent() — scrubs em-dashes (and "--") out of any generated text
//    before it is persisted to the database, written to R2, or returned to the
//    client. Every LLM call path passes its output through this before storage.
// 2. Color helpers — luminance-based text color derivation for the PPTX and
//    email builders. Never hardcode #fff / #000 as foreground colors.

// ─── Text sanitizer ────────────────────────────────────────────────────────
// The project rule is "never use em-dashes (— U+2014) in generated output."
// Replace them (and the ASCII approximation "--") with a comma + space. Leave
// "-", endash (–) alone. Non-string input returns untouched.
export function sanitizeContent(text: unknown): string {
  if (typeof text !== 'string') return String(text ?? '');
  return text
    .replace(/\u2014/g, ', ')  // em-dash (—)
    .replace(/ ?-- ?/g, ', ')  // double-hyphen used as em-dash
    .replace(/, {2,}/g, ', '); // collapse accidental double-commas
}

// System prompt snippet injected into every content-generating prompt.
export const EM_DASH_GUARD =
  'Never use em-dashes (—) in any output. Use a comma, a period, or restructure the sentence instead.';

// ─── Color helpers ─────────────────────────────────────────────────────────
// Parse "#rrggbb" → {r, g, b} 0..255.
export function parseHex(hex: string): { r: number; g: number; b: number } {
  const clean = String(hex || '').replace(/^#/, '').trim();
  const h = clean.length === 3
    ? clean.split('').map(c => c + c).join('')
    : clean;
  const n = parseInt(h.slice(0, 6) || '000000', 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

function toHex(n: number): string {
  const v = Math.max(0, Math.min(255, Math.round(n)));
  return v.toString(16).padStart(2, '0');
}

export function rgbToHex(r: number, g: number, b: number): string {
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// Linearize a single sRGB channel. Input 0..255, output 0..1.
function linearize(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

// Relative luminance per WCAG definition (0..1).
export function relativeLuminance(hex: string): number {
  const { r, g, b } = parseHex(hex);
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

export function isLightBackground(hex: string): boolean {
  return relativeLuminance(hex) > 0.179;
}

// Darken a color by `pct` (0..1). Simple sRGB multiply.
export function darken(hex: string, pct: number): string {
  const { r, g, b } = parseHex(hex);
  const f = Math.max(0, 1 - pct);
  return rgbToHex(r * f, g * f, b * f);
}

// Lighten toward white by `pct` (0..1).
export function lighten(hex: string, pct: number): string {
  const { r, g, b } = parseHex(hex);
  const f = Math.max(0, Math.min(1, pct));
  return rgbToHex(r + (255 - r) * f, g + (255 - g) * f, b + (255 - b) * f);
}

// Derive a text color for use against a given background.
//
// - Light background (L > 0.179): return primary darkened 40%.
// - Dark  background (L ≤ 0.179): lift the background toward white until its
//   luminance is ≥ 0.90.
//
// The caller passes the palette primary so we never reach for an untyped
// constant like #fff or #000.
export function complementaryText(backgroundHex: string, primaryHex: string): string {
  if (isLightBackground(backgroundHex)) {
    return darken(primaryHex, 0.4);
  }
  // Ramp up until luminance ≥ 0.90, bounded by 20 iterations.
  let candidate = backgroundHex;
  for (let i = 0; i < 20; i++) {
    if (relativeLuminance(candidate) >= 0.90) break;
    candidate = lighten(candidate, 0.25);
  }
  return candidate;
}
