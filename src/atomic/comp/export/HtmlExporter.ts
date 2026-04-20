// Produces a standalone HTML file from a comp's blocks + brand.
// Used by the Export HTML button (client-side) and any future server-side
// export — the function is environment-neutral.

import type { Block } from '../blocks/definitions/types';
import type { BrandConfig } from '../brand/BrandConfig';
import { getBlockDef } from '../blocks';

function escape(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderBlocksHtml(blocks: Block[], brand: BrandConfig): string {
  return (blocks || []).map((block) => {
    if ((block as any).screenshotUrl) {
      return `<img src="${escape((block as any).screenshotUrl)}" style="width:100%;display:block;" alt="" />`;
    }
    const def = getBlockDef(block.type);
    if (!def) return '';
    try { return def.render(block.fields || {}, brand); }
    catch (e) { console.error('[atomic-comp export]', block.type, e); return ''; }
  }).join('\n');
}

export function buildStandaloneHtml(opts: {
  name: string;
  blocks: Block[];
  brand: BrandConfig;
}): string {
  const { name, blocks, brand } = opts;
  const body = renderBlocksHtml(blocks, brand);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escape(name || 'Comp')}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; }
  body {
    font-family: ${brand.bodyFont || 'system-ui, -apple-system, sans-serif'};
    background: ${brand.background || '#ffffff'};
    color: ${brand.text || '#111'};
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }
  img { max-width: 100%; height: auto; display: block; }
  a { color: inherit; }
</style>
</head>
<body>
${body}
</body>
</html>`;
}

export function slugifyName(s: string): string {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'comp';
}

// Triggers a browser download of the standalone HTML file. No-op on server.
export function downloadHtmlBlob(opts: { name: string; blocks: Block[]; brand: BrandConfig }): void {
  if (typeof document === 'undefined') return;
  const html = buildStandaloneHtml(opts);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slugifyName(opts.name)}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
