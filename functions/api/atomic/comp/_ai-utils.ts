// Shared OpenRouter helpers for the Atomic Comp creation flows.
// Keeps the three endpoint files small and makes model selection + JSON
// extraction consistent (and easy to swap).

import type { Env } from '../../_utils';

export interface Block {
  id: string;
  type: string;
  fields: Record<string, string>;
  locked: boolean;
}

export interface BrandConfig {
  primary: string; secondary: string;
  background: string; surface: string;
  text: string; textLight: string;
  headingFont: string; bodyFont: string;
  logoUrl: string; siteName: string;
  source: 'scraped' | 'manual' | 'brand-bible' | 'default';
}

export const DEFAULT_BRAND: BrandConfig = {
  primary: '#2A5A6A',
  secondary: '#B8872E',
  background: '#FFFFFF',
  surface: '#F6F4EF',
  text: '#1A1613',
  textLight: '#65625E',
  headingFont: 'Georgia, "DM Serif Display", serif',
  bodyFont: '"DM Sans", system-ui, -apple-system, sans-serif',
  logoUrl: '',
  siteName: 'My Comp',
  source: 'default',
};

export function normalizeBrand(raw: any): BrandConfig {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    primary:     typeof r.primary     === 'string' && r.primary     ? r.primary     : DEFAULT_BRAND.primary,
    secondary:   typeof r.secondary   === 'string' && r.secondary   ? r.secondary   : DEFAULT_BRAND.secondary,
    background:  typeof r.background  === 'string' && r.background  ? r.background  : DEFAULT_BRAND.background,
    surface:     typeof r.surface     === 'string' && r.surface     ? r.surface     : DEFAULT_BRAND.surface,
    text:        typeof r.text        === 'string' && r.text        ? r.text        : DEFAULT_BRAND.text,
    textLight:   typeof r.textLight   === 'string' && r.textLight   ? r.textLight   : DEFAULT_BRAND.textLight,
    headingFont: typeof r.headingFont === 'string' && r.headingFont ? r.headingFont : DEFAULT_BRAND.headingFont,
    bodyFont:    typeof r.bodyFont    === 'string' && r.bodyFont    ? r.bodyFont    : DEFAULT_BRAND.bodyFont,
    logoUrl:     typeof r.logoUrl     === 'string' ? r.logoUrl      : DEFAULT_BRAND.logoUrl,
    siteName:    typeof r.siteName    === 'string' && r.siteName    ? r.siteName    : DEFAULT_BRAND.siteName,
    source:      (r.source === 'manual' || r.source === 'brand-bible' || r.source === 'default') ? r.source : 'scraped',
  };
}

const BLOCK_TYPES = new Set([
  'nav','hero','hero-split','image-full','heading','paragraph',
  'card','card-grid','article-card','article-grid',
  'testimonial','testimonial-grid','stats','cta','cta-split',
  'video','sponsor-grid','divider','footer','raw-html',
]);

export function normalizeBlocks(raw: any[], cap = 20): Block[] {
  const arr = Array.isArray(raw) ? raw : [];
  return arr.slice(0, cap).map((b: any) => {
    const type = typeof b?.type === 'string' && BLOCK_TYPES.has(b.type) ? b.type : 'raw-html';
    const fields = (b && typeof b.fields === 'object' && b.fields) ? b.fields : {};
    // Coerce all field values to strings — the client's field editors
    // assume strings. Arrays/objects are JSON-stringified so a card-grid
    // that came back with a real array still hydrates cleanly.
    const normFields: Record<string, string> = {};
    for (const k of Object.keys(fields)) {
      const v = fields[k];
      if (typeof v === 'string') normFields[k] = v;
      else if (v == null) normFields[k] = '';
      else normFields[k] = JSON.stringify(v);
    }
    return { id: genId(), type, fields: normFields, locked: false };
  });
}

export function genId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = 'b-';
  for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

// Strip ```json fences some models add around JSON responses.
export function extractJson(text: string): string {
  return String(text || '')
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
}

// Single-shot OpenRouter JSON call. Returns parsed value or throws.
export async function callOpenRouterJson(env: Env, opts: {
  messages: any[];
  model?: string;
  maxTokens?: number;
  xTitle?: string;
}): Promise<any> {
  if (!(env as any).OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY not configured');
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${(env as any).OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://submoacontent.com',
      'X-Title': opts.xTitle || 'Atomic Comp System',
    },
    body: JSON.stringify({
      model: opts.model || 'google/gemini-2.5-flash',
      max_tokens: opts.maxTokens || 8000,
      messages: opts.messages,
    }),
  });
  if (!res.ok) {
    const errText = (await res.text().catch(() => '')).slice(0, 400);
    throw new Error(`OpenRouter HTTP ${res.status}: ${errText}`);
  }
  const data: any = await res.json();
  const raw = data?.choices?.[0]?.message?.content;
  if (!raw) throw new Error('OpenRouter returned no content');
  return JSON.parse(extractJson(raw));
}

export const BLOCK_TYPES_LIST = Array.from(BLOCK_TYPES).join(', ');
