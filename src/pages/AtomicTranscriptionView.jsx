// Atomic Transcription View — /atomic/transcription/:id
// Three-column display: video + chapters + speakers | transcript | activation.
//
// The activation panel wires all 10 "Turn this into" targets + the 3
// "Pull from this" utilities + 2 advanced actions. Clicking a target
// calls POST /api/transcripts/:id/derive and navigates to the returned
// redirect_url with source_transcript + source_derivation query params.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PageShell from '../components/PageShell.jsx';

async function apiJson(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `API ${res.status}`);
  return data;
}

// Atomic Politics gating — regex over transcript text. Matches federal,
// state, and local legislative/political terms. Upgrade path: promote to
// a Claude classification call if false-positive rate gets noisy.
const POLITICS_REGEX = /\b(bill|senate|congress|legislation|vote|hearing|representative|legislator|policy|governor|amendment|committee|testimony|constitutional)\b/i;
// Press Release gating — announcement heuristic. Same upgrade path.
const ANNOUNCEMENT_REGEX = /\b(announcing|announce[ds]?|today|launch(es|ing)?|new|introducing|debut)\b/i;

const TURN_INTO = [
  { key: 'article',        label: 'Article',        desc: 'Long-form from transcript' },
  { key: 'quark-cast',     label: 'Quark Cast',     desc: '1-min podcast riff' },
  { key: 'email',          label: 'Email',          desc: 'Newsletter about this' },
  { key: 'powerpoint',     label: 'PowerPoint',     desc: 'Deck from chapter list' },
  { key: 'brief',          label: 'Brief',          desc: 'Save as research brief' },
  { key: 'press-release',  label: 'Press Release',  desc: 'Announcement from content', conditional: (txt) => ANNOUNCEMENT_REGEX.test(txt) },
  { key: 'atomic-flash',   label: 'Atomic Flash',   desc: 'Header image' },
  { key: 'quote-graphic',  label: 'Quote graphic',  desc: 'Design a pulled quote' },
  { key: 'infographic',    label: 'Infographic',    desc: 'Data infographic from this' },
  { key: 'atomic-politics',label: 'Atomic Politics',desc: "Add to today's brief", conditional: (txt) => POLITICS_REGEX.test(txt) },
];

const PULL_FROM = [
  { key: 'extract-quotes', label: 'Extract quotes',  desc: 'Top 5 quotable moments' },
  { key: 'key-takeaways',  label: 'Key takeaways',   desc: '3–5 bullet summary' },
  { key: 'translate',      label: 'Translate',       desc: '50+ languages' },
];

const ADVANCED = [
  { key: 'ask-reactor',    label: 'Ask the Reactor',    desc: 'Load transcript as conversation context' },
  { key: 'prompt-builder', label: 'Send to Prompt Builder', desc: 'Use as prompt template material' },
];

export default function AtomicTranscriptionView({ navigate, page }) {
  const transcriptId = (() => {
    const m = String(page || '').match(/^\/atomic\/transcription\/([^/?#]+)/);
    return m ? m[1] : null;
  })();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [inlineResult, setInlineResult] = useState(null); // { type, payload }
  const [busyKey, setBusyKey] = useState('');
  const videoRef = useRef(null);
  const transcriptRef = useRef(null);

  const load = useCallback(async () => {
    if (!transcriptId) return;
    setLoading(true); setError('');
    try {
      const d = await apiJson(`/api/transcripts/${encodeURIComponent(transcriptId)}`);
      setData(d);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, [transcriptId]);
  useEffect(() => { load(); }, [load]);

  const transcript = data?.transcript;
  const turns = transcript?.transcript_json || [];
  const chapters = transcript?.chapters || [];
  const speakers = data?.speakers || [];

  const transcriptText = transcript?.transcript_text || '';
  const filteredTurns = useMemo(() => {
    if (!search.trim()) return turns;
    const s = search.toLowerCase();
    return turns.filter(t => (t.text || '').toLowerCase().includes(s));
  }, [turns, search]);

  const turnInto = TURN_INTO.filter(a => !a.conditional || a.conditional(transcriptText));

  const jumpToTime = (seconds) => {
    if (videoRef.current && typeof videoRef.current.currentTime === 'number') {
      videoRef.current.currentTime = seconds;
      try { videoRef.current.play?.(); } catch {}
    }
  };

  const derive = async (key, options = {}) => {
    setBusyKey(key);
    try {
      const d = await apiJson(`/api/transcripts/${encodeURIComponent(transcriptId)}/derive`, {
        method: 'POST',
        body: JSON.stringify({ asset_type: key, options }),
      });
      if (d.inline) {
        setInlineResult({ type: key, payload: d });
      } else if (d.redirect_url) {
        navigate?.(d.redirect_url);
      }
    } catch (e) {
      setError(e.message);
    }
    setBusyKey('');
  };

  if (!transcriptId) return <PageShell eyebrow="// ATOMIC TRANSCRIPTION" title="Not found" />;
  if (loading) return <PageShell eyebrow="// ATOMIC TRANSCRIPTION" title="Loading…" />;
  if (error) return <PageShell eyebrow="// ATOMIC TRANSCRIPTION" title="Error"><div className="t-body" style={{ color: 'var(--danger)' }}>{error}</div></PageShell>;
  if (!transcript) return <PageShell eyebrow="// ATOMIC TRANSCRIPTION" title="Not found" />;

  // In-flight render — if the transcript is still processing, redirect to
  // the landing where the processing console lives.
  if (transcript.status !== 'ready') {
    return (
      <PageShell eyebrow="// ATOMIC TRANSCRIPTION" title="Still processing" subtitle="We'll redirect you when it's ready.">
        <button className="v2-btn" type="button" onClick={() => navigate?.('/atomic/transcription')}>Back to transcripts</button>
      </PageShell>
    );
  }

  return (
    <PageShell
      eyebrow="// TRANSCRIPTS"
      title={transcript.video_title || 'Untitled video'}
      subtitle={`${Math.round((transcript.video_duration_seconds || 0) / 60)} min · ${(transcript.transcription_provider || 'assemblyai').toUpperCase()} · ${speakers.length} speaker${speakers.length === 1 ? '' : 's'}`}
      actions={
        <>
          <DownloadMenu id={transcriptId} />
          <button type="button" className="v2-btn v2-btn--sm" onClick={() => navigate?.('/atomic/transcription')}>← All transcripts</button>
        </>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr 280px', gap: 20, width: '100%', minHeight: 0 }} className="ds-v2-transcript-grid">
        <style>{`
          @media (max-width: 1023px) {
            .ds-v2-transcript-grid { grid-template-columns: 1fr !important; }
          }
        `}</style>

        {/* LEFT COLUMN */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <VideoPlayer transcript={transcript} videoRef={videoRef} />
          <div className="v2-card" style={{ padding: 12, maxHeight: 260, overflowY: 'auto' }}>
            <div className="t-mono-label" style={{ marginBottom: 8 }}>// AI CHAPTERS</div>
            {chapters.length === 0 ? (
              <div className="t-mono-meta">No chapters generated.</div>
            ) : chapters.map((c, i) => (
              <button
                key={i}
                type="button"
                onClick={() => jumpToTime(c.start_seconds || 0)}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px', border: 'none', background: 'transparent', borderRadius: 4, cursor: 'pointer' }}
              >
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--amber)' }}>{fmtTime(c.start_seconds || 0)}</div>
                <div className="t-body-sm clip-2" style={{ fontWeight: 500, marginTop: 1 }}>{c.title}</div>
              </button>
            ))}
          </div>
          <div className="v2-card" style={{ padding: 12 }}>
            <div className="t-mono-label" style={{ marginBottom: 8 }}>// SPEAKERS</div>
            {speakers.length === 0 ? (
              <div className="t-mono-meta">—</div>
            ) : speakers.map((s, i) => <SpeakerRow key={s.id} speaker={s} colorIdx={i} transcriptId={transcriptId} onRenamed={load} />)}
          </div>
        </div>

        {/* CENTER — transcript */}
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
            <input
              className="v2-input"
              style={{ flex: 1, fontSize: 13 }}
              placeholder="Search transcript… (Cmd/Ctrl+F)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div ref={transcriptRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: 10, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {filteredTurns.length === 0 ? (
              <div className="t-body" style={{ color: 'var(--ink-light)' }}>No results.</div>
            ) : filteredTurns.map((turn, i) => <TranscriptTurn key={i} turn={turn} speakers={speakers} onWordClick={jumpToTime} />)}
          </div>
        </div>

        {/* RIGHT — activation panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          <ActivationSection label="// TURN THIS INTO" items={turnInto} busyKey={busyKey} onClick={(key) => derive(key)} />
          <ActivationSection label="// PULL FROM THIS" items={PULL_FROM} busyKey={busyKey} onClick={(key) => derive(key)} />
          <ActivationSection label="// ADVANCED" items={ADVANCED} busyKey={busyKey} onClick={(key) => derive(key)} collapsible />
          {inlineResult && <InlineResult result={inlineResult} onClose={() => setInlineResult(null)} />}
        </div>
      </div>
    </PageShell>
  );
}

function VideoPlayer({ transcript, videoRef }) {
  const src = transcript.source_r2_key ? `/api/transcripts/${transcript.id}/media` : null;
  const isYouTube = transcript.source_type === 'url:youtube' && transcript.source_url;
  if (isYouTube) {
    const videoId = (() => {
      const m = String(transcript.source_url).match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
      return m ? m[1] : null;
    })();
    if (videoId) {
      return (
        <div style={{ position: 'relative', paddingBottom: '56.25%', background: '#000', borderRadius: 6, overflow: 'hidden' }}>
          <iframe
            src={`https://www.youtube.com/embed/${videoId}`}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      );
    }
  }
  return (
    <div style={{ position: 'relative', paddingBottom: '56.25%', background: '#000', borderRadius: 6, overflow: 'hidden' }}>
      {src && (
        <video
          ref={videoRef}
          src={src}
          controls
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        />
      )}
    </div>
  );
}

function SpeakerRow({ speaker, colorIdx, transcriptId, onRenamed }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(speaker.display_name || speaker.speaker_key);
  // v2-consistent rotating palette for distinguishing speakers. Reuses the
  // semantic token hues (amber/ink/success/danger/ink-mid) as identity
  // colors — the avatar badge has no error semantics so --danger here is
  // just "the muted rose in slot 4." Documented in tokens-v2.css.
  const colors = ['var(--amber)', 'var(--ink)', 'var(--success)', 'var(--danger)', 'var(--ink-mid)'];
  const color = colors[colorIdx % colors.length];

  const save = async () => {
    setEditing(false);
    if (!value.trim() || value.trim() === speaker.display_name) return;
    try {
      await fetch(`/api/transcripts/${encodeURIComponent(transcriptId)}/rename-speaker`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ speaker_key: speaker.speaker_key, display_name: value.trim() }),
      });
      onRenamed?.();
    } catch {}
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
      <span style={{ width: 22, height: 22, borderRadius: '50%', background: color, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-sans)', fontSize: 10, fontWeight: 600, flexShrink: 0 }}>
        {String(speaker.display_name || speaker.speaker_key).slice(0, 1).toUpperCase()}
      </span>
      {editing ? (
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
          style={{ flex: 1, background: 'transparent', border: '1px solid var(--border-strong)', borderRadius: 4, padding: '2px 6px', fontFamily: 'var(--font-sans)', fontSize: 13, minWidth: 0 }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}
        >
          <div className="t-body-sm clip-1" style={{ fontWeight: 500 }}>{speaker.display_name || speaker.speaker_key}</div>
          <div className="t-mono-meta clip-1">{Math.round(speaker.total_seconds || 0)}s</div>
        </button>
      )}
    </div>
  );
}

function TranscriptTurn({ turn, speakers, onWordClick }) {
  const speakerRow = speakers.find(s => s.speaker_key === turn.speaker_key);
  const name = speakerRow?.display_name || turn.speaker;
  const colorIdx = speakers.findIndex(s => s.speaker_key === turn.speaker_key);
  // v2-consistent rotating palette for distinguishing speakers. Reuses the
  // semantic token hues (amber/ink/success/danger/ink-mid) as identity
  // colors — the avatar badge has no error semantics so --danger here is
  // just "the muted rose in slot 4." Documented in tokens-v2.css.
  const colors = ['var(--amber)', 'var(--ink)', 'var(--success)', 'var(--danger)', 'var(--ink-mid)'];
  const color = colors[Math.max(0, colorIdx) % colors.length];

  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{
          padding: '2px 8px',
          borderRadius: 999,
          background: color,
          color: '#fff',
          fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 500,
        }}>{name}</span>
        <span className="t-mono-meta">{fmtTime(turn.start_seconds || 0)}</span>
      </div>
      <div style={{ fontFamily: 'var(--font-sans)', fontSize: 15, lineHeight: 1.7, color: 'var(--ink)' }}>
        {(turn.words && turn.words.length > 0) ? turn.words.map((w, i) => (
          <span
            key={i}
            onClick={() => onWordClick(w.start || 0)}
            style={{ cursor: 'pointer' }}
          >{w.text} </span>
        )) : turn.text}
      </div>
    </div>
  );
}

function ActivationSection({ label, items, busyKey, onClick, collapsible = false }) {
  const [open, setOpen] = useState(!collapsible);
  return (
    <div className="v2-card" style={{ padding: 12 }}>
      <button
        type="button"
        onClick={() => collapsible ? setOpen(o => !o) : null}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'transparent', border: 'none', padding: 0, cursor: collapsible ? 'pointer' : 'default' }}
      >
        <span className="t-mono-label">{label}</span>
        {collapsible && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-light)' }}>{open ? '▾' : '▸'}</span>}
      </button>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 10 }}>
          {items.map(item => (
            <button
              key={item.key}
              type="button"
              onClick={() => onClick(item.key)}
              disabled={busyKey === item.key}
              style={{
                display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
                gap: 8, padding: '8px 10px', border: 'none', borderRadius: 4,
                background: 'transparent', cursor: busyKey === item.key ? 'wait' : 'pointer',
                textAlign: 'left', width: '100%', minWidth: 0,
                opacity: busyKey === item.key ? 0.6 : 1,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="t-body-sm clip-1" style={{ fontWeight: 500 }}>{item.label}</div>
                <div className="t-mono-meta clip-1">{item.desc}</div>
              </div>
              <span style={{ color: 'var(--ink-light)' }}>→</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DownloadMenu({ id }) {
  const [open, setOpen] = useState(false);
  const formats = ['txt', 'srt', 'vtt', 'docx', 'json'];
  return (
    <div style={{ position: 'relative' }}>
      <button type="button" className="v2-btn v2-btn--sm" onClick={() => setOpen(o => !o)}>Download ▾</button>
      {open && (
        <div className="ds-v2-model-menu" style={{ top: 'calc(100% + 6px)', right: 0, minWidth: 160 }} onMouseLeave={() => setOpen(false)}>
          {formats.map(f => (
            <a
              key={f}
              className="ds-v2-model-menu__item"
              href={`/api/transcripts/${encodeURIComponent(id)}/download/${f}`}
              onClick={() => setOpen(false)}
              style={{ textDecoration: 'none' }}
            >
              .{f}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function InlineResult({ result, onClose }) {
  const { type, payload } = result;
  return (
    <div className="v2-card" style={{ padding: 12, background: 'var(--amber-soft)', borderColor: 'var(--amber)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span className="t-mono-label" style={{ color: 'var(--amber-dark)' }}>// {type.replace('-', ' ').toUpperCase()}</span>
        <button type="button" onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--ink-mid)' }}>×</button>
      </div>
      {type === 'extract-quotes' && (payload.quotes || []).map((q, i) => (
        <div key={i} style={{ padding: '8px 10px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, marginBottom: 6 }}>
          <div className="t-body-sm" style={{ fontStyle: 'italic' }}>"{q.quote}"</div>
          <div className="t-mono-meta" style={{ marginTop: 4 }}>{q.speaker} · {fmtTime(q.timestamp_seconds || 0)}</div>
        </div>
      ))}
      {type === 'key-takeaways' && (
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {(payload.takeaways || []).map((t, i) => <li key={i} className="t-body-sm" style={{ marginBottom: 4 }}>{t}</li>)}
        </ul>
      )}
      {type === 'translate' && (
        <div style={{ padding: '8px 10px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, maxHeight: 240, overflowY: 'auto' }}>
          <div className="t-mono-meta" style={{ marginBottom: 6 }}>{payload.target_language}</div>
          <div className="t-body-sm" style={{ whiteSpace: 'pre-wrap' }}>{payload.translated_text}</div>
        </div>
      )}
    </div>
  );
}

function fmtTime(seconds) {
  const s = Math.floor(seconds || 0);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}
