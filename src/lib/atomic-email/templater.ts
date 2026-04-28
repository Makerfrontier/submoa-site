// Templater — substitutes field values into the parser's templated source HTML.
//
// Two substitution mechanisms, matching what parser.ts emits:
//
//   1. Inline content markers:
//      <!--ae:open:field-001-->...<!--ae:close:field-001-->
//      The substring between markers is replaced with the field's current
//      content. For HEADLINE/BODY/LINK/CTA, the value is the field's text
//      (or html for body). Markers themselves are PRESERVED in the template
//      DB row so subsequent edits don't compound.
//
//   2. Attribute markers (for IMAGE):
//      <img data-ae-field-id="field-007" src="..." alt="...">
//      <a   data-ae-link-id="field-007"  href="...">         <!-- only when wrapped_in_link -->
//      We rewrite the listed attributes via DOM-aware regex (img is void so
//      can't host inline content markers). The data-ae-* attrs are PRESERVED
//      in the template; export-time strip happens in stripInjections().
//
// Edits are performed against the stored template, not the source HTML, so
// repeated edits don't accumulate transformations.

import type { Field } from './field-types';

const escapeAttr = (s: string) => String(s ?? '').replace(/"/g, '&quot;');

export function renderTemplate(template: string, fields: Field[]): string {
  let out = template;

  for (const f of fields) {
    const id = f.id;
    if (f.type === 'image') {
      // Replace src/alt/width/height on the img tagged data-ae-field-id="id"
      out = rewriteAttributes(out, `data-ae-field-id="${id}"`, {
        src: f.src,
        alt: f.alt,
        width: f.width,
        height: f.height,
      });
      if (f.wrapped_in_link && f.link_href !== null) {
        out = rewriteAttributes(out, `data-ae-link-id="${id}"`, {
          href: f.link_href,
          target: f.link_target || undefined,
        });
      }
      continue;
    }

    // Body fields use per-segment markers so inline link slots survive edits.
    if (f.type === 'body') {
      for (const seg of f.segments) {
        if (seg.kind !== 'text') continue;
        const open = `<!--ae:btxt:${id}:${seg.index}:open-->`;
        const close = `<!--ae:btxt:${id}:${seg.index}:close-->`;
        out = replaceBetween(out, open, close, seg.html ?? '');
      }
      continue;
    }

    // Content-marker fields (headline, link, cta)
    const open = `<!--ae:open:${id}-->`;
    const close = `<!--ae:close:${id}-->`;
    let content = '';
    if (f.type === 'headline')      content = f.raw_html ?? f.text ?? '';
    else if (f.type === 'link' || f.type === 'cta') content = escapeForAnchorBody(f.text ?? '');
    out = replaceBetween(out, open, close, content);

    if (f.type === 'link' || f.type === 'cta') {
      // Update href on the same element
      const updates: Record<string, string | undefined> = {
        href: f.href,
        target: f.target || undefined,
        rel: f.rel || undefined,
      };
      if (f.type === 'cta') updates.style = f.button_style || undefined;
      out = rewriteAttributes(out, `data-ae-field-id="${id}"`, updates);
    }
  }

  return out;
}

// Strip injection-only attributes and content markers — used for final export.
export function stripInjections(html: string): string {
  let out = html;
  // Remove ae open/close markers (headline/link/cta)
  out = out.replace(/<!--ae:(open|close):field-\d+-->/g, '');
  // Remove ae body-text markers
  out = out.replace(/<!--ae:btxt:field-\d+:\d+:(open|close)-->/g, '');
  // Remove data-ae-field-id and data-ae-link-id attributes
  out = out.replace(/\s+data-ae-(field|link)-id="field-\d+"/g, '');
  return out;
}

function replaceBetween(html: string, open: string, close: string, replacement: string): string {
  const i = html.indexOf(open);
  if (i === -1) return html;
  const j = html.indexOf(close, i + open.length);
  if (j === -1) return html;
  return html.slice(0, i + open.length) + replacement + html.slice(j);
}

// Rewrite specified attributes on the element matched by `marker` (a string
// of the form `data-ae-field-id="field-007"`). For each attribute in updates:
//   - if value is undefined, attribute is REMOVED
//   - if attribute already present, value is replaced
//   - if attribute missing and value provided, attribute is APPENDED
function rewriteAttributes(html: string, marker: string, updates: Record<string, string | undefined>): string {
  const idx = html.indexOf(marker);
  if (idx === -1) return html;
  // Find tag start (`<`) walking backward and tag end walking forward, taking
  // care to not match across previous tags. The marker is unique-per-element
  // so the surrounding `<…>` is the right tag.
  let start = idx;
  while (start > 0 && html[start] !== '<') start--;
  let end = idx;
  while (end < html.length && html[end] !== '>') end++;
  if (start < 0 || end >= html.length) return html;
  // Self-closing tags end with /> — preserve.
  let tagEndIdx = end;
  let selfClose = html[end - 1] === '/';
  let inner = html.slice(start, end + 1);

  for (const [k, v] of Object.entries(updates)) {
    const re = new RegExp(`(\\s)${k}\\s*=\\s*("[^"]*"|'[^']*')`, 'i');
    if (v === undefined) {
      inner = inner.replace(re, '');
      continue;
    }
    const repl = `$1${k}="${escapeAttr(v)}"`;
    if (re.test(inner)) {
      inner = inner.replace(re, repl);
    } else {
      // Insert before final `>` (or `/>`)
      const tail = selfClose ? ' />' : '>';
      inner = inner.slice(0, inner.length - tail.length) + ` ${k}="${escapeAttr(v)}"` + tail;
    }
  }
  return html.slice(0, start) + inner + html.slice(end + 1);
}

// Anchor body is treated as plain text for now (no inline HTML inside link
// labels). User edits the visible label only; rich content inside anchors is
// preserved by the inline-marker mechanism if the source had it.
function escapeForAnchorBody(s: string): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
