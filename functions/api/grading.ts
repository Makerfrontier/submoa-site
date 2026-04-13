// src/grading.ts
// Article grading utility — all scoring functions, thresholds, weighted average

export const THRESHOLDS = {
  grammar: 85,
  readability: 50, // lowered from 70 — Flesch-Kincaid alone is unreliable until Copyleaks is wired
  ai_detection: 80,
  plagiarism: 90,
  seo: 70,
  overall: 75, // lowered from 80 until all 5 scores available
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
// Copyleaks Auth — token cache (tokens valid ~24h)
// ---------------------------------------------------------------------------
let _copyleaksToken: string | null = null;
let _copyleaksTokenExpiry = 0;

async function getCopyleaksToken(apiKey: string): Promise<string | null> {
  const now = Date.now();
  if (_copyleaksToken && now < _copyleaksTokenExpiry - 60_000) {
    return _copyleaksToken;
  }
  // apiKey is stored as "email:key" format — parse to extract credentials
  const colonIdx = apiKey.indexOf(":");
  if (colonIdx < 0) {
    console.error("COPYLEAKS_API_KEY must be in format email:key");
    return null;
  }
  const email = apiKey.slice(0, colonIdx);
  const key = apiKey.slice(colonIdx + 1);

  const res = await fetch("https://id.copyleaks.com/v3/account/login/api", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, key }),
  });
  if (!res.ok) {
    console.error("Copyleaks login failed:", res.status, await res.text());
    return null;
  }
  const data = (await res.json()) as { access_token: string };
  _copyleaksToken = data.access_token;
  _copyleaksTokenExpiry = now + 86_400_000; // 24h cache
  return _copyleaksToken;
}

// ---------------------------------------------------------------------------
// 3c. AI Detection — Copyleaks
// ---------------------------------------------------------------------------
export async function scoreAiDetection(
  text: string,
  apiKey: string | undefined
): Promise<number | null> {
  if (!apiKey) {
    console.error("COPYLEAKS_API_KEY missing");
    return null;
  }

  try {
    const token = await getCopyleaksToken(apiKey);
    console.log("Copyleaks AI token obtained:", !!token);
    if (!token) return null;

    const scanId = crypto.randomUUID();
    console.log("Calling AI detection endpoint, scanId:", scanId);

    const res = await fetch(
      `https://api.copyleaks.com/v2/writer-detector/${scanId}/check`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text }),
      }
    );

    const responseText = await res.text();
    console.log("AI detection response status:", res.status);
    console.log("AI detection response body:", responseText);

    if (!res.ok) {
      console.error("AI detection HTTP error:", res.status, responseText);
      return null;
    }

    try {
      const data = JSON.parse(responseText);
      return Math.round((data.human ?? 0) * 100);
    } catch (e) {
      console.error("AI detection parse error:", e);
      return null;
    }
  } catch (err) {
    console.error("AI detection exception:", err);
    return null;
  }
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
    console.error("COPYLEAKS_API_KEY missing");
    return null;
  }

  try {
    const token = await getCopyleaksToken(apiKey);
    console.log("Copyleaks Plagiarism token obtained:", !!token);
    if (!token) return null;

    const scanId = crypto.randomUUID();
    console.log("Calling plagiarism endpoint, scanId:", scanId);

    // Use /v3/businesses/submit/file for plain text content
    const res = await fetch(
      `https://api.copyleaks.com/v3/businesses/submit/file/${scanId}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          content: text,
          action: 'checkCredits',
        }),
      }
    );

    const responseText = await res.text();
    console.log("Plagiarism response status:", res.status);
    console.log("Plagiarism response body:", responseText);

    if (!res.ok) {
      console.error("Plagiarism HTTP error:", res.status, responseText);
      return null;
    }

    try {
      const data = JSON.parse(responseText);
      // For async, response contains scanId - need to poll for results
      const resultScanId = data.scanId || scanId;
      console.log("Plagiarism scan submitted, polling scanId:", resultScanId);

      // Poll for results (max 30 seconds)
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 1000));
        const pollRes = await fetch(
          `https://api.copyleaks.com/v3/scans/${resultScanId}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        const pollText = await pollRes.text();
        console.log(`Polling attempt ${i+1}, status:`, pollRes.status);

        if (!pollRes.ok) {
          console.error("Polling error:", pollRes.status, pollText);
          continue;
        }

        const pollData = JSON.parse(pollText);
        console.log("Poll response:", pollText);

        if (pollData.status === 'completed') {
          const plagiarismScore = pollData.results?.similarity ?? 0;
          return Math.round((1 - plagiarismScore) * 100);
        } else if (pollData.status === 'failed') {
          console.error("Plagiarism scan failed:", pollText);
          return null;
        }
        // Otherwise still processing, continue polling
      }
      console.error("Plagiarism polling timed out");
      return null;
    } catch (e) {
      console.error("Plagiarism parse/processing error:", e);
      return null;
    }
  } catch (err) {
    console.error("Plagiarism exception:", err);
    return null;
  }
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
