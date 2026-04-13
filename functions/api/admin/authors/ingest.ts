import { json, getSessionUser, generateId } from '../../_utils';
import type { Env } from '../../_utils';

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
        data: {
          text: text.slice(0, 10000), // DataforSEO has a text length limit
          language_code: 'en',
          location_code: 2840,
        }
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

export async function onRequest(context: { request: Request; env: Env }) {
  const { request, env } = context;
  
  // DEBUG — remove after fix
  console.log('ALL ENV KEYS:', Object.keys(env || {}));
  console.log('OPENROUTER direct:', typeof env?.OPENROUTER_API_KEY, env?.OPENROUTER_API_KEY?.slice(0,8));
  
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

  // Require admin session
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);
  if (user.role !== 'admin') return json({ error: 'Forbidden' }, 403);

  try {
    const contentType = request.headers.get('Content-Type') || '';
    let rssUrl: string | null = null;
    let textBlob: string | null = null;

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
      const body = await request.json();
      rssUrl = body.rss_url;

      if (!rssUrl) {
        return json({ error: 'rss_url is required' }, 400);
      }

      // Fetch and parse RSS feed
      console.log('Fetching RSS URL:', rssUrl);
      const response = await fetch(rssUrl, {
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; SubMoaBot/1.0)',
          'Accept': 'application/rss+xml, application/xml, text/xml, */*'
        }
      });
      console.log('RSS fetch status:', response.status);
      if (!response.ok) {
        return json({ error: `Failed to fetch RSS feed: ${response.status}` }, 400);
      }

      const xmlText = await response.text();
      
      // Simple RSS parser - extract items
      const itemMatches = xmlText.match(/<item[^>]*>([\s\S]*?)<\/item>/gi) || [];
      const articles: string[] = [];
      
      for (const item of itemMatches.slice(0, 10)) {
        const descMatch = item.match(/<description[^>]*>([\s\S]*?)<\/description>/i);
        if (descMatch && descMatch[1]) {
          // Strip HTML tags from description
          const text = descMatch[1].replace(/<[^>]+>/g, '').trim();
          if (text.length > 50) {
            articles.push(text);
          }
        }
        
        const contentMatch = item.match(/<content:encoded[^>]*>([\s\S]*?)<\/content:encoded>/i);
        if (contentMatch && contentMatch[1]) {
          const text = contentMatch[1].replace(/<[^>]+>/g, '').trim();
          if (text.length > 50) {
            articles.push(text);
          }
        }
      }

      if (articles.length === 0) {
        return json({ error: 'No article content found in RSS feed' }, 400);
      }

      textBlob = articles.join('\n\n');
    } else {
      return json({ error: 'Unsupported content type' }, 400);
    }

    // Step 3b: AI style analysis via OpenRouter
    console.log('Calling OpenRouter for style analysis...');
    console.log('Text blob length:', textBlob.length);
    
    // Debug: check which path the secret is accessible from
    const openRouterKey = (context as any).env?.OPENROUTER_API_KEY
      ?? (context as any).OPENROUTER_API_KEY
      ?? (env as any)?.OPENROUTER_API_KEY;
    console.log('OPENROUTER_API_KEY accessible:', !!openRouterKey, '| length:', openRouterKey?.length ?? 0);

    // Declare keywordThemes and semanticEntities early so they're available for name prompt
    let keywordThemes: string[] = [];
    let semanticEntities: string[] = [];

    const stylePrompt = `Analyze this author's writing style based on the following article excerpts. Provide a concise style guide (2-3 paragraphs) that describes their voice, tone, sentence structure, perspective, and formatting preferences. Focus on what makes their writing distinctive and readable. Respond ONLY with the style guide, no preamble.

---
${textBlob.slice(0, 8000)}`;

    console.log('Style prompt length:', stylePrompt.length);
    console.log('Style prompt preview:', stylePrompt.slice(0, 200));

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
    console.log('OpenRouter style response status:', styleResponse.status);
    const styleData = await styleResponse.json();
    console.log('OpenRouter style response:', JSON.stringify(styleData));
    
    if (styleData.choices && styleData.choices[0]?.message?.content) {
      styleGuide = styleData.choices[0].message.content;
    } else if (styleData.error) {
      console.error('OpenRouter API error:', styleData.error);
      return json({ error: 'OpenRouter API error: ' + JSON.stringify(styleData.error) }, 500);
    }

    // Step 3c: Generate author name from style and content
    console.log('Calling OpenRouter for name generation...');
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
    console.log('OpenRouter name response status:', nameResponse.status);
    const nameData = await nameResponse.json();
    console.log('OpenRouter name response:', JSON.stringify(nameData));
    
    if (nameData.choices && nameData.choices[0]?.message?.content) {
      authorName = nameData.choices[0].message.content.trim().replace(/^"+|"+$/g, '');
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

    // Step 3e: Generate slug
    const uuid = generateId();
    const slug = `author-${uuid.slice(0, 6)}`;

    // Step 3f: Discard raw text - never in response
    textBlob = '';

    // Step 3g: Return preview
    const preview = {
      slug,
      name: authorName,
      style_guide: styleGuide,
      keyword_themes: keywordThemes,
      semantic_entities: semanticEntities,
      source_type: rssUrl ? 'rss' : 'docx',
      rss_url: rssUrl || null,
    };
    console.log('Preview being returned:', JSON.stringify(preview));
    return json(preview);

  } catch (err: any) {
    console.error('Ingest error:', err);
    return json({ error: err.message || 'Server error' }, 500);
  }
}