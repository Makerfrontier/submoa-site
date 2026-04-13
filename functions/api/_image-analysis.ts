import { Env } from './_utils';

export async function analyzeImage(
  env: Env,
  imageBase64: string,
  mimeType: string,
  context: { topic: string; articleType: string; keywords: string[] }
): Promise<{
  alt_text: string;
  caption: string;
  title: string;
  seo_filename: string;
}> {
  const prompt = `You are an SEO image optimization expert. Analyze this product image and return ONLY a JSON object with these exact fields:
{
  "alt_text": "descriptive alt text under 125 characters, naturally including relevant keywords",
  "caption": "one sentence caption suitable for display under the image",
  "title": "short descriptive title for the image title attribute",
  "seo_filename": "seo-friendly-filename-with-hyphens.webp"
}

Context:
- Article topic: ${context.topic}
- Article type: ${context.articleType}
- Target keywords: ${context.keywords.join(', ')}

Return only the JSON object. No preamble. No explanation.`;

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://submoacontent.com',
      'X-Title': 'SubMoa Content'
    },
    body: JSON.stringify({
      model: env.OPENROUTER_VISION_MODEL ?? 'google/gemini-2.0-flash',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: `data:${mimeType};base64,${imageBase64}`
            }
          },
          {
            type: 'text',
            text: prompt
          }
        ]
      }]
    })
  });

  const data = await response.json();
  const text = data.choices[0].message.content;

  try {
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch {
    return {
      alt_text: `Product image for ${context.topic}`,
      caption: `Image related to ${context.topic}`,
      title: context.topic,
      seo_filename: context.topic.toLowerCase().replace(/\s+/g, '-') + '.webp'
    };
  }
}