// HTML parser for Atomic Email.
//
// Walks the DOM via node-html-parser and emits two artifacts:
//   1. fields: ordered list of editable fields (HEADLINE / BODY / IMAGE / LINK / CTA)
//   2. source_html_template: the original HTML with content-replaceable
//      regions wrapped in marker comments / attributes that the templater
//      substitutes during render and export.
//
// Walk is 2-pass:
//   Pass A — pre-collect anchors that wrap an <img>. Mark them claimed so the
//            anchor doesn't surface as its own LINK field; the wrapping link's
//            href is folded into the IMAGE field's link_href instead.
//   Pass B — walk in DOM order, emit fields, inject markers.
//
// Template tokens that must be PRESERVED on round-trip (don't surface as fields,
// don't strip from raw_html):
//   *|MERGE_TAG|*               (Mailchimp)
//   {{ var }} / {{ block }}     (Klaviyo, Handlebars, Liquid)
//   {% if %} / {% block %}      (Liquid, Jinja-ish)

import { parse, HTMLElement, Node, NodeType } from 'node-html-parser';
import type { BodySegment, Field, ParsedProject } from './field-types';

const HEADLINE_TAGS = new Set(['h1', 'h2', 'h3']);

const TEMPLATE_TOKEN_PATTERNS: RegExp[] = [
  /\*\|[A-Z0-9_:]+\|\*/g,
  /\{\{[\s\S]*?\}\}/g,
  /\{%[\s\S]*?%\}/g,
];

function visibleText(s: string): string {
  let t = s || '';
  for (const re of TEMPLATE_TOKEN_PATTERNS) t = t.replace(re, '');
  return t.replace(/\s+/g, ' ').trim();
}

function parseInlineStyle(styleStr: string | undefined | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!styleStr) return out;
  for (const decl of String(styleStr).split(';')) {
    const idx = decl.indexOf(':');
    if (idx === -1) continue;
    const k = decl.slice(0, idx).trim().toLowerCase();
    const v = decl.slice(idx + 1).trim();
    if (k) out[k] = v;
  }
  return out;
}

function looksLikeCTA(anchor: HTMLElement): boolean {
  const cls = String(anchor.getAttribute('class') || '').toLowerCase();
  if (/\b(btn|button|cta)\b/.test(cls)) return true;
  const style = parseInlineStyle(anchor.getAttribute('style'));
  const hasBg = !!(style['background-color'] || style['background']);
  const padPx = parseFloat(style['padding'] || '');
  const hasPad = !isNaN(padPx) && padPx >= 8;
  const hasRadius = !!style['border-radius'];
  if (hasBg && (hasPad || hasRadius)) return true;
  const parent = anchor.parentNode as HTMLElement | null;
  if (parent && parent.tagName && parent.tagName.toLowerCase() === 'td') {
    const ps = parseInlineStyle(parent.getAttribute('style'));
    const pcls = String(parent.getAttribute('class') || '').toLowerCase();
    const parentBg = !!(ps['background-color'] || ps['background']) || /\b(btn|button|cta)\b/.test(pcls);
    const parentRadius = !!ps['border-radius'] || /\b(btn|button|cta)\b/.test(pcls);
    if (parentBg && parentRadius) return true;
  }
  return false;
}

function domPath(node: HTMLElement, root: HTMLElement): string {
  const segs: string[] = [];
  let cur: any = node;
  while (cur && cur !== root) {
    const t: string = cur.tagName ? cur.tagName.toLowerCase() : '';
    if (!t) { cur = cur.parentNode; continue; }
    let siblingIdx = 1;
    let prev: any = cur.previousElementSibling;
    while (prev) {
      if (prev.tagName && prev.tagName.toLowerCase() === t) siblingIdx++;
      prev = prev.previousElementSibling;
    }
    segs.unshift(`${t}:nth-of-type(${siblingIdx})`);
    cur = cur.parentNode;
  }
  return segs.join(' > ');
}

function* walkElements(node: Node | null): Generator<HTMLElement> {
  if (!node) return;
  const el = node as any;
  if (el.nodeType === NodeType.ELEMENT_NODE && el.tagName) {
    yield el as HTMLElement;
  }
  for (const c of (el.childNodes || []) as Node[]) yield* walkElements(c);
}

// Pass A: find anchors wrapping a single <img> so we don't double-surface them.
function preclaimImageWrappingAnchors(root: HTMLElement): Set<HTMLElement> {
  const claimed = new Set<HTMLElement>();
  for (const el of walkElements(root)) {
    if (el.tagName?.toLowerCase() !== 'a') continue;
    const children = el.childNodes.filter((c: any) => {
      if (c.nodeType === NodeType.TEXT_NODE) return (c.rawText || '').trim().length > 0;
      if (c.nodeType === NodeType.ELEMENT_NODE) return c.tagName?.toLowerCase() !== 'br';
      return false;
    });
    const onlyChild = children.length === 1 ? (children[0] as any) : null;
    if (onlyChild && onlyChild.tagName?.toLowerCase() === 'img') {
      claimed.add(el);
    }
  }
  return claimed;
}

// Marker tokens written into the templated HTML.
//  - For headline/link/cta content: <!--ae:open:field-001-->...<!--ae:close:field-001-->
//  - For attribute values:  data-ae-field-id="{id}" on the same element
//  - For body text segments: <!--ae:btxt:field-001:0:open-->text<!--ae:btxt:field-001:0:close-->
//    Each text span between/around inline anchors gets its own marker pair so
//    inline links can be substituted independently.
const OPEN = (id: string) => `<!--ae:open:${id}-->`;
const CLOSE = (id: string) => `<!--ae:close:${id}-->`;
const BTXT_OPEN = (id: string, idx: number) => `<!--ae:btxt:${id}:${idx}:open-->`;
const BTXT_CLOSE = (id: string, idx: number) => `<!--ae:btxt:${id}:${idx}:close-->`;

export function parseEmail(html: string): ParsedProject {
  // Some emails arrive without <html>/<body> scaffolding (or as fragments).
  // node-html-parser is lenient enough to walk fragments; we don't auto-wrap
  // because re-serialization of an injected <html><body> would change byte
  // output.
  const root = parse(html, {
    lowerCaseTagName: false,
    comment: true,
    blockTextElements: { script: true, style: true, pre: true, noscript: true },
  });

  const claimedAnchors = preclaimImageWrappingAnchors(root as any);

  const fields: Field[] = [];
  let counter = 0;
  const setId = (el: HTMLElement, id: string) => {
    // Stamp a data-ae-field-id attribute on the field's owning element so the
    // browser-side preview can correlate clicks → field cards. Stripped on export.
    el.setAttribute('data-ae-field-id', id);
  };

  for (const el of walkElements(root as any)) {
    const tag = el.tagName?.toLowerCase() || '';

    // HEADLINE
    if (HEADLINE_TAGS.has(tag)) {
      const inner = el.innerHTML;
      const text = visibleText(inner.replace(/<[^>]+>/g, ''));
      if (!text) continue;
      counter++;
      const id = `field-${String(counter).padStart(3, '0')}`;
      // Wrap inner content with markers
      el.set_content(OPEN(id) + inner + CLOSE(id));
      setId(el, id);
      fields.push({
        id,
        type: 'headline',
        level: tag as 'h1' | 'h2' | 'h3',
        text,
        raw_html: inner,
        dom_path: domPath(el, root as any),
      });
      continue;
    }

    // BODY <p>
    if (tag === 'p') {
      const inner = el.innerHTML;
      const visible = visibleText(inner.replace(/<[^>]+>/g, ' '));
      if (!visible) continue;
      counter++;
      const id = `field-${String(counter).padStart(3, '0')}`;

      // Walk children to build segments. For each text node and inline non-
      // anchor element, emit a text segment. For each non-claimed <a>, emit
      // a link segment with a pre-allocated link field id matching what the
      // outer walker will assign next.
      const segments: BodySegment[] = [];
      const newInnerParts: string[] = [];
      let textIdx = 0;
      let upcomingCounter = counter;
      for (const c of (el.childNodes as any[])) {
        const ctype: number = c.nodeType;
        const childTag: string | undefined = c.tagName?.toLowerCase?.();
        if (childTag === 'a' && !claimedAnchors.has(c)) {
          // Anchor: walker will assign it a LINK field id when it visits.
          // Pre-allocate matching id here.
          upcomingCounter++;
          const linkId = `field-${String(upcomingCounter).padStart(3, '0')}`;
          segments.push({ kind: 'link', field_id: linkId });
          newInnerParts.push(c.toString());
        } else if (ctype === NodeType.TEXT_NODE) {
          const t = (c.rawText as string) || '';
          if (!t.length) continue;
          const idx = textIdx++;
          segments.push({ kind: 'text', index: idx, html: t });
          newInnerParts.push(BTXT_OPEN(id, idx) + t + BTXT_CLOSE(id, idx));
        } else if (ctype === NodeType.ELEMENT_NODE) {
          // Inline element that isn't an anchor (or is a claimed anchor):
          // <strong>, <em>, <br>, <span>, image-wrapping <a>. Preserve raw
          // HTML in a text segment. Edits via the textarea will lose nested
          // tags (limitation), but bare text round-trips fine.
          const idx = textIdx++;
          const html = c.toString();
          segments.push({ kind: 'text', index: idx, html });
          newInnerParts.push(BTXT_OPEN(id, idx) + html + BTXT_CLOSE(id, idx));
        }
      }

      el.set_content(newInnerParts.join(''));
      setId(el, id);
      fields.push({
        id,
        type: 'body',
        segments,
        text_preview: visible.slice(0, 200),
        dom_path: domPath(el, root as any),
      });
      continue;
    }

    // IMAGE
    if (tag === 'img') {
      const src = el.getAttribute('src') || '';
      const isDataUri = /^data:/i.test(src);
      const parent = el.parentNode as HTMLElement | null;
      const wrapped = !!(parent && parent.tagName?.toLowerCase() === 'a' && claimedAnchors.has(parent));
      counter++;
      const id = `field-${String(counter).padStart(3, '0')}`;
      // For images we don't wrap inner content (img is void); we substitute via
      // attribute swap. The templater finds [data-ae-field-id="field-id"] and
      // updates `src`/`alt`/`width`/`height` from the field record.
      setId(el, id);
      const linkHref = wrapped ? (parent!.getAttribute('href') || '') : null;
      const linkTarget = wrapped ? (parent!.getAttribute('target') || '') : null;
      if (wrapped) {
        // Stamp the wrapping anchor too so its href update is also targeted.
        parent!.setAttribute('data-ae-link-id', id);
      }
      fields.push({
        id,
        type: 'image',
        src,
        alt: el.getAttribute('alt') || '',
        width: el.getAttribute('width') || '',
        height: el.getAttribute('height') || '',
        wrapped_in_link: wrapped,
        link_href: linkHref,
        link_target: linkTarget,
        is_data_uri: isDataUri,
        dom_path: domPath(el, root as any),
      });
      continue;
    }

    // LINK / CTA
    if (tag === 'a') {
      if (claimedAnchors.has(el)) continue;
      const inner = el.innerHTML;
      const text = visibleText(inner.replace(/<[^>]+>/g, ''));
      const href = el.getAttribute('href') || '';
      if (!text && !href) continue;
      counter++;
      const id = `field-${String(counter).padStart(3, '0')}`;
      const isCta = looksLikeCTA(el);
      // Wrap inner content for editable text + stamp id for href substitution
      el.set_content(OPEN(id) + inner + CLOSE(id));
      setId(el, id);
      fields.push(
        isCta ? {
          id,
          type: 'cta',
          text,
          href,
          target: el.getAttribute('target') || '',
          rel: el.getAttribute('rel') || '',
          button_style: el.getAttribute('style') || '',
          dom_path: domPath(el, root as any),
        } : {
          id,
          type: 'link',
          text,
          href,
          target: el.getAttribute('target') || '',
          rel: el.getAttribute('rel') || '',
          dom_path: domPath(el, root as any),
        }
      );
    }
  }

  const source_html_template = (root as any).toString();
  return { fields, source_html_template };
}
