// functions/api/grading-v2.ts
// Parallel V2 grader — runs alongside the existing grading.ts module without replacing it.
//
// Differences vs v1:
//   - Single entry point: gradeArticle() returns one GradeResult
//   - AI detection uses Pangram (env.PANGRAM_API_KEY) instead of Copyleaks
//   - Plagiarism is stubbed (returns 100) — wire to a real provider before relying on it
//   - SEO uses keyword density bands (0.5–2.5% optimal) + title-position bonus
//   - Markdown is stripped from the article before scoring
//
// To validate against v1 results, call both from the same caller and compare scores.

import type { Env as BaseEnv } from "./_utils";

// Augment Env with the new secret this grader needs (the base type doesn't know about Pangram yet)
type Env = BaseEnv & { PANGRAM_API_KEY?: string };

export interface GradeResult {
  grammar_score: number;
  readability_score: number;
  ai_detection_score: number;
  plagiarism_score: number;
  seo_score: number;
  overall_score: number;
  passed: boolean;
}

export const THRESHOLDS_V2 = {
  grammar: 85,
  readability: 70,
  ai_detection: 80,
  plagiarism: 90,
  seo: 70,
  overall: 80,
};

const WEIGHTS = {
  grammar: 0.20,
  readability: 0.15,
  ai_detection: 0.30,
  plagiarism: 0.20,
  seo: 0.15,
};

// ---------------------------------------------------------------------------
// Grammar — LanguageTool (free tier, same as v1)
// ---------------------------------------------------------------------------
async function scoreGrammar(text: string, _env: Env): Promise<number> {
  try {
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    if (wordCount === 0) return 100;
    const params = new URLSearchParams({ text, language: "en-US" });
    const res = await fetch("https://api.languagetool.org/v2/check", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    if (!res.ok) return 85;
    const data: any = await res.json();
    const errorCount = data.matches?.length ?? 0;
    const score = 100 - Math.round((errorCount / wordCount) * 100);
    return Math.max(0, Math.min(100, score));
  } catch {
    return 85;
  }
}

// ---------------------------------------------------------------------------
// Readability — Flesch-Kincaid
// ---------------------------------------------------------------------------
function countSyllables(word: string): number {
  word = word.toLowerCase().replace(/[^a-z]/g, "");
  if (word.length <= 3) return 1;
  const stripped = word.replace(/(?:[^laeiouy]|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
  const matches = stripped.match(/[aeiouy]{1,2}/g);
  return matches ? matches.length : 1;
}

function scoreReadability(text: string): number {
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0).length;
  const words = text.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  if (wordCount === 0 || sentences === 0) return 70;
  const syllableCount = words.reduce((sum, w) => sum + countSyllables(w), 0);
  const fk = 206.835 - 1.015 * (wordCount / sentences) - 84.6 * (syllableCount / wordCount);
  return Math.max(0, Math.min(100, Math.round(fk)));
}

// ---------------------------------------------------------------------------
// AI Detection — Pangram
// ---------------------------------------------------------------------------
async function scoreAiDetection(text: string, env: Env): Promise<number> {
  if (!env.PANGRAM_API_KEY) {
    console.warn("[grading-v2] PANGRAM_API_KEY not set — returning fallback 80");
    return 80;
  }
  try {
    const res = await fetch("https://pangram.com/api/v1/detect", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.PANGRAM_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: text.slice(0, 10000) }),
    });
    if (!res.ok) {
      console.warn("[grading-v2] Pangram HTTP", res.status);
      return 80;
    }
    const data: any = await res.json();
    const humanProbability = data.human_probability ?? data.human ?? data.score ?? 0.8;
    return Math.round(humanProbability * 100);
  } catch (e) {
    console.warn("[grading-v2] Pangram exception:", e);
    return 80;
  }
}

// ---------------------------------------------------------------------------
// Plagiarism — STUB (always returns 100). Wire to a real provider before trusting.
// ---------------------------------------------------------------------------
function scorePlagiarism(): number {
  return 100;
}

// ---------------------------------------------------------------------------
// SEO — keyword density bands + first-200-chars bonus
// ---------------------------------------------------------------------------
function scoreSeo(text: string, targetKeywords: string[]): number {
  if (!targetKeywords || targetKeywords.length === 0) return 70;
  const lowerText = text.toLowerCase();
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  if (wordCount === 0) return 70;
  let totalScore = 0;
  for (const keyword of targetKeywords) {
    const kw = keyword.toLowerCase().trim();
    if (!kw) continue;
    const regex = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    const matches = lowerText.match(regex);
    const count = matches ? matches.length : 0;
    const density = (count / wordCount) * 100;
    let kwScore = 0;
    if (density >= 0.5 && density <= 2.5) kwScore = 100;
    else if (density > 0 && density < 0.5) kwScore = 60;
    else if (density > 2.5) kwScore = 70;
    else kwScore = 0;
    const titleBonus = lowerText.indexOf(kw) >= 0 && lowerText.indexOf(kw) < 200 ? 10 : 0;
    totalScore += Math.min(100, kwScore + titleBonus);
  }
  return Math.round(totalScore / targetKeywords.length);
}

// ---------------------------------------------------------------------------
// Public entry — gradeArticleV2
// ---------------------------------------------------------------------------
export async function gradeArticleV2(
  articleContent: string,
  targetKeywordsJson: string | null,
  env: Env
): Promise<GradeResult> {
  const plainText = articleContent
    .replace(/#{1,6}\s/g, "")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`[^`]+`/g, "")
    .trim();

  let keywords: string[] = [];
  try {
    if (targetKeywordsJson) {
      const parsed = JSON.parse(targetKeywordsJson);
      keywords = Array.isArray(parsed) ? parsed : [parsed];
    }
  } catch {
    keywords = targetKeywordsJson ? [targetKeywordsJson] : [];
  }

  const [grammarScore, aiScore] = await Promise.all([
    scoreGrammar(plainText, env),
    scoreAiDetection(plainText, env),
  ]);

  const readabilityScore = scoreReadability(plainText);
  const plagiarismScore = scorePlagiarism();
  const seoScore = scoreSeo(plainText, keywords);

  const overallScore = Math.round(
    grammarScore * WEIGHTS.grammar +
    readabilityScore * WEIGHTS.readability +
    aiScore * WEIGHTS.ai_detection +
    plagiarismScore * WEIGHTS.plagiarism +
    seoScore * WEIGHTS.seo
  );

  return {
    grammar_score: grammarScore,
    readability_score: readabilityScore,
    ai_detection_score: aiScore,
    plagiarism_score: plagiarismScore,
    seo_score: seoScore,
    overall_score: overallScore,
    passed: overallScore >= THRESHOLDS_V2.overall,
  };
}
