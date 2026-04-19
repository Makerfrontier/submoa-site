// src/quick-podcast-research.ts
// Perplexity Sonar research via OpenRouter — grounded facts + citations used
// as the brief for Sonnet script generation.

export interface ResearchSource {
  title: string;
  url: string;
  snippet: string;
}

export interface ResearchResult {
  topic: string;
  synthesis: string;
  sources: ResearchSource[];
  query_used: string;
}

export function isUrlInput(input: string): boolean {
  const trimmed = input.trim();
  try {
    const url = new URL(trimmed);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export async function researchTopic(
  openrouterKey: string,
  topic: string,
  options: { is_url?: boolean; detail_level?: 'brief' | 'normal' | 'deep' } = {},
): Promise<ResearchResult> {
  const query = options.is_url
    ? `Read the content at ${topic} and summarize the key facts, claims, and context. Identify the main thesis and any notable counterpoints.`
    : `Provide a comprehensive briefing on: ${topic}. Include recent developments, key facts, multiple perspectives, and notable people or organizations involved. Cite specific sources.`;

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openrouterKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://submoacontent.com',
      'X-Title': 'SubMoa Quick Podcast — Research',
    },
    body: JSON.stringify({
      model: 'perplexity/sonar',
      messages: [{ role: 'user', content: query }],
      max_tokens: 2000,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`Sonar research failed ${res.status}: ${errText}`);
  }

  const data: any = await res.json();
  const synthesis = data.choices?.[0]?.message?.content ?? '';

  // Perplexity Sonar citation shape varies across OpenRouter versions;
  // check both message.citations and top-level citations.
  const rawCitations = data.choices?.[0]?.message?.citations
                    ?? data.citations
                    ?? [];

  const sources: ResearchSource[] = (rawCitations as any[]).map((c: any, i: number) => {
    if (typeof c === 'string') return { title: `Source ${i + 1}`, url: c, snippet: '' };
    return {
      title: c.title ?? c.name ?? `Source ${i + 1}`,
      url: c.url ?? c.link ?? '',
      snippet: c.snippet ?? c.text ?? '',
    };
  }).filter((s: ResearchSource) => s.url);

  return { topic, synthesis, sources, query_used: query };
}
