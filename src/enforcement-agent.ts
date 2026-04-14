// src/enforcement-agent.ts
// Writing compliance enforcement agent
// Runs after generation, before grading
// Scans for violations, fixes only what's broken, returns clean article
// One focused OpenRouter call — does not rewrite for quality or style

interface Env {
  OPENROUTER_API_KEY: string;
}

// ---------------------------------------------------------------------------
// Banned patterns — matches the writing skill hard banned list exactly
// ---------------------------------------------------------------------------
const BANNED_PATTERNS: { pattern: RegExp; label: string; fix?: string }[] = [
  // Punctuation
  { pattern: /—/g,                          label: 'Em dash (—)' },
  { pattern: /\.{3}/g,                       label: 'Ellipsis in body copy' },

  // AI tell phrases
  { pattern: /in today'?s world/gi,          label: 'Banned phrase: "in today\'s world"' },
  { pattern: /in the world of/gi,            label: 'Banned phrase: "in the world of"' },
  { pattern: /when it comes to/gi,           label: 'Banned phrase: "when it comes to"' },
  { pattern: /it'?s worth noting/gi,         label: 'Banned phrase: "it\'s worth noting"' },
  { pattern: /it'?s important to note/gi,    label: 'Banned phrase: "it\'s important to note"' },
  { pattern: /dive into/gi,                  label: 'Banned phrase: "dive into"' },
  { pattern: /deep dive/gi,                  label: 'Banned phrase: "deep dive"' },
  { pattern: /\bdelve\b/gi,                  label: 'Banned word: "delve"' },
  { pattern: /\btapestry\b/gi,               label: 'Banned word: "tapestry"' },
  { pattern: /\blandscape\b/gi,              label: 'Banned word: "landscape" (metaphor)' },
  { pattern: /\bleverage\b/gi,               label: 'Banned word: "leverage" (verb)' },
  { pattern: /\bnavigate\b/gi,               label: 'Banned word: "navigate" (metaphor)' },
  { pattern: /\bunlock\b/gi,                 label: 'Banned word: "unlock"' },
  { pattern: /\bunleash\b/gi,                label: 'Banned word: "unleash"' },
  { pattern: /game.chang/gi,                 label: 'Banned phrase: "game-changer"' },
  { pattern: /in conclusion/gi,              label: 'Banned phrase: "in conclusion"' },
  { pattern: /to summarize/gi,               label: 'Banned phrase: "to summarize"' },
  { pattern: /in summary/gi,                 label: 'Banned phrase: "in summary"' },
  { pattern: /^furthermore[,\s]/gim,         label: 'Banned sentence opener: "Furthermore"' },
  { pattern: /^moreover[,\s]/gim,            label: 'Banned sentence opener: "Moreover"' },
  { pattern: /^additionally[,\s]/gim,        label: 'Banned sentence opener: "Additionally"' },
  { pattern: /\bcrucial\b/gi,               label: 'Banned word: "crucial"' },
  { pattern: /\bpivotal\b/gi,               label: 'Banned word: "pivotal"' },
  { pattern: /\bparamount\b/gi,             label: 'Banned word: "paramount"' },
  { pattern: /\bcomprehensive\b/gi,         label: 'Banned word: "comprehensive"' },
  { pattern: /\brobust\b/gi,                label: 'Banned word: "robust"' },
  { pattern: /^remember,/gim,               label: 'Banned sentence opener: "Remember,"' },
  { pattern: /^it'?s\s/gim,                 label: 'Banned sentence opener: "It\'s"' },
];

// ---------------------------------------------------------------------------
// Scan — returns list of violations without fixing anything
// ---------------------------------------------------------------------------
export interface Violation {
  label: string;
  count: number;
  examples: string[];
}

export function scanForViolations(content: string): Violation[] {
  const violations: Violation[] = [];

  for (const { pattern, label } of BANNED_PATTERNS) {
    // Reset lastIndex for global patterns
    const globalPattern = new RegExp(
      pattern.source,
      pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g'
    );
    const matches: string[] = [];
    let match;

    while ((match = globalPattern.exec(content)) !== null) {
      // Grab surrounding context for the example
      const start = Math.max(0, match.index - 30);
      const end = Math.min(content.length, match.index + match[0].length + 30);
      const example =
        '...' +
        content.slice(start, end).replace(/\n/g, ' ') +
        '...';
      matches.push(example);
      if (matches.length >= 3) break; // Max 3 examples per violation type
    }

    if (matches.length > 0) {
      violations.push({ label, count: matches.length, examples: matches });
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Enforce — calls OpenRouter to fix violations
// Only called if violations are found
// ---------------------------------------------------------------------------
export async function enforceWritingGuidelines(
  content: string,
  violations: Violation[],
  env: Env
): Promise<{ cleaned: string; violations_fixed: string[]; calls: number }> {
  if (violations.length === 0) {
    return { cleaned: content, violations_fixed: [], calls: 0 };
  }

  const violationList = violations
    .map(
      (v) =>
        `- ${v.label} (found ${v.count} time${v.count > 1 ? 's' : ''})`
    )
    .join('\n');

  const prompt = `You are a writing compliance agent. Your only job is to fix the specific violations listed below.

DO NOT rewrite for quality, style, tone, or SEO.
DO NOT change sentence structure unless required to fix a violation.
DO NOT add, remove, or reorganize content.
ONLY fix the listed violations.

VIOLATIONS TO FIX:
${violationList}

RULES FOR FIXING:
- Em dash (—): replace with a comma, or split into two sentences
- Ellipsis (...): remove or replace with a period
- Banned phrases: rephrase the clause naturally without the banned term
- Banned sentence openers: restructure the sentence to not start with that word
- "It's" sentence opener: restructure so the sentence starts differently

Return the corrected article only.
No preamble. No explanation. No "Here is the corrected version:".
Just the article text, fixed.

ARTICLE:
${content}`;

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://www.submoacontent.com',
      'X-Title': 'SubMoa Enforcement Agent',
    },
    body: JSON.stringify({
      model: 'anthropic/claude-3.5-sonnet',
      max_tokens: 8192,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('Enforcement agent OpenRouter error:', res.status, err);
    // Return original content — don't block the pipeline on enforcement failure
    return { cleaned: content, violations_fixed: [], calls: 1 };
  }

  const data = await res.json() as {
    choices: Array<{ message: { content: string } }>;
  };

  const cleaned = data.choices?.[0]?.message?.content?.trim() ?? content;

  // Verify the fix worked — scan again
  const remainingViolations = scanForViolations(cleaned);
  const fixed = violations
    .filter(
      (v) => !remainingViolations.find((r) => r.label === v.label)
    )
    .map((v) => v.label);

  console.log(
    `Enforcement agent: fixed ${fixed.length}/${violations.length} violation types`
  );

  if (remainingViolations.length > 0) {
    console.warn(
      'Remaining violations after enforcement:',
      remainingViolations.map((v) => v.label).join(', ')
    );
  }

  return {
    cleaned,
    violations_fixed: fixed,
    calls: 1,
  };
}

// ---------------------------------------------------------------------------
// Main export — scan + fix in one call
// Use this in queue-consumer.ts after generation
// ---------------------------------------------------------------------------
export async function runEnforcementAgent(
  content: string,
  env: Env
): Promise<{
  content: string;
  violations_found: Violation[];
  violations_fixed: string[];
  enforcement_calls: number;
  was_clean: boolean;
}> {
  // Step 1 — scan
  const violations = scanForViolations(content);

  if (violations.length === 0) {
    console.log(
      'Enforcement agent: article is clean, no violations found'
    );
    return {
      content,
      violations_found: [],
      violations_fixed: [],
      enforcement_calls: 0,
      was_clean: true,
    };
  }

  console.log(
    `Enforcement agent: found ${violations.length} violation type(s): ${violations
      .map((v) => `${v.label} (×${v.count})`)
      .join(', ')}`
  );

  // Step 2 — fix
  const { cleaned, violations_fixed, calls } =
    await enforceWritingGuidelines(content, violations, env);

  return {
    content: cleaned,
    violations_found: violations,
    violations_fixed,
    enforcement_calls: calls,
    was_clean: false,
  };
}
