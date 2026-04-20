import { getSessionUser, json, generateId } from '../../_utils';
import type { Env } from '../../_utils';
import { callOpenRouterJson, normalizeBrand, normalizeBlocks, BLOCK_TYPES_LIST, DEFAULT_BRAND } from './_ai-utils';

// POST /api/atomic/comp/generate-brief
// Body: {
//   brandUrl?, siteName, pageType, pageTitle, targetAudience, keyMessage,
//   tone, sections[], additionalContext?
// }
// Returns { comp_id, brand, blocks, block_count }.
export async function onRequestPost(context: { request: Request; env: Env }) {
  const user = await getSessionUser(context.request, context.env);
  if (!user) return json({ error: 'Not authenticated' }, 401);
  const account_id = user.account_id || 'makerfrontier';

  let body: any = {};
  try { body = await context.request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const brandUrl = typeof body.brandUrl === 'string' ? body.brandUrl.trim() : '';
  const siteName = String(body.siteName || '').trim().slice(0, 120);
  const pageType = String(body.pageType || 'Landing Page').trim().slice(0, 60);
  const pageTitle = String(body.pageTitle || '').trim().slice(0, 160);
  const targetAudience = String(body.targetAudience || '').trim().slice(0, 400);
  const keyMessage = String(body.keyMessage || '').trim().slice(0, 400);
  const tone = String(body.tone || 'Professional').trim().slice(0, 40);
  const sections = Array.isArray(body.sections) ? body.sections.filter((s: any) => typeof s === 'string') : [];
  const additionalContext = String(body.additionalContext || '').trim().slice(0, 1200);

  if (!pageTitle) return json({ error: 'pageTitle is required' }, 400);
  if (sections.length === 0) return json({ error: 'At least one section is required' }, 400);

  // Optional brand extraction from a supplied URL.
  let brand = { ...DEFAULT_BRAND };
  if (brandUrl) {
    try {
      const res = await fetch(brandUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SubMoa-AtomicComp/1.0)' },
        signal: AbortSignal.timeout(10000),
        redirect: 'follow',
      });
      if (res.ok) {
        const html = (await res.text()).slice(0, 40000);
        const extracted = await callOpenRouterJson(context.env, {
          messages: [{
            role: 'user',
            content: `Extract brand config from this HTML. Return JSON only:
{ "primary":"#hex","secondary":"#hex","background":"#hex","surface":"#hex","text":"#hex","textLight":"#hex","headingFont":"CSS font-family","bodyFont":"CSS font-family","logoUrl":"absolute URL or empty","siteName":"brand name" }

HTML:
${html}`,
          }],
          xTitle: 'Atomic Comp - Brand Extract',
          maxTokens: 600,
        });
        brand = normalizeBrand(extracted);
      }
    } catch {
      // Non-fatal — keep defaults.
    }
  }
  if (siteName) brand.siteName = siteName;

  const prompt = `You are a senior web designer and copywriter. Generate a complete web page comp from this brief.

BRIEF:
Site: ${brand.siteName}
Page type: ${pageType}
Page title: ${pageTitle}
Target audience: ${targetAudience || '(not specified)'}
Key message: ${keyMessage || '(not specified)'}
Tone: ${tone}
Sections requested (in this order): ${sections.join(' → ')}
Additional context: ${additionalContext || 'none'}

BRAND:
Primary color: ${brand.primary}
Secondary color: ${brand.secondary}
Heading font: ${brand.headingFont}
Body font: ${brand.bodyFont}
Site name: ${brand.siteName}

Available block types: ${BLOCK_TYPES_LIST}

Generate a "blocks" array with one block per requested section, in the requested order.
Write REAL, compelling copy — not placeholder text, not "Lorem ipsum". Write as if a professional copywriter is launching this page.

Image fields: use https://images.unsplash.com/photo-{id}?w=1200&auto=format&fit=crop
Pick thematically appropriate Unsplash photos for the site's subject.
For card-grid and article-grid: generate 3-4 realistic cards/articles with full fields.
For stats: use plausible, impressive numbers specific to the industry.
For nav.links, footer.columns, testimonial-grid.testimonials etc. (JSON-string fields):
return a JSON-serialized string (the client parses it).

Return ONLY a JSON object: { "blocks": [ { "type":"...", "fields":{...} }, ... ] }`;

  let result: any;
  try {
    result = await callOpenRouterJson(context.env, {
      messages: [{ role: 'user', content: prompt }],
      xTitle: 'Atomic Comp - AI Brief',
      maxTokens: 9000,
    });
  } catch (e: any) {
    return json({ error: `Generation failed: ${e?.message || e}` }, 500);
  }

  const blocks = normalizeBlocks(result?.blocks, 20);
  if (!blocks.length) return json({ error: 'No blocks generated' }, 422);

  const compId = generateId();
  const now = Math.floor(Date.now() / 1000);
  const compName = (pageTitle || `${brand.siteName} — ${pageType}`).slice(0, 160);
  try {
    await context.env.submoacontent_db
      .prepare(`INSERT INTO atomic_comp_drafts
                (id, account_id, name, blocks_json, brand_json, source_url, share_token, share_enabled, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, NULL, 0, ?, ?)`)
      .bind(compId, account_id, compName, JSON.stringify(blocks), JSON.stringify(brand), brandUrl || null, now, now)
      .run();
  } catch (err: any) {
    return json({ error: `DB insert failed: ${err?.message || err}` }, 500);
  }

  return json({ comp_id: compId, brand, blocks, block_count: blocks.length });
}
