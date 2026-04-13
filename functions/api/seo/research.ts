// POST /api/seo/research
// Runs Phase A (inline SEO) and Phase B (deep research) for a submission.
// Input: { topic, target_keywords, seo_research, article_format, product_link? }
// Output: { seoContextBlock, deepReport, topRankers, contentGaps, expandedKeywords }
import { runPhaseA } from '../dataforseo/phase-a'
import { runPhaseB } from '../dataforseo/phase-b'
import { dfs } from '../dataforseo/_client'
import { scrapeProductPage } from '../_utils'

// Expand keywords using DataforSEO related keywords
async function expandKeywords(keywords: string[], locationCode = 2840, languageCode = 'en'): Promise<string[]> {
  const expanded = new Set<string>(keywords)
  for (const kw of keywords.slice(0, 5)) {
    try {
      const res = await dfs<{ results: Array<{ keyword: string; search_volume: number }> }>(
        '/keywords_for_keywords/live',
        'POST',
        { keywords: [kw], location_code: locationCode, language_code: languageCode, limit: 10 }
      )
      if (res.results?.length) {
        res.results
          .filter(r => r.search_volume > 100 && !expanded.has(r.keyword.toLowerCase()))
          .slice(0, 3)
          .forEach(r => expanded.add(r.keyword))
      }
    } catch (e) {
      console.warn('Keyword expansion failed for', kw, e)
    }
    if (expanded.size >= keywords.length + 5) break
  }
  return Array.from(expanded).slice(0, 20)
}

export async function onRequestPost(context) {
  const { request, env } = context

  try {
    const body = await request.json()
    const { topic, target_keywords, seo_research, article_format, product_link } = body

    if (!topic) {
      return Response.json({ error: 'topic is required' }, { status: 400 })
    }

    // Parse keywords from JSON array string
    let keywords: string[] = []
    if (target_keywords) {
      try {
        const parsed = JSON.parse(target_keywords)
        keywords = Array.isArray(parsed) ? parsed.map(k => k.trim()).filter(Boolean) : target_keywords.split(',').map(k => k.trim()).filter(Boolean)
      } catch {
        keywords = target_keywords.split(',').map(k => k.trim()).filter(Boolean)
      }
    }

    const locationCode = 2840 // United States
    const languageCode = 'en'

    // Expand keywords if seo_research is requested
    let expandedKeywords: string[] = keywords
    if (seo_research === true || seo_research === 1) {
      console.log('Expanding keywords via DataforSEO:', keywords)
      expandedKeywords = await expandKeywords(keywords, locationCode, languageCode)
      console.log('Expanded keywords:', expandedKeywords)
    }

    // Scrape product page if product_link is provided
    let productPageText = ''
    if (product_link) {
      console.log('Scraping product page:', product_link)
      productPageText = await scrapeProductPage(product_link)
      console.log('Product page scraped, chars:', productPageText.length)
    }

    // Phase A: Always runs if keywords are provided
    const phaseA = expandedKeywords.length
      ? await runPhaseA(topic, expandedKeywords, locationCode, languageCode, productPageText)
      : { seoContextBlock: null, searchIntent: null, intentExplanation: null, primaryKeyword: topic, enriched: [] }

    // Phase B: Only runs if seo_research is explicitly true
    let phaseB = null
    if (seo_research === true || seo_research === 1) {
      phaseB = await runPhaseB(topic, expandedKeywords, locationCode, languageCode, productPageText)
    }

    return Response.json({
      seoContextBlock: phaseA.seoContextBlock,
      searchIntent: phaseA.searchIntent,
      intentExplanation: phaseA.intentExplanation,
      primaryKeyword: phaseA.primaryKeyword,
      enrichedKeywords: phaseA.enriched,
      expandedKeywords,
      productPageText: productPageText || null,
      deepReport: phaseB?.report || null,
      topRankers: phaseB?.topRankers || [],
      contentGaps: phaseB?.contentGaps || []
    })

  } catch (e) {
    console.error('seo/research error:', e)
    return Response.json({ error: e.message || 'Research failed' }, { status: 500 })
  }
}
