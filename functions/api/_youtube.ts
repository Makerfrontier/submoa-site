// YouTube transcript utility
// Extracts video ID from URL and fetches transcript via YouTube Data API v3 captions endpoint

export interface YouTubeTranscriptResult {
  transcript: string;
  videoId: string;
}

export interface Env {
  YOUTUBE_API_KEY: string;
  submoacontent_db: any;
  SUBMOA_IMAGES: any;
}

// Extract video ID from various YouTube URL formats
export function extractYouTubeVideoId(url: string): string | null {
  if (!url) return null;

  // Handle bare video IDs (11 characters)
  if (/^[a-zA-Z0-9_-]{11}$/.test(url)) {
    return url;
  }

  try {
    const parsed = new URL(url);
    // youtube.com/watch?v=...
    if (parsed.hostname.includes('youtube.com')) {
      return parsed.searchParams.get('v');
    }
    // youtu.be/...
    if (parsed.hostname === 'youtu.be') {
      return parsed.pathname.slice(1);
    }
    // youtube.com/embed/...
    if (parsed.pathname.startsWith('/embed/')) {
      return parsed.pathname.split('/embed/')[1]?.split('?')[0];
    }
    // youtube.com/v/...
    if (parsed.pathname.startsWith('/v/')) {
      return parsed.pathname.split('/v/')[1]?.split('?')[0];
    }
  } catch {
    return null;
  }

  return null;
}

// Fetch transcript for a YouTube video using YouTube Data API v3
export async function getYouTubeTranscript(
  videoId: string,
  apiKey: string
): Promise<string | null> {
  if (!apiKey) {
    console.error('[getYouTubeTranscript] No YOUTUBE_API_KEY configured');
    return null;
  }

  if (!videoId) {
    console.error('[getYouTubeTranscript] No videoId provided');
    return null;
  }

  try {
    // Step 1: List available caption tracks for the video
    const listUrl = `https://www.googleapis.com/youtube/v3/captions?part=snippet&videoId=${videoId}&key=${apiKey}`;
    const listResponse = await fetch(listUrl);

    if (!listResponse.ok) {
      console.error(`[getYouTubeTranscript] Caption list API error: ${listResponse.status} ${listResponse.statusText}`);
      return null;
    }

    const listData = await listResponse.json() as { items?: Array<{ id: string; snippet: { language: string; isDraft: boolean } }> };

    if (!listData.items || listData.items.length === 0) {
      console.log(`[getYouTubeTranscript] No captions found for video ${videoId}`);
      return null;
    }

    // Find the first non-draft English caption if available, otherwise any non-draft caption
    const captionTrack = listData.items.find(c => !c.snippet.isDraft) || listData.items[0];

    if (!captionTrack) {
      console.log(`[getYouTubeTranscript] All caption tracks are drafts for video ${videoId}`);
      return null;
    }

    // Step 2: Download the caption track
    const downloadUrl = `https://www.googleapis.com/youtube/v3/captions/${captionTrack.id}?key=${apiKey}`;
    const downloadResponse = await fetch(downloadUrl, {
      headers: {
        'Accept': 'text/vtt, application/x-youtube-vtt+json',
      },
    });

    if (!downloadResponse.ok) {
      console.error(`[getYouTubeTranscript] Caption download API error: ${downloadResponse.status}`);
      return null;
    }

    let transcriptText = await downloadResponse.text() as string;

    // Parse VTT format and extract plain text
    // VTT format: WEBVTT\n\n00:00:00.000 --> 00:00:04.000\nTranscript line 1\n\n00:00:04.000 --> 00:00:08.000\nTranscript line 2\n...
    transcriptText = parseVttTranscript(transcriptText);

    if (!transcriptText || transcriptText.trim().length === 0) {
      console.log(`[getYouTubeTranscript] Empty transcript after parsing for video ${videoId}`);
      return null;
    }

    console.log(`[getYouTubeTranscript] Successfully fetched transcript (${transcriptText.length} chars) for video ${videoId}`);
    return transcriptText;

  } catch (err) {
    console.error(`[getYouTubeTranscript] Error fetching transcript for ${videoId}:`, err);
    return null;
  }
}

// Parse WebVTT format transcript into plain text
function parseVttTranscript(vttContent: string): string {
  if (!vttContent) return '';

  const lines = vttContent.split('\n');
  const transcriptLines: string[] = [];
  let collecting = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip WEBVTT header and metadata
    if (trimmed === 'WEBVTT' || trimmed.startsWith('NOTE') || trimmed.startsWith('STYLE')) {
      continue;
    }

    // Skip timestamp lines (e.g., 00:00:00.000 --> 00:00:04.000)
    if (trimmed.includes('-->')) {
      collecting = true;
      continue;
    }

    // Skip empty lines
    if (trimmed === '') {
      collecting = false;
      continue;
    }

    // Skip cue identifiers (numbers)
    if (/^\d+$/.test(trimmed)) {
      continue;
    }

    // Collect transcript text
    if (collecting) {
      transcriptLines.push(trimmed);
    }
  }

  return transcriptLines.join(' ').replace(/<\/?c[^>]*>/g, '').trim();
}

// Full pipeline: extract ID, fetch transcript, return both
export async function fetchYouTubeTranscript(
  youtubeUrl: string,
  apiKey: string
): Promise<{ videoId: string | null; transcript: string | null }> {
  const videoId = extractYouTubeVideoId(youtubeUrl);

  if (!videoId) {
    return { videoId: null, transcript: null };
  }

  const transcript = await getYouTubeTranscript(videoId, apiKey);
  return { videoId, transcript };
}
