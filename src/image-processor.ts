// src/image-processor.ts
// Image SEO pipeline — runs in the queue consumer after article generation.
//
// Public API:
//   processImages()             → DataforSEO + Claude vision → renamed images in R2 + companion doc
//   injectImagesIntoArticle()   → splice <figure> blocks into article HTML at chosen paragraph slots
//   generateImageCopyBuffers()  → Claude-written before/after sentences for each image
//
// Notes on bindings: the queue consumer binds D1 as `env.DB`. Pages functions use
// `env.submoacontent_db`. This module only touches R2 (`SUBMOA_IMAGES`) and outbound
// fetch — no D1 — so it works in both contexts.

interface Env {
  SUBMOA_IMAGES: R2Bucket;
  OPENROUTER_API_KEY: string;
  DATAFORSEO_LOGIN?: string;
  DATAFORSEO_PASSWORD?: string;
}

export interface ImageRecord {
  originalKey: string;
  originalFilename: string;
  renamedFilename: string;
  renamedKey: string;
  altText: string;
  caption: string;
  keywords: string[];
  searchVolume: number | null;
  placementAfterParagraph: number; // 0 = featured/hero
  isFeatured: boolean;
  relevanceScore: number;
}

export interface ProcessImagesResult {
  images: ImageRecord[];
  featuredImage: ImageRecord | null;
  companionDocKey: string | null;
}

const CLAUDE_MODEL = "anthropic/claude-sonnet-4";
const DFS_BASE = "https://api.dataforseo.com/v3";

// ---------------------------------------------------------------------------
// processImages — main pipeline entry point
// ---------------------------------------------------------------------------
export async function processImages(
  env: Env,
  submissionId: string,
  title: string,
  articleContent: string,
  targetKeywords: string[],
  imageR2Keys: string[]
): Promise<ProcessImagesResult> {
  const empty: ProcessImagesResult = { images: [], featuredImage: null, companionDocKey: null };
  if (!imageR2Keys.length) return empty;

  const primaryKeyword = (targetKeywords[0] ?? title).toString().trim();
  const kwSlug = slugify(primaryKeyword);

  // 1 + 2: DataforSEO calls in parallel (best-effort — failures don't block)
  const [keywordData, competingAlts] = await Promise.all([
    fetchKeywordData(env, targetKeywords).catch((e) => {
      console.error("[image-processor] DataforSEO keyword data failed:", e);
      return new Map<string, number | null>();
    }),
    fetchCompetingAltTexts(env, primaryKeyword).catch((e) => {
      console.error("[image-processor] DataforSEO Google Images failed:", e);
      return [] as string[];
    }),
  ]);

  // 3: Download originals from R2 + base64 encode
  const downloaded = await Promise.all(
    imageR2Keys.map(async (key, idx) => {
      const obj = await env.SUBMOA_IMAGES.get(key);
      if (!obj) return null;
      const bytes = new Uint8Array(await obj.arrayBuffer());
      const contentType = obj.httpMetadata?.contentType || guessContentType(key);
      return {
        index: idx,
        key,
        filename: filenameFromKey(key),
        ext: extFromKey(key) || extFromContentType(contentType) || "jpg",
        contentType,
        base64: bytesToBase64(bytes),
        bytes,
      };
    })
  );
  const valid = downloaded.filter((d): d is NonNullable<typeof d> => !!d);
  if (!valid.length) {
    console.warn("[image-processor] No images could be downloaded from R2");
    return empty;
  }

  // 4: Claude vision analysis
  const analyses = await analyzeImagesWithClaude(env, {
    title,
    articleContent,
    targetKeywords,
    primaryKeyword,
    competingAlts,
    images: valid.map((v) => ({ index: v.index, ext: v.ext, base64: v.base64, contentType: v.contentType })),
  });

  if (!analyses.length) {
    console.warn("[image-processor] Claude returned no image analyses");
    return empty;
  }

  // 5 + 6: copy renamed images to projects/{id}/images/, build records
  const records: ImageRecord[] = [];
  for (const a of analyses) {
    const src = valid.find((v) => v.index === a.original_index);
    if (!src) continue;

    const renamedFilename = sanitizeFilename(a.renamed_filename, kwSlug, a.original_index, src.ext);
    const renamedKey = `projects/${submissionId}/images/${renamedFilename}`;

    await env.SUBMOA_IMAGES.put(renamedKey, src.bytes, {
      httpMetadata: { contentType: src.contentType },
    });

    const kwList = pickRecordKeywords(targetKeywords);
    const volume = kwList.length ? keywordData.get(kwList[0].toLowerCase()) ?? null : null;

    records.push({
      originalKey: src.key,
      originalFilename: src.filename,
      renamedFilename,
      renamedKey,
      altText: clampAlt(a.alt_text, primaryKeyword),
      caption: (a.caption || "").trim(),
      keywords: kwList,
      searchVolume: volume,
      placementAfterParagraph: Math.max(0, Math.floor(a.placement_paragraph ?? 0)),
      isFeatured: !!a.is_featured_candidate,
      relevanceScore: clampScore(a.relevance_score),
    });
  }

  // 7: Ensure exactly one featured image
  enforceSingleFeatured(records);

  // 8 + 9: companion doc
  const companionText = buildCompanionDoc(title, submissionId, records);
  const companionKey = `projects/${submissionId}/images/image-seo-companion.txt`;
  await env.SUBMOA_IMAGES.put(companionKey, companionText, {
    httpMetadata: { contentType: "text/plain; charset=utf-8" },
  });

  return {
    images: records,
    featuredImage: records.find((r) => r.isFeatured) ?? null,
    companionDocKey: companionKey,
  };
}

// ---------------------------------------------------------------------------
// injectImagesIntoArticle — splice <figure> blocks into article HTML
// ---------------------------------------------------------------------------
export function injectImagesIntoArticle(
  articleHtml: string,
  images: ImageRecord[],
  submissionId: string
): string {
  if (!images.length) return articleHtml;

  const featured = images.find((i) => i.isFeatured) ?? null;
  const inline = images
    .filter((i) => !i.isFeatured)
    .sort((a, b) => a.placementAfterParagraph - b.placementAfterParagraph);

  // Featured hero — prepend to article
  let html = articleHtml;
  if (featured) {
    const heroFigure = `<figure style="margin: 0 0 32px 0; text-align: center;">
  <img src="/api/submissions/${submissionId}/images/${encodeURIComponent(featured.renamedFilename)}" alt="${escapeAttr(featured.altText)}" style="max-width: 100%; height: auto; border-radius: 8px;" loading="eager" />
  <figcaption style="font-size: 13px; color: #6a8a6a; margin-top: 8px; font-style: italic;">${escapeHtml(featured.caption)}</figcaption>
</figure>\n`;
    html = heroFigure + html;
  }

  if (!inline.length) return html;

  // Split on </p> while keeping the closing tag attached
  const parts = html.split(/(<\/p>)/i);
  // parts looks like: [chunk, "</p>", chunk, "</p>", trailing]
  // Paragraph N "ends" after the (N+1)-th </p>. We map placementAfterParagraph (1-based)
  // to inserting the figure right after that closing tag.
  const queue = [...inline];
  const out: string[] = [];
  let pIndex = 0; // count of </p> tags emitted

  for (const part of parts) {
    out.push(part);
    if (/^<\/p>$/i.test(part)) {
      pIndex += 1;
      while (queue.length && queue[0].placementAfterParagraph <= pIndex) {
        const img = queue.shift()!;
        out.push(figureBlock(img, submissionId));
      }
    }
  }
  // Any leftover images get appended at the end
  for (const img of queue) out.push(figureBlock(img, submissionId));

  return out.join("");
}

function figureBlock(img: ImageRecord, submissionId: string): string {
  return `\n<figure style="margin: 24px 0; text-align: center;">
  <img src="/api/submissions/${submissionId}/images/${encodeURIComponent(img.renamedFilename)}" alt="${escapeAttr(img.altText)}" style="max-width: 100%; height: auto; border-radius: 6px;" loading="lazy" />
  <figcaption style="font-size: 13px; color: #6a8a6a; margin-top: 8px; font-style: italic;">${escapeHtml(img.caption)}</figcaption>
</figure>\n`;
}

// ---------------------------------------------------------------------------
// generateImageCopyBuffers — Claude-written sentence before/after each image
// ---------------------------------------------------------------------------
export async function generateImageCopyBuffers(
  env: Env,
  articleContent: string,
  images: ImageRecord[],
  topic: string,
  targetKeywords: string[]
): Promise<Record<string, { before: string; after: string }>> {
  const targets = images.filter((i) => !i.isFeatured);
  if (!targets.length) return {};

  const kwLine = targetKeywords.slice(0, 5).join(", ");
  const articleSnippet = articleContent.length > 4000 ? articleContent.slice(0, 4000) + "…" : articleContent;

  const prompt = `You are writing brief SEO copy buffers for images embedded in an article.

Article topic: ${topic}
Target keywords: ${kwLine}

Article excerpt:
"""
${articleSnippet}
"""

For each image below, write:
- "before": ONE sentence (max 25 words) introducing what the reader is about to see, naturally including or adjacent to a target keyword.
- "after":  ONE sentence (max 25 words) reinforcing the point, using a keyword-adjacent phrase.

Return STRICT JSON only, no prose, no markdown:
{
  "<renamed_filename>": { "before": "...", "after": "..." }
}

Images:
${targets.map((i) => `- ${i.renamedFilename} — alt: ${i.altText}`).join("\n")}`;

  const text = await callClaudeText(env, prompt).catch((e) => {
    console.error("[image-processor] copy-buffer Claude call failed:", e);
    return "";
  });

  const parsed = safeJsonExtract<Record<string, { before: string; after: string }>>(text);
  return parsed ?? {};
}

// ---------------------------------------------------------------------------
// DataforSEO — keyword search volume (Standard queue)
// ---------------------------------------------------------------------------
async function fetchKeywordData(env: Env, keywords: string[]): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>();
  if (!env.DATAFORSEO_LOGIN || !env.DATAFORSEO_PASSWORD) return out;
  const cleaned = keywords.map((k) => k.toString().trim()).filter(Boolean).slice(0, 10);
  if (!cleaned.length) return out;

  const auth = "Basic " + btoa(`${env.DATAFORSEO_LOGIN}:${env.DATAFORSEO_PASSWORD}`);
  const res = await fetch(`${DFS_BASE}/keywords_data/google_ads/search_volume/live`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: auth },
    body: JSON.stringify([{ keywords: cleaned, location_code: 2840, language_code: "en" }]),
  });
  if (!res.ok) throw new Error(`DataforSEO keywords HTTP ${res.status}`);
  const data: any = await res.json();
  const items = data?.tasks?.[0]?.result ?? [];
  for (const item of items) {
    const k = (item?.keyword ?? "").toString().toLowerCase();
    if (!k) continue;
    out.set(k, typeof item?.search_volume === "number" ? item.search_volume : null);
  }
  return out;
}

// ---------------------------------------------------------------------------
// DataforSEO — competing alt texts from top Google Images results
// ---------------------------------------------------------------------------
async function fetchCompetingAltTexts(env: Env, primaryKeyword: string): Promise<string[]> {
  if (!env.DATAFORSEO_LOGIN || !env.DATAFORSEO_PASSWORD) return [];
  if (!primaryKeyword) return [];

  const auth = "Basic " + btoa(`${env.DATAFORSEO_LOGIN}:${env.DATAFORSEO_PASSWORD}`);
  const res = await fetch(`${DFS_BASE}/serp/google/images/live/advanced`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: auth },
    body: JSON.stringify([{ keyword: primaryKeyword, location_code: 2840, language_code: "en", depth: 10 }]),
  });
  if (!res.ok) throw new Error(`DataforSEO images HTTP ${res.status}`);
  const data: any = await res.json();
  const items: any[] = data?.tasks?.[0]?.result?.[0]?.items ?? [];
  const alts: string[] = [];
  for (const it of items) {
    const a = (it?.alt ?? it?.title ?? "").toString().trim();
    if (a) alts.push(a);
    if (alts.length >= 5) break;
  }
  return alts;
}

// ---------------------------------------------------------------------------
// Claude vision — analyze all images at once, return structured metadata
// ---------------------------------------------------------------------------
interface ClaudeAnalysis {
  original_index: number;
  renamed_filename: string;
  alt_text: string;
  caption: string;
  relevance_score: number;
  placement_paragraph: number;
  is_featured_candidate: boolean;
}

async function analyzeImagesWithClaude(
  env: Env,
  ctx: {
    title: string;
    articleContent: string;
    targetKeywords: string[];
    primaryKeyword: string;
    competingAlts: string[];
    images: { index: number; ext: string; base64: string; contentType: string }[];
  }
): Promise<ClaudeAnalysis[]> {
  const articleSnippet =
    ctx.articleContent.length > 6000 ? ctx.articleContent.slice(0, 6000) + "…" : ctx.articleContent;
  const competing = ctx.competingAlts.length
    ? ctx.competingAlts.map((a) => `- ${a}`).join("\n")
    : "(none retrieved)";

  const instructions = `You are an SEO image strategist. Analyze the ${ctx.images.length} image(s) below for an article.

Article title: ${ctx.title}
Primary keyword: ${ctx.primaryKeyword}
All target keywords: ${ctx.targetKeywords.join(", ") || "(none)"}

Article excerpt:
"""
${articleSnippet}
"""

Competing alt texts from Google Images for this query:
${competing}

For each image (referenced by 0-based original_index), output ONE JSON object with:
- original_index: the image's 0-based index as supplied
- renamed_filename: lowercase, hyphen-separated, primary keyword first, descriptor middle, position number at end. KEEP the original file extension. Example: "${slugify(ctx.primaryKeyword)}-detail-1.${ctx.images[0]?.ext ?? "jpg"}"
- alt_text: max 125 characters. Include the primary keyword once, naturally. Do NOT start with "image of" or "picture of". Describe what's actually visible.
- caption: ONE sentence adding context not visible in the image (use case, benefit, comparison). No emoji.
- relevance_score: integer 0-100 — how well this image matches the article topic and primary keyword.
- placement_paragraph: 1-based paragraph number AFTER which the image should appear. Use 0 ONLY for the single featured/hero image. Space images evenly — roughly one per ~300 words of article.
- is_featured_candidate: boolean. EXACTLY ONE image must be true — the most visually compelling and topic-relevant one.

Return STRICT JSON: an array of these objects, no prose, no markdown fences.`;

  const content: any[] = [{ type: "text", text: instructions }];
  for (const img of ctx.images) {
    content.push({
      type: "image_url",
      image_url: { url: `data:${img.contentType};base64,${img.base64}` },
    });
    content.push({ type: "text", text: `^ image original_index = ${img.index}` });
  }

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 2000,
      messages: [{ role: "user", content }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Claude image analysis HTTP ${res.status}: ${await res.text().catch(() => "")}`);
  }
  const data: any = await res.json();
  const text: string = data?.choices?.[0]?.message?.content ?? "";
  const parsed = safeJsonExtract<ClaudeAnalysis[]>(text);
  if (!Array.isArray(parsed)) {
    console.error("[image-processor] Claude returned non-array:", text.slice(0, 400));
    return [];
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// Plain-text Claude call (used by generateImageCopyBuffers)
// ---------------------------------------------------------------------------
async function callClaudeText(env: Env, prompt: string): Promise<string> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Claude HTTP ${res.status}`);
  const data: any = await res.json();
  return data?.choices?.[0]?.message?.content ?? "";
}

// ---------------------------------------------------------------------------
// Companion document
// ---------------------------------------------------------------------------
function buildCompanionDoc(title: string, submissionId: string, images: ImageRecord[]): string {
  const lines: string[] = [];
  lines.push("IMAGE SEO COMPANION DOCUMENT");
  lines.push(`Article: ${title}`);
  lines.push(`Project ID: ${submissionId}`);
  lines.push(`Generated: ${new Date().toISOString().slice(0, 10)}`);
  lines.push(`Total images: ${images.length}`);
  lines.push("=".repeat(60));
  lines.push("");

  images.forEach((img, i) => {
    const star = img.isFeatured ? " ★ FEATURED" : "";
    const placement = img.isFeatured
      ? "Featured hero image (top of article)"
      : `After paragraph ${img.placementAfterParagraph}`;
    lines.push(`IMAGE ${i + 1}${star}`);
    lines.push(`Original filename:  ${img.originalFilename}`);
    lines.push(`Renamed filename:   ${img.renamedFilename}`);
    lines.push(`Alt text:           ${img.altText}`);
    lines.push(`Caption:            ${img.caption}`);
    lines.push(`Keywords:           ${img.keywords.join(", ") || "(none)"}`);
    lines.push(`Search volume:      ${img.searchVolume ?? "unknown"}`);
    lines.push(`Placement:          ${placement}`);
    lines.push("");
    lines.push("-".repeat(40));
    lines.push("");
  });

  lines.push("USAGE NOTES");
  lines.push("- Copy alt text and captions to your CMS exactly as shown");
  lines.push("- Rename image files before uploading to your site");
  lines.push("- Featured image should be uploaded as the post thumbnail");
  lines.push("- All alt text is under 125 characters and keyword-optimized");
  lines.push("- Captions add context not visible in the image");
  lines.push("");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function slugify(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "image";
}

function sanitizeFilename(proposed: string, kwSlug: string, idx: number, fallbackExt: string): string {
  const cleaned = (proposed || "").trim().toLowerCase();
  // Pull extension off the proposal if present, else fall back to original
  const m = cleaned.match(/^(.+?)\.([a-z0-9]{2,5})$/);
  let stem = m ? m[1] : cleaned;
  let ext = (m ? m[2] : fallbackExt).toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  if (ext === "jpeg") ext = "jpg";

  stem = slugify(stem);
  if (!stem) stem = `${kwSlug}-${idx + 1}`;
  if (!/-\d+$/.test(stem)) stem = `${stem}-${idx + 1}`;
  return `${stem}.${ext}`;
}

function pickRecordKeywords(targetKeywords: string[]): string[] {
  return targetKeywords
    .map((k) => k.toString().trim())
    .filter(Boolean)
    .slice(0, 3);
}

function clampAlt(s: string, primary: string): string {
  let alt = (s || "").replace(/\s+/g, " ").trim();
  alt = alt.replace(/^(image|picture|photo|photograph) of /i, "");
  if (alt.length > 125) alt = alt.slice(0, 122).trim() + "…";
  if (!alt) alt = primary;
  return alt;
}

function clampScore(n: any): number {
  const x = typeof n === "number" ? n : parseInt(n, 10);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(100, Math.round(x)));
}

function enforceSingleFeatured(records: ImageRecord[]): void {
  if (!records.length) return;
  const featured = records.filter((r) => r.isFeatured);
  if (featured.length === 1) return;

  if (featured.length > 1) {
    // Keep the highest-relevance featured, demote the rest
    const sorted = [...featured].sort((a, b) => b.relevanceScore - a.relevanceScore);
    sorted.slice(1).forEach((r) => (r.isFeatured = false));
    return;
  }

  // None marked — promote the highest relevance image
  const top = [...records].sort((a, b) => b.relevanceScore - a.relevanceScore)[0];
  top.isFeatured = true;
  top.placementAfterParagraph = 0;
}

function filenameFromKey(key: string): string {
  const idx = key.lastIndexOf("/");
  return idx >= 0 ? key.slice(idx + 1) : key;
}

function extFromKey(key: string): string | null {
  const m = key.match(/\.([a-z0-9]{2,5})$/i);
  return m ? m[1].toLowerCase() : null;
}

function extFromContentType(ct: string): string | null {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
  };
  return map[ct.toLowerCase()] ?? null;
}

function guessContentType(key: string): string {
  const ext = extFromKey(key);
  switch (ext) {
    case "png": return "image/png";
    case "webp": return "image/webp";
    case "gif": return "image/gif";
    default: return "image/jpeg";
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  // Chunked to avoid stack overflow on large images
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)) as any);
  }
  return btoa(binary);
}

function escapeHtml(s: string): string {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

function safeJsonExtract<T>(text: string): T | null {
  if (!text) return null;
  // Strip ```json fences if present
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Try to find the first {...} or [...] block
    const arr = cleaned.match(/\[[\s\S]*\]/);
    if (arr) {
      try { return JSON.parse(arr[0]) as T; } catch {}
    }
    const obj = cleaned.match(/\{[\s\S]*\}/);
    if (obj) {
      try { return JSON.parse(obj[0]) as T; } catch {}
    }
    return null;
  }
}
