// src/infographic-assembler.ts
// Assembles infographic data from article content using Claude.
// 1. Content police runs on extracted JSON before SVG render — fixes all 25 banned patterns
// 2. Raw data CSV exported alongside the SVG
// 3. Sources text file generated from agent-sourced URLs
// 4. All files written to the project folder via packageInfographic

import { packageInfographic } from "./packager-update";
import { renderInfographicSVG } from "./infographic-renderer";

interface Env {
  submoacontent_db: D1Database;
  SUBMOA_IMAGES: R2Bucket;
  ANTHROPIC_API_KEY: string;
}

// ── Content police for infographic data ───────────────────────────────────────
// Runs on the structured JSON before SVG render.
// Checks labels, values, and context strings for banned patterns.
// Makes targeted fixes only — does not restructure the infographic.

const BANNED_PATTERNS = [
  // Em dashes and ellipses
  /—/g,
  /\.\.\./g,
  // AI tell phrases
  /\bin today'?s world\b/gi,
  /\bwhen it comes to\b/gi,
  /\bit'?s worth noting\b/gi,
  /\bit'?s important to note\b/gi,
  /\bdive into\b/gi,
  /\bdeep dive\b/gi,
  /\bdelve into\b/gi,
  /\btapestry\b/gi,
  /\blandscape\b/gi,
  /\bleverage\b/gi,
  /\bnavigate\b/gi,
  /\bunlock\b/gi,
  /\bunleash\b/gi,
  /\bgame.?changer\b/gi,
  /\bin conclusion\b/gi,
  /\bto summarize\b/gi,
  /\bin summary\b/gi,
  /\bfurthermore\b/gi,
  /\bmoreover\b/gi,
  /\bcrucial\b/gi,
  /\bpivotal\b/gi,
  /\bparamount\b/gi,
  /\bcomprehensive\b/gi,
  /\brobust\b/gi,
];

function stripBannedPatterns(text: string): string {
  let cleaned = text;
  // Replace em dashes with comma or hyphen
  cleaned = cleaned.replace(/—/g, " - ");
  // Remove ellipses
  cleaned = cleaned.replace(/\.\.\./g, ".");
  // Strip AI tell phrases (replace with nothing or simpler equivalent)
  cleaned = cleaned.replace(/\bin today'?s world\b/gi, "today");
  cleaned = cleaned.replace(/\bwhen it comes to\b/gi, "for");
  cleaned = cleaned.replace(/\bit'?s worth noting\b/gi, "notably");
  cleaned = cleaned.replace(/\bit'?s important to note\b/gi, "note that");
  cleaned = cleaned.replace(/\bdive into\b/gi, "explore");
  cleaned = cleaned.replace(/\bdeep dive\b/gi, "detailed look");
  cleaned = cleaned.replace(/\bdelve into\b/gi, "explore");
  cleaned = cleaned.replace(/\btapestry\b/gi, "combination");
  cleaned = cleaned.replace(/\blandscape\b/gi, "field");
  cleaned = cleaned.replace(/\bleverage\b/gi, "use");
  cleaned = cleaned.replace(/\bnavigate\b/gi, "manage");
  cleaned = cleaned.replace(/\bunlock\b/gi, "access");
  cleaned = cleaned.replace(/\bunleash\b/gi, "release");
  cleaned = cleaned.replace(/\bgame.?changer\b/gi, "major improvement");
  cleaned = cleaned.replace(/\bin conclusion\b/gi, "");
  cleaned = cleaned.replace(/\bto summarize\b/gi, "");
  cleaned = cleaned.replace(/\bin summary\b/gi, "");
  cleaned = cleaned.replace(/\bfurthermore\b/gi, "also");
  cleaned = cleaned.replace(/\bmoreover\b/gi, "also");
  cleaned = cleaned.replace(/\bcrucial\b/gi, "important");
  cleaned = cleaned.replace(/\bpivotal\b/gi, "key");
  cleaned = cleaned.replace(/\bparamount\b/gi, "essential");
  cleaned = cleaned.replace(/\bcomprehensive\b/gi, "complete");
  cleaned = cleaned.replace(/\brobust\b/gi, "strong");
  // Collapse double spaces
  cleaned = cleaned.replace(/  +/g, " ").trim();
  return cleaned;
}

export function enforceInfographicData(data: any): { data: any; violations: string[] } {
  const violations: string[] = [];

  function scanAndFix(obj: any, path: string): any {
    if (typeof obj === "string") {
      const original = obj;
      const cleaned = stripBannedPatterns(obj);
      if (cleaned !== original) {
        violations.push(`Fixed banned pattern in ${path}: "${original}" → "${cleaned}"`);
      }
      return cleaned;
    }
    if (Array.isArray(obj)) {
      return obj.map((item, i) => scanAndFix(item, `${path}[${i}]`));
    }
    if (typeof obj === "object" && obj !== null) {
      const result: Record<string, any> = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = scanAndFix(value, `${path}.${key}`);
      }
      return result;
    }
    return obj;
  }

  const cleanedData = scanAndFix(data, "root");

  if (violations.length > 0) {
    console.log(`Content police fixed ${violations.length} violation(s) in infographic data:`);
    violations.forEach((v) => console.log(" ", v));
  }

  return { data: cleanedData, violations };
}

// ── CSV data exporter ─────────────────────────────────────────────────────────
// Converts structured infographic JSON to the standard CSV template format.

export function exportInfographicCsv(data: any, sources: string[]): string {
  const header = "stat_label,value,context,source_url\n";

  const rows = (data.sections ?? []).map((s: any) => {
    const label = `"${(s.label ?? "").replace(/"/g, '""')}"`;
    const value = `"${(s.value ?? "").replace(/"/g, '""')}"`;
    const context = `"${(s.context ?? "").replace(/"/g, '""')}"`;
    const source = `"${(sources[0] ?? "").replace(/"/g, '""')}"`;
    return `${label},${value},${context},${source}`;
  });

  return header + rows.join("\n");
}

// ── Sources text file ─────────────────────────────────────────────────────────

export function buildSourcesText(
  sources: string[],
  submissionId: string,
  topic: string
): string {
  const date = new Date().toISOString().split("T")[0];
  const lines = [
    `Sources — ${topic}`,
    `Project ID: ${submissionId}`,
    `Generated: ${date}`,
    "",
    ...sources.map((s, i) => `${i + 1}. ${s}`),
    "",
    "Sources were gathered automatically by the infographic assembly agent.",
    "Verify all data before publication.",
  ];
  return lines.join("\n");
}

// ── Full assembler function (replace in infographic-assembler.ts) ─────────────

export async function assembleInfographic(
  env: Env,
  submission: any,
  infraRecord: any
): Promise<void> {
  try {
    await env.submoacontent_db.prepare(
      `UPDATE infographic_submissions SET infographic_status = 'rendering' WHERE id = ?`
    ).bind(infraRecord.id).run();

    // Fetch skill + style
    const skill = await env.submoacontent_db.prepare(
      `SELECT content FROM agent_skills WHERE name = 'writing-skill' AND active = 1 LIMIT 1`
    ).first<{ content: string }>();

    const style = await env.submoacontent_db.prepare(
      `SELECT * FROM infographic_styles WHERE id = ?`
    ).bind(infraRecord.design_style).first();

    // Build prompt
    const prompt = `You are the Infographic Assembly Agent.

ASSEMBLY PROFILE FROM SKILL DOCUMENT:
${skill?.content ?? "Extract key data points. Return valid JSON only."}

DESIGN STYLE: ${(style as any)?.label ?? infraRecord.design_style}
LAYOUT: ${infraRecord.layout}
MAX DATA POINTS: ${infraRecord.max_data_points}
${infraRecord.primary_stat ? `PRIMARY STAT TO ANCHOR: ${infraRecord.primary_stat}` : ""}
${infraRecord.cta_text ? `CTA TEXT: ${infraRecord.cta_text}` : ""}

ARTICLE CONTENT:
${submission.article_content}

Return ONLY valid JSON. No markdown fences. No preamble. Schema:
{
  "headline": "string (max 8 words)",
  "subheadline": "string (max 12 words, optional)",
  "sections": [
    {
      "label": "string (max 5 words)",
      "value": "string (stat or short claim)",
      "context": "string (max 8 words, optional)",
      "source_url": "string (optional)"
    }
  ],
  "subject_a": "string (only for comparison type)",
  "subject_b": "string (only for comparison type)",
  "cta": "string (optional)",
  "sources": ["array of source URLs used"]
}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const responseData: any = await response.json();
    const jsonText = responseData.content?.[0]?.text?.trim();

    let infographicData: any;
    try {
      infographicData = JSON.parse(jsonText);
    } catch {
      console.error("Infographic JSON parse failed:", jsonText);
      await env.submoacontent_db.prepare(
        `UPDATE infographic_submissions SET infographic_status = 'failed' WHERE id = ?`
      ).bind(infraRecord.id).run();
      return;
    }

    // ── CONTENT POLICE ────────────────────────────────────────────────────────
    const { data: cleanedData, violations } = enforceInfographicData(infographicData);
    infographicData = cleanedData;

    if (violations.length > 0) {
      console.log(`Content police made ${violations.length} fix(es) to infographic data for ${submission.id}`);
    }

    // ── RENDER SVG ────────────────────────────────────────────────────────────
    const svg = renderInfographicSVG(infographicData, style as any, infraRecord);

    // ── EXPORT CSV + SOURCES ──────────────────────────────────────────────────
    const sources: string[] = infographicData.sources ?? [];
    const csvData = exportInfographicCsv(infographicData, sources);
    const sourcesText = buildSourcesText(sources, submission.id, submission.topic ?? "Infographic");

    // ── WRITE TO PROJECT FOLDER ───────────────────────────────────────────────
    await packageInfographic(
      env,
      submission.id,
      svg,
      csvData,
      sourcesText,
      // PNG conversion would go here if a headless renderer is available
      // For now, PNG placeholder remains until PNG renderer is wired
      undefined
    );

    // Save structured data to DB
    await env.submoacontent_db.prepare(
      `UPDATE infographic_submissions SET
        infographic_data = ?,
        infographic_status = 'ready',
        svg_r2_key = ?,
        assembled_at = ?
       WHERE id = ?`
    ).bind(
      JSON.stringify(infographicData),
      `projects/${submission.id}/infographic/infographic.svg`,
      Date.now(),
      infraRecord.id
    ).run();

    console.log(`Infographic assembled for submission ${submission.id}`);

  } catch (err) {
    console.error("Infographic assembly error:", err);
    await env.submoacontent_db.prepare(
      `UPDATE infographic_submissions SET infographic_status = 'failed' WHERE id = ?`
    ).bind(infraRecord.id).run();
    // Never block pipeline
  }
}
