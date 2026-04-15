import { json, getSessionUser, generateId } from '../../_utils';
import type { Env } from '../../_utils';
import { scoreGrammar, scoreReadability, scoreSeo, calcOverall } from '../../grading';

// DataforSEO keywords for text endpoint
async function fetchDataforSEO(text: string, login: string, password: string) {
  const credentials = btoa(`${login}:${password}`);
  
  const response = await fetch('https://api.dataforseo.com/v3/keywords_data/keywords_for_text/live', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([
      {
        text: text.slice(0, 10000),
        language_code: 'en',
        location_code: 2840,
      }
    ]),
  });

  if (!response.ok) {
    throw new Error(`DataforSEO error: ${response.status}`);
  }

  const result = await response.json();
  
  if (result.status === 'error') {
    throw new Error(result.error_message || 'DataforSEO API error');
  }

  return result;
}

// ---------------------------------------------------------------------------
// Robust text extractor — handles CDATA, HTML entities, plain text
// ---------------------------------------------------------------------------
function extractText(raw: string): string {
  // 1. Unwrap CDATA: <![CDATA[ ... ]]>
  let text = raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  // 2. Strip remaining HTML tags
  text = text.replace(/<[^>]+>/g, ' ');
  // 3. Decode common HTML entities
  text = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&[a-z]+;/g, ' ');
  return text.replace(/\s+/g, ' ').trim();
}

export async function onRequest(context: { request: Request; env: Env }) {
  const { request, env } = context;
  
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  // Require session
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);

  try {
    const body = await request.json().catch(() => ({}));
    const scope = body.scope || 'admin';
    const custom_name = body.custom_name || null;
    const account_id = user.account_id || 'makerfrontier';

    // User scope — enforce 3-author limit
    if (scope === 'user') {
      const { results } = await env.submoacontent_db.prepare(
        `SELECT COUNT(*) as n FROM author_profiles WHERE account_id = ? AND source_type != 'global'`
      ).bind(account_id).all();
      if (results[0].n >= 3) {
        return json({ error: 'Maximum 3 authors per account' }, 400);
      }
    }

    const contentType = request.headers.get('Content-Type') || '';
    let rssUrl: string | null = null;
    let textBlob: string | null = null;
    let rssUrlInput: string | null = null;

    // Handle multipart form (DOCX upload)
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('document') as File | null;
      
      if (!file) {
        return json({ error: 'No document file provided' }, 400);
      }

      if (!file.name.endsWith('.docx')) {
        return json({ error: 'Only .docx files are supported' }, 400);
      }

      const arrayBuffer = await file.arrayBuffer();
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ arrayBuffer });
      textBlob = result.value.trim();
      
      if (!textBlob) {
        return json({ error: 'Could not extract text from document' }, 400);
      }
    }
    // Handle JSON (RSS URL)
    else if (contentType.includes('application/json')) {
      rssUrlInput = body.rss_url || body.rssUrl;
      rssUrl = rssUrlInput;

      if (!rssUrl) {
        return json({ error: 'rss_url is required' }, 400);
      }

      // Fetch and parse RSS feed
      const response = await fetch(rssUrl, {
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; SubMoaBot/1.0)',
          'Accept': 'application/rss+xml, application/xml, text/xml, */*'
        }
      });
      if (!response.ok) {
        return json({ error: `Failed to fetch RSS feed: ${response.status}` }, 400);
      }

      const xmlText = await response.text();

      const articles: string[] = [];
      const MIN_LEN = 20;

      // Helper — pick the longest non-empty field from a node
      function bestText(node: string): string {
        const tags = [
          /<content:encoded[^>]*>([\s\S]*?)<\/content:encoded>/i,
          /<content[^>]*>([\s\S]*?)<\/content>/i,
          /<description[^>]*>([\s\S]*?)<\/description>/i,
          /<summary[^>]*>([\s\S]*?)<\/summary>/i,
        ];
        let best = '';
        for (const re of tags) {
          const m = node.match(re);
          if (m && m[1]) {
            const t = extractText(m[1]);
            if (t.length > best.length) best = t;
          }
        }
        return best;
      }

      // RSS 2.0 — <item> elements
      const itemMatches = xmlText.match(/<item[^>]*>([\s\S]*?)<\/item>/gi) || [];
      for (const item of itemMatches.slice(0, 10)) {
        const text = bestText(item);
        if (text.length >= MIN_LEN) articles.push(text);
      }

      // Atom — <entry> elements (fallback when no <item> found)
      if (articles.length === 0) {
        const entryMatches = xmlText.match(/<entry[^>]*>([\s\S]*?)<\/entry>/gi) || [];
        for (const entry of entryMatches.slice(0, 10)) {
          const text = bestText(entry);
          if (text.length >= MIN_LEN) articles.push(text);
        }
      }

      // Last resort — collect all <title> elements as thin signal
      if (articles.length === 0) {
        const titles = [...xmlText.matchAll(/<title[^>]*>([\s\S]*?)<\/title>/gi)]
          .map(m => extractText(m[1]))
          .filter(t => t.length >= MIN_LEN && !t.toLowerCase().includes('rss'));
        if (titles.length > 0) articles.push(titles.join('. '));
      }

      if (articles.length === 0) {
        return json({ error: 'No article content found in RSS feed. The feed may use an unsupported format or contain only links.' }, 400);
      }

      textBlob = articles.join('\n\n');
    } else {
      return json({ error: 'Unsupported content type' }, 400);
    }

    // Step 3b: AI style analysis via OpenRouter
    const openRouterKey = env.OPENROUTER_API_KEY;

    // Declare keywordThemes and semanticEntities early so they're available for name prompt
    let keywordThemes: string[] = [];
    let semanticEntities: string[] = [];

    const stylePrompt = `Analyze this author's writing style based on the following article excerpts. Provide a concise style guide (2-3 paragraphs) that describes their voice, tone, sentence structure, perspective, and formatting preferences. Focus on what makes their writing distinctive and readable. Respond ONLY with the style guide, no preamble.

---
${textBlob.slice(0, 8000)}`;

    let styleGuide = 'Style guide could not be generated.';

    const styleResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openRouterKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://submoacontent.com',
        'X-Title': 'SubMoa Content'
      },
      body: JSON.stringify({
        model: env.OPENROUTER_DEFAULT_MODEL ?? 'openrouter/auto',
        max_tokens: 1000,
        messages: [{ role: 'user', content: stylePrompt }]
      })
    });
    let styleData: any = {};
    try { styleData = await styleResponse.json(); } catch {}
    if (styleData.choices?.[0]?.message?.content) {
      styleGuide = styleData.choices[0].message.content;
    } else if (styleData.error) {
      return json({ error: 'OpenRouter style error: ' + JSON.stringify(styleData.error) }, 500);
    }

    // Step 3c: Generate author name from style and content
    const namePrompt = `Based on this author's writing style and topics covered, generate a short, memorable author name/label (2-4 words) that captures their identity and expertise. Examples: "The Field Reviewer", "Backcountry Expert", "Gear Tester". Respond ONLY with the name, nothing else.

---
Style: ${styleGuide}
Topics: ${keywordThemes.slice(0, 10).join(', ')}`;

    let authorName = 'The Field Expert';
    
    const nameResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openRouterKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://submoacontent.com',
        'X-Title': 'SubMoa Content'
      },
      body: JSON.stringify({
        model: env.OPENROUTER_DEFAULT_MODEL ?? 'openrouter/auto',
        max_tokens: 50,
        messages: [{ role: 'user', content: namePrompt }]
      })
    });
    let nameData: any = {};
    try { nameData = await nameResponse.json(); } catch {}
    if (nameData.choices?.[0]?.message?.content) {
      authorName = nameData.choices[0].message.content.trim().replace(/\*\*/g, '').replace(/^"+|"+$/g, '');
    } else if (nameData.error) {
      console.error('OpenRouter name API error:', nameData.error);
    }

    // Step 3d: DataforSEO analysis
    const dfsLogin = env.DATAFORSEO_LOGIN;
    const dfsPassword = env.DATAFORSEO_PASSWORD;

    if (dfsLogin && dfsPassword) {
      try {
        const dfsResult = await fetchDataforSEO(textBlob, dfsLogin, dfsPassword);
        
        if (dfsResult.results && dfsResult.results.length > 0) {
          const sortedResults = dfsResult.results
            .sort((a: any, b: any) => (b.search_volume || 0) - (a.search_volume || 0));
          
          keywordThemes = sortedResults.slice(0, 15).map((r: any) => r.keyword);
          
          // Extract unique semantic entities from keywords
          const entitySet = new Set<string>();
          for (const kw of keywordThemes.slice(0, 20)) {
            const words = kw.split(/\s+/);
            words.forEach(w => {
              if (w.length > 4 && !['the', 'and', 'for', 'with'].includes(w.toLowerCase())) {
                entitySet.add(w.replace(/[^a-zA-Z0-9]/g, ''));
              }
            });
          }
          semanticEntities = Array.from(entitySet).slice(0, 20);
        }
      } catch (dfsErr: any) {
        console.error('DataforSEO error:', dfsErr.message);
        // Continue without keyword data
      }
    }

    // Step 3e: Grade sample text
    const sampleText = (textBlob || '').slice(0, 5000);
    let sampleGrade = null;
    if (sampleText.length > 100) {
      try {
        const [grammar, seo] = await Promise.all([
          scoreGrammar(sampleText, env.LANGUAGETOOL_API_KEY),
          Promise.resolve(scoreSeo(sampleText, [], '', sampleText.slice(0, 300))),
        ]);
        const readability = scoreReadability(sampleText);
        const overall = calcOverall({ grammar, readability, ai_detection: null, plagiarism: null, seo, overall: null });
        sampleGrade = { grammar, readability, ai_detection: null, plagiarism: null, seo, overall };
      } catch (gradeErr) {
        console.error('Sample grading error:', gradeErr);
      }
    }

    // Step 3f: Generate slug
    const uuid = generateId();
    const slug = `author-${uuid.slice(0, 6)}`;

    // Step 3g: Discard raw text - never in response
    textBlob = '';

    // Step 3h: Return preview
    const preview = {
      slug,
      name: custom_name || authorName,
      style_guide: styleGuide,
      keyword_themes: keywordThemes,
      semantic_entities: semanticEntities,
      source_type: rssUrl ? 'rss' : 'docx',
      rss_url: rssUrl || null,
      grade: sampleGrade,
    };
    return json(preview);

  } catch (err: any) {
    console.error('Ingest error:', err);
    return json({ error: err.message || 'Server error' }, 500);
  }
}