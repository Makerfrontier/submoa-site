// POST /api/seo/research
// Runs Phase A (inline SEO) and Phase B (deep research) for a submission.
// Input: { topic, target_keywords, seo_research, article_format }
// Output: { seoContextBlock, deepReport, topRankers, contentGaps }
import { runPhaseA } from '../dataforseo/phase-a'
import { runPhaseB } from '../dataforseo/phase-b'

export async function onRequestPost(context) {
  const { request, env } = context

  try {
    const body = await request.json()
    const { topic, target_keywords, seo_research, article_format } = body

    if (!topic) {
      return Response.json({ error: 'topic is required' }, { status: 400 })
    }

    const keywords = target_keywords
      ? target_keywords.split(',').map(k => k.trim()).filter(Boolean)
      : []

    const locationCode = 2840 // United States
    const languageCode = 'en'

    // Phase A: Always runs if keywords are provided
    const phaseA = keywords.length
      ? await runPhaseA(topic, keywords, locationCode, languageCode)
      : { seoContextBlock: null, searchIntent: null, intentExplanation: null, primaryKeyword: topic, enriched: [] }

    // Phase B: Only runs if seo_research is explicitly true
    let phaseB = null
    if (seo_research === true || seo_research === 1) {
      phaseB = await runPhaseB(topic, keywords, locationCode, languageCode)
    }

    return Response.json({
      seoContextBlock: phaseA.seoContextBlock,
      searchIntent: phaseA.searchIntent,
      intentExplanation: phaseA.intentExplanation,
      primaryKeyword: phaseA.primaryKeyword,
      enrichedKeywords: phaseA.enriched,
      deepReport: phaseB?.report || null,
      topRankers: phaseB?.topRankers || [],
      contentGaps: phaseB?.contentGaps || []
    })

  } catch (e) {
    console.error('seo/research error:', e)
    return Response.json({ error: e.message || 'Research failed' }, { status: 500 })
  }
}
