import { getSessionUser, json, generateId } from '../../_utils';
import type { Env } from '../../_utils';
import { callOpenRouterJson, normalizeBrand, normalizeBlocks, BLOCK_TYPES_LIST } from './_ai-utils';

// POST /api/atomic/comp/import-url
// Body: { url }
// Fetches the URL, asks the model for { brand, blocks }, creates a comp,
// returns { comp_id, brand, blocks, block_count }.
export async function onRequestPost(context: { request: Request; env: Env }) {
  const user = await getSessionUser(context.request, context.env);
  if (!user) return json({ error: 'Not authenticated' }, 401);
  const account_id = user.account_id || 'makerfrontier';

  let body: any = {};
  try { body = await context.request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const url = typeof body.url === 'string' ? body.url.trim() : '';
  if (!url) return json({ error: 'url is required' }, 400);
  try { new URL(url); } catch { return json({ error: 'Invalid URL' }, 400); }

  // 1. Fetch the page HTML
  let html: string;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SubMoa-AtomicComp/1.0)' },
      signal: AbortSignal.timeout(15000),
      redirect: 'follow',
    });
    if (!res.ok) return json({ error: `Target returned HTTP ${res.status}` }, 422);
    html = await res.text();
  } catch (e: any) {
    return json({ error: `Could not fetch URL: ${e?.message || e}` }, 422);
  }

  const htmlTrunc = html.slice(0, 80000);

  // 2. Single-shot extraction: brand + blocks in one structured JSON call.
  const prompt = `You are analyzing a web page to create an editable comp.

URL: ${url}
HTML (truncated to 80KB):
${htmlTrunc}

Return a JSON object with two keys: "brand" and "blocks".

BRAND — extract from the HTML:
{
  "primary": "#hex — the main brand accent (buttons, links, highlights)",
  "secondary": "#hex — secondary accent or slightly darker primary",
  "background": "#hex — page background color",
  "surface": "#hex — card/panel background, slightly different from background",
  "text": "#hex — main body text color",
  "textLight": "#hex — muted/secondary text",
  "headingFont": "CSS font-family for headings with fallbacks",
  "bodyFont": "CSS font-family for body text with fallbacks",
  "logoUrl": "absolute URL of the logo image, or empty string",
  "siteName": "the site or brand name"
}

BLOCKS — array of block objects matching the visible page sections.
Available block types: ${BLOCK_TYPES_LIST}

For each block: { "type": "block-type", "fields": { ...field values matching the type } }

Rules:
- Extract REAL text content from the HTML — actual headlines, body copy, nav labels.
- For images, use actual src URLs from the HTML (make them absolute).
- If you cannot find a real image URL in the HTML for a given field,
  use a Picsum seeded placeholder: https://picsum.photos/seed/{word}/{w}/{h}
  Pick a seed word that matches the content theme (e.g. "racing", "trail",
  "team", "product", "event"). Picsum URLs always resolve.
  NEVER generate images.unsplash.com URLs — they require real photo IDs
  and will 404 if invented.
- card-grid and article-grid: extract the grid's cards/articles as a JSON string in the "cards" or "articles" field.
- nav: "links" field is a JSON string of [{text,url}].
- footer: "columns" field is a JSON string of [{heading, links:[{text,url}]}].
- Cap at 15 blocks — pick the most important sections.
- If a section doesn't match any block type, use raw-html with the section's outerHTML (max 2000 chars).
- Skip cookie banners, popups, modals, newsletter overlays, ad units.

Return ONLY valid JSON. No markdown, no explanation.`;

  let result: any;
  try {
    result = await callOpenRouterJson(context.env, {
      messages: [{ role: 'user', content: prompt }],
      xTitle: 'Atomic Comp - URL Import',
      maxTokens: 8000,
    });
  } catch (e: any) {
    return json({ error: `AI analysis failed: ${e?.message || e}` }, 500);
  }

  const brand = normalizeBrand(result?.brand);
  const blocks = normalizeBlocks(result?.blocks, 15);

  if (!blocks.length) return json({ error: 'No blocks extracted from page' }, 422);

  const compId = generateId();
  const now = Math.floor(Date.now() / 1000);
  const compName = (brand.siteName || safeHostname(url)).slice(0, 160);
  try {
    await context.env.submoacontent_db
      .prepare(`INSERT INTO atomic_comp_drafts
                (id, account_id, name, blocks_json, brand_json, source_url, share_token, share_enabled, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, NULL, 0, ?, ?)`)
      .bind(compId, account_id, compName, JSON.stringify(blocks), JSON.stringify(brand), url, now, now)
      .run();
  } catch (err: any) {
    return json({ error: `DB insert failed: ${err?.message || err}` }, 500);
  }

  return json({ comp_id: compId, brand, blocks, block_count: blocks.length });
}

function safeHostname(u: string): string {
  try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return 'Imported'; }
}
