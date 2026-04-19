import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

export interface ColorToken {
  hex: string;
  description: string;
}

export interface TypeRole {
  family: string;
  weight: number;
  size: number;
  lh: number;
  ls: string;
  color: string;
  transform: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  style: 'normal' | 'italic';
}

export interface BrandBibleConfig {
  version_number: number;
  colors: Record<string, ColorToken>;
  typography: Record<string, TypeRole>;
}

export const DEFAULT_BRAND_BIBLE: BrandBibleConfig = {
  version_number: 0,
  colors: {
    bg:             { hex: '#EDE8DF', description: 'page background — warm cream' },
    card:           { hex: '#FAF7F2', description: 'card surfaces' },
    'surface-inp':  { hex: '#F0EBE2', description: 'inputs, inset surfaces' },
    green:          { hex: '#3D5A3E', description: 'primary — tile accent for articles' },
    'green-dark':   { hex: '#2B4030', description: 'H1, H2, active states' },
    amber:          { hex: '#B8872E', description: 'eyebrows, accents, primary action' },
    'leather-dark': { hex: '#3A2410', description: 'sidebar, display headlines' },
    text:           { hex: '#221A10', description: 'body text — warm near-black, never pure #000' },
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

export const COLOR_TOKEN_KEYS = Object.keys(DEFAULT_BRAND_BIBLE.colors);
export const TYPE_ROLE_KEYS = Object.keys(DEFAULT_BRAND_BIBLE.typography);
export const FONT_FAMILIES = ['Playfair Display', 'DM Sans', 'Crimson Pro', 'ui-monospace, SF Mono, Menlo'];

export function applyBrandBibleToRoot(config: BrandBibleConfig) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  for (const [key, tok] of Object.entries(config.colors)) {
    root.style.setProperty(`--${key}`, tok.hex);
  }
  for (const [role, spec] of Object.entries(config.typography)) {
    root.style.setProperty(`--font-${role}-family`, `"${spec.family.split(',')[0].trim()}", ${spec.family.includes('monospace') ? 'monospace' : spec.family.includes('Crimson') ? 'serif' : spec.family.includes('Playfair') ? 'serif' : 'sans-serif'}`);
    root.style.setProperty(`--font-${role}-weight`, String(spec.weight));
    root.style.setProperty(`--font-${role}-size`, `${spec.size}px`);
    root.style.setProperty(`--font-${role}-lh`, String(spec.lh));
    root.style.setProperty(`--font-${role}-ls`, spec.ls);
    root.style.setProperty(`--font-${role}-color`, `var(--${spec.color})`);
    root.style.setProperty(`--font-${role}-transform`, spec.transform);
    root.style.setProperty(`--font-${role}-style`, spec.style);
  }
}

interface Ctx {
  config: BrandBibleConfig;
  loading: boolean;
  refresh: () => Promise<void>;
}

const BrandBibleContext = createContext<Ctx>({ config: DEFAULT_BRAND_BIBLE, loading: false, refresh: async () => {} });

export function BrandBibleProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<BrandBibleConfig>(DEFAULT_BRAND_BIBLE);
  const [loading, setLoading] = useState(true);

  const fetchActive = async () => {
    try {
      const r = await fetch('/api/admin/brand-bible/active', { credentials: 'include' });
      if (r.ok) {
        const data: any = await r.json();
        if (data?.config) {
          setConfig(data.config);
          applyBrandBibleToRoot(data.config);
          setLoading(false);
          return;
        }
      }
    } catch { /* fall back */ }
    applyBrandBibleToRoot(DEFAULT_BRAND_BIBLE);
    setLoading(false);
  };

  useEffect(() => { fetchActive(); }, []);

  return (
    <BrandBibleContext.Provider value={{ config, loading, refresh: fetchActive }}>
      {children}
    </BrandBibleContext.Provider>
  );
}

export function useBrandBible() { return useContext(BrandBibleContext); }
