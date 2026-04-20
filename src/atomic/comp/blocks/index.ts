// Block registry — single source of truth for the 20 Atomic Comp block types.

import type { Block, BlockDef } from './definitions/types';
import { generateId } from './render-utils';
import * as defs from './definitions/all-blocks';

export const BLOCK_REGISTRY: Record<string, BlockDef> = {
  nav:                 defs.nav,
  hero:                defs.hero,
  'hero-split':        defs.heroSplit,
  'image-full':        defs.imageFull,
  heading:             defs.heading,
  paragraph:           defs.paragraph,
  card:                defs.card,
  'card-grid':         defs.cardGrid,
  'article-card':      defs.articleCard,
  'article-grid':      defs.articleGrid,
  testimonial:         defs.testimonial,
  'testimonial-grid':  defs.testimonialGrid,
  stats:               defs.stats,
  cta:                 defs.cta,
  'cta-split':         defs.ctaSplit,
  video:               defs.video,
  'sponsor-grid':      defs.sponsorGrid,
  divider:             defs.divider,
  footer:              defs.footer,
  'raw-html':          defs.rawHtml,
};

export function getBlockDef(type: string): BlockDef | undefined {
  return BLOCK_REGISTRY[type];
}

export function createBlock(type: string): Block {
  const def = getBlockDef(type);
  if (!def) throw new Error('Unknown block type: ' + type);
  return {
    id: generateId(),
    type,
    fields: { ...def.defaultFields },
    locked: false,
  };
}

// Order + grouping surfaced in the block picker drawer.
export const BLOCK_CATEGORIES: Array<{ label: string; blocks: string[] }> = [
  { label: 'Layout',       blocks: ['nav', 'hero', 'hero-split', 'divider', 'footer'] },
  { label: 'Content',      blocks: ['heading', 'paragraph', 'image-full', 'video', 'raw-html'] },
  { label: 'Cards',        blocks: ['card', 'card-grid', 'article-card', 'article-grid'] },
  { label: 'Social proof', blocks: ['testimonial', 'testimonial-grid', 'stats', 'sponsor-grid'] },
  { label: 'Conversion',   blocks: ['cta', 'cta-split'] },
];

export { generateId };
