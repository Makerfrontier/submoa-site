import { json, getSessionUser, Env } from '../../_utils';
import { scrapeProductPage } from '../../_utils';
import { runPhaseA } from '../../dataforseo/phase-a';
import { runPhaseB } from '../../dataforseo/phase-b';
import { dfs } from '../../dataforseo/_client';

const VOCAL_TONE_DEFINITIONS: Record<string, string> = {
  'expert': 'Authoritative and confident. Makes definitive statements. Commands authority on the subject.',
  'professional': 'Neutral and polished. Corporate-appropriate without being stiff. Balanced and measured.',
  'analytical': 'Logical and data-driven. Breaks things down systematically. Structured reasoning.',
  'educational': 'Clear and explanatory. Teaches concepts thoroughly. Reader-focused instruction.',
  'technical': 'Detailed and system-focused. Precision matters. Assumes technical literacy.',
  'scientific': 'Formal and evidence-oriented. Cites sources. Hedged with appropriate caution.',
  'journalistic': 'Objective and fact-based. Neutral perspective. Information-first approach.',
  'advisory': 'Guidance-driven and helpful. Recommends courses of action. Supportive tone.',
  'conversational': 'Casual and direct. Like talking to a knowledgeable friend. Approachable.',
  'humorous': 'Playful and witty. Entertainment value. Light touch where appropriate.',
  'storytelling': 'Narrative and immersive. Uses anecdote and scene-setting. Descriptive flow.',
  'opinionated': 'Assertive with clear stance. States opinions definitively. Not afraid to take a position.',
  'relatable': 'Familiar and everyday. Uses common experience. Warm and human.',
  'entertaining': 'Engaging and light. Fun to read. Holds attention without effort.',
  'provocative': 'Bold and challenging. Pushes boundaries. Attention-commanding.',
  'satirical': 'Ironic and exaggerated. Indirect criticism. Understatement for effect.',
  'instructional': 'Step-by-step guidance. Actionable steps. Clear and methodical.',
  'listicle': 'Structured and scannable. Numbered lists. Quick to digest.',
  'review-focused': 'Evaluative and experience-driven. Assesses quality and value. Personal verdict.',
  'comparison': 'Side-by-side analysis. Decision-oriented. Pro/con framing.',
};

async function expandKeywords(keywords: string[], locationCode = 2840, languageCode = 'en'): Promise<string[]> {
  const expanded = new Set<string>(keywords);
  for (const kw of keywords.slice(0, 5)) {
    try {
      const res = await dfs<{ results: Array<{ keyword: string; search_volume: number }> }>(
        '/keywords_for_keywords/live',
        'POST',
        { keywords: [kw], location_code: locationCode, language_code: languageCode, limit: 10 }
      );
      if (res.results?.length) {
        res.results
          .filter(r => r.search_volume > 100 && !expanded.has(r.keyword.toLowerCase()))
          .slice(0, 3)
          .forEach(r => expanded.add(r.keyword));
      }
    } catch (e) {
      console.warn('Keyword expansion failed for', kw, e);
    }
    if (expanded.size >= keywords.length + 5) break;
  }
  return Array.from(expanded).slice(0, 20);
}

export async function onRequest(context: { request: Request; env: Env }) {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (context.request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const user = await getSessionUser(context.request, context.env);
  if (!user) return json({ error: 'Not authenticated' }, 401);
  if (user.role !== 'admin') return json({ error: 'Forbidden' }, 403);

  try {
    const { submission_id } = await context.request.json();
    if (!submission_id) return json({ error: 'submission_id is required' }, 400);

    // 1. Fetch submission from D1
    const submission = await context.env.submoacontent_db
      .prepare('SELECT * FROM submissions WHERE id = ?')
      .bind(submission_id)
      .first() as any;

    if (!submission) return json({ error: 'Submission not found' }, 404);

    // 2. Fetch author_profile
    const authorProfile = await context.env.submoacontent_db
      .prepare('SELECT * FROM author_profiles WHERE slug = ? AND is_active = 1')
      .bind(submission.author)
      .first() as any;

    if (!authorProfile) return json({ error: 'Author profile not found for: ' + submission.author }, 404);

    // 3. Scrape product page if product_link exists
    let productPageText = '';
    if (submission.product_link) {
      productPageText = await scrapeProductPage(submission.product_link);
    }

    // 4. Expand keywords via DataforSEO if seo_research is enabled
    let keywords: string[] = [];
    if (submission.target_keywords) {
      try {
        const parsed = JSON.parse(submission.target_keywords);
        keywords = Array.isArray(parsed) ? parsed.map((k: string) => k.trim()).filter(Boolean) : submission.target_keywords.split(',').map((k: string) => k.trim()).filter(Boolean);
      } catch {
        keywords = submission.target_keywords.split(',').map((k: string) => k.trim()).filter(Boolean);
      }
    }

    let expandedKeywords: string[] = keywords;
    if (submission.seo_research && keywords.length) {
      expandedKeywords = await expandKeywords(keywords);
    }

    // Phase A for context block (limited keywords for speed)
    const phaseA = await runPhaseA(
      submission.topic,
      expandedKeywords.slice(0, 10),
      2840,
      'en',
      productPageText
    );

    // Phase B for deep SEO report
    let deepReport = '';
    if (submission.seo_research) {
      const phaseB = await runPhaseB(submission.topic, expandedKeywords, 2840, 'en', productPageText);
      deepReport = phaseB.report || '';
    }

    // 5. Build AI prompt
    const vocalToneDef = VOCAL_TONE_DEFINITIONS[submission.vocal_tone || ''] || 'Default tone — neutral, informative, balanced.';
    const articleFormatDef = submission.article_format || 'standard article';
    const optimizationTarget = submission.optimization_target || 'not specified';
    const tone_stance = submission.tone_stance || 'neutral';

    let prompt = `AUTHOR VOICE:
${authorProfile.style_guide || 'No style guide available.'}

VOCAL TONE:
${vocalToneDef}

ARTICLE FORMAT:
${articleFormatDef}

OPTIMIZATION TARGET:
${optimizationTarget}`;

    if (expandedKeywords.length) {
      prompt += `\n\nTARGET KEYWORDS:\n${expandedKeywords.join(', ')}`;
    }

    if (productPageText) {
      prompt += `\n\nPRODUCT PAGE CONTENT:\n${productPageText}`;
    }

    prompt += `
\nBRIEF:
${submission.human_observation || 'No brief provided.'}`;

    if (submission.anecdotal_stories) {
      prompt += `\n\nANECDOTAL STORIES TO INCLUDE:\n${submission.anecdotal_stories}`;
    }

    prompt += `\n\nWrite a ${submission.min_word_count || 1200}+ word article on: ${submission.topic}`;

    if (submission.include_faq) {
      prompt += `\n\nAfter the conclusion, add a FAQ section with 5 to 7 questions and answers drawn naturally from the article content. Format each question as a subheading.`;
    }

    if (phaseA.seoContextBlock) {
      prompt += `\n\nSEO CONTEXT (from keyword research):\n${phaseA.seoContextBlock}`;
    }

    if (deepReport) {
      prompt += `\n\nDEEP SEO RESEARCH REPORT:\n${deepReport}`;
    }

    console.log('Generating article for submission:', submission_id);
    console.log('Prompt length:', prompt.length);
    console.log('Vocal tone:', submission.vocal_tone || 'default');

    // 6. Call OpenRouter
    const openRouterKey = (context as any).env?.OPENROUTER_API_KEY
      ?? (context as any).OPENROUTER_API_KEY
      ?? (context.env as any)?.OPENROUTER_API_KEY;

    if (!openRouterKey) {
      return json({ error: 'OpenRouter API key not configured' }, 500);
    }

    const modelResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openRouterKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://submoacontent.com',
        'X-Title': 'SubMoa Content',
      },
      body: JSON.stringify({
        model: env.OPENROUTER_DEFAULT_MODEL ?? 'openrouter/auto',
        max_tokens: 8192,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!modelResponse.ok) {
      const errText = await modelResponse.text();
      console.error('OpenRouter error:', modelResponse.status, errText);
      return json({ error: 'AI generation failed: ' + modelResponse.status }, 500);
    }

    const modelData = await modelResponse.json();
    const articleContent = modelData?.choices?.[0]?.message?.content || '';

    if (!articleContent) {
      return json({ error: 'AI returned empty content' }, 500);
    }

    // 7 & 8. Save result to submissions
    const now = Date.now();
    await context.env.submoacontent_db
      .prepare('UPDATE submissions SET article_content = ?, status = ?, updated_at = ?, seo_report_content = ? WHERE id = ?')
      .bind(articleContent, 'article_done', now, deepReport || null, submission_id)
      .run();

    // 9. Return
    return json({ success: true, article_content: articleContent });

  } catch (err: any) {
    console.error('Generate error:', err.message, err.stack);
    return json({ error: err.message || 'Generation failed' }, 500);
  }
}
