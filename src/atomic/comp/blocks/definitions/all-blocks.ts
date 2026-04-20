// All 20 Atomic Comp block definitions, consolidated into a single module.
// The spec originally suggested one file per block; consolidating here keeps
// the registry legible and lets us share the render helpers without a barrel
// file per block. Each export is its own `BlockDef` and can be split into a
// standalone file later without touching callers — the registry at
// src/atomic/comp/blocks/index.ts is the only consumer.

import type { BlockDef } from './types';
import type { BrandConfig } from '../../brand/BrandConfig';
import {
  escapeHtml, escapeAttr, parseJsonSafe,
  btnPrimary, btnOutlineLight, linkArrow, eyebrowEl, sectionContainer,
} from '../render-utils';

// ─── 1. NAV ────────────────────────────────────────────────────────────────
export const nav: BlockDef = {
  type: 'nav',
  label: 'Navigation',
  icon: '⇌',
  category: 'layout',
  fields: [
    { key: 'logoUrl',   label: 'Logo image URL', type: 'image' },
    { key: 'logoAlt',   label: 'Logo alt',        type: 'text' },
    { key: 'links',     label: 'Links (JSON)',    type: 'richtext', placeholder: '[{"text":"Shop","url":"/shop"}]' },
    { key: 'ctaText',   label: 'CTA text',        type: 'text' },
    { key: 'ctaUrl',    label: 'CTA URL',         type: 'url' },
    { key: 'bgColor',   label: 'Background',      type: 'color' },
    { key: 'textColor', label: 'Text',            type: 'color' },
    { key: 'sticky',    label: 'Sticky',          type: 'select', options: ['no', 'yes'] },
  ],
  defaultFields: {
    logoUrl: '',
    logoAlt: 'Site logo',
    links: '[{"text":"Home","url":"/"},{"text":"Shop","url":"/shop"},{"text":"About","url":"/about"},{"text":"Contact","url":"/contact"}]',
    ctaText: 'Get started',
    ctaUrl: '#',
    bgColor: '',
    textColor: '',
    sticky: 'no',
  },
  render(fields, brand) {
    const bg   = fields.bgColor   || brand.background;
    const text = fields.textColor || brand.text;
    const links = parseJsonSafe<Array<{ text: string; url: string }>>(fields.links, []);
    const linksHtml = links.map(l => `<a href="${escapeAttr(l.url)}" style="
      color:${text};
      font-family:${brand.bodyFont};
      font-size:0.95rem;
      font-weight:500;
      text-decoration:none;
      padding:8px 2px;
      letter-spacing:0.01em;
    ">${escapeHtml(l.text)}</a>`).join('');
    const logoHtml = fields.logoUrl
      ? `<img src="${escapeAttr(fields.logoUrl)}" alt="${escapeAttr(fields.logoAlt || brand.siteName)}" style="height:36px;width:auto;display:block;" />`
      : `<span style="
          font-family:${brand.headingFont};
          font-size:1.25rem;
          font-weight:700;
          color:${text};
          letter-spacing:-0.01em;
        ">${escapeHtml(brand.siteName || 'Brand')}</span>`;
    const cta = fields.ctaText ? `<a href="${escapeAttr(fields.ctaUrl || '#')}" style="
      display:inline-block;
      background:${brand.primary};
      color:#ffffff;
      font-family:${brand.bodyFont};
      font-size:0.9rem;
      font-weight:600;
      padding:10px 22px;
      border-radius:6px;
      text-decoration:none;
      letter-spacing:0.01em;
    ">${escapeHtml(fields.ctaText)}</a>` : '';
    const position = fields.sticky === 'yes' ? 'sticky;top:0;z-index:50;' : 'relative;';
    return `<nav style="
      position:${position}
      background:${bg};
      border-bottom:1px solid rgba(0,0,0,0.06);
      box-shadow:0 1px 2px rgba(0,0,0,0.03);
    ">
      <div style="
        max-width:1280px;
        margin:0 auto;
        padding:16px 24px;
        display:flex;
        align-items:center;
        gap:40px;
      ">
        <div style="flex-shrink:0;">${logoHtml}</div>
        <div style="flex:1;display:flex;gap:28px;justify-content:center;flex-wrap:wrap;">${linksHtml}</div>
        <div style="flex-shrink:0;">${cta}</div>
      </div>
    </nav>`;
  },
};

// ─── 2. HERO ──────────────────────────────────────────────────────────────
export const hero: BlockDef = {
  type: 'hero',
  label: 'Hero',
  icon: '◉',
  category: 'layout',
  fields: [
    { key: 'headline',         label: 'Headline',         type: 'text' },
    { key: 'subheadline',      label: 'Subheadline',      type: 'richtext' },
    { key: 'ctaText',          label: 'Primary CTA',      type: 'text' },
    { key: 'ctaUrl',           label: 'Primary URL',      type: 'url' },
    { key: 'ctaSecondaryText', label: 'Secondary CTA',    type: 'text' },
    { key: 'ctaSecondaryUrl',  label: 'Secondary URL',    type: 'url' },
    { key: 'backgroundImage',  label: 'Background image', type: 'image' },
    { key: 'overlayOpacity',   label: 'Overlay %',        type: 'select', options: ['0','20','40','60','80'] },
    { key: 'textAlign',        label: 'Text align',       type: 'select', options: ['left','center'] },
    { key: 'minHeight',        label: 'Min height',       type: 'select', options: ['500px','600px','700px','100vh'] },
    { key: 'textColor',        label: 'Text color',       type: 'color' },
  ],
  defaultFields: {
    headline: 'The headline that stops scrolling',
    subheadline: 'A compelling subheadline that explains the value in one sentence so the visitor knows what this page is about without thinking.',
    ctaText: 'Get started',
    ctaUrl: '#',
    ctaSecondaryText: 'Learn more',
    ctaSecondaryUrl: '#',
    backgroundImage: 'https://images.unsplash.com/photo-1557683316-973673baf926?w=1920&auto=format&fit=crop',
    overlayOpacity: '40',
    textAlign: 'left',
    minHeight: '600px',
    textColor: '#ffffff',
  },
  render(fields, brand) {
    const overlay = Number(fields.overlayOpacity || '40') / 100;
    const color   = fields.textColor || '#ffffff';
    const align   = fields.textAlign === 'center' ? 'center' : 'left';
    const justify = align === 'center' ? 'center' : 'flex-start';
    const primaryCta   = btnPrimary(fields.ctaText, fields.ctaUrl, brand);
    const secondaryCta = btnOutlineLight(fields.ctaSecondaryText, fields.ctaSecondaryUrl, brand);
    return `<section style="
      position:relative;
      min-height:${fields.minHeight || '600px'};
      background-image:url('${escapeAttr(fields.backgroundImage)}');
      background-size:cover;
      background-position:center;
      background-color:${brand.text};
      display:flex;
      align-items:center;
      justify-content:${justify};
      padding:clamp(60px,10vw,120px) clamp(24px,5vw,64px);
    ">
      <div style="position:absolute;inset:0;background:rgba(0,0,0,${overlay});"></div>
      <div style="
        position:relative;
        max-width:${align === 'center' ? '820px' : '720px'};
        text-align:${align};
      ">
        <h1 style="
          font-family:${brand.headingFont};
          font-size:clamp(2.2rem,5vw,4.2rem);
          font-weight:700;
          color:${color};
          line-height:1.08;
          letter-spacing:-0.02em;
          margin:0 0 20px;
        ">${escapeHtml(fields.headline)}</h1>
        ${fields.subheadline ? `<p style="
          font-family:${brand.bodyFont};
          font-size:clamp(1rem,2vw,1.3rem);
          color:${color};
          opacity:0.9;
          line-height:1.6;
          margin:0 0 36px;
          max-width:600px;
          ${align === 'center' ? 'margin-left:auto;margin-right:auto;' : ''}
        ">${escapeHtml(fields.subheadline)}</p>` : ''}
        <div>${primaryCta}${secondaryCta}</div>
      </div>
    </section>`;
  },
};

// ─── 3. HERO SPLIT ────────────────────────────────────────────────────────
export const heroSplit: BlockDef = {
  type: 'hero-split',
  label: 'Hero (split)',
  icon: '▤',
  category: 'layout',
  fields: [
    { key: 'headline',      label: 'Headline',    type: 'text' },
    { key: 'subheadline',   label: 'Subheadline', type: 'text' },
    { key: 'body',          label: 'Body',        type: 'richtext' },
    { key: 'ctaText',       label: 'CTA text',    type: 'text' },
    { key: 'ctaUrl',        label: 'CTA URL',     type: 'url' },
    { key: 'image',         label: 'Image',       type: 'image' },
    { key: 'imagePosition', label: 'Image on',    type: 'select', options: ['right','left'] },
    { key: 'bgColor',       label: 'Background',  type: 'color' },
  ],
  defaultFields: {
    headline: 'Built for the work you actually do',
    subheadline: 'Purpose-built tools, ready out of the box',
    body: 'Everything you need to get the job done — with no setup tax, no configuration tree, and no learning curve to scale. Just pick it up and go.',
    ctaText: 'Get started',
    ctaUrl: '#',
    image: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=1200&auto=format&fit=crop',
    imagePosition: 'right',
    bgColor: '',
  },
  render(fields, brand) {
    const bg = fields.bgColor || brand.background;
    const imgRight = fields.imagePosition !== 'left';
    const textCol = `<div style="
      padding:clamp(40px,6vw,80px);
      display:flex;
      flex-direction:column;
      justify-content:center;
    ">
      ${fields.subheadline ? eyebrowEl(fields.subheadline, brand.secondary, brand.bodyFont) : ''}
      <h2 style="
        font-family:${brand.headingFont};
        font-size:clamp(1.8rem,3.8vw,3rem);
        font-weight:700;
        color:${brand.text};
        line-height:1.1;
        letter-spacing:-0.02em;
        margin:0 0 18px;
      ">${escapeHtml(fields.headline)}</h2>
      <p style="
        font-family:${brand.bodyFont};
        font-size:1.1rem;
        color:${brand.textLight};
        line-height:1.7;
        margin:0 0 28px;
      ">${escapeHtml(fields.body)}</p>
      <div>${btnPrimary(fields.ctaText, fields.ctaUrl, brand)}</div>
    </div>`;
    const imgCol = `<div style="
      background-image:url('${escapeAttr(fields.image)}');
      background-size:cover;
      background-position:center;
      min-height:460px;
    "></div>`;
    return `<section style="background:${bg};">
      <div style="
        max-width:1280px;
        margin:0 auto;
        display:grid;
        grid-template-columns:1fr 1fr;
        gap:0;
        min-height:520px;
      ">
        ${imgRight ? textCol + imgCol : imgCol + textCol}
      </div>
    </section>`;
  },
};

// ─── 4. IMAGE FULL ────────────────────────────────────────────────────────
export const imageFull: BlockDef = {
  type: 'image-full',
  label: 'Image',
  icon: '▣',
  category: 'content',
  fields: [
    { key: 'src',       label: 'Image URL',  type: 'image' },
    { key: 'alt',       label: 'Alt text',   type: 'text' },
    { key: 'caption',   label: 'Caption',    type: 'text' },
    { key: 'link',      label: 'Link URL',   type: 'url' },
    { key: 'maxHeight', label: 'Max height', type: 'select', options: ['auto','300px','400px','500px','600px'] },
    { key: 'objectFit', label: 'Fit',        type: 'select', options: ['cover','contain'] },
  ],
  defaultFields: {
    src: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=1600&auto=format&fit=crop',
    alt: '',
    caption: '',
    link: '',
    maxHeight: 'auto',
    objectFit: 'cover',
  },
  render(fields, brand) {
    const h = fields.maxHeight && fields.maxHeight !== 'auto' ? `height:${fields.maxHeight};` : '';
    const fit = fields.objectFit || 'cover';
    const img = `<img src="${escapeAttr(fields.src)}" alt="${escapeAttr(fields.alt)}" style="
      display:block;
      width:100%;
      ${h}
      object-fit:${fit};
    " />`;
    const wrapped = fields.link ? `<a href="${escapeAttr(fields.link)}" style="display:block;">${img}</a>` : img;
    return `<figure style="margin:0;padding:32px 0;background:${brand.background};">
      ${wrapped}
      ${fields.caption ? `<figcaption style="
        font-family:${brand.bodyFont};
        font-size:0.9rem;
        font-style:italic;
        color:${brand.textLight};
        text-align:center;
        padding:16px 24px 0;
      ">${escapeHtml(fields.caption)}</figcaption>` : ''}
    </figure>`;
  },
};

// ─── 5. HEADING ───────────────────────────────────────────────────────────
export const heading: BlockDef = {
  type: 'heading',
  label: 'Heading',
  icon: 'H',
  category: 'content',
  fields: [
    { key: 'text',    label: 'Heading text', type: 'text' },
    { key: 'eyebrow', label: 'Eyebrow',      type: 'text' },
    { key: 'level',   label: 'Level',        type: 'select', options: ['H1','H2','H3','H4'] },
    { key: 'align',   label: 'Align',        type: 'select', options: ['left','center','right'] },
    { key: 'size',    label: 'Size',         type: 'select', options: ['sm','md','lg','xl'] },
    { key: 'color',   label: 'Color',        type: 'color' },
  ],
  defaultFields: {
    text: 'Section heading',
    eyebrow: '',
    level: 'H2',
    align: 'left',
    size: 'lg',
    color: '',
  },
  render(fields, brand) {
    const sizes = { sm: '1.4rem', md: '1.8rem', lg: 'clamp(1.8rem,3vw,2.5rem)', xl: 'clamp(2.2rem,4vw,3.4rem)' };
    const tag = (fields.level || 'H2').toLowerCase();
    const color = fields.color || brand.text;
    const align = fields.align || 'left';
    return `<section style="padding:48px clamp(24px,5vw,48px);background:${brand.background};">
      ${sectionContainer(`
        <div style="text-align:${align};">
          ${fields.eyebrow ? eyebrowEl(fields.eyebrow, brand.primary, brand.bodyFont) : ''}
          <${tag} style="
            font-family:${brand.headingFont};
            font-size:${sizes[(fields.size as keyof typeof sizes)] || sizes.lg};
            font-weight:700;
            color:${color};
            line-height:1.15;
            letter-spacing:-0.015em;
            margin:0;
          ">${escapeHtml(fields.text)}</${tag}>
        </div>
      `)}
    </section>`;
  },
};

// ─── 6. PARAGRAPH ─────────────────────────────────────────────────────────
export const paragraph: BlockDef = {
  type: 'paragraph',
  label: 'Paragraph',
  icon: '¶',
  category: 'content',
  fields: [
    { key: 'text',     label: 'Text',      type: 'richtext' },
    { key: 'align',    label: 'Align',     type: 'select', options: ['left','center','right'] },
    { key: 'maxWidth', label: 'Max width', type: 'select', options: ['full','900px','700px','560px'] },
    { key: 'fontSize', label: 'Size',      type: 'select', options: ['sm','md','lg'] },
    { key: 'color',    label: 'Color',     type: 'color' },
  ],
  defaultFields: {
    text: 'A meaningful paragraph written at the right length for the space. Not too short that it feels empty, not too long that it loses the reader. This is where you explain the context, the motivation, or the detail that matters.',
    align: 'left',
    maxWidth: '700px',
    fontSize: 'md',
    color: '',
  },
  render(fields, brand) {
    const sizes = { sm: '0.95rem', md: '1.075rem', lg: '1.2rem' };
    const mw = fields.maxWidth && fields.maxWidth !== 'full' ? `max-width:${fields.maxWidth};margin-left:auto;margin-right:auto;` : '';
    const color = fields.color || brand.text;
    return `<section style="padding:24px clamp(24px,5vw,48px);background:${brand.background};">
      <div style="${mw}">
        <p style="
          font-family:${brand.bodyFont};
          font-size:${sizes[(fields.fontSize as keyof typeof sizes)] || sizes.md};
          color:${color};
          line-height:1.75;
          text-align:${fields.align || 'left'};
          margin:0;
        ">${escapeHtml(fields.text)}</p>
      </div>
    </section>`;
  },
};

// ─── card sub-renderer reused by card, card-grid, article-grid ────────────
interface CardFields {
  image?: string; badge?: string; headline?: string; body?: string;
  ctaText?: string; ctaUrl?: string; imageAspect?: string;
}
function renderCardTile(f: CardFields, brand: BrandConfig): string {
  const aspect = (f.imageAspect || '16:9').replace(':', '/');
  return `<article style="
    background:${brand.surface};
    border-radius:10px;
    overflow:hidden;
    box-shadow:0 1px 3px rgba(0,0,0,0.06),0 8px 24px rgba(0,0,0,0.06);
    display:flex;
    flex-direction:column;
  ">
    <div style="position:relative;aspect-ratio:${aspect};background:${brand.background};">
      ${f.image ? `<img src="${escapeAttr(f.image)}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;" />` : ''}
      ${f.badge ? `<span style="
        position:absolute;top:14px;left:14px;
        background:${brand.primary};
        color:#ffffff;
        font-family:${brand.bodyFont};
        font-size:0.7rem;
        font-weight:700;
        letter-spacing:0.1em;
        text-transform:uppercase;
        padding:5px 10px;
        border-radius:4px;
      ">${escapeHtml(f.badge)}</span>` : ''}
    </div>
    <div style="padding:24px;display:flex;flex-direction:column;gap:12px;flex:1;">
      <h3 style="
        font-family:${brand.headingFont};
        font-size:1.3rem;
        font-weight:700;
        color:${brand.text};
        margin:0;
        line-height:1.25;
        letter-spacing:-0.01em;
      ">${escapeHtml(f.headline || '')}</h3>
      <p style="
        font-family:${brand.bodyFont};
        font-size:0.975rem;
        color:${brand.textLight};
        line-height:1.6;
        margin:0;
        flex:1;
      ">${escapeHtml(f.body || '')}</p>
      ${f.ctaText ? `<div style="margin-top:4px;">${linkArrow(f.ctaText, f.ctaUrl || '#', brand)}</div>` : ''}
    </div>
  </article>`;
}

// ─── 7. CARD ──────────────────────────────────────────────────────────────
export const card: BlockDef = {
  type: 'card',
  label: 'Card',
  icon: '▤',
  category: 'cards',
  fields: [
    { key: 'image',       label: 'Image',    type: 'image' },
    { key: 'badge',       label: 'Badge',    type: 'text' },
    { key: 'headline',    label: 'Headline', type: 'text' },
    { key: 'body',        label: 'Body',     type: 'richtext' },
    { key: 'ctaText',     label: 'CTA text', type: 'text' },
    { key: 'ctaUrl',      label: 'CTA URL',  type: 'url' },
    { key: 'imageAspect', label: 'Image aspect', type: 'select', options: ['16:9','4:3','1:1','3:2'] },
  ],
  defaultFields: {
    image: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&auto=format&fit=crop',
    badge: 'Featured',
    headline: 'A compelling card headline',
    body: 'Short body copy that describes what is inside this card so someone decides to click.',
    ctaText: 'Read more',
    ctaUrl: '#',
    imageAspect: '16:9',
  },
  render(fields, brand) {
    return `<section style="padding:40px clamp(24px,5vw,48px);background:${brand.background};">
      <div style="max-width:640px;margin:0 auto;">${renderCardTile(fields, brand)}</div>
    </section>`;
  },
};

// ─── 8. CARD GRID ─────────────────────────────────────────────────────────
export const cardGrid: BlockDef = {
  type: 'card-grid',
  label: 'Card grid',
  icon: '▦',
  category: 'cards',
  fields: [
    { key: 'eyebrow',  label: 'Eyebrow',    type: 'text' },
    { key: 'headline', label: 'Headline',   type: 'text' },
    { key: 'columns',  label: 'Columns',    type: 'select', options: ['2','3','4'] },
    { key: 'cards',    label: 'Cards JSON', type: 'richtext' },
    { key: 'bgColor',  label: 'Background', type: 'color' },
  ],
  defaultFields: {
    eyebrow: 'Featured',
    headline: 'The best of what we offer',
    columns: '3',
    cards: JSON.stringify([
      { image: 'https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&auto=format&fit=crop', badge: '', headline: 'First card', body: 'Body copy for the first card in the grid.', ctaText: 'Read more', ctaUrl: '#', imageAspect: '16:9' },
      { image: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=800&auto=format&fit=crop', badge: '', headline: 'Second card', body: 'Body copy for the second card in the grid.', ctaText: 'Read more', ctaUrl: '#', imageAspect: '16:9' },
      { image: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&auto=format&fit=crop', badge: '', headline: 'Third card', body: 'Body copy for the third card in the grid.', ctaText: 'Read more', ctaUrl: '#', imageAspect: '16:9' },
    ]),
    bgColor: '',
  },
  render(fields, brand) {
    const cards = parseJsonSafe<CardFields[]>(fields.cards, []);
    const cols = Math.max(1, Math.min(4, parseInt(fields.columns || '3', 10)));
    const bg = fields.bgColor || brand.background;
    const tiles = cards.map(c => renderCardTile(c, brand)).join('');
    return `<section style="padding:clamp(60px,8vw,100px) clamp(24px,5vw,48px);background:${bg};">
      ${sectionContainer(`
        ${(fields.eyebrow || fields.headline) ? `<div style="text-align:center;margin-bottom:48px;">
          ${eyebrowEl(fields.eyebrow, brand.secondary, brand.bodyFont)}
          ${fields.headline ? `<h2 style="
            font-family:${brand.headingFont};
            font-size:clamp(1.8rem,3.5vw,2.8rem);
            font-weight:700;
            color:${brand.text};
            margin:0;
            line-height:1.15;
            letter-spacing:-0.015em;
          ">${escapeHtml(fields.headline)}</h2>` : ''}
        </div>` : ''}
        <div style="
          display:grid;
          grid-template-columns:repeat(${cols},1fr);
          gap:24px;
        " class="acs-grid-responsive">${tiles}</div>
      `)}
    </section>`;
  },
};

// ─── article card sub-renderer ────────────────────────────────────────────
interface ArticleFields {
  image?: string; category?: string; headline?: string; body?: string;
  author?: string; date?: string; readTime?: string; ctaText?: string; ctaUrl?: string;
}
function renderArticleTile(f: ArticleFields, brand: BrandConfig): string {
  const meta = [f.author, f.date, f.readTime].filter(Boolean).map(escapeHtml).join(' · ');
  return `<article style="
    background:${brand.surface};
    border-radius:10px;
    overflow:hidden;
    box-shadow:0 1px 3px rgba(0,0,0,0.06),0 8px 24px rgba(0,0,0,0.06);
    display:flex;
    flex-direction:column;
  ">
    <div style="position:relative;aspect-ratio:16/9;background:${brand.background};">
      ${f.image ? `<img src="${escapeAttr(f.image)}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;" />` : ''}
    </div>
    <div style="padding:24px;display:flex;flex-direction:column;gap:12px;flex:1;">
      ${f.category ? `<span style="
        font-family:${brand.bodyFont};
        font-size:0.72rem;
        font-weight:700;
        letter-spacing:0.12em;
        text-transform:uppercase;
        color:${brand.primary};
      ">${escapeHtml(f.category)}</span>` : ''}
      <h3 style="
        font-family:${brand.headingFont};
        font-size:1.3rem;
        font-weight:700;
        color:${brand.text};
        margin:0;
        line-height:1.25;
        letter-spacing:-0.01em;
      ">${escapeHtml(f.headline || '')}</h3>
      <p style="
        font-family:${brand.bodyFont};
        font-size:0.975rem;
        color:${brand.textLight};
        line-height:1.6;
        margin:0;
        flex:1;
      ">${escapeHtml(f.body || '')}</p>
      ${meta ? `<div style="
        font-family:${brand.bodyFont};
        font-size:0.8rem;
        color:${brand.textLight};
        margin-top:4px;
      ">${meta}</div>` : ''}
      ${f.ctaText ? `<a href="${escapeAttr(f.ctaUrl || '#')}" style="
        display:inline-block;
        background:${brand.primary};
        color:#ffffff;
        font-family:${brand.bodyFont};
        font-size:0.9rem;
        font-weight:600;
        padding:10px 20px;
        border-radius:6px;
        text-decoration:none;
        margin-top:8px;
        align-self:flex-start;
      ">${escapeHtml(f.ctaText)}</a>` : ''}
    </div>
  </article>`;
}

// ─── 9. ARTICLE CARD ──────────────────────────────────────────────────────
export const articleCard: BlockDef = {
  type: 'article-card',
  label: 'Article card',
  icon: '✦',
  category: 'cards',
  fields: [
    { key: 'image',    label: 'Image',     type: 'image' },
    { key: 'category', label: 'Category',  type: 'text' },
    { key: 'headline', label: 'Headline',  type: 'text' },
    { key: 'body',     label: 'Excerpt',   type: 'richtext' },
    { key: 'author',   label: 'Author',    type: 'text' },
    { key: 'date',     label: 'Date',      type: 'text' },
    { key: 'readTime', label: 'Read time', type: 'text' },
    { key: 'ctaText',  label: 'CTA text',  type: 'text' },
    { key: 'ctaUrl',   label: 'CTA URL',   type: 'url' },
  ],
  defaultFields: {
    image: 'https://images.unsplash.com/photo-1586953208448-b95a79798f07?w=1200&auto=format&fit=crop',
    category: 'Field Notes',
    headline: 'What we learned from a month on the trail',
    body: 'A short excerpt that sets up the story without giving everything away — the reader should want to know more.',
    author: 'Sam Carter',
    date: 'Apr 18, 2026',
    readTime: '6 min read',
    ctaText: 'Read more',
    ctaUrl: '#',
  },
  render(fields, brand) {
    return `<section style="padding:40px clamp(24px,5vw,48px);background:${brand.background};">
      <div style="max-width:640px;margin:0 auto;">${renderArticleTile(fields, brand)}</div>
    </section>`;
  },
};

// ─── 10. ARTICLE GRID ─────────────────────────────────────────────────────
export const articleGrid: BlockDef = {
  type: 'article-grid',
  label: 'Article grid',
  icon: '▦',
  category: 'cards',
  fields: [
    { key: 'eyebrow',  label: 'Eyebrow',   type: 'text' },
    { key: 'headline', label: 'Headline',  type: 'text' },
    { key: 'columns',  label: 'Columns',   type: 'select', options: ['2','3'] },
    { key: 'articles', label: 'Articles JSON', type: 'richtext' },
    { key: 'bgColor',  label: 'Background', type: 'color' },
  ],
  defaultFields: {
    eyebrow: 'Latest',
    headline: 'Stories from the field',
    columns: '3',
    articles: JSON.stringify([
      { image: 'https://images.unsplash.com/photo-1586953208448-b95a79798f07?w=1200&auto=format&fit=crop', category: 'Field Notes', headline: 'A week in the backcountry', body: 'Lessons from a seven-day trip with nothing but gear on our backs.', author: 'Sam', date: 'Apr 14', readTime: '6 min', ctaText: 'Read', ctaUrl: '#' },
      { image: 'https://images.unsplash.com/photo-1472214103451-9374bd1c798e?w=1200&auto=format&fit=crop', category: 'Gear', headline: 'The boot test we ran for 400 miles', body: 'Four pairs, one summer, brutal conditions. Here is what held up.', author: 'Jordan', date: 'Apr 9', readTime: '8 min', ctaText: 'Read', ctaUrl: '#' },
      { image: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1200&auto=format&fit=crop', category: 'Skills', headline: 'How to read a topo map in the dark', body: 'You probably will not have a headlamp when you need one most.', author: 'Riley', date: 'Apr 2', readTime: '5 min', ctaText: 'Read', ctaUrl: '#' },
    ]),
    bgColor: '',
  },
  render(fields, brand) {
    const arts = parseJsonSafe<ArticleFields[]>(fields.articles, []);
    const cols = Math.max(1, Math.min(3, parseInt(fields.columns || '3', 10)));
    const bg = fields.bgColor || brand.background;
    const tiles = arts.map(a => renderArticleTile(a, brand)).join('');
    return `<section style="padding:clamp(60px,8vw,100px) clamp(24px,5vw,48px);background:${bg};">
      ${sectionContainer(`
        ${(fields.eyebrow || fields.headline) ? `<div style="margin-bottom:44px;">
          ${eyebrowEl(fields.eyebrow, brand.secondary, brand.bodyFont)}
          ${fields.headline ? `<h2 style="
            font-family:${brand.headingFont};
            font-size:clamp(1.8rem,3.5vw,2.8rem);
            font-weight:700;
            color:${brand.text};
            margin:0;
            line-height:1.15;
            letter-spacing:-0.015em;
          ">${escapeHtml(fields.headline)}</h2>` : ''}
        </div>` : ''}
        <div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:24px;">${tiles}</div>
      `)}
    </section>`;
  },
};

// ─── testimonial helpers ──────────────────────────────────────────────────
function renderStars(rating: string | undefined, color: string): string {
  const n = parseInt(rating || '0', 10);
  if (!n || n < 3) return '';
  return `<div style="display:flex;gap:3px;justify-content:center;">${Array.from({ length: 5 }, (_, i) => `
    <span style="font-size:18px;color:${i < n ? color : 'rgba(0,0,0,0.15)'};">★</span>
  `).join('')}</div>`;
}

// ─── 11. TESTIMONIAL ──────────────────────────────────────────────────────
export const testimonial: BlockDef = {
  type: 'testimonial',
  label: 'Testimonial',
  icon: '❝',
  category: 'social-proof',
  fields: [
    { key: 'quote',   label: 'Quote',    type: 'richtext' },
    { key: 'name',    label: 'Name',     type: 'text' },
    { key: 'title',   label: 'Title',    type: 'text' },
    { key: 'company', label: 'Company',  type: 'text' },
    { key: 'avatar',  label: 'Avatar',   type: 'image' },
    { key: 'rating',  label: 'Rating',   type: 'select', options: ['none','3','4','5'] },
  ],
  defaultFields: {
    quote: 'The difference between this and everything else I have used is not incremental — it is a different category of tool.',
    name: 'Alex Morgan',
    title: 'Head of Operations',
    company: 'Harbor Co.',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&auto=format&fit=crop',
    rating: '5',
  },
  render(fields, brand) {
    const attribution = [fields.title, fields.company].filter(Boolean).join(' · ');
    return `<section style="padding:clamp(60px,8vw,100px) clamp(24px,5vw,48px);background:${brand.surface};">
      <div style="max-width:780px;margin:0 auto;text-align:center;">
        <div style="
          font-family:${brand.headingFont};
          font-size:4rem;
          line-height:1;
          color:${brand.primary};
          margin-bottom:8px;
        ">“</div>
        <p style="
          font-family:${brand.headingFont};
          font-size:clamp(1.2rem,2.4vw,1.7rem);
          font-style:italic;
          color:${brand.text};
          line-height:1.5;
          margin:0 0 32px;
          letter-spacing:-0.01em;
        ">${escapeHtml(fields.quote)}</p>
        ${renderStars(fields.rating, brand.secondary)}
        <div style="display:flex;align-items:center;gap:14px;justify-content:center;margin-top:24px;">
          ${fields.avatar ? `<img src="${escapeAttr(fields.avatar)}" alt="" style="
            width:56px;height:56px;border-radius:50%;object-fit:cover;
          " />` : ''}
          <div style="text-align:left;">
            <div style="
              font-family:${brand.bodyFont};
              font-weight:700;
              font-size:0.95rem;
              color:${brand.text};
            ">${escapeHtml(fields.name)}</div>
            ${attribution ? `<div style="
              font-family:${brand.bodyFont};
              font-size:0.85rem;
              color:${brand.textLight};
            ">${attribution}</div>` : ''}
          </div>
        </div>
      </div>
    </section>`;
  },
};

// ─── 12. TESTIMONIAL GRID ─────────────────────────────────────────────────
interface TestimonialFields { quote?: string; name?: string; title?: string; company?: string; avatar?: string; rating?: string; }
export const testimonialGrid: BlockDef = {
  type: 'testimonial-grid',
  label: 'Testimonial grid',
  icon: '❞',
  category: 'social-proof',
  fields: [
    { key: 'eyebrow',      label: 'Eyebrow',           type: 'text' },
    { key: 'headline',     label: 'Headline',          type: 'text' },
    { key: 'testimonials', label: 'Testimonials JSON', type: 'richtext' },
    { key: 'columns',      label: 'Columns',           type: 'select', options: ['2','3'] },
    { key: 'bgColor',      label: 'Background',        type: 'color' },
  ],
  defaultFields: {
    eyebrow: 'Trusted',
    headline: 'What our customers say',
    testimonials: JSON.stringify([
      { quote: 'The difference is not incremental — it is a different category.', name: 'Alex Morgan', title: 'Head of Ops', company: 'Harbor Co.', avatar: '', rating: '5' },
      { quote: 'It changed how the team works. Honestly.', name: 'Priya S.', title: 'PM',           company: 'Mesa Labs',  avatar: '', rating: '5' },
      { quote: 'Faster, cleaner, and our customers notice.',                     name: 'Jordan L.',   title: 'Founder',      company: 'Pinebluff',   avatar: '', rating: '5' },
    ]),
    columns: '3',
    bgColor: '',
  },
  render(fields, brand) {
    const items = parseJsonSafe<TestimonialFields[]>(fields.testimonials, []);
    const cols = Math.max(1, Math.min(3, parseInt(fields.columns || '3', 10)));
    const bg = fields.bgColor || brand.background;
    const tiles = items.map(t => `<div style="
      background:${brand.surface};
      padding:28px;
      border-radius:10px;
      border:1px solid rgba(0,0,0,0.06);
      display:flex;
      flex-direction:column;
      gap:16px;
    ">
      ${renderStars(t.rating, brand.secondary)}
      <p style="
        font-family:${brand.bodyFont};
        font-size:1rem;
        color:${brand.text};
        line-height:1.65;
        margin:0;
        flex:1;
      ">${escapeHtml(t.quote || '')}</p>
      <div style="display:flex;align-items:center;gap:12px;">
        ${t.avatar ? `<img src="${escapeAttr(t.avatar)}" alt="" style="width:40px;height:40px;border-radius:50%;object-fit:cover;" />` : ''}
        <div>
          <div style="font-family:${brand.bodyFont};font-weight:700;font-size:0.9rem;color:${brand.text};">${escapeHtml(t.name || '')}</div>
          <div style="font-family:${brand.bodyFont};font-size:0.8rem;color:${brand.textLight};">${escapeHtml([t.title, t.company].filter(Boolean).join(' · '))}</div>
        </div>
      </div>
    </div>`).join('');
    return `<section style="padding:clamp(60px,8vw,100px) clamp(24px,5vw,48px);background:${bg};">
      ${sectionContainer(`
        ${(fields.eyebrow || fields.headline) ? `<div style="text-align:center;margin-bottom:48px;">
          ${eyebrowEl(fields.eyebrow, brand.secondary, brand.bodyFont)}
          ${fields.headline ? `<h2 style="
            font-family:${brand.headingFont};
            font-size:clamp(1.8rem,3.5vw,2.8rem);
            font-weight:700;
            color:${brand.text};
            margin:0;
            line-height:1.15;
            letter-spacing:-0.015em;
          ">${escapeHtml(fields.headline)}</h2>` : ''}
        </div>` : ''}
        <div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:20px;">${tiles}</div>
      `)}
    </section>`;
  },
};

// ─── 13. STATS ────────────────────────────────────────────────────────────
interface StatFields { value?: string; label?: string; prefix?: string; suffix?: string; }
export const stats: BlockDef = {
  type: 'stats',
  label: 'Stats',
  icon: '#',
  category: 'social-proof',
  fields: [
    { key: 'eyebrow',   label: 'Eyebrow',     type: 'text' },
    { key: 'headline',  label: 'Headline',    type: 'text' },
    { key: 'stats',     label: 'Stats JSON',  type: 'richtext' },
    { key: 'columns',   label: 'Columns',     type: 'select', options: ['2','3','4'] },
    { key: 'bgColor',   label: 'Background',  type: 'color' },
    { key: 'textColor', label: 'Text color',  type: 'color' },
  ],
  defaultFields: {
    eyebrow: 'By the numbers',
    headline: '',
    stats: JSON.stringify([
      { value: '12', label: 'Years in business', prefix: '', suffix: '' },
      { value: '4,800', label: 'Projects shipped', prefix: '', suffix: '+' },
      { value: '97', label: 'Client satisfaction', prefix: '', suffix: '%' },
      { value: '24', label: 'Countries served', prefix: '', suffix: '' },
    ]),
    columns: '4',
    bgColor: '',
    textColor: '#ffffff',
  },
  render(fields, brand) {
    const items = parseJsonSafe<StatFields[]>(fields.stats, []);
    const cols = Math.max(1, Math.min(4, parseInt(fields.columns || '4', 10)));
    const bg = fields.bgColor || brand.primary;
    const color = fields.textColor || '#ffffff';
    const tiles = items.map(s => `<div style="text-align:center;">
      ${s.prefix ? `<span style="
        font-family:${brand.bodyFont};
        font-size:1.1rem;
        color:${color};
        opacity:0.75;
        vertical-align:top;
      ">${escapeHtml(s.prefix)}</span>` : ''}
      <span style="
        font-family:${brand.headingFont};
        font-size:clamp(2.2rem,4.5vw,3.6rem);
        font-weight:700;
        color:${color};
        line-height:1;
        letter-spacing:-0.02em;
      ">${escapeHtml(s.value || '')}</span>
      ${s.suffix ? `<span style="
        font-family:${brand.bodyFont};
        font-size:1.4rem;
        font-weight:600;
        color:${color};
        opacity:0.85;
        vertical-align:top;
      ">${escapeHtml(s.suffix)}</span>` : ''}
      <div style="
        font-family:${brand.bodyFont};
        font-size:0.9rem;
        color:${color};
        opacity:0.78;
        margin-top:10px;
        letter-spacing:0.02em;
      ">${escapeHtml(s.label || '')}</div>
    </div>`).join('');
    return `<section style="padding:clamp(60px,8vw,100px) clamp(24px,5vw,48px);background:${bg};">
      ${sectionContainer(`
        ${(fields.eyebrow || fields.headline) ? `<div style="text-align:center;margin-bottom:48px;">
          ${fields.eyebrow ? `<div style="
            font-family:${brand.bodyFont};
            font-size:0.75rem;
            font-weight:700;
            letter-spacing:0.14em;
            text-transform:uppercase;
            color:${color};
            opacity:0.75;
            margin-bottom:12px;
          ">${escapeHtml(fields.eyebrow)}</div>` : ''}
          ${fields.headline ? `<h2 style="
            font-family:${brand.headingFont};
            font-size:clamp(1.6rem,3vw,2.4rem);
            font-weight:700;
            color:${color};
            margin:0;
            line-height:1.15;
          ">${escapeHtml(fields.headline)}</h2>` : ''}
        </div>` : ''}
        <div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:32px;">${tiles}</div>
      `)}
    </section>`;
  },
};

// ─── 14. CTA ──────────────────────────────────────────────────────────────
export const cta: BlockDef = {
  type: 'cta',
  label: 'CTA',
  icon: '→',
  category: 'conversion',
  fields: [
    { key: 'eyebrow',          label: 'Eyebrow',        type: 'text' },
    { key: 'headline',         label: 'Headline',       type: 'text' },
    { key: 'body',             label: 'Body',           type: 'richtext' },
    { key: 'ctaText',          label: 'Primary CTA',    type: 'text' },
    { key: 'ctaUrl',           label: 'Primary URL',    type: 'url' },
    { key: 'ctaSecondaryText', label: 'Secondary CTA',  type: 'text' },
    { key: 'ctaSecondaryUrl',  label: 'Secondary URL',  type: 'url' },
    { key: 'bgColor',          label: 'Background',     type: 'color' },
    { key: 'textColor',        label: 'Text color',     type: 'color' },
    { key: 'layout',           label: 'Layout',         type: 'select', options: ['centered','left-aligned'] },
  ],
  defaultFields: {
    eyebrow: 'Ready to go',
    headline: 'Start building today',
    body: 'No credit card needed. Get started in under five minutes.',
    ctaText: 'Get started',
    ctaUrl: '#',
    ctaSecondaryText: 'Book a demo',
    ctaSecondaryUrl: '#',
    bgColor: '',
    textColor: '#ffffff',
    layout: 'centered',
  },
  render(fields, brand) {
    const bg = fields.bgColor || brand.primary;
    const color = fields.textColor || '#ffffff';
    const centered = fields.layout !== 'left-aligned';
    const align = centered ? 'center' : 'left';
    const pill = (text: string, url: string, primary: boolean) => {
      if (!text) return '';
      return `<a href="${escapeAttr(url || '#')}" style="
        display:inline-block;
        ${primary
          ? `background:#ffffff;color:${bg};`
          : `background:transparent;color:${color};border:2px solid ${color};`}
        font-family:${brand.bodyFont};
        font-size:1rem;
        font-weight:600;
        padding:${primary ? '14px 32px' : '12px 30px'};
        border-radius:6px;
        text-decoration:none;
        letter-spacing:0.01em;
        ${primary ? '' : 'margin-left:12px;'}
      ">${escapeHtml(text)}</a>`;
    };
    return `<section style="padding:clamp(70px,10vw,120px) clamp(24px,5vw,48px);background:${bg};">
      ${sectionContainer(`
        <div style="text-align:${align};max-width:${centered ? '760px;margin:0 auto;' : 'none;'}">
          ${fields.eyebrow ? `<div style="
            font-family:${brand.bodyFont};
            font-size:0.75rem;
            font-weight:700;
            letter-spacing:0.14em;
            text-transform:uppercase;
            color:${color};
            opacity:0.75;
            margin-bottom:14px;
          ">${escapeHtml(fields.eyebrow)}</div>` : ''}
          <h2 style="
            font-family:${brand.headingFont};
            font-size:clamp(2rem,4vw,3.2rem);
            font-weight:700;
            color:${color};
            line-height:1.1;
            letter-spacing:-0.02em;
            margin:0 0 16px;
          ">${escapeHtml(fields.headline)}</h2>
          ${fields.body ? `<p style="
            font-family:${brand.bodyFont};
            font-size:1.1rem;
            color:${color};
            opacity:0.88;
            line-height:1.6;
            margin:0 0 32px;
          ">${escapeHtml(fields.body)}</p>` : ''}
          <div>${pill(fields.ctaText, fields.ctaUrl, true)}${pill(fields.ctaSecondaryText, fields.ctaSecondaryUrl, false)}</div>
        </div>
      `)}
    </section>`;
  },
};

// ─── 15. CTA SPLIT ────────────────────────────────────────────────────────
export const ctaSplit: BlockDef = {
  type: 'cta-split',
  label: 'CTA (split)',
  icon: '→',
  category: 'conversion',
  fields: [
    { key: 'eyebrow',       label: 'Eyebrow',     type: 'text' },
    { key: 'headline',      label: 'Headline',    type: 'text' },
    { key: 'body',          label: 'Body',        type: 'richtext' },
    { key: 'ctaText',       label: 'CTA text',    type: 'text' },
    { key: 'ctaUrl',        label: 'CTA URL',     type: 'url' },
    { key: 'image',         label: 'Image',       type: 'image' },
    { key: 'imagePosition', label: 'Image on',    type: 'select', options: ['right','left'] },
    { key: 'bgColor',       label: 'Background',  type: 'color' },
  ],
  defaultFields: {
    eyebrow: 'About us',
    headline: 'A story you want to be part of',
    body: 'We started because we could not find what we needed, and now we build it for everyone like us.',
    ctaText: 'Read our story',
    ctaUrl: '#',
    image: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=1200&auto=format&fit=crop',
    imagePosition: 'right',
    bgColor: '',
  },
  render(fields, brand) {
    const bg = fields.bgColor || brand.surface;
    const imgRight = fields.imagePosition !== 'left';
    const text = `<div style="
      padding:clamp(40px,6vw,80px);
      display:flex;
      flex-direction:column;
      justify-content:center;
    ">
      ${fields.eyebrow ? eyebrowEl(fields.eyebrow, brand.secondary, brand.bodyFont) : ''}
      <h2 style="
        font-family:${brand.headingFont};
        font-size:clamp(1.8rem,3.6vw,2.8rem);
        font-weight:700;
        color:${brand.text};
        line-height:1.15;
        letter-spacing:-0.015em;
        margin:0 0 18px;
      ">${escapeHtml(fields.headline)}</h2>
      <p style="
        font-family:${brand.bodyFont};
        font-size:1.05rem;
        color:${brand.textLight};
        line-height:1.7;
        margin:0 0 28px;
      ">${escapeHtml(fields.body)}</p>
      <div>${btnPrimary(fields.ctaText, fields.ctaUrl, brand)}</div>
    </div>`;
    const img = `<div style="
      background-image:url('${escapeAttr(fields.image)}');
      background-size:cover;
      background-position:center;
      min-height:360px;
    "></div>`;
    return `<section style="background:${bg};">
      <div style="
        max-width:1280px;
        margin:0 auto;
        display:grid;
        grid-template-columns:1fr 1fr;
        gap:0;
      ">
        ${imgRight ? text + img : img + text}
      </div>
    </section>`;
  },
};

// ─── 16. VIDEO ────────────────────────────────────────────────────────────
export const video: BlockDef = {
  type: 'video',
  label: 'Video',
  icon: '▷',
  category: 'content',
  fields: [
    { key: 'videoUrl',    label: 'Video URL',    type: 'url', placeholder: 'https://www.youtube.com/watch?v=…' },
    { key: 'posterImage', label: 'Poster image', type: 'image' },
    { key: 'caption',     label: 'Caption',      type: 'text' },
    { key: 'width',       label: 'Width',        type: 'select', options: ['full','900px','700px','560px'] },
    { key: 'autoPlay',    label: 'Autoplay',     type: 'select', options: ['no','yes'] },
  ],
  defaultFields: {
    videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    posterImage: 'https://images.unsplash.com/photo-1492724441997-5dc865305da7?w=1200&auto=format&fit=crop',
    caption: '',
    width: '900px',
    autoPlay: 'no',
  },
  render(fields, brand) {
    const mw = fields.width && fields.width !== 'full' ? `max-width:${fields.width};margin-left:auto;margin-right:auto;` : '';
    return `<section style="padding:48px clamp(24px,5vw,48px);background:${brand.background};">
      <div style="${mw}">
        <div style="
          position:relative;
          aspect-ratio:16/9;
          background:${brand.text};
          border-radius:10px;
          overflow:hidden;
          box-shadow:0 8px 28px rgba(0,0,0,0.15);
        " data-acs-video-url="${escapeAttr(fields.videoUrl)}">
          ${fields.posterImage ? `<img src="${escapeAttr(fields.posterImage)}" alt="" style="
            width:100%;height:100%;object-fit:cover;display:block;
          " />` : ''}
          <div style="
            position:absolute;
            inset:0;
            display:flex;
            align-items:center;
            justify-content:center;
            pointer-events:none;
          ">
            <div style="
              width:84px;height:84px;
              border-radius:50%;
              background:rgba(255,255,255,0.92);
              display:flex;
              align-items:center;
              justify-content:center;
              box-shadow:0 4px 20px rgba(0,0,0,0.3);
            ">
              <span style="
                display:block;
                width:0;
                height:0;
                border-left:22px solid ${brand.primary};
                border-top:14px solid transparent;
                border-bottom:14px solid transparent;
                margin-left:5px;
              "></span>
            </div>
          </div>
        </div>
        ${fields.caption ? `<p style="
          font-family:${brand.bodyFont};
          font-size:0.9rem;
          font-style:italic;
          color:${brand.textLight};
          text-align:center;
          margin:14px 0 0;
        ">${escapeHtml(fields.caption)}</p>` : ''}
      </div>
    </section>`;
  },
};

// ─── 17. SPONSOR GRID ─────────────────────────────────────────────────────
interface Sponsor { name?: string; logo?: string; tier?: string; url?: string; }
export const sponsorGrid: BlockDef = {
  type: 'sponsor-grid',
  label: 'Sponsor grid',
  icon: '◆',
  category: 'social-proof',
  fields: [
    { key: 'eyebrow',    label: 'Eyebrow',          type: 'text' },
    { key: 'headline',   label: 'Headline',         type: 'text' },
    { key: 'sponsors',   label: 'Sponsors JSON',    type: 'richtext' },
    { key: 'showTiers',  label: 'Group by tier',    type: 'select', options: ['no','yes'] },
    { key: 'tierLabels', label: 'Tier labels JSON', type: 'richtext' },
    { key: 'bgColor',    label: 'Background',       type: 'color' },
    { key: 'grayscale',  label: 'Grayscale',        type: 'select', options: ['no','yes'] },
  ],
  defaultFields: {
    eyebrow: 'Our partners',
    headline: 'Trusted by the best',
    sponsors: JSON.stringify([
      { name: 'Acme', logo: 'https://dummyimage.com/160x60/2B4030/ffffff&text=ACME', tier: '1', url: '#' },
      { name: 'Bolt', logo: 'https://dummyimage.com/160x60/B8872E/ffffff&text=BOLT', tier: '1', url: '#' },
      { name: 'Cedar', logo: 'https://dummyimage.com/160x60/6B5744/ffffff&text=CEDAR', tier: '2', url: '#' },
      { name: 'Dune',  logo: 'https://dummyimage.com/160x60/CDC5B4/221A10&text=DUNE',  tier: '2', url: '#' },
      { name: 'Echo',  logo: 'https://dummyimage.com/160x60/3A2410/ffffff&text=ECHO',  tier: '3', url: '#' },
      { name: 'Flint', logo: 'https://dummyimage.com/160x60/2A5A6A/ffffff&text=FLINT', tier: '3', url: '#' },
    ]),
    showTiers: 'no',
    tierLabels: '{"1":"Presenting","2":"Gold","3":"Silver"}',
    bgColor: '',
    grayscale: 'yes',
  },
  render(fields, brand) {
    const items = parseJsonSafe<Sponsor[]>(fields.sponsors, []);
    const bg = fields.bgColor || brand.background;
    const gray = fields.grayscale === 'yes';
    const renderLogos = (list: Sponsor[]) => `<div style="
      display:flex;
      flex-wrap:wrap;
      gap:24px;
      justify-content:center;
      align-items:center;
    ">${list.map(s => `<a href="${escapeAttr(s.url || '#')}" style="
      display:flex;
      align-items:center;
      justify-content:center;
      padding:16px 22px;
      background:${brand.surface};
      border-radius:8px;
      min-width:160px;
      min-height:80px;
      text-decoration:none;
    ">
      ${s.logo ? `<img src="${escapeAttr(s.logo)}" alt="${escapeAttr(s.name || '')}" style="
        max-height:52px;
        max-width:160px;
        object-fit:contain;
        ${gray ? 'filter:grayscale(100%);opacity:0.78;' : ''}
      " />` : `<span style="
        font-family:${brand.headingFont};
        font-size:1.1rem;
        font-weight:700;
        color:${brand.text};
      ">${escapeHtml(s.name || '')}</span>`}
    </a>`).join('')}</div>`;
    let body: string;
    if (fields.showTiers === 'yes') {
      const labels = parseJsonSafe<Record<string, string>>(fields.tierLabels, {});
      const byTier = new Map<string, Sponsor[]>();
      items.forEach(s => {
        const t = s.tier || '1';
        if (!byTier.has(t)) byTier.set(t, []);
        byTier.get(t)!.push(s);
      });
      const sortedTiers = Array.from(byTier.keys()).sort();
      body = sortedTiers.map(t => `<div style="margin-bottom:36px;">
        <div style="
          font-family:${brand.bodyFont};
          font-size:0.75rem;
          font-weight:700;
          letter-spacing:0.14em;
          text-transform:uppercase;
          color:${brand.textLight};
          text-align:center;
          margin-bottom:20px;
        ">${escapeHtml(labels[t] || ('Tier ' + t))}</div>
        ${renderLogos(byTier.get(t)!)}
      </div>`).join('');
    } else {
      body = renderLogos(items);
    }
    return `<section style="padding:clamp(60px,8vw,100px) clamp(24px,5vw,48px);background:${bg};">
      ${sectionContainer(`
        ${(fields.eyebrow || fields.headline) ? `<div style="text-align:center;margin-bottom:44px;">
          ${eyebrowEl(fields.eyebrow, brand.secondary, brand.bodyFont)}
          ${fields.headline ? `<h2 style="
            font-family:${brand.headingFont};
            font-size:clamp(1.8rem,3.5vw,2.6rem);
            font-weight:700;
            color:${brand.text};
            margin:0;
            line-height:1.15;
          ">${escapeHtml(fields.headline)}</h2>` : ''}
        </div>` : ''}
        ${body}
      `)}
    </section>`;
  },
};

// ─── 18. DIVIDER ──────────────────────────────────────────────────────────
export const divider: BlockDef = {
  type: 'divider',
  label: 'Divider',
  icon: '—',
  category: 'layout',
  fields: [
    { key: 'style',   label: 'Style',   type: 'select', options: ['line','dots','gradient','space'] },
    { key: 'color',   label: 'Color',   type: 'color' },
    { key: 'spacing', label: 'Spacing', type: 'select', options: ['sm','md','lg','xl'] },
  ],
  defaultFields: { style: 'line', color: '', spacing: 'md' },
  render(fields, brand) {
    const spaceMap = { sm: 20, md: 40, lg: 64, xl: 96 };
    const pad = (spaceMap[(fields.spacing as keyof typeof spaceMap)] || spaceMap.md);
    const c = fields.color || 'rgba(0,0,0,0.12)';
    if (fields.style === 'space') {
      return `<div style="padding:${pad}px 0;"></div>`;
    }
    if (fields.style === 'dots') {
      return `<div style="padding:${pad}px 0;text-align:center;background:${brand.background};">
        <span style="
          display:inline-flex;gap:8px;
        ">${[0,1,2].map(() => `<span style="
          width:6px;height:6px;border-radius:50%;background:${c};
        "></span>`).join('')}</span>
      </div>`;
    }
    if (fields.style === 'gradient') {
      return `<div style="padding:${pad}px clamp(24px,5vw,48px);background:${brand.background};">
        <div style="
          height:2px;
          background:linear-gradient(90deg,transparent 0%,${brand.primary} 50%,transparent 100%);
        "></div>
      </div>`;
    }
    return `<div style="padding:${pad}px clamp(24px,5vw,48px);background:${brand.background};">
      <div style="height:1px;background:${c};"></div>
    </div>`;
  },
};

// ─── 19. FOOTER ───────────────────────────────────────────────────────────
interface FooterColumn { heading?: string; links?: Array<{ text: string; url: string }>; }
interface SocialLinks { twitter?: string; instagram?: string; facebook?: string; youtube?: string; linkedin?: string; }
export const footer: BlockDef = {
  type: 'footer',
  label: 'Footer',
  icon: '⎯',
  category: 'layout',
  fields: [
    { key: 'logoUrl',      label: 'Logo',          type: 'image' },
    { key: 'logoAlt',      label: 'Logo alt',      type: 'text' },
    { key: 'tagline',      label: 'Tagline',       type: 'text' },
    { key: 'columns',      label: 'Columns JSON',  type: 'richtext' },
    { key: 'socialLinks',  label: 'Social JSON',   type: 'richtext' },
    { key: 'copyright',    label: 'Copyright',     type: 'text' },
    { key: 'bgColor',      label: 'Background',    type: 'color' },
    { key: 'textColor',    label: 'Text color',    type: 'color' },
  ],
  defaultFields: {
    logoUrl: '',
    logoAlt: '',
    tagline: 'Built for the work you actually do.',
    columns: JSON.stringify([
      { heading: 'Product', links: [{ text: 'Features', url: '#' }, { text: 'Pricing', url: '#' }, { text: 'Changelog', url: '#' }] },
      { heading: 'Company', links: [{ text: 'About', url: '#' }, { text: 'Careers', url: '#' }, { text: 'Press', url: '#' }] },
      { heading: 'Resources', links: [{ text: 'Blog', url: '#' }, { text: 'Guides', url: '#' }, { text: 'Support', url: '#' }] },
    ]),
    socialLinks: '{"twitter":"#","instagram":"#","linkedin":"#"}',
    copyright: '© 2026 Your Company. All rights reserved.',
    bgColor: '',
    textColor: '#E8E8E6',
  },
  render(fields, brand) {
    const bg = fields.bgColor || brand.text;
    const color = fields.textColor || '#E8E8E6';
    const cols = parseJsonSafe<FooterColumn[]>(fields.columns, []);
    const social = parseJsonSafe<SocialLinks>(fields.socialLinks, {});
    const socialIcon = (label: string, url: string) => `<a href="${escapeAttr(url)}" style="
      display:inline-flex;
      width:36px;height:36px;
      border-radius:50%;
      background:rgba(255,255,255,0.08);
      color:${color};
      align-items:center;
      justify-content:center;
      text-decoration:none;
      font-family:${brand.bodyFont};
      font-size:0.7rem;
      font-weight:700;
      letter-spacing:0.05em;
      text-transform:uppercase;
    ">${escapeHtml(label)}</a>`;
    const socialRow = [
      social.twitter && socialIcon('TW', social.twitter),
      social.instagram && socialIcon('IG', social.instagram),
      social.facebook && socialIcon('FB', social.facebook),
      social.youtube && socialIcon('YT', social.youtube),
      social.linkedin && socialIcon('IN', social.linkedin),
    ].filter(Boolean).join('');
    const logoHtml = fields.logoUrl
      ? `<img src="${escapeAttr(fields.logoUrl)}" alt="${escapeAttr(fields.logoAlt)}" style="height:32px;display:block;margin-bottom:16px;" />`
      : `<div style="
          font-family:${brand.headingFont};
          font-size:1.35rem;
          font-weight:700;
          color:${color};
          margin-bottom:16px;
          letter-spacing:-0.01em;
        ">${escapeHtml(brand.siteName || 'Brand')}</div>`;
    const columnsHtml = cols.map(col => `<div>
      <div style="
        font-family:${brand.bodyFont};
        font-size:0.75rem;
        font-weight:700;
        letter-spacing:0.12em;
        text-transform:uppercase;
        color:${color};
        opacity:0.75;
        margin-bottom:14px;
      ">${escapeHtml(col.heading || '')}</div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${(col.links || []).map(l => `<a href="${escapeAttr(l.url)}" style="
          color:${color};
          opacity:0.85;
          font-family:${brand.bodyFont};
          font-size:0.9rem;
          text-decoration:none;
        ">${escapeHtml(l.text)}</a>`).join('')}
      </div>
    </div>`).join('');
    return `<footer style="background:${bg};">
      <div style="max-width:1280px;margin:0 auto;padding:72px clamp(24px,5vw,48px) 36px;">
        <div style="
          display:grid;
          grid-template-columns:1.5fr repeat(${Math.max(1, cols.length)}, 1fr);
          gap:48px;
          margin-bottom:48px;
        ">
          <div>
            ${logoHtml}
            ${fields.tagline ? `<p style="
              font-family:${brand.bodyFont};
              font-size:0.95rem;
              color:${color};
              opacity:0.8;
              line-height:1.6;
              margin:0 0 20px;
              max-width:280px;
            ">${escapeHtml(fields.tagline)}</p>` : ''}
            ${socialRow ? `<div style="display:flex;gap:8px;">${socialRow}</div>` : ''}
          </div>
          ${columnsHtml}
        </div>
        <div style="
          border-top:1px solid rgba(255,255,255,0.08);
          padding-top:24px;
          display:flex;
          justify-content:space-between;
          align-items:center;
          font-family:${brand.bodyFont};
          font-size:0.85rem;
          color:${color};
          opacity:0.65;
        ">
          <span>${escapeHtml(fields.copyright)}</span>
        </div>
      </div>
    </footer>`;
  },
};

// ─── 20. RAW HTML ─────────────────────────────────────────────────────────
export const rawHtml: BlockDef = {
  type: 'raw-html',
  label: 'Raw HTML',
  icon: '</>',
  category: 'content',
  fields: [
    { key: 'html', label: 'HTML', type: 'richtext', placeholder: '<div>...</div>' },
  ],
  defaultFields: {
    html: '<div style="padding:48px;text-align:center;font-family:system-ui,sans-serif;"><h2>Raw HTML block</h2><p>Anything you drop in here renders as-is. No brand styling applied.</p></div>',
  },
  render(fields /*, brand */) {
    // Deliberately un-styled — the escape hatch for unclassifiable content.
    return String(fields.html || '');
  },
};
