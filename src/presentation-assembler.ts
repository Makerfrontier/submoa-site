// src/presentation-assembler.ts
// JS-native presentation builder — runs in queue consumer when article_format === 'presentation'.
//
// Pipeline:
//   1. Load user's uploaded .pptx template from R2
//   2. Extract theme colors + fonts from ppt/theme/theme1.xml via pizzip + lightweight regex
//      (the consumer is a Cloudflare Worker — no python-pptx, no shell, no /tmp)
//   3. Ask Claude to refine the visual analysis given the extracted hints
//   4. Ask Claude to generate a structured slide deck (JSON)
//   5. Run content police (banned phrases / em-dashes / ellipses)
//   6. Render a fresh .pptx with pptxgenjs styled to match the template
//   7. Save to R2 and update DB
//
// Caveats vs. the original Python spec:
//   - We GENERATE a new deck styled to match the template; we don't EDIT the template's slides.
//   - No image-based QA pass (would require soffice/pdftoppm — not available in Workers).

import JSZip from "jszip";
// pptxgenjs ships UMD; the default import gives us the constructor in both Node and Worker bundles.
import PptxGenJS from "pptxgenjs";
import { writeProjectFile } from "./project-template";

interface Env {
  DB?: D1Database;
  submoacontent_db?: D1Database;
  SUBMOA_IMAGES: R2Bucket;
  OPENROUTER_API_KEY: string;
}

function db(env: Env): D1Database {
  const x = env.submoacontent_db ?? env.DB;
  if (!x) throw new Error("[presentation-assembler] No D1 binding available");
  return x;
}

const CLAUDE_MODEL = "anthropic/claude-sonnet-4";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------
export interface PresentationRecord {
  id: string;
  submission_id: string;
  template_r2_key: string;
  template_filename: string;
  slide_count_target: number | null;
  key_details: string | null;
  structured_notes: string | null; // JSON [{ slide_type, notes }]
  include_charts: number;
  include_images: number;
  image_r2_keys: string | null;    // JSON string[]
  presentation_status: string | null;
}

interface SubmissionContext {
  id: string;
  topic: string;
  author: string | null;
  target_keywords?: string | null;
}

interface TemplateAnalysis {
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  background_color: string;
  header_font: string;
  body_font: string;
  header_size_pt: number;
  body_size_pt: number;
  layout_style: string;
  text_alignment: "left" | "center" | "right";
  design_notes: string;
}

type SlideType = "title" | "agenda" | "section" | "content" | "chart" | "quote" | "timeline" | "comparison" | "team" | "closing";

interface Slide {
  slide_type: SlideType;
  title: string;
  body: string | null;
  bullets: string[] | null;
  chart_data: { type: "bar" | "line" | "pie"; labels: string[]; values: number[]; title: string } | null;
  image_hint: string | null;
  speaker_notes: string;
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------
export async function assemblePresentation(
  env: Env,
  submission: SubmissionContext,
  pres: PresentationRecord
): Promise<void> {
  try {
    await setStatus(env, pres.id, "rendering");

    // 1. Load template from R2
    const tmplObj = await env.SUBMOA_IMAGES.get(pres.template_r2_key);
    if (!tmplObj) throw new Error(`Template not found in R2: ${pres.template_r2_key}`);
    const tmplBuffer = await tmplObj.arrayBuffer();

    // 2. Extract template hints (colors, fonts) from theme1.xml
    const hints = await extractTemplateHints(tmplBuffer);

    // 3. Refine via Claude
    const analysis = await analyzeTemplateWithClaude(env, hints, pres.template_filename);

    // 4. Author voice + writing skill (best effort)
    const skill = await getWritingSkill(env);
    const author = submission.author
      ? await db(env).prepare("SELECT name, style_guide FROM author_profiles WHERE slug = ?")
          .bind(submission.author)
          .first<{ name: string | null; style_guide: string | null }>()
          .catch(() => null)
      : null;

    // 5. Generate slide content
    const structured = pres.structured_notes ? safeJson<{ slide_type: string; notes: string }[]>(pres.structured_notes) ?? [] : [];
    const slides = await generateSlides(env, submission, pres, analysis, skill, author, structured);

    // 6. Content police
    const cleaned = enforceSlideContent(slides);

    // 7. Build PPTX
    const imageMap = await downloadImagesIfRequested(env, pres);
    const pptxBuffer = await buildPptx(cleaned, analysis, imageMap, submission.topic);

    // 8. Write to R2
    const pptxKey = `projects/${submission.id}/presentation/presentation.pptx`;
    await writeProjectFile(env as any, submission.id, "presentation", "presentation.pptx", pptxBuffer,
      "application/vnd.openxmlformats-officedocument.presentationml.presentation");

    // 9. Update DB
    const now = Date.now();
    await db(env).prepare(
      `UPDATE presentation_submissions
         SET presentation_status = ?, pptx_r2_key = ?, slide_count_actual = ?, assembled_at = ?
       WHERE id = ?`
    ).bind("ready", pptxKey, cleaned.length, now, pres.id).run();

    await db(env).prepare(
      `UPDATE submissions SET status = ?, grade_status = ?, updated_at = ? WHERE id = ?`
    ).bind("article_done", "graded", now, submission.id).run();

    console.log(`[presentation-assembler] Built ${cleaned.length}-slide deck for ${submission.id}`);
  } catch (err: any) {
    console.error("[presentation-assembler] Assembly error:", err?.message ?? err);
    await setStatus(env, pres.id, "failed").catch(() => {});
    await db(env).prepare(
      `UPDATE submissions SET status = 'failed', updated_at = ? WHERE id = ?`
    ).bind(Date.now(), submission.id).run().catch(() => {});
  }
}

async function setStatus(env: Env, id: string, status: string): Promise<void> {
  await db(env).prepare("UPDATE presentation_submissions SET presentation_status = ? WHERE id = ?")
    .bind(status, id).run();
}

async function getWritingSkill(env: Env): Promise<string> {
  const row = await db(env).prepare(
    "SELECT content FROM agent_skills WHERE name = 'writing-skill' AND active = 1 LIMIT 1"
  ).first<{ content: string }>().catch(() => null);
  return row?.content ?? "Write tight, scannable, presentation-ready copy. No fluff.";
}

// ---------------------------------------------------------------------------
// Template hint extraction (no Python — just pizzip + theme1.xml regex)
// ---------------------------------------------------------------------------
interface TemplateHints {
  colors: string[];   // dk1, lt1, accent1..accent6 in order, when found
  majorFont?: string; // header
  minorFont?: string; // body
  slideText: string;  // first ~500 chars of any text we can find — helps Claude reason about voice
  filename?: string;
}

async function extractTemplateHints(buffer: ArrayBuffer): Promise<TemplateHints> {
  const out: TemplateHints = { colors: [], slideText: "" };
  try {
    const zip = await JSZip.loadAsync(buffer);
    const themeFile = zip.file("ppt/theme/theme1.xml");
    if (themeFile) {
      const xml = await themeFile.async("string");
      // Color scheme — extract <a:srgbClr val="HEX"/> in order of first 8 entries
      const colorMatches = [...xml.matchAll(/<a:srgbClr\s+val="([0-9A-Fa-f]{6})"/g)].slice(0, 12);
      out.colors = colorMatches.map((m) => "#" + m[1].toUpperCase());
      // Fonts — major/minor latin typeface names
      const major = xml.match(/<a:majorFont>[\s\S]*?<a:latin\s+typeface="([^"]+)"/);
      const minor = xml.match(/<a:minorFont>[\s\S]*?<a:latin\s+typeface="([^"]+)"/);
      if (major) out.majorFont = major[1];
      if (minor) out.minorFont = minor[1];
    }
    // Pull a sample of text from the first slide (best effort)
    const slide1 = zip.file("ppt/slides/slide1.xml");
    if (slide1) {
      const xml = await slide1.async("string");
      const text = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]).join(" ");
      out.slideText = text.slice(0, 500);
    }
  } catch (e) {
    console.warn("[presentation-assembler] Template hint extraction failed:", e);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Claude template analysis
// ---------------------------------------------------------------------------
async function analyzeTemplateWithClaude(env: Env, hints: TemplateHints, filename: string): Promise<TemplateAnalysis> {
  const fallback: TemplateAnalysis = {
    primary_color: hints.colors[2] || "#1E2761",
    secondary_color: hints.colors[3] || "#666666",
    accent_color: hints.colors[4] || "#c8973a",
    background_color: hints.colors[1] || "#FFFFFF",
    header_font: hints.majorFont || "Calibri",
    body_font: hints.minorFont || "Calibri",
    header_size_pt: 32,
    body_size_pt: 16,
    layout_style: "minimal",
    text_alignment: "left",
    design_notes: "Clean corporate template",
  };

  const prompt = `You analyze PowerPoint templates and return JSON.

Template filename: ${filename}
Theme colors detected (hex, in scheme order — first two are dark/light text, then accent1-6 if present):
${hints.colors.join(", ") || "(none extracted)"}

Major font (headings): ${hints.majorFont || "(unknown)"}
Minor font (body): ${hints.minorFont || "(unknown)"}

Sample text from slide 1: """${hints.slideText || "(none)"}"""

Return ONLY valid JSON, no prose, no markdown:
{
  "primary_color": "#hex",
  "secondary_color": "#hex",
  "accent_color": "#hex",
  "background_color": "#hex",
  "header_font": "font name",
  "body_font": "font name",
  "header_size_pt": 28-44,
  "body_size_pt": 12-18,
  "layout_style": "minimal|corporate|bold|editorial|data-heavy",
  "text_alignment": "left|center|right",
  "design_notes": "one sentence describing visual style"
}

Use the detected hints. If a hint is missing, infer from the filename and sample text. Pick HIGH-CONTRAST colors that look good against the background.`;

  try {
    const text = await callClaude(env, prompt, 800);
    const parsed = safeJson<TemplateAnalysis>(text);
    if (parsed) {
      return {
        ...fallback,
        ...parsed,
        // Sanity-clamp font sizes
        header_size_pt: clamp(parsed.header_size_pt, 22, 50),
        body_size_pt: clamp(parsed.body_size_pt, 10, 22),
      };
    }
  } catch (e) {
    console.warn("[presentation-assembler] Claude template analysis failed; using fallback:", e);
  }
  return fallback;
}

// ---------------------------------------------------------------------------
// Slide content generation
// ---------------------------------------------------------------------------
async function generateSlides(
  env: Env,
  submission: SubmissionContext,
  pres: PresentationRecord,
  analysis: TemplateAnalysis,
  skill: string,
  author: { name: string | null; style_guide: string | null } | null,
  structured: { slide_type: string; notes: string }[]
): Promise<Slide[]> {
  const targetCount = pres.slide_count_target ?? 0; // 0 = agent decides
  const guidance = structured.length
    ? `Per-slide intent supplied by the user (use these where they fit naturally; you may add more):\n${structured.map((s, i) => `${i + 1}. [${s.slide_type}] ${s.notes}`).join("\n")}`
    : "(no per-slide notes — design the deck yourself)";

  const prompt = `You design slide decks. Output STRICT JSON.

WRITING SKILL:
${skill}

AUTHOR VOICE:
${author?.style_guide || "Clear, confident, technically credible. Short sentences."}

TOPIC: ${submission.topic}
KEY DETAILS:
${pres.key_details || "(none)"}

TARGET SLIDE COUNT: ${targetCount > 0 ? targetCount : "AGENT DECIDES (between 5 and 12)"}
INCLUDE CHARTS: ${pres.include_charts ? "YES — generate chart_data for any quantitative claim" : "NO"}
INCLUDE IMAGES: ${pres.include_images ? "YES — set image_hint where an image strengthens the slide" : "NO"}

${guidance}

Return ONLY a JSON array. Each element:
{
  "slide_type": "title|agenda|section|content|chart|quote|timeline|comparison|team|closing",
  "title": "max 8 words",
  "body": "max 40 words, scannable, no sentence over 15 words" or null,
  "bullets": ["...", "..."] or null,
  "chart_data": { "type": "bar|line|pie", "labels": [...], "values": [...], "title": "" } or null,
  "image_hint": "short visual description" or null,
  "speaker_notes": "expanded talking points (2-4 sentences)"
}

Hard rules:
- First slide MUST be slide_type "title"
- Last slide MUST be slide_type "closing"
- Include an "agenda" slide as slide 2 if total slides >= 6
- No em dashes, no ellipses, no "delve / navigate / unlock / in today's"
- Every slide either has a bullets array OR a body string OR chart_data — never empty
- Body and bullets should not duplicate each other on the same slide`;

  let attempt = 0;
  while (attempt < 2) {
    try {
      const text = await callClaude(env, prompt, 4000);
      const parsed = safeJson<any[]>(text);
      if (Array.isArray(parsed) && parsed.length >= 2) {
        return normalizeSlides(parsed, targetCount, !!pres.include_charts);
      }
      console.warn("[presentation-assembler] Claude returned malformed slides, retrying");
    } catch (e) {
      console.warn("[presentation-assembler] Claude slides call failed:", e);
    }
    attempt++;
  }
  // Hard fallback: minimal 3-slide deck
  return [
    { slide_type: "title", title: submission.topic, body: null, bullets: null, chart_data: null, image_hint: null, speaker_notes: "" },
    { slide_type: "content", title: "Overview", body: pres.key_details || submission.topic, bullets: null, chart_data: null, image_hint: null, speaker_notes: "" },
    { slide_type: "closing", title: "Thank you", body: null, bullets: null, chart_data: null, image_hint: null, speaker_notes: "" },
  ];
}

function normalizeSlides(raw: any[], target: number, allowCharts: boolean): Slide[] {
  const out: Slide[] = raw.map((r) => ({
    slide_type: validSlideType(r.slide_type),
    title: String(r.title ?? "").trim().slice(0, 80),
    body: r.body ? String(r.body).trim() : null,
    bullets: Array.isArray(r.bullets) ? r.bullets.map((b: any) => String(b).trim()).filter(Boolean).slice(0, 8) : null,
    chart_data: allowCharts && r.chart_data && Array.isArray(r.chart_data.labels) && Array.isArray(r.chart_data.values) ? {
      type: ["bar", "line", "pie"].includes(r.chart_data.type) ? r.chart_data.type : "bar",
      labels: r.chart_data.labels.map((l: any) => String(l)),
      values: r.chart_data.values.map((v: any) => Number(v)).filter((n: number) => Number.isFinite(n)),
      title: String(r.chart_data.title ?? ""),
    } : null,
    image_hint: r.image_hint ? String(r.image_hint).trim() : null,
    speaker_notes: r.speaker_notes ? String(r.speaker_notes).trim() : "",
  }));

  if (out.length === 0) return out;
  // Enforce first/last
  if (out[0].slide_type !== "title") out[0].slide_type = "title";
  if (out[out.length - 1].slide_type !== "closing") out[out.length - 1].slide_type = "closing";

  // Trim to target if specified
  if (target > 0 && out.length > target) {
    return [out[0], ...out.slice(1, target - 1), out[out.length - 1]];
  }
  return out;
}

function validSlideType(t: any): SlideType {
  const allowed: SlideType[] = ["title", "agenda", "section", "content", "chart", "quote", "timeline", "comparison", "team", "closing"];
  return (allowed as string[]).includes(t) ? (t as SlideType) : "content";
}

// ---------------------------------------------------------------------------
// Content police
// ---------------------------------------------------------------------------
const BANNED_PATTERNS: Array<[RegExp, string]> = [
  [/—/g, ", "],                                             // em dash → comma
  [/\u2026|\.{3}/g, "."],                                    // ellipsis → period
  [/\b(delve into|delve)\b/gi, "explore"],
  [/\b(navigate the landscape of|navigate the landscape)\b/gi, "work through"],
  [/\bin today'?s fast[- ]paced\b/gi, "in today's"],
  [/\bunlock the (potential|power) of\b/gi, "use"],
  [/\bgame[- ]changer\b/gi, "shift"],
  [/\bin the realm of\b/gi, "in"],
  [/\bat the end of the day\b/gi, ""],
  [/\bcutting[- ]edge\b/gi, "advanced"],
  [/\bleverage\b/gi, "use"],
  [/\bsynergy\b/gi, "alignment"],
];

function enforceSlideContent(slides: Slide[]): Slide[] {
  let totalFixes = 0;
  const fix = (s: string | null): string | null => {
    if (!s) return s;
    let out = s;
    for (const [re, repl] of BANNED_PATTERNS) {
      const before = out;
      out = out.replace(re, repl);
      if (before !== out) totalFixes++;
    }
    return out.replace(/\s{2,}/g, " ").trim();
  };
  for (const slide of slides) {
    slide.title = fix(slide.title) ?? "";
    slide.body = fix(slide.body);
    slide.speaker_notes = fix(slide.speaker_notes) ?? "";
    if (slide.bullets) slide.bullets = slide.bullets.map((b) => fix(b)!).filter(Boolean);
  }
  if (totalFixes > 0) console.log(`[presentation-assembler] Content police fixed ${totalFixes} pattern(s)`);
  return slides;
}

// ---------------------------------------------------------------------------
// Image download (best effort)
// ---------------------------------------------------------------------------
async function downloadImagesIfRequested(env: Env, pres: PresentationRecord): Promise<{ ext: string; base64: string }[]> {
  if (!pres.include_images || !pres.image_r2_keys) return [];
  const keys = safeJson<string[]>(pres.image_r2_keys) ?? [];
  const out: { ext: string; base64: string }[] = [];
  for (const key of keys) {
    try {
      const obj = await env.SUBMOA_IMAGES.get(key);
      if (!obj) continue;
      const bytes = new Uint8Array(await obj.arrayBuffer());
      const ext = (key.split(".").pop() || "jpg").toLowerCase();
      out.push({ ext, base64: bytesToBase64(bytes) });
    } catch (e) {
      console.warn("[presentation-assembler] image fetch failed:", key, e);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// PPTX build via pptxgenjs
// ---------------------------------------------------------------------------
async function buildPptx(
  slides: Slide[],
  a: TemplateAnalysis,
  images: { ext: string; base64: string }[],
  topic: string
): Promise<ArrayBuffer> {
  const pres = new (PptxGenJS as any)();
  pres.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 in
  pres.title = topic.slice(0, 80);
  pres.author = "SubMoa Content";

  const SLIDE_W = 13.33;
  const SLIDE_H = 7.5;

  // Per-deck "image cursor" — non-featured slides consume images in order
  let imgCursor = 0;
  const popImage = () => (imgCursor < images.length ? images[imgCursor++] : null);

  for (let i = 0; i < slides.length; i++) {
    const s = slides[i];
    const slide = pres.addSlide();
    slide.background = { color: stripHash(a.background_color) };

    if (s.slide_type === "title") {
      // Centered hero title
      slide.addText(s.title || topic, {
        x: 0.5, y: SLIDE_H / 2 - 1.0, w: SLIDE_W - 1, h: 1.6,
        fontSize: a.header_size_pt + 8,
        fontFace: a.header_font,
        color: stripHash(a.primary_color),
        bold: true,
        align: "center",
        valign: "middle",
      });
      if (s.body) {
        slide.addText(s.body, {
          x: 1, y: SLIDE_H / 2 + 0.7, w: SLIDE_W - 2, h: 0.8,
          fontSize: a.body_size_pt + 2,
          fontFace: a.body_font,
          color: stripHash(a.secondary_color),
          align: "center",
        });
      }
      // Accent bar
      slide.addShape("rect", {
        x: SLIDE_W / 2 - 0.5, y: SLIDE_H / 2 + 0.45, w: 1.0, h: 0.06,
        fill: { color: stripHash(a.accent_color) },
        line: { type: "none" },
      });
    } else if (s.slide_type === "closing") {
      slide.addText(s.title || "Thank you", {
        x: 0.5, y: SLIDE_H / 2 - 0.8, w: SLIDE_W - 1, h: 1.4,
        fontSize: a.header_size_pt + 4,
        fontFace: a.header_font,
        color: stripHash(a.primary_color),
        bold: true,
        align: "center",
      });
      if (s.body) {
        slide.addText(s.body, {
          x: 1, y: SLIDE_H / 2 + 0.6, w: SLIDE_W - 2, h: 0.8,
          fontSize: a.body_size_pt,
          fontFace: a.body_font,
          color: stripHash(a.secondary_color),
          align: "center",
        });
      }
    } else {
      // Standard content layout: header bar + title + body region

      // Top accent bar
      slide.addShape("rect", {
        x: 0, y: 0, w: SLIDE_W, h: 0.18,
        fill: { color: stripHash(a.accent_color) },
        line: { type: "none" },
      });

      slide.addText(s.title || `Slide ${i + 1}`, {
        x: 0.5, y: 0.4, w: SLIDE_W - 1, h: 0.9,
        fontSize: a.header_size_pt,
        fontFace: a.header_font,
        color: stripHash(a.primary_color),
        bold: true,
        align: a.text_alignment,
      });

      const bodyTop = 1.5;
      const bodyW = s.chart_data || s.image_hint ? (SLIDE_W - 1) * 0.55 : SLIDE_W - 1;
      const bodyX = 0.5;

      if (s.bullets && s.bullets.length) {
        slide.addText(
          s.bullets.map((b) => ({ text: b, options: { bullet: { type: "bullet" } } })),
          {
            x: bodyX, y: bodyTop, w: bodyW, h: SLIDE_H - bodyTop - 0.6,
            fontSize: a.body_size_pt,
            fontFace: a.body_font,
            color: "404040",
            valign: "top",
            paraSpaceAfter: 6,
          }
        );
      } else if (s.body) {
        slide.addText(s.body, {
          x: bodyX, y: bodyTop, w: bodyW, h: SLIDE_H - bodyTop - 0.6,
          fontSize: a.body_size_pt,
          fontFace: a.body_font,
          color: "404040",
          valign: "top",
        });
      }

      // Right column: chart OR image OR (if neither) accent quote box
      const rightX = bodyX + bodyW + 0.4;
      const rightW = SLIDE_W - rightX - 0.5;

      if (s.chart_data && s.chart_data.values.length > 0) {
        try {
          const chartType = s.chart_data.type === "pie"
            ? pres.charts.PIE
            : s.chart_data.type === "line"
              ? pres.charts.LINE
              : pres.charts.BAR;
          slide.addChart(chartType, [{
            name: s.chart_data.title || "Data",
            labels: s.chart_data.labels,
            values: s.chart_data.values,
          }], {
            x: rightX, y: bodyTop, w: rightW, h: SLIDE_H - bodyTop - 0.8,
            chartColors: [stripHash(a.accent_color), stripHash(a.primary_color), stripHash(a.secondary_color)],
            showLegend: s.chart_data.type === "pie",
            showTitle: !!s.chart_data.title,
            title: s.chart_data.title,
            titleFontSize: 12,
            titleColor: stripHash(a.primary_color),
            catAxisLabelFontSize: 10,
            valAxisLabelFontSize: 10,
          });
        } catch (e) {
          console.warn("[presentation-assembler] chart failed for slide", i, e);
        }
      } else if (s.image_hint && images.length > 0) {
        const img = popImage();
        if (img) {
          slide.addImage({
            data: `data:image/${normalizeExt(img.ext)};base64,${img.base64}`,
            x: rightX, y: bodyTop, w: rightW, h: SLIDE_H - bodyTop - 0.8,
            sizing: { type: "cover", w: rightW, h: SLIDE_H - bodyTop - 0.8 },
          });
        }
      }
    }

    if (s.speaker_notes) {
      slide.addNotes(s.speaker_notes);
    }
  }

  // pptxgenjs returns the file as an ArrayBuffer when outputType is 'arraybuffer'
  const out = await pres.write({ outputType: "arraybuffer" });
  return out as ArrayBuffer;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function stripHash(hex: string): string {
  return (hex || "").replace(/^#/, "").toUpperCase();
}

function clamp(n: any, lo: number, hi: number): number {
  const x = typeof n === "number" ? n : parseInt(n, 10);
  if (!Number.isFinite(x)) return Math.round((lo + hi) / 2);
  return Math.max(lo, Math.min(hi, Math.round(x)));
}

function normalizeExt(ext: string): string {
  const e = ext.toLowerCase();
  if (e === "jpg") return "jpeg";
  return e;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as any);
  }
  return btoa(bin);
}

async function callClaude(env: Env, prompt: string, maxTokens = 2000): Promise<string> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.OPENROUTER_API_KEY}` },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Claude HTTP ${res.status}: ${await res.text().catch(() => "")}`);
  const data: any = await res.json();
  return data?.choices?.[0]?.message?.content ?? "";
}

function safeJson<T>(text: string): T | null {
  if (!text) return null;
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  try { return JSON.parse(cleaned) as T; } catch {}
  const arr = cleaned.match(/\[[\s\S]*\]/);
  if (arr) { try { return JSON.parse(arr[0]) as T; } catch {} }
  const obj = cleaned.match(/\{[\s\S]*\}/);
  if (obj) { try { return JSON.parse(obj[0]) as T; } catch {} }
  return null;
}
