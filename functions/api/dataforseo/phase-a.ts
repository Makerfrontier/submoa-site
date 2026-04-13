// DataforSEO Phase A — Inline SEO Enrichment
// Runs before writing. Enriches the brief with keyword intelligence.
// Returns: { keywords[], searchIntent, seoContextBlock }

import { dfs } from './_client'

interface KeywordsDataflowInput {
  keywords: string[]      // seed keywords from the brief
  location_code?: number  // 2840 = US
  language_code?: string  // 'en'
}

interface EnrichedKeyword {
  keyword: string
  search_volume: number
  competition: string
  cpc: number
  trends: Record<string, number>
  related: string[]
}

interface PhaseAResult {
  enriched: EnrichedKeyword[]
  searchIntent: 'informational' | 'navigational' | 'commercial' | 'transactional'
  intentExplanation: string
  primaryKeyword: string
  seoContextBlock: string  // formatted block to inject into article
}

// Determine search intent from keyword patterns
function classifyIntent(keyword: string): { intent: PhaseAResult['searchIntent'], explanation: string } {
  const kw = keyword.toLowerCase()
  if (/\bbuy|price|shop|order|deal|coupon|discount\b/.test(kw))
    return { intent: 'transactional', explanation: ` "${keyword}" shows clear purchase intent — user is ready to buy` }
  if (/\bvs|compare|alternative|versus|better|review\b/.test(kw))
    return { intent: 'commercial', explanation: ` "${keyword}" indicates comparison or research before purchase` }
  if (/\bnear|store|location|hours|address\b/.test(kw))
    return { intent: 'navigational', explanation: ` "${keyword}" shows the user is looking for a specific brand or location` }
  return { intent: 'informational', explanation: ` "${keyword}" is informational — user is researching, not buying yet` }
}

export async function runPhaseA(
  topic: string,
  targetKeywords: string[],
  locationCode = 2840,
  languageCode = 'en',
  productPageText?: string
): Promise<PhaseAResult> {
  // 1. Keyword Suggestions — expand seed keywords into related terms
  const suggested: Array<{ keyword: string; search_volume: number; competition: string; cpc: number }> = []

  for (const kw of targetKeywords.slice(0, 5)) {
    try {
      const res = await dfs<{ results: Array<{ keyword: string; search_volume: number; competition: string; cpc: number }> }>(
        '/keywords_for_keywords/live',
        'POST',
        {
          keywords: [kw],
          location_code: locationCode,
          language_code: languageCode,
          include_subdomains: false,
          limit: 10
        }
      )

      if (res.results?.length) {
        suggested.push(...res.results.map(r => ({
          keyword: r.keyword,
          search_volume: r.search_volume ?? 0,
          competition: r.competition ?? 'N/A',
          cpc: r.cpc ?? 0
        })))
      }
    } catch (e) {
      console.warn(`Phase A kw suggestion failed for "${kw}":`, e)
    }
  }

  // 2. Get search volume for top keywords
  const topKws = suggested
    .filter(k => k.search_volume > 0)
    .sort((a, b) => b.search_volume - a.search_volume)
    .slice(0, 20)

  const enriched: EnrichedKeyword[] = topKws.map(k => ({
    keyword: k.keyword,
    search_volume: k.search_volume,
    competition: k.competition,
    cpc: k.cpc,
    trends: {},        // Keywords Trends endpoint separate if needed
    related: []
  }))

  // 3. Classify intent from primary keyword
  const primary = targetKeywords[0] || topic
  const { intent, explanation } = classifyIntent(primary)

  // 4. Build SEO Context Block (markdown)
  const svList = enriched
    .slice(0, 8)
    .map(k => `- **${k.keyword}** — ${k.search_volume.toLocaleString()}/mo, CPC $${k.cpc.toFixed(2)}, ${k.competition} competition`)
    .join('\n')

const productBlock = productPageText
    ? `\n\n**Product Page Content:**\nThe following was scraped from the product page. Use this for accurate specs, pricing, features, and descriptions — do not invent product details:\n\n${productPageText}`
    : '';

  const seoContextBlock = `## SEO Context

**Primary keyword:** ${primary}
**Search intent:** ${intent.toUpperCase()}${explanation}${productBlock}

**Keyword intelligence:**
${svList || `- No volume data available for "${primary}" — write naturally and optimize for semantic relevance`}

**Article should:**
${intent === 'transactional' ? '- Lead with product benefits, price, and where to buy\n- Include strong CTAs and purchase links\n- Address objections before the reader leaves' : ''}
${intent === 'commercial' ? '- Compare options fairly and thoroughly\n- Include feature/price tables if possible\n- Lead with the recommendation upfront' : ''}
${intent === 'informational' ? '- Answer the reader\'s question fully in the first 2 paragraphs\n- Use headers to organize key sub-topics\n- Include examples and real-world applications' : ''}
${intent === 'navigational' ? '- Confirm the brand/product upfront\n- Focus on what makes this specific option stand out\n- Clear location or direct links' : ''}
`

  return {
    enriched,
    searchIntent: intent,
    intentExplanation: explanation,
    primaryKeyword: primary,
    seoContextBlock
  }
}
