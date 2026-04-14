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

// Cache Copyleaks access tokens per-worker-instance to avoid re-authenticating on every call
let _copyleaksToken: string | null = null;
let _copyleaksTokenExpiry = 0;

async function getCopyleaksToken(apiKey: string): Promise<string> {
  // apiKey is stored as "email:key" format: "ben@example.com:00000000-0000-..."
  const colonIdx = apiKey.indexOf(":");
  if (colonIdx < 0) throw new Error("COPYLEAKS_API_KEY must be in format email:key");
  const email = apiKey.slice(0, colonIdx);
  const key = apiKey.slice(colonIdx + 1);

  const res = await fetch("https://id.copyleaks.com/v3/account/login/api", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, key }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error("Copyleaks login failed:", res.status, err);
    throw new Error(`Copyleaks auth failed: ${res.status}`);
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

async function ensureCopyleaksToken(apiKey: string): Promise<string> {
  // Tokens are valid for ~24h; reuse until near expiry
  if (_copyleaksToken && Date.now() < _copyleaksTokenExpiry - 60_000) {
    return _copyleaksToken;
  }
  _copyleaksToken = await getCopyleaksToken(apiKey);
  _copyleaksTokenExpiry = Date.now() + 86_400_000; // 24h
  return _copyleaksToken;
}

// ---------------------------------------------------------------------------
// 3c. AI Detection — Copyleaks Writer Detector (may be async)
// ---------------------------------------------------------------------------
async function pollWriterDetector(
  accessToken: string,
  scanId: string,
  maxWaitMs = 30000
): Promise<number | null> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    await new Promise(r => setTimeout(r, 3000));
    const res = await fetch(
      `https://api.copyleaks.com/v2/writer-detector/${scanId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) continue;
    const data = await res.json() as { summary?: { human: number }; result?: { human: number } };
    const human = data.summary?.human ?? data.result?.human ?? null;
    if (human !== null) return Math.round(human * 100);
  }
  return null;
}

export async function scoreAiDetection(
  text: string,
  apiKey: string | undefined
): Promise<number | null> {
  if (!apiKey) {
    console.warn("COPYLEAKS_API_KEY missing — AI detection skipped");
    return null;
  }

  let accessToken: string;
  try {
    accessToken = await ensureCopyleaksToken(apiKey);
  } catch (err) {
    console.error("Copyleaks AI detection auth error:", err);
    return null;
  }

  const scanId = crypto.randomUUID();

  const res = await fetch(
    `https://api.copyleaks.com/v2/writer-detector/${scanId}/check`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    }
  );

  if (!res.ok) {
    console.error("Copyleaks AI detection error:", res.status, await res.text());
    return null;
  }

  // Try immediate response first
  const data = await res.json() as {
    summary?: { human: number };
    result?: { human: number };
    status?: string;
  };

  if (data.summary?.human !== undefined) {
    return Math.round(data.summary.human * 100);
  }
  if (data.result?.human !== undefined) {
    return Math.round(data.result.human * 100);
  }

  // If status indicates async, poll for results
  if (data.status === 'in_progress' || data.status === 'pending' || data.status === undefined) {
    return await pollWriterDetector(accessToken, scanId);
  }

  return null;
}

// ---------------------------------------------------------------------------
// 3d. Plagiarism — Copyleaks
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// 3d. Plagiarism — Copyleaks (async, requires polling)
// ---------------------------------------------------------------------------
function utf8ToBase64(str: string): string {
  // btoa doesn't handle Unicode — use TextEncoder via Uint8Array
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  let binary = '';
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary);
}

async function pollCopyleaksScan(
  accessToken: string,
  scanId: string,
  maxWaitMs = 30000
): Promise<{ completed: boolean; plagiarismScore?: number }> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const res = await fetch(
      `https://api.copyleaks.com/v3/businesses/${scanId}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    if (!res.ok) {
      // Not ready yet or error — wait and retry
      await new Promise(r => setTimeout(r, 2000));
      continue;
    }
    const data = await res.json() as {
      status: string;
      results?: { score: number }[];
      plagiarismScore?: number;
    };
    if (data.status === 'completed') {
      // Extract max plagiarism score from results
      const score = data.plagiarismScore ??
        (data.results && data.results.length > 0
          ? Math.max(...data.results.map(r => r.score))
          : 0);
      return { completed: true, plagiarismScore: score };
    }
    // In progress — wait 3s before polling again
    await new Promise(r => setTimeout(r, 3000));
  }
  return { completed: false };
}

export async function scorePlagiarism(
  text: string,
  apiKey: string | undefined,
  title: string
): Promise<number | null> {
  if (!apiKey) {
    console.warn("COPYLEAKS_API_KEY missing — plagiarism check skipped");
    return null;
  }

  let accessToken: string;
  try {
    accessToken = await ensureCopyleaksToken(apiKey);
  } catch (err) {
    console.error("Copyleaks plagiarism auth error:", err);
    return null;
  }

  const scanId = crypto.randomUUID();

  // Use proper UTF-8 base64 encoding to avoid btoa URIError on Unicode chars
  const base64Text = utf8ToBase64(text);

  const res = await fetch(
    `https://api.copyleaks.com/v3/businesses/submit/text`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: base64Text,
        base64: true,
        properties: {
          title,
          action: 0, // full scan, returns results directly in newer API versions
        },
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    console.error("Copyleaks plagiarism submit error:", res.status, errText);
    return null;
  }

  // Try to parse as immediate result first (newer API versions)
  const data = await res.json() as {
    plagiarismScore?: number;
    status?: string;
    scanId?: string;
  };

  // If API returns score directly, use it
  if (data.plagiarismScore !== undefined) {
    return Math.round((1 - data.plagiarismScore) * 100);
  }

  // Otherwise if it returns a scanId and 'completed' status, poll for results
  if (data.scanId || data.status === 'completed') {
    const result = await pollCopyleaksScan(accessToken, data.scanId ?? scanId);
    if (result.completed && result.plagiarismScore !== undefined) {
      return Math.round((1 - result.plagiarismScore) * 100);
    }
  }

  // Fallback — return a neutral score rather than blocking pipeline
  console.warn("Copyleaks plagiarism: could not retrieve score, returning null");
  return null;
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

// Score color helper (for UI)
// ---------------------------------------------------------------------------
export function scoreColor(score: number | null, threshold: number): "pass" | "warn" | "fail" {
  if (score === null) return "fail";
  if (score >= threshold) return "pass";
  if (score >= threshold - 10) return "warn";
  return "fail";
}
