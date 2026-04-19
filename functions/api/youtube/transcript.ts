// POST /api/youtube/transcript
// Takes a YouTube URL + optional topic focus, returns the transcript.
// Also generates a short AI summary + key takeaways in the same call.
// Reuses extractYouTubeVideoId + getYouTubeTranscript from _youtube.ts.
import { getSessionUser, json } from '../_utils';
import type { Env } from '../_utils';
import { extractYouTubeVideoId, getYouTubeTranscript } from '../_youtube';

function sliceTranscriptForTopic(transcript: string, topic: string): string {
  if (!topic.trim() || !transcript) return transcript;
  // Simple topic filtering — split into sentences and keep ones matching any
  // keyword from the topic plus 1 sentence on either side.
  const kw = topic.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  if (kw.length === 0) return transcript;
  const sentences = transcript.split(/(?<=[.!?])\s+/);
  const keep = new Set<number>();
  sentences.forEach((s, i) => {
    const low = s.toLowerCase();
    if (kw.some(k => low.includes(k))) {
      keep.add(i);
      if (i > 0) keep.add(i - 1);
      if (i < sentences.length - 1) keep.add(i + 1);
    }
  });
  if (keep.size === 0) return transcript;
  const indices = Array.from(keep).sort((a, b) => a - b);
  return indices.map(i => sentences[i]).join(' ');
}

async function generateSummary(env: Env, transcript: string, topic: string): Promise<{ summary: string; takeaways: string[] } | null> {
  try {
    const system =
      "You are a content summarizer. Given a YouTube transcript, produce a 3-5 sentence summary plus a bullet list of the key takeaways. Return ONLY valid JSON: {\"summary\": \"3-5 sentences\", \"takeaways\": [\"item\", \"item\"]}. Under no circumstances fabricate details not present in the transcript.";
    const userPrompt = `${topic ? `Focus the summary on this angle: ${topic}\n\n` : ''}Transcript:\n${transcript.slice(0, 12000)}`;
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://www.submoacontent.com',
        'X-Title': 'SubMoa YouTube Transcript',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        max_tokens: 1400,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userPrompt },
        ],
      }),
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    const raw = (data?.choices?.[0]?.message?.content ?? '').trim();
    const parsed = (() => {
      try { return JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()); } catch { return null; }
    })();
    if (!parsed) return null;
    return {
      summary: String(parsed.summary || '').slice(0, 2000),
      takeaways: Array.isArray(parsed.takeaways) ? parsed.takeaways.slice(0, 12).map((t: any) => String(t).slice(0, 400)) : [],
    };
  } catch { return null; }
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
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const url = String(body.url || '').trim().slice(0, 600);
  const topic = String(body.topic || '').trim().slice(0, 1000);
  if (!url) return json({ error: 'url is required' }, 400);

  const videoId = extractYouTubeVideoId(url);
  if (!videoId) return json({ error: 'Could not parse YouTube video id from URL' }, 400);

  const rawTranscript = await getYouTubeTranscript(videoId, env.YOUTUBE_API_KEY);
  if (!rawTranscript) return json({ error: 'No transcript available for this video' }, 404);

  const transcript = topic ? sliceTranscriptForTopic(rawTranscript, topic) : rawTranscript;

  // Summary is best-effort — failure returns transcript only.
  const summaryResult = await generateSummary(env as any, transcript, topic);

  return json({
    video_id: videoId,
    transcript,
    summary: summaryResult?.summary || '',
    takeaways: summaryResult?.takeaways || [],
  });
}
