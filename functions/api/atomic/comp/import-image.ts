import { getSessionUser, json, generateId } from '../../_utils';
import type { Env } from '../../_utils';
import { callOpenRouterJson, normalizeBrand, normalizeBlocks, BLOCK_TYPES_LIST } from './_ai-utils';

// POST /api/atomic/comp/import-image
// multipart/form-data with field "file" (image/* or application/pdf, max 20 MB).
// Uses a vision-capable model to classify the design into blocks + brand.
const MAX_BYTES = 20 * 1024 * 1024;

export async function onRequestPost(context: { request: Request; env: Env }) {
  const user = await getSessionUser(context.request, context.env);
  if (!user) return json({ error: 'Not authenticated' }, 401);
  const account_id = user.account_id || 'makerfrontier';

  let form: FormData;
  try { form = await context.request.formData(); }
  catch { return json({ error: 'Expected multipart/form-data' }, 400); }

  const file = form.get('file');
  if (!(file instanceof File)) return json({ error: 'Missing "file"' }, 400);
  if (file.size === 0) return json({ error: 'Empty file' }, 400);
  if (file.size > MAX_BYTES) return json({ error: `File too large (max ${MAX_BYTES / 1024 / 1024} MB)` }, 413);
  const mime = (file.type || '').toLowerCase();
  const isImage = mime.startsWith('image/');
  const isPdf = mime === 'application/pdf';
  if (!isImage && !isPdf) return json({ error: 'Only images or PDFs accepted' }, 415);

  // Convert to base64 without the common btoa(fromCharCode) pitfall by
  // using chunked Uint8Array → binary conversion.
  const buf = await file.arrayBuffer();
  const base64 = bytesToBase64(new Uint8Array(buf));

  const prompt = `You are analyzing a screenshot or design mockup of a web page.
Identify every visible section and generate block definitions.

Available block types: ${BLOCK_TYPES_LIST}

Return a JSON object:
{
  "brand": {
    "primary": "#hex — dominant brand accent color visible in the design",
    "secondary": "#hex",
    "background": "#hex — page background",
    "surface": "#hex — card backgrounds",
    "text": "#hex — body text color",
    "textLight": "#hex — muted text",
    "headingFont": "font-family string with fallbacks",
    "bodyFont": "font-family string with fallbacks",
    "logoUrl": "",
    "siteName": "site name visible in the design (or empty)"
  },
  "blocks": [
    { "type":"block-type", "fields": { ...field values } }
  ]
}

Rules:
- Write REAL content based on what you can read in the image — actual headlines, copy, nav labels.
- For images you can't extract: use https://images.unsplash.com/photo-{relevant-id}?w=1200&auto=format&fit=crop
- Pick brand colors from what's actually visible in the design.
- Limit to 12 blocks. Skip cookie banners and popups.
- For fields that expect a JSON string (nav.links, card-grid.cards, footer.columns, testimonial-grid.testimonials),
  return a JSON-serialized string (not a raw array).
Return ONLY valid JSON. No markdown.`;

  const imgDataUrl = `data:${isPdf ? 'application/pdf' : mime};base64,${base64}`;
  let result: any;
  try {
    result = await callOpenRouterJson(context.env, {
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: imgDataUrl } },
          { type: 'text', text: prompt },
        ],
      }],
      xTitle: 'Atomic Comp - Image Import',
      maxTokens: 6000,
    });
  } catch (e: any) {
    return json({ error: `Analysis failed: ${e?.message || e}` }, 500);
  }

  const brand = normalizeBrand(result?.brand);
  const blocks = normalizeBlocks(result?.blocks, 12);
  if (!blocks.length) return json({ error: 'No blocks extracted from design' }, 422);

  const compId = generateId();
  const now = Math.floor(Date.now() / 1000);
  const name = `Imported: ${(file.name || 'design').slice(0, 120)}`;
  try {
    await context.env.submoacontent_db
      .prepare(`INSERT INTO atomic_comp_drafts
                (id, account_id, name, blocks_json, brand_json, source_url, share_token, share_enabled, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, NULL, NULL, 0, ?, ?)`)
      .bind(compId, account_id, name, JSON.stringify(blocks), JSON.stringify(brand), now, now)
      .run();
  } catch (err: any) {
    return json({ error: `DB insert failed: ${err?.message || err}` }, 500);
  }

  return json({ comp_id: compId, brand, blocks, block_count: blocks.length });
}

// Chunked Uint8Array → base64. Avoids the stack-overflow risk of
// String.fromCharCode.apply on large buffers.
function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK) as unknown as number[]);
  }
  return btoa(binary);
}
