// /youtube-transcript — paste a URL, get transcript, AI summary, optional
// blog-draft article. Requires auth (gated at the App route).

import { useEffect, useState } from 'react';
import PageShell from '../components/PageShell.jsx';

const cardStyle = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: 16,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  boxShadow: 'var(--shadow-card)',
};

const labelStyle = {
  fontSize: 10,
  fontWeight: 700,
  color: 'var(--amber)',
  letterSpacing: '.08em',
  textTransform: 'uppercase',
};

function download(filename, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function YouTubeTranscript({ navigate }) {
  const [url, setUrl] = useState('');
  const [topic, setTopic] = useState('');
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState(''); // 'fetching' | 'processing' | ''
  const [error, setError] = useState('');
  const [transcript, setTranscript] = useState('');
  const [summary, setSummary] = useState('');
  const [takeaways, setTakeaways] = useState([]);
  const [videoId, setVideoId] = useState('');

  // Draft card state
  const [authors, setAuthors] = useState([]);
  const [author, setAuthor] = useState('');
  const [draft, setDraft] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState('');

  useEffect(() => {
    fetch('/api/authors', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { authors: [] })
      .then(d => {
        const list = d.authors || [];
        setAuthors(list);
        if (list.length > 0) setAuthor(list[0].slug);
      }).catch(() => {});
  }, []);

  // Video metadata pulled from YouTube oEmbed before any transcript attempt,
  // so the user sees the thumbnail + title even if the transcript fails.
  const [videoMeta, setVideoMeta] = useState(null);
  const [transcriptFailed, setTranscriptFailed] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [audioUploading, setAudioUploading] = useState(false);

  async function fetchVideoMeta(u) {
    try {
      const oembed = `https://www.youtube.com/oembed?url=${encodeURIComponent(u)}&format=json`;
      const res = await fetch(oembed);
      if (!res.ok) return null;
      return await res.json();
    } catch { return null; }
  }

  async function attemptTranscript(u, topicStr) {
    const res = await fetch('/api/youtube/transcript', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: u, topic: topicStr }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'Failed to fetch transcript');
    return data;
  }

  // Run summary+takeaways on an already-obtained transcript (used by paste /
  // audio fallbacks). Reuses the same server endpoint by passing the text
  // through a lightweight summary endpoint would be cleaner — for now we
  // just set transcript and let the user generate the blog draft.
  function acceptTranscript(text) {
    setTranscript(text);
    setTranscriptFailed(false);
  }

  async function handleGenerate() {
    if (!url.trim()) return;
    setError(''); setLoading(true); setPhase('fetching');
    setTranscript(''); setSummary(''); setTakeaways([]); setDraft(''); setDraftError('');
    setTranscriptFailed(false);

    // 1. Metadata first so we can show thumbnail even on failure.
    const meta = await fetchVideoMeta(url.trim());
    setVideoMeta(meta);

    // 2. Two attempts with a 1s gap.
    try {
      try {
        const data = await attemptTranscript(url.trim(), topic.trim());
        setPhase('processing');
        setTranscript(data.transcript || '');
        setSummary(data.summary || '');
        setTakeaways(Array.isArray(data.takeaways) ? data.takeaways : []);
        setVideoId(data.video_id || '');
      } catch (first) {
        // Wait 1s and retry
        await new Promise(r => setTimeout(r, 1000));
        try {
          const data = await attemptTranscript(url.trim(), topic.trim());
          setPhase('processing');
          setTranscript(data.transcript || '');
          setSummary(data.summary || '');
          setTakeaways(Array.isArray(data.takeaways) ? data.takeaways : []);
          setVideoId(data.video_id || '');
        } catch (second) {
          throw second;
        }
      }
    } catch (e) {
      setTranscriptFailed(true);
      setError("This video does not have a transcript available. This can happen when the creator has disabled captions, the video is too new, or auto-captions haven't been generated yet.");
    } finally {
      setLoading(false); setPhase('');
    }
  }

  async function uploadAudio(file) {
    if (!file) return;
    setAudioUploading(true); setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/youtube/transcribe-audio', { method: 'POST', credentials: 'include', body: fd });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || 'Transcription failed');
      if (d.transcript) acceptTranscript(d.transcript);
    } catch (e) { setError(e.message); }
    setAudioUploading(false);
  }

  async function handleGenerateDraft() {
    if (!transcript) return;
    setDraftError(''); setDrafting(true); setDraft('');
    try {
      const res = await fetch('/api/youtube/draft-article', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript, topic: topic.trim(), author }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Draft failed');
      setDraft(data.draft || '');
    } catch (e) {
      setDraftError(e.message || 'Failed');
    } finally {
      setDrafting(false);
    }
  }

  function sendToBuildArticle() {
    try {
      sessionStorage.setItem('youtube_handoff', JSON.stringify({
        url,
        topic,
        draft,
      }));
    } catch {}
    navigate?.('/author');
  }

  const copy = async (s) => { try { await navigator.clipboard.writeText(s); } catch {} };
  const takeawaysText = takeaways.length ? '\n\nKey Takeaways:\n' + takeaways.map(t => `- ${t}`).join('\n') : '';

  return (
    <PageShell
      eyebrow="// YOUTUBE TRANSCRIBE"
      title="Transcribe a video"
      subtitle="Paste any URL. Get the raw transcript, an AI summary, and an optional blog draft."
    >

      {videoMeta && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, padding: 10, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }}>
          {videoMeta.thumbnail_url && (
            <img src={videoMeta.thumbnail_url} alt="" style={{ width: 120, height: 90, objectFit: 'cover', borderRadius: 4 }} />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{videoMeta.title}</div>
            <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 2 }}>{videoMeta.author_name}</div>
          </div>
        </div>
      )}

      {error && (
        <div style={{ background: 'var(--error-bg)', border: '1px solid var(--error-border)', borderRadius: 6, padding: '10px 14px', fontSize: 13, color: 'var(--error)', marginBottom: 16 }}>
          {error}
        </div>
      )}

      {transcriptFailed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 20 }}>
          <div style={{ padding: 14, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>OPTION A — AUDIO UPLOAD</div>
            <div style={{ fontSize: 12, color: 'var(--text-mid)', marginBottom: 10, lineHeight: 1.6 }}>
              If you have access to the video audio, download it and upload the MP3 here — we'll transcribe it using AI.
            </div>
            <input type="file" accept=".mp3,.mp4,audio/mpeg,audio/mp4,video/mp4"
              onChange={(e) => uploadAudio(e.target.files?.[0])} style={{ fontSize: 12 }} disabled={audioUploading} />
            {audioUploading && <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 6 }}>Transcribing via Whisper…</div>}
          </div>

          <div style={{ padding: 14, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>OPTION B — MANUAL PASTE</div>
            <textarea className="form-textarea" rows={4} placeholder="Paste transcript manually"
              value={pasteText} onChange={(e) => setPasteText(e.target.value)} />
            <button className="btn-primary" style={{ marginTop: 8 }} disabled={!pasteText.trim()}
              onClick={() => { acceptTranscript(pasteText.trim()); setPasteText(''); }}>
              Use This Transcript
            </button>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="form-group">
        <label className="form-label">YouTube URL <span className="required">✦</span></label>
        <input
          type="url"
          className="form-input"
          placeholder="https://www.youtube.com/watch?v=…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      </div>

      <div className="form-group">
        <label className="form-label">Topic focus (optional)</label>
        <textarea
          className="form-input form-textarea"
          rows={3}
          placeholder="What do you want to extract from this video? Leave blank for full transcript. Example: extract everything about suppressor decibel ratings and legal considerations."
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 24 }}>
        <button className="btn-primary" onClick={handleGenerate} disabled={loading || !url.trim()}>
          {phase === 'fetching' ? 'Fetching transcript…' : phase === 'processing' ? 'Processing…' : 'Generate'}
        </button>
      </div>

      {/* Output grid */}
      {(transcript || summary) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
          {/* Card 1 — Raw Transcript */}
          <div style={cardStyle}>
            <div style={labelStyle}>Raw Transcript {topic ? '(topic-filtered)' : ''}</div>
            <div style={{ maxHeight: 260, overflow: 'auto', fontSize: 12, color: 'var(--text-mid)', lineHeight: 1.6, whiteSpace: 'pre-wrap', background: 'var(--surface-inp)', padding: 10, borderRadius: 6, border: '1px solid var(--border-light)' }}>
              {transcript || 'Transcript not available.'}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="db-btn db-btn-gold" onClick={() => copy(transcript)} disabled={!transcript}>Copy</button>
              <button className="db-btn db-btn-gold" onClick={() => download(`transcript-${videoId || 'video'}.txt`, transcript)} disabled={!transcript}>Download TXT</button>
            </div>
          </div>

          {/* Card 2 — Summary + Key Takeaways */}
          <div style={cardStyle}>
            <div style={labelStyle}>Summary + Key Takeaways</div>
            {summary ? (
              <>
                <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>{summary}</div>
                {takeaways.length > 0 && (
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--text-mid)', lineHeight: 1.6 }}>
                    {takeaways.map((t, i) => <li key={i}>{t}</li>)}
                  </ul>
                )}
              </>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--text-light)', fontStyle: 'italic' }}>
                Summary not generated — the model call may have failed.
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="db-btn db-btn-gold" onClick={() => copy(summary + takeawaysText)} disabled={!summary}>Copy</button>
              <button className="db-btn db-btn-gold" onClick={() => download(`summary-${videoId || 'video'}.txt`, summary + takeawaysText)} disabled={!summary}>Download TXT</button>
            </div>
          </div>

          {/* Card 3 — Blog Article Draft */}
          <div style={cardStyle}>
            <div style={labelStyle}>Blog Article Draft</div>
            <div>
              <label className="form-label" style={{ fontSize: 11 }}>Author voice</label>
              <select className="form-input form-select" value={author} onChange={(e) => setAuthor(e.target.value)}>
                {authors.length === 0 && <option value="">No authors available</option>}
                {authors.map(a => <option key={a.slug} value={a.slug}>{a.name}</option>)}
              </select>
            </div>
            {!draft && (
              <button className="btn-primary" onClick={handleGenerateDraft} disabled={drafting || !transcript || !author}>
                {drafting ? 'Generating draft…' : 'Generate Draft'}
              </button>
            )}
            {draftError && (
              <div style={{ fontSize: 12, color: 'var(--error)' }}>{draftError}</div>
            )}
            {draft && (
              <>
                <textarea
                  readOnly
                  value={draft}
                  rows={10}
                  style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: 12, background: 'var(--surface-inp)', border: '1px solid var(--border-light)', borderRadius: 6, padding: 10, color: 'var(--text)' }}
                />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="db-btn db-btn-gold" onClick={() => copy(draft)}>Copy</button>
                  <button className="db-btn db-btn-gold" onClick={() => download(`draft-${videoId || 'video'}.md`, draft)}>Download .md</button>
                  <button className="db-btn db-btn-green" onClick={sendToBuildArticle}>Send to Build Article →</button>
                  <button className="db-btn" onClick={handleGenerateDraft} disabled={drafting}>Regenerate</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </PageShell>
  );
}
