// Atomic Comp System — block type definitions (Phase 1 scaffolding).
// Block renderers + import detectors land in Phase 2.

import type { BrandConfig } from '../../brand/BrandConfig';

export type FieldType =
  | 'text'
  | 'richtext'
  | 'image'
  | 'url'
  | 'color'
  | 'select'
  | 'boolean';

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  default?: string;
  options?: string[];
  placeholder?: string;
  maxLength?: number;
  aiPromptHint?: string;
}

export interface BlockDef {
  type: string;
  label: string;
  icon: string;
  category?: 'layout' | 'content' | 'cards' | 'conversion' | 'media';
  fields: FieldDef[];
  defaultFields: Record<string, string>;
  render: (fields: Record<string, string>, brand: BrandConfig) => string;
  importDetector?: (el: Element) => boolean;
  importExtractor?: (el: Element) => Record<string, string>;
}

export interface Block {
  id: string;
  type: string;
  fields: Record<string, string>;
  locked: boolean;
  screenshotUrl?: string;
}

// The canonical list of block type slugs. Phase 2 implementations register
// against these; importers classify incoming HTML into these.
export const BLOCK_TYPES = [
  'nav',
  'hero',
  'hero-split',
  'image-full',
  'heading',
  'paragraph',
  'card',
  'card-grid',
  'article-card',
  'article-grid',
  'testimonial',
  'testimonial-grid',
  'stats',
  'cta',
  'cta-split',
  'video',
  'divider',
  'sponsor-grid',
  'footer',
  'raw-html',
] as const;

export type BlockType = typeof BLOCK_TYPES[number];
