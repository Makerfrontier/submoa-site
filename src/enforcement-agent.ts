// enforcement-agent.ts
// Scans generated articles for banned patterns and fixes only the violations.
// If enforcement fails, falls back to the raw article — never blocks the pipeline.

const BANNED_PATTERNS = [
  { pattern: /--/g, label: "em dash (--)" },
  { pattern: /\.\.\./g, label: "ellipsis (...)" },
  { pattern: /\bdelve[s]?\b/gi, label: '"delve" / "delving"' },
  { pattern: /\btapestry\b/gi, label: '"tapestry"' },
  { pattern: /\brobust\b/gi, label: '"robust"' },
  { pattern: /\bcrucial\b/gi, label: '"crucial"' },
  { pattern: /\bpivotal\b/gi, label: '"pivotal"' },
  { pattern: /\bfurthermore\b/gi, label: '"furthermore"' },
  { pattern: /\bmoreover\b/gi, label: '"moreover"' },
  { pattern: /\bin conclusion\b/gi, label: '"in conclusion"' },
  { pattern: /\bto conclude\b/gi, label: '"to conclude"' },
  { pattern: /\btestament\b/gi, label: '"testament"' },
  { pattern: /\bleverage[\s\S]*?\b/gi, label: '"leverage" (verb)' },
  { pattern: /\bnavigate[\s\S]*?\b/gi, label: '"navigate" (non-physical)' },
  { pattern: /\bparadigm\b/gi, label: '"paradigm"' },
  { pattern: /\becosystem[\s\S]*?\b/gi, label: '"ecosystem" (non-biology)' },
  { pattern: /\bunlock\b/gi, label: '"unlock"' },
  { pattern: /\bholistic\b/gi, label: '"holistic"' },
  { pattern: /\bfoster\b/gi, label: '"foster"' },
  { pattern: /\bharness\b/gi, label: '"harness"' },
  { pattern: /\bstreamline\b/gi, label: '"streamline"' },
  { pattern: /\boptimize\b/gi, label: '"optimize"' },
  { pattern: /\butilize\b/gi, label: '"utilize"' },
  { pattern: /\bfacilitate\b/gi, label: '"facilitate"' },
  { pattern: /\bimplement\b/gi, label: '"implement"' },
  { pattern: /\bsubsequently\b/gi, label: '"subsequently"' },
  { pattern: /\bdelve\s+into\b/gi, label: '"delve into"' },
  { pattern: /\bgame[ -]?changer\b/gi, label: '"game-changer"' },
  { pattern: /\bjourney\b/gi, label: '"journey" (non-travel)' },
  { pattern: /\bspace\b(?!\s+(character|bar|between|of|in|out|around|above|below))/gi, label: '"space" (field)' },
  { pattern: /\$\b/gi, label: "latex inline math ($)" },
];

export interface EnforcementResult {
  article: string;
  violations: string[];
  fixed: boolean;
  error?: string;
}

/**
 * Detect all banned pattern violations in an article.
 */
export function detectViolations(article: string): string[] {
  const found: string[] = [];
  for (const { pattern, label } of BANNED_PATTERNS) {
    pattern.lastIndex = 0; // reset regex state
    if (pattern.test(article)) {
      found.push(label);
    }
  }
  return found;
}

/**
 * Call OpenRouter to fix only the violations in the article.
 * Never makes structural changes — only targeted replacements.
 */
async function callFixer(
  article: string,
  violations: string[],
  apiKey: string
): Promise<string> {
  const violationList = violations.map((v) => `- "${v}"`).join("\n");

  const fixPrompt = `You are an editing agent. Fix ONLY the banned phrases listed below. Do NOT rewrite the article. Do NOT change structure, tone, or facts. Only fix the exact violations.

BANNED PHRASES FOUND:
${violationList}

ORIGINAL ARTICLE:
${article}

INSTRUCTIONS:
- Replace each banned phrase with a natural alternative
- Preserve all formatting, headings, and structure
- Return the complete article with only the violations fixed

Respond with only the corrected article text.`;

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "HTTP-Referer": "https://www.submoacontent.com",
      "X-Title": "SubMoa Content",
    },
    body: JSON.stringify({
      model: "anthropic/claude-3.7-sonnet",
      max_tokens: 8192,
      messages: [{ role: "user", content: fixPrompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter enforcement error: ${res.status} ${err}`);
  }

  const data = await res.json() as {
    choices: Array<{ message: { content: string } }>;
  };

  return data.choices[0].message.content.trim();
}

/**
 * Main enforcement entry point.
 * Returns the article (clean or fixed). Never throws — falls back to raw on error.
 */
export async function runEnforcementAgent(
  article: string,
  apiKey: string
): Promise<EnforcementResult> {
  // Phase 1: Detect
  const violations = detectViolations(article);

  if (violations.length === 0) {
    console.log("[enforcement] Clean — no violations detected");
    return { article, violations: [], fixed: false };
  }

  console.log(`[enforcement] ${violations.length} violation(s) found: ${violations.join(", ")}`);

  // Phase 2: Fix
  try {
    const fixed = await callFixer(article, violations, apiKey);

    if (!fixed || fixed.length < article.length * 0.5) {
      throw new Error("Fixer returned empty or suspiciously short content");
    }

    console.log(`[enforcement] Fixed — ${fixed.split(/\s+/).length} words`);
    return { article: fixed, violations, fixed: true };
  } catch (err: any) {
    console.error(`[enforcement] Fix failed: ${err.message} — using raw article`);
    return { article, violations, fixed: false, error: err.message };
  }
}
