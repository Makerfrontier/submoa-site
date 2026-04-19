// POST /api/presentations/analyze-template  (multipart form)
// Accepts a .pptx upload, unpacks the XML via JSZip, detects whether the deck
// uses proper PowerPoint placeholders or free-floating text boxes, pulls the
// theme palette, and returns an analysis object.
//
// Stores the uploaded file at templates/user/{account_id}/{uuid}.pptx in R2
// so the consumer can read it back at generation time.
//
// Note: Workers don't have a filesystem — the PPTX skill reference at
// /mnt/skills/public/pptx/SKILL.md lives in the Claude harness, not on the
// Worker. We implement the analysis directly here using JSZip.

import { getSessionUser, json, generateId } from '../_utils';

const MAX_SIZE = 50 * 1024 * 1024; // 50 MB

interface TemplateAnalysis {
  uploaded_r2_key: string;
  slide_count: number;
  layout_names: string[];
  placeholders: Array<{ slide: number; type: string; idx: number | null; name: string }>;
  colors: string[];
  fonts: { major: string | null; minor: string | null };
  verdict: 'Layout Locked' | 'Best Effort';
  verdict_detail: string;
}

async function unpack(file: File) {
  const JSZip: any = (await import('jszip')).default;
  return JSZip.loadAsync(await file.arrayBuffer());
}

function uniqueArray<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

export async function onRequest(context: { request: Request; env: any }) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);

  let form: FormData;
  try { form = await request.formData(); }
  catch { return json({ error: 'Multipart form data required' }, 400); }

  const file = form.get('template');
  if (!(file instanceof File)) return json({ error: 'template file required' }, 400);
  if (!file.name.toLowerCase().endsWith('.pptx')) return json({ error: 'Only .pptx files are accepted' }, 400);
  if (file.size > MAX_SIZE) return json({ error: 'Template exceeds 50 MB limit' }, 400);

  let zip: any;
  try { zip = await unpack(file); }
  catch (e: any) { return json({ error: `Unzip failed: ${e?.message || e}` }, 400); }

  // ── Slide layout names ─────────────────────────────────────────────────
  const layoutNames: string[] = [];
  const layoutFiles = Object.keys(zip.files).filter((k: string) => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(k));
  for (const path of layoutFiles) {
    try {
      const xml = await zip.file(path).async('string');
      const m = xml.match(/<p:cSld\s+name="([^"]+)"/);
      if (m) layoutNames.push(m[1]);
    } catch {}
  }

  // ── Slides + placeholder vs free-text box detection ────────────────────
  const slideFiles = Object.keys(zip.files)
    .filter((k: string) => /^ppt\/slides\/slide\d+\.xml$/.test(k))
    .sort((a, b) => {
      const na = parseInt(a.match(/slide(\d+)\.xml/)![1], 10);
      const nb = parseInt(b.match(/slide(\d+)\.xml/)![1], 10);
      return na - nb;
    });

  const placeholders: TemplateAnalysis['placeholders'] = [];
  let totalShapes = 0;
  let placeholderShapes = 0;

  for (let i = 0; i < slideFiles.length; i++) {
    const path = slideFiles[i];
    const xml = await zip.file(path).async('string');
    // Every drawing shape is a <p:sp> element. Placeholders have <p:ph ...> as
    // a descendant; free-floating text boxes do not.
    const spMatches = Array.from(xml.matchAll(/<p:sp\b([\s\S]*?)<\/p:sp>/g));
    for (const sp of spMatches) {
      totalShapes++;
      const spXml = sp[1] || '';
      const phMatch = spXml.match(/<p:ph\b([^>]*)\/?>/);
      if (phMatch) {
        placeholderShapes++;
        const attrs = phMatch[1] || '';
        const typeMatch = attrs.match(/type="([^"]+)"/);
        const idxMatch = attrs.match(/idx="(\d+)"/);
        const nameMatch = spXml.match(/<p:nvSpPr>[\s\S]*?<p:cNvPr[^>]*name="([^"]+)"/);
        placeholders.push({
          slide: i + 1,
          type: typeMatch ? typeMatch[1] : 'body',
          idx: idxMatch ? parseInt(idxMatch[1], 10) : null,
          name: nameMatch ? nameMatch[1] : 'shape',
        });
      }
    }
  }

  // ── Theme colors + fonts ───────────────────────────────────────────────
  let colors: string[] = [];
  let majorFont: string | null = null;
  let minorFont: string | null = null;
  try {
    const theme = zip.file('ppt/theme/theme1.xml');
    if (theme) {
      const xml = await theme.async('string');
      colors = uniqueArray(
        Array.from(xml.matchAll(/<a:srgbClr\s+val="([0-9A-Fa-f]{6})"/g))
          .slice(0, 20).map((m: any) => '#' + String(m[1]).toUpperCase())
      );
      const major = xml.match(/<a:majorFont>[\s\S]*?<a:latin\s+typeface="([^"]+)"/);
      const minor = xml.match(/<a:minorFont>[\s\S]*?<a:latin\s+typeface="([^"]+)"/);
      if (major) majorFont = major[1];
      if (minor) minorFont = minor[1];
    }
  } catch {}

  // ── Verdict ────────────────────────────────────────────────────────────
  const placeholderRatio = totalShapes > 0 ? placeholderShapes / totalShapes : 0;
  const verdict: 'Layout Locked' | 'Best Effort' =
    placeholders.length >= Math.max(4, slideFiles.length * 1) && placeholderRatio >= 0.6
      ? 'Layout Locked'
      : 'Best Effort';
  const verdict_detail = verdict === 'Layout Locked'
    ? `${placeholders.length} placeholders detected across ${layoutNames.length || slideFiles.length} layout${layoutNames.length === 1 ? '' : 's'}`
    : 'free-floating text boxes detected, layout adherence is approximate';

  // ── Persist the upload so the consumer can read it later ───────────────
  const accountId = user.account_id || 'makerfrontier';
  const uuid = generateId();
  const r2Key = `templates/user/${accountId}/${uuid}.pptx`;
  try {
    const buf = await file.arrayBuffer();
    await env.SUBMOA_IMAGES.put(r2Key, buf, {
      httpMetadata: { contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
      customMetadata: {
        uploaded_by: user.id,
        account_id: accountId,
        filename: file.name,
        size: String(file.size),
      },
    });
  } catch (e: any) {
    return json({ error: `R2 write failed: ${e?.message || e}` }, 500);
  }

  const analysis: TemplateAnalysis = {
    uploaded_r2_key: r2Key,
    slide_count: slideFiles.length,
    layout_names: layoutNames,
    placeholders,
    colors,
    fonts: { major: majorFont, minor: minorFont },
    verdict,
    verdict_detail,
  };

  return json(analysis);
}
