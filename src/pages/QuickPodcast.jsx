// Quick Podcast — standalone /listen page.
// Intentionally structurally separable from the rest of SubMoa:
//  - No sidebar, no main nav
//  - Mobile-first single-column layout
//  - Zero imports from SubMoa-specific feature components (only brand bible
//    tokens + the ConfirmModal primitive under src/components/)
// Designed so the backend + this file can be lifted into a spinout product
// with only the brand palette swapped.

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import ConfirmModal from '../components/ConfirmModal.jsx';

async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `API ${res.status}`);
  return data;
}

const eyebrowStyle = {
  fontFamily: 'DM Sans', fontWeight: 600, fontSize: 11, lineHeight: 1.2,
  letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--amber)',
};
const h1Style = {
  fontFamily: 'Playfair Display', fontSize: 40, fontWeight: 600, lineHeight: 1.15,
  letterSpacing: '-0.015em', color: 'var(--green-dark)', margin: 0,
};
const leadStyle = {
  fontFamily: 'DM Sans', fontSize: 18, fontWeight: 400, lineHeight: 1.55,
  color: 'var(--text-mid)', margin: 0,
};

const LENGTHS = [5, 10, 15, 20];

export default function QuickPodcast({ navigate }) {
  const [topic, setTopic] = useState('');
  const [lengthMinutes, setLengthMinutes] = useState(10);
  const [mode, setMode] = useState('conversation');
  const [activeEpisodeId, setActiveEpisodeId] = useState(null);
  const [status, setStatus] = useState(null);
  const [library, setLibrary] = useState([]);
  const [detail, setDetail] = useState(null); // loaded when audio_ready for active episode
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState('');
  const [showSources, setShowSources] = useState(false);
  const [showScript, setShowScript] = useState(false);
  const [feed, setFeed] = useState(null); // { feed_url, rotated_at }
  const [feedExpanded, setFeedExpanded] = useState(false);
  const [coverRefreshedAt, setCoverRefreshedAt] = useState(0);
  const [coverBusy, setCoverBusy] = useState(''); // 'regen' | 'upload' | ''
  const [themeExpanded, setThemeExpanded] = useState(false);
  const [themeMusic, setThemeMusic] = useState(null); // GET response
  const [themePrompt, setThemePrompt] = useState('');
  const [themeBusy, setThemeBusy] = useState(''); // 'regen' | 'upload' | ''
  const [confirmModal, setConfirmModal] = useState(null);
  const pollTimerRef = useRef(null);

  // Deep-link support — ?from=article&id=... or ?topic=... pre-fills topic.
  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      const pre = p.get('topic');
      if (pre) setTopic(pre);
    } catch {}
  }, []);

  const loadLibrary = useCallback(async () => {
    try { const d = await api('/api/quick-podcast/library'); setLibrary(d.episodes || []); } catch {}
  }, []);
  useEffect(() => { loadLibrary(); }, [loadLibrary]);

  // Poll status of the active episode until audio_ready or failed
  useEffect(() => {
    if (!activeEpisodeId) return;
    const tick = async () => {
      try {
        const s = await api(`/api/quick-podcast/${activeEpisodeId}/status`);
        setStatus(s);
        if (s.status === 'audio_ready') {
          clearInterval(pollTimerRef.current);
          const d = await api(`/api/quick-podcast/${activeEpisodeId}`);
          setDetail(d);
          loadLibrary();
        } else if (s.status === 'failed') {
          clearInterval(pollTimerRef.current);
          setToast('Generation failed — try again');
          setTimeout(() => setToast(''), 3500);
        }
      } catch { /* swallow — next tick retries */ }
    };
    tick();
    pollTimerRef.current = setInterval(tick, 2000);
    return () => clearInterval(pollTimerRef.current);
  }, [activeEpisodeId, loadLibrary]);

  const costEstimate = useMemo(() => {
    // ~$0.01 research + ~$0.03 script + (chars * $4.20/M) TTS + ~$0.01 tags.
    // Rough chars per minute at 150 wpm, avg 5 chars/word = 750 chars/min.
    const audio = (lengthMinutes * 750 * 4.2) / 1_000_000;
    return 0.05 + audio;
  }, [lengthMinutes]);

  const seconds = useMemo(() => lengthMinutes * 60, [lengthMinutes]);

  const generate = async () => {
    if (!topic.trim()) { setToast('Type a topic first'); setTimeout(() => setToast(''), 2000); return; }
    setBusy('generate');
    setDetail(null);
    setStatus(null);
    try {
      const r = await api('/api/quick-podcast/generate', {
        method: 'POST',
        body: JSON.stringify({ topic: topic.trim(), length_minutes: lengthMinutes, mode }),
      });
      setActiveEpisodeId(r.episode_id);
    } catch (e) { setToast(e.message); setTimeout(() => setToast(''), 3000); }
    setBusy('');
  };

  const reset = () => { setActiveEpisodeId(null); setStatus(null); setDetail(null); setTopic(''); };

  const deleteEpisode = (ep) => {
    setConfirmModal({
      title: 'Delete this podcast?',
      message: `"${ep.topic}" will be removed from your library and the audio file deleted. Cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'destructive',
      onConfirm: async () => {
        try { await api(`/api/quick-podcast/${ep.id}`, { method: 'DELETE' }); await loadLibrary(); } catch (e) { setToast(e.message); }
      },
    });
  };

  const openEpisode = async (ep) => {
    setActiveEpisodeId(ep.id);
    if (ep.status === 'audio_ready') {
      try { const d = await api(`/api/quick-podcast/${ep.id}`); setDetail(d); setStatus({ status: 'audio_ready', audio_url: d.audio_url, audio_duration_seconds: d.audio_duration_seconds }); } catch {}
    }
  };

  const loadFeed = async () => {
    if (feed) return;
    try { const d = await api('/api/quick-podcast/my-feed'); setFeed(d); } catch (e) { setToast(e.message); }
  };

  const rotateFeed = () => {
    setConfirmModal({
      title: 'Reset your RSS URL?',
      message: 'This will invalidate your current URL. Anyone subscribed — including you in Apple Podcasts — will need to re-add the new URL. Continue?',
      confirmLabel: 'Reset URL',
      variant: 'destructive',
      onConfirm: async () => {
        try { const d = await api('/api/quick-podcast/rotate-feed', { method: 'POST' }); setFeed(d); setToast('New URL ready — re-add it in Apple Podcasts'); setTimeout(() => setToast(''), 4000); } catch (e) { setToast(e.message); }
      },
    });
  };

  const copyUrl = async () => {
    if (!feed?.feed_url) return;
    try { await navigator.clipboard.writeText(feed.feed_url); setToast('Copied'); setTimeout(() => setToast(''), 1500); } catch { setToast('Copy failed'); }
  };

  // Extract the rss token from feed_url so the cover <img> knows the path.
  const rssToken = useMemo(() => {
    if (!feed?.feed_url) return '';
    const m = String(feed.feed_url).match(/\/feed\/([a-f0-9]{16,})\.xml/i);
    return m ? m[1] : '';
  }, [feed?.feed_url]);

  const regenerateCover = async () => {
    setCoverBusy('regen');
    try {
      await api('/api/quick-podcast/regenerate-cover', { method: 'POST' });
      setCoverRefreshedAt(Date.now());
      setToast('New cover generated'); setTimeout(() => setToast(''), 2000);
    } catch (e) { setToast(e.message); }
    finally { setCoverBusy(''); }
  };

  const uploadCover = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverBusy('upload');
    try {
      const fd = new FormData();
      fd.append('cover', file);
      const res = await fetch('/api/quick-podcast/upload-cover', { method: 'POST', body: fd, credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Upload failed ${res.status}`);
      setCoverRefreshedAt(Date.now());
      setToast('Cover uploaded'); setTimeout(() => setToast(''), 2000);
    } catch (err) { setToast(err.message); }
    finally { setCoverBusy(''); e.target.value = ''; }
  };

  const loadThemeMusic = async () => {
    try {
      const d = await api('/api/quick-podcast/theme-music');
      setThemeMusic(d);
      if (d?.prompt && !themePrompt) setThemePrompt(d.prompt);
    } catch (e) { setToast(e.message); }
  };

  const regenerateTheme = async () => {
    setThemeBusy('regen');
    try {
      const res = await fetch('/api/quick-podcast/theme-music', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(themePrompt.trim() ? { prompt: themePrompt.trim() } : {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Regen failed ${res.status}`);
      await loadThemeMusic();
      setToast('Theme music generated'); setTimeout(() => setToast(''), 2500);
    } catch (err) { setToast(err.message); }
    finally { setThemeBusy(''); }
  };

  const uploadTheme = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setThemeBusy('upload');
    try {
      const fd = new FormData();
      fd.append('audio', file);
      const res = await fetch('/api/quick-podcast/theme-music', { method: 'PUT', body: fd, credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Upload failed ${res.status}`);
      await loadThemeMusic();
      setToast('Theme music uploaded'); setTimeout(() => setToast(''), 2000);
    } catch (err) { setToast(err.message); }
    finally { setThemeBusy(''); e.target.value = ''; }
  };

  const generating = Boolean(activeEpisodeId) && status?.status !== 'audio_ready' && status?.status !== 'failed';
  const audioReady = status?.status === 'audio_ready';

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Minimal top bar — bypasses the SubMoa sidebar intentionally */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--card)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button onClick={() => navigate('/dashboard')} style={{ padding: '6px 10px', background: 'transparent', border: 'none', color: 'var(--text-mid)', fontFamily: 'DM Sans', fontSize: 13, cursor: 'pointer' }}>
          ◂ back to dashboard
        </button>
        <div style={{ fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Quick Podcast</div>
        <div style={{ width: 120 }} />
      </div>

      <div style={{ maxWidth: 600, margin: '0 auto', padding: '32px 16px 96px' }}>
        <div style={eyebrowStyle}>✦ QUICK PODCAST</div>
        <h1 style={{ ...h1Style, marginTop: 8 }}>Listen.</h1>
        <p style={{ ...leadStyle, marginTop: 4 }}>Anything in 60 seconds.</p>

        {/* Input state */}
        {!generating && !audioReady && (
          <>
            <textarea
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder="Type a topic, ask a question, or paste a URL…"
              rows={4}
              style={{
                width: '100%', marginTop: 24, padding: 16,
                fontFamily: 'DM Sans', fontSize: 16, lineHeight: 1.5, color: 'var(--text)',
                background: 'var(--surface-inp)', border: '1px solid var(--border)',
                borderRadius: 8, resize: 'vertical',
              }}
            />

            <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {LENGTHS.map(min => (
                <button key={min} onClick={() => setLengthMinutes(min)}
                  style={pillStyle(lengthMinutes === min)}>
                  {min}min
                </button>
              ))}
              <div style={{ width: 8 }} />
              <button onClick={() => setMode('conversation')} style={pillStyle(mode === 'conversation')}>Conversation</button>
              <button onClick={() => setMode('solo')} style={pillStyle(mode === 'solo')}>Solo</button>
            </div>

            <button
              onClick={generate}
              disabled={!topic.trim() || busy === 'generate'}
              style={{
                width: '100%', marginTop: 20, padding: '16px 24px',
                background: 'var(--amber)', color: 'var(--card)', border: 'none', borderRadius: 8,
                fontFamily: 'DM Sans', fontSize: 16, fontWeight: 600, lineHeight: 1,
                cursor: !topic.trim() || busy === 'generate' ? 'not-allowed' : 'pointer',
                opacity: !topic.trim() || busy === 'generate' ? 0.5 : 1,
              }}
            >
              {busy === 'generate' ? 'Starting…' : 'Generate Podcast →'}
            </button>

            <div style={{ marginTop: 10, fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text-mid)', textAlign: 'center' }}>
              ≈ {Math.round(seconds)} seconds of audio · ~${costEstimate.toFixed(2)}
            </div>
          </>
        )}

        {/* Generating state */}
        {generating && status && (
          <div style={{ marginTop: 24, padding: 20, background: 'var(--card)', border: '2px solid var(--podcast-teal)', borderRadius: 8 }}>
            <div style={{ ...eyebrowStyle, color: 'var(--podcast-teal)' }}>GENERATING</div>
            <h4 style={{ fontFamily: 'DM Sans', fontSize: 18, fontWeight: 600, color: 'var(--text)', margin: '4px 0 16px' }}>
              {status.topic || topic}
            </h4>
            <StepList status={status.status} />
            <div style={{ marginTop: 14, fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text-mid)' }}>
              This usually takes 60-90 seconds.
            </div>
            <button onClick={reset} style={{ marginTop: 14, padding: '6px 12px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-mid)', fontFamily: 'DM Sans', fontSize: 13, cursor: 'pointer', borderRadius: 4 }}>Cancel</button>
          </div>
        )}

        {/* Audio-ready state */}
        {audioReady && detail && (
          <div style={{ marginTop: 24, padding: 20, background: 'var(--card)', border: '2px solid var(--podcast-teal)', borderRadius: 8 }}>
            <div style={{ ...eyebrowStyle, color: 'var(--podcast-teal)' }}>READY</div>
            <h4 style={{ fontFamily: 'DM Sans', fontSize: 18, fontWeight: 600, color: 'var(--text)', margin: '4px 0' }}>{detail.topic}</h4>
            <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text-mid)', marginBottom: 12 }}>
              {detail.hosts && detail.hosts.length > 0 ? `Hosts: ${detail.hosts.map(h => h.name).join(', ')} · ` : ''}
              {formatDuration(detail.audio_duration_seconds)} · {detail.sources?.length || 0} source{(detail.sources?.length || 0) !== 1 ? 's' : ''}
            </div>
            <audio src={detail.audio_url} controls style={{ width: '100%' }} />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
              <button onClick={() => setShowSources(v => !v)} style={secondaryBtnStyle}>{showSources ? 'Hide' : 'View'} Sources</button>
              <button onClick={() => setShowScript(v => !v)} style={secondaryBtnStyle}>{showScript ? 'Hide' : 'View'} Script</button>
            </div>
            {showSources && detail.sources && detail.sources.length > 0 && (
              <div style={{ marginTop: 12, padding: 12, background: 'var(--surface-inp)', borderRadius: 4 }}>
                {detail.sources.map((s, i) => (
                  <div key={i} style={{ marginBottom: 8, fontFamily: 'DM Sans', fontSize: 13 }}>
                    <a href={s.url} target="_blank" rel="noreferrer" style={{ color: 'var(--green-dark)', textDecoration: 'underline' }}>{s.title}</a>
                    {s.snippet && <div style={{ color: 'var(--text-mid)', fontSize: 12, marginTop: 2 }}>{s.snippet}</div>}
                  </div>
                ))}
              </div>
            )}
            {showScript && (detail.script || []).length > 0 && (
              <div style={{ marginTop: 12, padding: 12, background: 'var(--surface-inp)', borderRadius: 4, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {detail.script.map((seg, i) => (
                  <div key={seg.id || i}>
                    <div style={{ fontFamily: 'DM Sans', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-mid)' }}>{seg.speaker_name}</div>
                    <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text)' }}>{seg.text}</div>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={reset}
              style={{
                width: '100%', marginTop: 16, padding: '14px 20px',
                background: 'var(--amber)', color: 'var(--card)', border: 'none', borderRadius: 8,
                fontFamily: 'DM Sans', fontSize: 15, fontWeight: 600, cursor: 'pointer',
              }}
            >
              ✦ Generate Another →
            </button>
          </div>
        )}

        {/* Library */}
        <div style={{ marginTop: 40 }}>
          <h4 style={{ fontFamily: 'DM Sans', fontSize: 18, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Library</h4>
          {library.length === 0 && (
            <div style={{ marginTop: 8, fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text-mid)' }}>
              Your generated podcasts will show up here.
            </div>
          )}
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {library.map(ep => (
              <div key={ep.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, background: 'var(--card)', border: '1px solid var(--border-light)', borderRadius: 6 }}>
                <button onClick={() => openEpisode(ep)} aria-label="Open" disabled={ep.status !== 'audio_ready'}
                  style={{ padding: '6px 10px', border: 'none', background: ep.status === 'audio_ready' ? 'var(--podcast-teal)' : 'var(--border)', color: 'var(--card)', borderRadius: '50%', cursor: ep.status === 'audio_ready' ? 'pointer' : 'not-allowed' }}>▷</button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 14, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ep.topic}</div>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--text-mid)' }}>
                    {ep.status === 'audio_ready' ? `${ep.target_length_minutes || '?'} min · ${ep.host_count} host${ep.host_count !== 1 ? 's' : ''} · ${formatRelative(ep.created_at)}`
                      : ep.status === 'failed' ? 'failed'
                      : `generating… (${ep.status})`}
                  </div>
                </div>
                <button onClick={() => deleteEpisode(ep)} style={{ padding: '4px 8px', background: 'transparent', border: 'none', color: 'var(--text-light)', cursor: 'pointer', fontFamily: 'DM Sans', fontSize: 16 }}>×</button>
              </div>
            ))}
          </div>
        </div>

        {/* Apple Podcasts RSS card */}
        <div style={{ marginTop: 32, border: '1px solid var(--border)', background: 'var(--card)', borderRadius: 6 }}>
          <button
            onClick={() => { setFeedExpanded(v => { const next = !v; if (next) loadFeed(); return next; }); }}
            style={{ width: '100%', padding: '14px 16px', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', ...eyebrowStyle }}
          >
            <span>✦ LISTEN ON APPLE PODCASTS</span>
            <span style={{ color: 'var(--text-mid)', fontSize: 14 }}>{feedExpanded ? '▴' : '▾'}</span>
          </button>
          {feedExpanded && (
            <div style={{ padding: 16, borderTop: '1px solid var(--border-light)' }}>
              {rssToken && (
                <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--border-light)' }}>
                  <div style={{ ...eyebrowStyle, marginBottom: 8 }}>✦ FEED COVER</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <img
                      src={`/api/quick-podcast/feed-cover/${rssToken}.png${coverRefreshedAt ? `?v=${coverRefreshedAt}` : ''}`}
                      alt="Your podcast feed cover"
                      style={{ width: 80, height: 80, borderRadius: 8, objectFit: 'cover', border: '1px solid var(--border)', background: 'var(--surface-inp)' }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text-mid)', marginBottom: 8, lineHeight: 1.45 }}>
                        Cover Apple Podcasts shows for your feed.
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button onClick={regenerateCover} disabled={coverBusy !== ''} style={{ ...secondaryBtnStyle, opacity: coverBusy ? 0.6 : 1, cursor: coverBusy ? 'wait' : 'pointer' }}>
                          {coverBusy === 'regen' ? 'Generating…' : 'Regenerate'}
                        </button>
                        <label style={{ ...secondaryBtnStyle, opacity: coverBusy ? 0.6 : 1, cursor: coverBusy ? 'wait' : 'pointer', display: 'inline-block' }}>
                          {coverBusy === 'upload' ? 'Uploading…' : 'Upload custom'}
                          <input type="file" accept="image/png,image/jpeg" onChange={uploadCover} disabled={coverBusy !== ''} style={{ display: 'none' }} />
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text-mid)', marginTop: 0, lineHeight: 1.55 }}>
                Add this URL to Apple Podcasts to get every podcast you generate auto-downloaded to your iPhone. Works in CarPlay, AirPods, HomePod.
              </p>
              <input readOnly value={feed?.feed_url || 'Loading…'}
                onFocus={e => e.target.select()}
                style={{ width: '100%', padding: '8px 10px', fontFamily: 'ui-monospace, SF Mono, Menlo', fontSize: 12, color: 'var(--text)', background: 'var(--surface-inp)', border: '1px solid var(--border)', borderRadius: 4 }} />
              <button onClick={copyUrl} style={{ ...secondaryBtnStyle, marginTop: 8 }}>Copy URL</button>

              <div style={{ marginTop: 14, fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text)' }}>
                <strong>How to add it (3 steps):</strong>
                <ol style={{ marginTop: 4, paddingLeft: 20, color: 'var(--text-mid)' }}>
                  <li>Open Apple Podcasts on your iPhone</li>
                  <li>Library → "..." → Follow a Show by URL</li>
                  <li>Paste the URL above and tap Follow</li>
                </ol>
              </div>

              <hr style={{ margin: '16px 0', border: 'none', borderTop: '1px solid var(--border-light)' }} />
              <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text-mid)' }}>
                {feed?.rotated_at ? `Last rotated: ${formatRelative(feed.rotated_at)}` : 'Never rotated.'}
              </div>
              <button onClick={rotateFeed} style={{ ...secondaryBtnStyle, marginTop: 6, color: 'var(--error)' }}>Reset URL</button>
            </div>
          )}
        </div>

        {/* Theme Music card — separate expandable section */}
        <div style={{ marginTop: 12, border: '1px solid var(--border)', background: 'var(--card)', borderRadius: 6 }}>
          <button
            onClick={() => { setThemeExpanded(v => { const next = !v; if (next) loadThemeMusic(); return next; }); }}
            style={{ width: '100%', padding: '14px 16px', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', ...eyebrowStyle }}
          >
            <span>✦ THEME MUSIC</span>
            <span style={{ color: 'var(--text-mid)', fontSize: 14 }}>{themeExpanded ? '▴' : '▾'}</span>
          </button>
          {themeExpanded && (
            <div style={{ padding: 16, borderTop: '1px solid var(--border-light)' }}>
              <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text-mid)', marginTop: 0, lineHeight: 1.55 }}>
                Plays at the start and end of every podcast you generate. Same music every episode — your show's signature.
              </p>

              {themeMusic?.has_music ? (
                <>
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-mid)', marginBottom: 4 }}>INTRO</div>
                    <audio controls preload="none" src={`${themeMusic.intro_url}?v=${themeMusic.generated_at || 0}`} style={{ width: '100%' }} />
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-mid)', marginBottom: 4 }}>OUTRO</div>
                    <audio controls preload="none" src={`${themeMusic.outro_url}?v=${themeMusic.generated_at || 0}`} style={{ width: '100%' }} />
                  </div>
                </>
              ) : (
                <div style={{ marginTop: 12, padding: 12, background: 'var(--surface-inp)', borderRadius: 4, fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text-mid)' }}>
                  No theme music yet. Generate your first podcast to create one automatically, or regenerate below.
                </div>
              )}

              <div style={{ marginTop: 14 }}>
                <div style={{ fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-mid)', marginBottom: 4 }}>PROMPT (optional)</div>
                <textarea
                  value={themePrompt}
                  onChange={e => setThemePrompt(e.target.value)}
                  placeholder="Describe your ideal theme music, or leave blank to use the default."
                  style={{ width: '100%', minHeight: 84, padding: 10, fontFamily: 'DM Sans', fontSize: 13, lineHeight: 1.5, color: 'var(--text)', background: 'var(--surface-inp)', border: '1px solid var(--border)', borderRadius: 4, resize: 'vertical' }}
                />
              </div>

              <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={regenerateTheme} disabled={themeBusy !== ''} style={{ ...secondaryBtnStyle, background: 'var(--amber)', color: 'var(--card)', border: '1px solid var(--amber)', opacity: themeBusy ? 0.6 : 1, cursor: themeBusy ? 'wait' : 'pointer' }}>
                  {themeBusy === 'regen' ? 'Generating… (~15s)' : 'Regenerate (~$0.04)'}
                </button>
                <label style={{ ...secondaryBtnStyle, opacity: themeBusy ? 0.6 : 1, cursor: themeBusy ? 'wait' : 'pointer', display: 'inline-block' }}>
                  {themeBusy === 'upload' ? 'Uploading…' : 'Upload custom'}
                  <input type="file" accept="audio/mpeg,audio/wav" onChange={uploadTheme} disabled={themeBusy !== ''} style={{ display: 'none' }} />
                </label>
              </div>

              {themeMusic?.generated_at && (
                <div style={{ marginTop: 10, fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text-mid)' }}>
                  Last updated: {formatRelative(themeMusic.generated_at)} · {themeMusic.is_custom ? 'Custom upload' : 'AI generated'}
                </div>
              )}
            </div>
          )}
        </div>

        {toast && (
          <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', padding: '10px 16px', background: 'var(--leather-dark)', color: 'var(--card)', fontFamily: 'DM Sans', fontSize: 13, fontWeight: 500, borderRadius: 6, boxShadow: '0 4px 14px rgba(0,0,0,0.18)', zIndex: 500 }}>
            {toast}
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={!!confirmModal}
        title={confirmModal?.title}
        message={confirmModal?.message}
        confirmLabel={confirmModal?.confirmLabel}
        variant={confirmModal?.variant}
        onConfirm={() => { const m = confirmModal; setConfirmModal(null); m?.onConfirm?.(); }}
        onCancel={() => setConfirmModal(null)}
      />
    </div>
  );
}

function pillStyle(active) {
  return {
    padding: '8px 14px', borderRadius: 999,
    border: active ? '2px solid var(--amber)' : '1px solid var(--border)',
    background: active ? 'var(--amber-light)' : 'var(--card)',
    color: 'var(--text)', fontFamily: 'DM Sans', fontWeight: 500, fontSize: 13,
    cursor: 'pointer',
  };
}

const secondaryBtnStyle = {
  padding: '8px 12px', background: 'var(--card)', color: 'var(--text)', border: '1px solid var(--border)',
  fontFamily: 'DM Sans', fontWeight: 500, fontSize: 13, cursor: 'pointer', borderRadius: 4,
};

function StepList({ status }) {
  const steps = [
    { key: 'researching', label: 'Researching the topic…' },
    { key: 'casting', label: 'Casting hosts' },
    { key: 'scripting', label: 'Writing the script' },
    { key: 'generating_audio', label: 'Generating audio' },
  ];
  const order = ['researching', 'casting', 'scripting', 'generating_audio', 'audio_ready'];
  const currentIdx = order.indexOf(status);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {steps.map((s, i) => {
        const isDone = currentIdx > i;
        const isActive = currentIdx === i;
        const dotColor = isDone ? 'var(--success)' : isActive ? 'var(--amber)' : 'var(--text-light)';
        const labelColor = isActive ? 'var(--text)' : isDone ? 'var(--text-mid)' : 'var(--text-light)';
        return (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span aria-hidden style={{ width: 12, height: 12, borderRadius: '50%', background: isDone ? dotColor : 'transparent', border: `2px solid ${dotColor}`, display: 'inline-block', flexShrink: 0 }} />
            <span style={{ fontFamily: 'DM Sans', fontSize: 14, color: labelColor }}>{s.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function formatDuration(s) {
  if (!s) return '—';
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(Math.floor(r)).padStart(2, '0')}`;
}

function formatRelative(unix) {
  if (!unix) return '';
  const diff = Math.floor(Date.now() / 1000) - unix;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(unix * 1000).toLocaleDateString();
}
