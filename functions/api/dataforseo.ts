// src/dataforseo.ts
// DataforSEO API utility
// Pulls keyword volume, SERP intent, and competitor headlines for generation prompt assembly

interface Env {
  DATAFORSEO_LOGIN: string;   // DataforSEO uses Basic Auth: login + password
  DATAFORSEO_PASSWORD: string;
}

function getAuthHeader(env: Env): string {
  return "Basic " + btoa(`${env.DATAFORSEO_LOGIN}:${env.DATAFORSEO_PASSWORD}`);
}

export interface KeywordIntelligence {
  primary_keyword: string;
  search_volume: number | null;
  competition: number | null;
  related_keywords: RelatedKeyword[];
  serp_intent: SerpIntent;
  competitor_headlines: string[];
}

export interface RelatedKeyword {
  keyword: string;
  volume: number | null;
}

export type SerpIntent =
  | "informational"
  | "commercial"
  | "navigational"
  | "transactional"
  | "mixed"
  | "unknown";

async function fetchKeywordVolume(
  env: Env,
  keywords: string[]
): Promise<Map<string, { volume: number | null; competition: number | null }>> {
  const result = new Map();
  if (keywords.length === 0) return result;

  const res = await fetch(
    "https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live",
    {
      method: "POST",
      headers: {
        Authorization: getAuthHeader(env),
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        { keywords, language_code: "en", location_code: 2840 },
      ]),
    }
  );

  if (!res.ok) {
    console.error("DataforSEO keyword volume error:", res.status, await res.text());
    return result;
  }

  const data = await res.json() as any;
  const items = data?.tasks?.[0]?.result ?? [];
  for (const item of items) {
    result.set(item.keyword, {
      volume: item.search_volume,
      competition: item.competition,
    });
  }
  return result;
}

async function fetchSerpData(
  env: Env,
  keyword: string
): Promise<{ intent: SerpIntent; headlines: string[] }> {
  const res = await fetch(
    "https://api.dataforseo.com/v3/serp/google/organic/live/regular",
    {
      method: "POST",
      headers: {
        Authorization: getAuthHeader(env),
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        { keyword, language_code: "en", location_code: 2840, device: "desktop", depth: 10 },
      ]),
    }
  );

  if (!res.ok) {
    console.error("DataforSEO SERP error:", res.status, await res.text());
    return { intent: "unknown", headlines: [] };
  }

  const data = await res.json() as any;
  const items = data?.tasks?.[0]?.result?.[0]?.items ?? [];
  const headlines = items
    .filter((i: any) => i.type === "organic" && i.title)
    .slice(0, 5)
    .map((i: any) => i.title as string);

  const intent = inferIntent(headlines, items.map((i: any) => i.url ?? ""));
  return { intent, headlines };
}

function inferIntent(headlines: string[], urls: string[]): SerpIntent {
  const text = headlines.join(" ").toLowerCase();
  const urlText = urls.join(" ").toLowerCase();

  const informationalSignals = ["what is","how to","why","guide","explained","tutorial","tips","learn","understanding","overview"];
  const commercialSignals = ["best","top","review","vs","compare","buy","cheap","deal","price","worth it"];
  const transactionalSignals = ["buy","order","purchase","shop","discount","coupon","amazon","sale"];

  let informational = 0, commercial = 0, transactional = 0;
  for (const s of informationalSignals) if (text.includes(s)) informational++;
  for (const s of commercialSignals) if (text.includes(s)) commercial++;
  for (const s of transactionalSignals) if (text.includes(s) || urlText.includes(s)) transactional++;

  const max = Math.max(informational, commercial, transactional);
  if (max === 0) return "unknown";

  const leaders = [
    informational === max ? "informational" : null,
    commercial === max ? "commercial" : null,
    transactional === max ? "transactional" : null,
  ].filter(Boolean);

  if (leaders.length > 1) return "mixed";
  return leaders[0] as SerpIntent;
}

async function fetchRelatedKeywords(
  env: Env,
  keyword: string
): Promise<RelatedKeyword[]> {
  const res = await fetch(
    "https://api.dataforseo.com/v3/keywords_data/google_ads/keywords_for_keywords/live",
    {
      method: "POST",
      headers: {
        Authorization: getAuthHeader(env),
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        { keywords: [keyword], language_code: "en", location_code: 2840, limit: 10 },
      ]),
    }
  );

  if (!res.ok) {
    console.error("DataforSEO related keywords error:", res.status, await res.text());
    return [];
  }

  const data = await res.json() as any;
  return (data?.tasks?.[0]?.result ?? [])
    .slice(0, 10)
    .map((item: any) => ({ keyword: item.keyword, volume: item.search_volume }));
}

export async function getKeywordIntelligence(
  env: Env,
  targetKeywords: string[],
  topic: string
): Promise<KeywordIntelligence> {
  const primary = targetKeywords.length > 0 ? targetKeywords[0] : topic;
  const allKeywords = targetKeywords.length > 0 ? targetKeywords : [topic];

  const [volumeMap, serpData, relatedKeywords] = await Promise.all([
    fetchKeywordVolume(env, allKeywords),
    fetchSerpData(env, primary),
    fetchRelatedKeywords(env, primary),
  ]);

  const primaryData = volumeMap.get(primary) ?? { volume: null, competition: null };

  const explicitRelated: RelatedKeyword[] = allKeywords
    .slice(1)
    .map((kw) => ({ keyword: kw, volume: volumeMap.get(kw)?.volume ?? null }));

  const combined = [
    ...explicitRelated,
    ...relatedKeywords.filter((r) => !allKeywords.includes(r.keyword)),
  ].slice(0, 10);

  return {
    primary_keyword: primary,
    search_volume: primaryData.volume,
    competition: primaryData.competition,
    related_keywords: combined,
    serp_intent: serpData.intent,
    competitor_headlines: serpData.headlines,
  };
}

export function formatKeywordIntelligenceForPrompt(intel: KeywordIntelligence): string {
  const lines = [
    `=== DATAFORSEO KEYWORD INTELLIGENCE ===`,
    `Primary keyword: ${intel.primary_keyword}`,
    intel.search_volume !== null ? `Search volume: ${intel.search_volume.toLocaleString()}/month` : `Search volume: unavailable`,
    intel.competition !== null ? `Competition: ${(intel.competition * 100).toFixed(0)}%` : null,
    `SERP intent: ${intel.serp_intent}`,
    ``,
    `Related terms to weave in naturally:`,
    ...intel.related_keywords.map((r) => `  - ${r.keyword}${r.volume !== null ? ` (${r.volume.toLocaleString()}/mo)` : ""}`),
    ``,
    `Top competing headlines (differentiate from these):`,
    ...intel.competitor_headlines.map((h, i) => `  ${i + 1}. ${h}`),
    ``,
    `SEO instructions:`,
    `  - Place primary keyword in: title, first 50 words, at least one H2, conclusion`,
    `  - Weave related terms naturally — do not force them`,
    `  - SERP intent is ${intel.serp_intent} — match format to what Google is rewarding`,
    intel.serp_intent === "informational" ? `  - Informational intent: comprehensive, educational, answer the question fully` : null,
    intel.serp_intent === "commercial" ? `  - Commercial intent: evaluative, comparison-friendly, help readers decide` : null,
    intel.serp_intent === "transactional" ? `  - Transactional intent: benefit-led, clear CTAs, price context` : null,
  ].filter((l) => l !== null).join("\n");

  return lines;
}
