// src/grading.ts
// Article grading utility — all scoring functions, thresholds, weighted average

export const THRESHOLDS = {
  grammar: 85,
  readability: 70,
  ai_detection: 80,
  plagiarism: 90,
  seo: 70,
  overall: 80,
} as const;

export const MAX_REWRITE_ATTEMPTS = 2;

export interface GradeScores {
  grammar: number | null;
  readability: number | null;
  ai_detection: number | null;
  plagiarism: number | null;
  seo: number | null;
  overall: number | null;
}

// ---------------------------------------------------------------------------
// 3a. Grammar — LanguageTool API
// ---------------------------------------------------------------------------
export async function scoreGrammar(
  text: string,
  apiKey?: string
): Promise<number> {
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  if (wordCount === 0) return 0;

  const body = new URLSearchParams({
    text,
    language: "en-US",
    ...(apiKey ? { apiKey } : {}),
  });

  const res = await fetch("https://api.languagetool.org/v2/check", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    console.error("LanguageTool error:", res.status, await res.text());
    return 0;
  }

  const data: { matches: unknown[] } = await res.json();
  const errorCount = data.matches?.length ?? 0;
  const raw = 100 - (errorCount / wordCount) * 100;
  return Math.min(100, Math.max(0, Math.round(raw)));
}

// ---------------------------------------------------------------------------
// 3b. Readability — Flesch-Kincaid (local, no API)
// ---------------------------------------------------------------------------
function countSyllables(word: string): number {
  word = word.toLowerCase().replace(/[^a-z]/g, "");
  if (word.length <= 3) return 1;
  // Remove trailing e
  word = word.replace(/e$/, "");
  const vowelGroups = word.match(/[aeiou]+/gi);
  return Math.max(1, vowelGroups ? vowelGroups.length : 1);
}

export function scoreReadability(text: string): number {
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0).length;
  const words = text.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  if (sentences === 0 || wordCount === 0) return 0;

  const syllables = words.reduce((sum, w) => sum + countSyllables(w), 0);
  const fk =
    206.835 - 1.015 * (wordCount / sentences) - 84.6 * (syllables / wordCount);
  return Math.min(100, Math.max(0, Math.round(fk)));
}

// ---------------------------------------------------------------------------
// 3c. AI Detection — Copyleaks
// ---------------------------------------------------------------------------
export async function scoreAiDetection(
  text: string,
  apiKey: string | undefined
): Promise<number | null> {
  if (!apiKey) {
    console.warn("COPYLEAKS_API_KEY missing — AI detection skipped");
    return null;
  }

  const scanId = crypto.randomUUID();

  const res = await fetch(
    `https://api.copyleaks.com/v2/writer-detector/${scanId}/check`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    }
  );

  if (!res.ok) {
    console.error("Copyleaks AI detection error:", res.status, await res.text());
    return null;
  }

  const data: { human: number } = await res.json();
  // human is 0–1, higher = more human-like = better score
  return Math.round((data.human ?? 0) * 100);
}

// ---------------------------------------------------------------------------
// 3d. Plagiarism — Copyleaks
// ---------------------------------------------------------------------------
export async function scorePlagiarism(
  text: string,
  apiKey: string | undefined,
  title: string
): Promise<number | null> {
  if (!apiKey) {
    console.warn("COPYLEAKS_API_KEY missing — plagiarism check skipped");
    return null;
  }

  const scanId = crypto.randomUUID();

  const res = await fetch(
    `https://api.copyleaks.com/v3/businesses/submit/url`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: `data:text/plain;base64,${btoa(text)}`,
        properties: {
          title,
          action: 1, // checkCredits
          scanId,
        },
      }),
    }
  );

  if (!res.ok) {
    console.error("Copyleaks plagiarism error:", res.status, await res.text());
    return null;
  }

  const data: { plagiarismScore: number } = await res.json();
  return Math.round((1 - (data.plagiarismScore ?? 0)) * 100);
}

// ---------------------------------------------------------------------------
// 3e. SEO Alignment — local keyword density check
// ---------------------------------------------------------------------------
export function scoreSeo(
  articleText: string,
  targetKeywords: string[],
  title: string,
  firstParagraph: string
): number {
  if (!targetKeywords || targetKeywords.length === 0) return 70; // neutral if no keywords

  const lowerArticle = articleText.toLowerCase();
  const lowerTitle = title.toLowerCase();
  const lowerFirst = firstParagraph.toLowerCase();

  let totalScore = 0;

  for (const kw of targetKeywords) {
    const lowerKw = kw.toLowerCase();

    // Base: appears anywhere in article
    const bodyMatches = (lowerArticle.match(new RegExp(lowerKw, "g")) ?? []).length;

    // Position bonus: title or first paragraph = 2x weight
    const positionBonus =
      (lowerTitle.includes(lowerKw) ? 2 : 0) +
      (lowerFirst.includes(lowerKw) ? 2 : 0);

    const kwScore = Math.min(10, bodyMatches + positionBonus);
    totalScore += kwScore;
  }

  // Normalize to 0–100
  const maxPossible = targetKeywords.length * 10;
  return Math.min(100, Math.round((totalScore / maxPossible) * 100));
}

// ---------------------------------------------------------------------------
// 3f. Weighted overall score
// ---------------------------------------------------------------------------
export function calcOverall(scores: GradeScores): number {
  const weights: Record<keyof Omit<GradeScores, "overall">, number> = {
    grammar: 0.2,
    readability: 0.15,
    ai_detection: 0.3,
    plagiarism: 0.2,
    seo: 0.15,
  };

  let weightSum = 0;
  let scoreSum = 0;

  for (const [key, weight] of Object.entries(weights) as [
    keyof typeof weights,
    number
  ][]) {
    const val = scores[key];
    if (val !== null && val !== undefined) {
      scoreSum += val * weight;
      weightSum += weight;
    }
  }

  if (weightSum === 0) return 0;

  // Redistribute excluded weights proportionally
  return Math.round(scoreSum / weightSum);
}

// ---------------------------------------------------------------------------
// Rewrite instruction builder
// ---------------------------------------------------------------------------
export function buildRewriteInstructions(scores: GradeScores, targetKeywords: string[]): string {
  const instructions: string[] = [];

  if (scores.grammar !== null && scores.grammar < THRESHOLDS.grammar) {
    instructions.push("Fix all grammar, punctuation, and sentence structure issues.");
  }
  if (scores.readability !== null && scores.readability < THRESHOLDS.readability) {
    instructions.push("Shorten sentences, simplify vocabulary, improve paragraph flow.");
  }
  if (scores.ai_detection !== null && scores.ai_detection < THRESHOLDS.ai_detection) {
    instructions.push(
      "Rewrite to sound more natural and human. Add specific observations, vary sentence rhythm, use contractions, include concrete details."
    );
  }
  if (scores.plagiarism !== null && scores.plagiarism < THRESHOLDS.plagiarism) {
    instructions.push(
      "Rephrase any sections that closely mirror common sources. Use original framing throughout."
    );
  }
  if (scores.seo !== null && scores.seo < THRESHOLDS.seo) {
    instructions.push(
      `Naturally incorporate these keywords more thoroughly: ${targetKeywords.join(", ")}.`
    );
  }

  return instructions.join("\n");
}

// ---------------------------------------------------------------------------
// Score color helper (for UI)
// ---------------------------------------------------------------------------
export function scoreColor(score: number | null, threshold: number): "pass" | "warn" | "fail" {
  if (score === null) return "fail";
  if (score >= threshold) return "pass";
  if (score >= threshold - 10) return "warn";
  return "fail";
}
