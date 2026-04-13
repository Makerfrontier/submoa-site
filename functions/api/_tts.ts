/**
 * Text-to-Speech generation via OpenRouter OpenAI TTS endpoint.
 * Strips FAQ section, converts markdown to plain text, chunks at sentence boundaries,
 * generates MP3 per chunk, concatenates, and uploads to R2.
 */

export async function generateAudio(
  articleContent: string,
  submission: { id: string; topic: string },
  authorProfile: { name: string; tts_voice_id?: string },
  env: { OPENROUTER_API_KEY: string; SUBMOA_IMAGES: R2Bucket }
): Promise<string> {
  // 1. Strip FAQ section
  const faqPatterns = [
    /#{1,6}\s*FAQ[^]*$/im,
    /#{1,6}\s*Frequently Asked Questions[^]*$/im,
    /#{1,6}\s*FAQ\s*Section[^]*$/im,
  ];
  let text = articleContent;
  for (const pattern of faqPatterns) {
    const match = text.match(pattern);
    if (match) {
      text = text.slice(0, text.indexOf(match[0]));
    }
  }

  // 2. Convert markdown to plain text
  text = text
    .replace(/^#{1,6}\s+/gm, '')          // headings
    .replace(/\*\*(.+?)\*\*/g, '$1')       // bold
    .replace(/\*(.+?)\*/g, '$1')           // italic
    .replace(/__(.+?)__/g, '$1')           // bold underscore
    .replace(/_(.+?)_/g, '$1')             // italic underscore
    .replace(/`(.+?)`/g, '$1')             // inline code
    .replace(/```[\s\S]*?```/g, '')        // code blocks
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')    // links
    .replace(/!\[.*?\]\(.*?\)/g, '')        // images
    .replace(/^[\-\*\+]\s+/gm, '')         // list bullets
    .replace(/^\d+\.\s+/gm, '')            // numbered lists
    .replace(/^>\s+/gm, '')                // blockquotes
    .replace(/\n{3,}/g, '\n\n')           // excess newlines
    .trim();

  // 3. Prepend byline
  const byline = `By ${authorProfile.name}. `;
  text = byline + text;

  // 4. Split into chunks of max 4000 characters at sentence boundaries
  const MAX_CHUNK = 4000;
  const chunks: string[] = [];
  const sentences = text.split(/(?<=[.!?])\s+/);
  let currentChunk = '';

  for (const sentence of sentences) {
    if ((currentChunk + sentence).length > MAX_CHUNK && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = sentence;
    } else {
      currentChunk += (currentChunk ? ' ' : '') + sentence;
    }
  }
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  // 5. Generate MP3 for each chunk via OpenRouter
  const voice = authorProfile.tts_voice_id || 'alloy';
  const mp3Buffers: ArrayBuffer[] = [];

  for (const chunk of chunks) {
    const response = await fetch('https://openrouter.ai/api/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/tts-1',
        voice,
        input: chunk,
        response_format: 'mp3',
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('[generateAudio] OpenRouter TTS error:', err);
      throw new Error(`TTS generation failed: ${response.status} ${err}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    mp3Buffers.push(arrayBuffer);
  }

  // 6. Concatenate all MP3 buffers
  const totalLength = mp3Buffers.reduce((acc, buf) => acc + buf.byteLength, 0);
  const combined = new ArrayBuffer(totalLength);
  const view = new Uint8Array(combined);
  let offset = 0;
  for (const buf of mp3Buffers) {
    view.set(new Uint8Array(buf), offset);
    offset += buf.byteLength;
  }

  // 7. Upload to R2
  const r2Path = `articles/${submission.id}/audio.mp3`;
  await env.SUBMOA_IMAGES.put(r2Path, combined, {
    httpMetadata: { contentType: 'audio/mpeg' },
  });

  console.log(`[generateAudio] Uploaded audio to R2: ${r2Path} (${chunks.length} chunks)`);
  return r2Path;
}
