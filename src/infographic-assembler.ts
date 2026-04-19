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

// Per-stage failure recorder. Any caller that throws flips the row to
// generation_failed and stamps an error message + timestamp so the UI can
// surface it and the sweeper can requeue.
async function recordFailure(
  env: Env,
  submissionId: string,
  infraRecordId: string,
  stage: string,
  err: unknown,
): Promise<void> {
  const msg = err instanceof Error ? err.message : String(err);
  const full = `[${stage}] ${msg}`.slice(0, 800);
  console.error(`[infographic-assembler] failure at ${stage} for ${submissionId}:`, err);
  try {
    await env.submoacontent_db.prepare(
      `UPDATE infographic_submissions
         SET infographic_status = 'generation_failed',
             error_message = ?,
             updated_at = ?
       WHERE id = ?`
    ).bind(full, Date.now(), infraRecordId).run();
  } catch (writeErr) {
    console.error('[infographic-assembler] failed to persist failure state:', writeErr);
  }
  try {
    await env.submoacontent_db.prepare(
      `UPDATE submissions SET status = 'generation_failed', updated_at = ? WHERE id = ?`
    ).bind(Date.now(), submissionId).run();
  } catch {}
}

export async function assembleInfographic(
  env: Env,
  submission: any,
  infraRecord: any
): Promise<void> {
  const submissionId = submission?.id;
  const infraId = infraRecord?.id;
  if (!submissionId || !infraId) {
    console.error('[infographic-assembler] missing submission or infographic record id — aborting');
    return;
  }

  // Stage 0 — mark generating with a fresh timestamp so the timeout sweeper
  // has a clean reference point even if the row was left stale from before.
  try {
    await env.submoacontent_db.prepare(
      `UPDATE infographic_submissions
         SET infographic_status = 'generating',
             error_message = NULL,
             updated_at = ?
       WHERE id = ?`
    ).bind(Date.now(), infraId).run();
  } catch (e) {
    console.error('[infographic-assembler] stage-0 status write failed:', e);
  }

  // Stage 1 — fetch skill + style.
  let skill: { content: string } | null = null;
  let style: any = null;
  try {
    skill = await env.submoacontent_db.prepare(
      `SELECT content FROM agent_skills WHERE name = 'writing-skill' AND active = 1 LIMIT 1`
    ).first<{ content: string }>();
    style = await env.submoacontent_db.prepare(
      `SELECT * FROM infographic_styles WHERE id = ?`
    ).bind(infraRecord.design_style).first();
  } catch (e) {
    await recordFailure(env, submissionId, infraId, 'fetch-skill-or-style', e);
    return;
  }

  // Stage 2 — call Claude.
  let jsonText: string | undefined;
  try {
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

    if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured');

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
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Anthropic HTTP ${response.status}: ${body.slice(0, 300)}`);
    }
    const responseData: any = await response.json();
    jsonText = responseData.content?.[0]?.text?.trim();
    if (!jsonText) throw new Error('Anthropic returned empty content');
  } catch (e) {
    await recordFailure(env, submissionId, infraId, 'anthropic-generate', e);
    return;
  }

  // Stage 3 — parse JSON.
  let infographicData: any;
  try {
    infographicData = JSON.parse(jsonText);
  } catch (e) {
    await recordFailure(env, submissionId, infraId, 'parse-json', new Error(`JSON parse failed: ${(jsonText || '').slice(0, 200)}`));
    return;
  }

  // Stage 4 — content police (pure function, should never throw but guard anyway).
  try {
    const { data: cleanedData, violations } = enforceInfographicData(infographicData);
    infographicData = cleanedData;
    if (violations.length > 0) {
      console.log(`Content police made ${violations.length} fix(es) to infographic data for ${submissionId}`);
    }
  } catch (e) {
    await recordFailure(env, submissionId, infraId, 'content-police', e);
    return;
  }

  // Stage 5 — render SVG.
  let svg = '';
  try {
    svg = renderInfographicSVG(infographicData, style as any, infraRecord);
  } catch (e) {
    await recordFailure(env, submissionId, infraId, 'render-svg', e);
    return;
  }

  // Stage 6 — export CSV + sources.
  const sources: string[] = infographicData.sources ?? [];
  let csvData = '';
  let sourcesText = '';
  try {
    csvData = exportInfographicCsv(infographicData, sources);
    sourcesText = buildSourcesText(sources, submissionId, submission.topic ?? "Infographic");
  } catch (e) {
    await recordFailure(env, submissionId, infraId, 'export-assets', e);
    return;
  }

  // Stage 7 — package to R2.
  try {
    await packageInfographic(env, submissionId, svg, csvData, sourcesText, undefined);
  } catch (e) {
    await recordFailure(env, submissionId, infraId, 'package-r2', e);
    return;
  }

  // Stage 8 — persist final state.
  try {
    await env.submoacontent_db.prepare(
      `UPDATE infographic_submissions SET
        infographic_data = ?,
        infographic_status = 'ready',
        svg_r2_key = ?,
        assembled_at = ?,
        updated_at = ?,
        error_message = NULL
       WHERE id = ?`
    ).bind(
      JSON.stringify(infographicData),
      `projects/${submissionId}/infographic/infographic.svg`,
      Date.now(),
      Date.now(),
      infraId
    ).run();
    console.log(`Infographic assembled for submission ${submissionId}`);
  } catch (e) {
    await recordFailure(env, submissionId, infraId, 'persist-final', e);
  }
}
