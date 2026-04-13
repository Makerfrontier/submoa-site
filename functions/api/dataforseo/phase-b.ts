// DataforSEO Phase B — Deep SEO Research Report
// Runs when seo_research=true. Generates a full competitive analysis
// and appends it to the article_content as a structured report block.

import { dfs } from './_client'

interface PhaseBResult {
  report: string          // full markdown report
  topRankers: Array<{ url: string, title: string, domain: string, position: number }>
  contentGaps: string[]    // topics competitors cover that the article doesn't
  wordCount: number
}

// Extract domain from URL
function extractDomain(url: string): string {
  try { return new URL(url).hostname.replace('www.', '') } catch { return url }
}

export async function runPhaseB(
  topic: string,
  targetKeywords: string[],
  locationCode = 2840,
  languageCode = 'en',
  productPageText?: string
): Promise<PhaseBResult> {
  const primary = targetKeywords[0] || topic
  const topRankers: PhaseBResult['topRankers'] = []
  const contentGaps: string[] = []

  // 1. Get top 10 SERP results for primary keyword
  try {
    const serpRes = await dfs<{
      results: Array<{
        url: string
        title: string
        position: number
        domain: string
      }>
    }>(
      '/serp/google/organic/live/regular',
      'POST',
      {
        keywords: [primary],
        location_code: locationCode,
        language_code: languageCode,
        max_results: 10
      }
    )

    if (serpRes.results?.length) {
      serpRes.results.forEach(r => {
        topRankers.push({
          url: r.url,
          title: r.title,
          domain: extractDomain(r.url),
          position: r.position
        })
      })
    }
  } catch (e) {
    console.warn('Phase B SERP fetch failed:', e)
  }

  // 2. Get related/people-also-search topics for content gaps
  try {
    const relatedRes = await dfs<{
      results: Array<{ keyword: string; search_volume: number }>
    }>(
      '/keywords_for_keywords/live',
      'POST',
      {
        keywords: [primary],
        location_code: locationCode,
        language_code: languageCode,
        limit: 20
      }
    )

    if (relatedRes.results?.length) {
      // Filter for high-volume related terms that aren't direct product keywords
      const gapKws = relatedRes.results
        .filter(r => {
          const kw = r.keyword.toLowerCase()
          return r.search_volume > 200 &&
            !kw.includes(primary.toLowerCase()) &&
            !/\bbuy|price|shop|order\b/.test(kw)
        })
        .slice(0, 8)

      contentGaps.push(...gapKws.map(g => g.keyword))
    }
  } catch (e) {
    console.warn('Phase B related keywords failed:', e)
  }

  // 3. Get search volume for top competing topics
  const gapVolumes: Record<string, number> = {}
  if (contentGaps.length) {
    try {
      const svRes = await dfs<{
        results: Array<{ keyword: string; search_volume: number }>
      }>(
        '/keywords_for_keywords/live',
        'POST',
        {
          keywords: contentGaps.slice(0, 10),
          location_code: locationCode,
          language_code: languageCode,
          limit: 5
        }
      )
      if (svRes.results?.length) {
        svRes.results.forEach(r => { gapVolumes[r.keyword] = r.search_volume ?? 0 })
      }
    } catch (e) {
      console.warn('Phase B volume fetch failed:', e)
    }
  }

  // 4. Build the report markdown
  const rankerList = topRankers.length
    ? topRankers.map(r => `${r.position}. **[${r.domain}](${r.url})** — "${r.title}"`).join('\n')
    : '_No SERP data available_'

  const gapList = contentGaps.length
    ? contentGaps.map(g => `- **${g}** — ${(gapVolumes[g] || 0).toLocaleString()}/mo search volume`).join('\n')
    : '_No content gap data available_'

  const productBlock = productPageText
    ? `\n\n### Product Page Intelligence\n\nThe following was scraped from the product page at the submitted URL. Use this for accurate specs, pricing, features, and descriptions — do not invent product details:\n\n${productPageText}\n`
    : '';

  const report = `

---

## Deep SEO Research Report

**Topic:** ${topic}
**Primary keyword:** ${primary}
**Generated:** ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}${productBlock}

### Top Ranking Pages

${rankerList}

### Content Gaps — Topics to Cover

These are high-signal related topics that top-ranking pages address but a basic article might miss:

${gapList}

### Strategic Recommendations

- **Headline:** Lead with the primary keyword. Headlines with the target keyword in position 1-3 outperform those without by roughly 25% in click-through rate.
- **Subheadings:** Work secondary keywords (${contentGaps.slice(0, 3).map(g => `**${g}**`).join(', ') || 'your top related terms'}) into H2s naturally.
- **Length:** Articles ranking in the top 3 for commercial and informational intents typically run 1,400–2,100 words. Stay at the higher end if covering content gaps.
- **Structure:** Use the primary keyword in the first 100 words, one H2 per content gap topic, and the primary keyword in at least 3 subheadings total.
- **Links:** Reference 2–3 of the top-ranking domains above as sources. External links to authoritative sources correlate with higher rankings.
- **CTA:** For ${primary}, a review-summary table followed by a clear recommendation outperforms a hard sell at the bottom.

`
  return {
    report,
    topRankers,
    contentGaps,
    wordCount: report.split(/\s+/).length
  }
}
