// Atomic Comp System — brand configuration.
// Brand drives colors + fonts in every block renderer. Defaults below match
// a neutral, print-editorial look that renders well with any content before
// a real brand has been scraped.

export interface BrandConfig {
  primary: string;
  secondary: string;
  background: string;
  surface: string;
  text: string;
  textLight: string;
  headingFont: string;
  bodyFont: string;
  logoUrl: string;
  siteName: string;
  source: 'scraped' | 'manual' | 'brand-bible' | 'default';
}

export const DEFAULT_BRAND: BrandConfig = {
  primary:     '#2B4030',
  secondary:   '#B8872E',
  background:  '#FAFAF7',
  surface:     '#FFFFFF',
  text:        '#1A1A1A',
  textLight:   '#6B6B6B',
  headingFont: '"DM Sans", system-ui, -apple-system, sans-serif',
  bodyFont:    '"DM Sans", system-ui, -apple-system, sans-serif',
  logoUrl:     '',
  siteName:    '',
  source:      'default',
};

// Minimal runtime validator — accepts any object, fills missing keys from
// DEFAULT_BRAND. Used when hydrating comps from DB where the JSON column
// may predate a schema change.
export function normalizeBrand(input: any): BrandConfig {
  const b = input && typeof input === 'object' ? input : {};
  return {
    primary:     typeof b.primary     === 'string' ? b.primary     : DEFAULT_BRAND.primary,
    secondary:   typeof b.secondary   === 'string' ? b.secondary   : DEFAULT_BRAND.secondary,
    background:  typeof b.background  === 'string' ? b.background  : DEFAULT_BRAND.background,
    surface:     typeof b.surface     === 'string' ? b.surface     : DEFAULT_BRAND.surface,
    text:        typeof b.text        === 'string' ? b.text        : DEFAULT_BRAND.text,
    textLight:   typeof b.textLight   === 'string' ? b.textLight   : DEFAULT_BRAND.textLight,
    headingFont: typeof b.headingFont === 'string' ? b.headingFont : DEFAULT_BRAND.headingFont,
    bodyFont:    typeof b.bodyFont    === 'string' ? b.bodyFont    : DEFAULT_BRAND.bodyFont,
    logoUrl:     typeof b.logoUrl     === 'string' ? b.logoUrl     : DEFAULT_BRAND.logoUrl,
    siteName:    typeof b.siteName    === 'string' ? b.siteName    : DEFAULT_BRAND.siteName,
    source:      (b.source === 'scraped' || b.source === 'manual' || b.source === 'brand-bible')
                   ? b.source : 'default',
  };
}
