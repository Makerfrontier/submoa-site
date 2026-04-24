// Atomic Transcription — /atomic/transcription landing + in-flight view.
//
// Stages:
//   1. INPUT   — URL paste or file upload, options row, recent transcripts grid
//   2. PROCESSING — 5-step progress console streamed via SSE from the consumer
//   3. DISPLAY — lives on /atomic/transcription/:id (AtomicTranscriptionView)
//
// Gated by the ATOMIC_TRANSCRIPTION_ENABLED env var on the server. The /start
// endpoint returns 503 when disabled; the UI shows a Coming Soon state.

import { useCallback, useEffect, useRef, useState } from 'react';
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

function detectPlatform(url) {
  const u = String(url || '').toLowerCase();
  if (/youtube\.com|youtu\.be/.test(u)) return 'YOUTUBE';
  if (/vimeo\.com/.test(u)) return 'VIMEO';
  if (/tiktok\.com/.test(u)) return 'TIKTOK';
  if (/x\.com|twitter\.com/.test(u)) return 'X';
  if (/loom\.com/.test(u)) return 'LOOM';
  return null;
}

const STEPS = [
  { id: 'FETCH',       label: 'FETCH',      desc: 'Pulling video from source' },
  { id: 'EXTRACT',     label: 'EXTRACT',    desc: 'Extracting audio · 16kbps mono' },
  { id: 'TRANSCRIBE',  label: 'TRANSCRIBE', desc: 'Running through AssemblyAI' },
  { id: 'DIARIZE',     label: 'DIARIZE',    desc: 'Identifying speakers' },
  { id: 'INDEX',       label: 'INDEX',      desc: 'Building chapters and index' },
];

export default function AtomicTranscription({ navigate }) {
  const [mode, setMode] = useState('url'); // 'url' | 'upload'
  const [url, setUrl] = useState('');
  const [file, setFile] = useState(null);
  const [tier, setTier] = useState('best');
  const [speakers, setSpeakers] = useState('auto');
  const [timestamps, setTimestamps] = useState('word');
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [jobId, setJobId] = useState(null);        // active processing transcript_id
  const [jobState, setJobState] = useState(null);  // latest SSE status event
  const [submitting, setSubmitting] = useState(false);
  const [disabled, setDisabled] = useState(false); // env-gate fallback

  const loadRecent = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiJson('/api/transcripts?limit=12');
      setRecent(d.transcripts || []);
    } catch (e) {
      // 401 etc — not fatal for the page shell.
      console.warn('[transcripts] recent load failed', e.message);
    }
    setLoading(false);
  }, []);
  useEffect(() => { loadRecent(); }, [loadRecent]);

  // SSE stream — reacts to jobId changes.
  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    const es = new EventSource(`/api/transcripts/${encodeURIComponent(jobId)}/stream`, { withCredentials: true });
    es.addEventListener('status', (evt) => {
      if (cancelled) return;
      try { setJobState(JSON.parse(evt.data)); } catch {}
    });
    es.addEventListener('complete', (evt) => {
      if (cancelled) return;
      try {
        const data = JSON.parse(evt.data);
        if (data.status === 'ready') {
          navigate?.(`/atomic/transcription/${jobId}`);
        } else if (data.status === 'failed') {
          setError(data.error_message || 'Transcription failed');
          setJobId(null);
          setSubmitting(false);
        }
      } catch {}
      es.close();
    });
    es.onerror = () => { /* server closed — normal at end of stream */ };
    return () => { cancelled = true; es.close(); };
  }, [jobId, navigate]);

  const submitUrl = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setSubmitting(true); setError('');
    try {
      const d = await apiJson('/api/transcripts/start', {
        method: 'POST',
        body: JSON.stringify({ source_type: 'url', url: trimmed, options: { tier, speakers, timestamps } }),
      });
      setJobId(d.transcript_id);
      setJobState({ status: 'queued', current_step: 'FETCH', progress_percent: 0 });
    } catch (e) {
      setError(e.message);
      if (/503/i.test(e.message) || /not yet enabled/i.test(e.message)) setDisabled(true);
      setSubmitting(false);
    }
  };

  const submitUpload = async () => {
    if (!file) return;
    setSubmitting(true); setError('');
    try {
      const urlRes = await apiJson('/api/transcripts/upload-url', {
        method: 'POST',
        body: JSON.stringify({
          filename: file.name,
          content_type: file.type || 'application/octet-stream',
          size_bytes: file.size,
        }),
      });
      // Upload the bytes into the reserved R2 key via the dedicated chunk endpoint.
      const putRes = await fetch(urlRes.upload_url, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      });
      if (!putRes.ok) throw new Error(`Upload failed (${putRes.status})`);
      // Now flip it to queued.
      const d = await apiJson('/api/transcripts/start', {
        method: 'POST',
        body: JSON.stringify({ transcript_id: urlRes.transcript_id, options: { tier, speakers, timestamps } }),
      });
      setJobId(d.transcript_id);
      setJobState({ status: 'queued', current_step: 'FETCH', progress_percent: 0 });
    } catch (e) {
      setError(e.message);
      if (/503/i.test(e.message) || /not yet enabled/i.test(e.message)) setDisabled(true);
      setSubmitting(false);
    }
  };

  const cancel = () => {
    setJobId(null);
    setJobState(null);
    setSubmitting(false);
  };

  if (disabled) {
    return (
      <PageShell eyebrow="// ATOMIC TRANSCRIPTION" title="Coming soon" subtitle="Turn any video into a transcript — this feature is being provisioned. Check back shortly.">
        <div className="v2-card" style={{ maxWidth: 480, padding: 20 }}>
          <div className="t-body" style={{ color: 'var(--ink-mid)' }}>
            We're finishing the audio pipeline deploy. Once it's live you'll be able to paste a URL or upload a file here and get a transcript back with speakers and chapters.
          </div>
        </div>
      </PageShell>
    );
  }

  if (jobId) {
    return (
      <PageShell
        eyebrow="// ATOMIC TRANSCRIPTION"
        title="Processing"
        subtitle="You can close this tab — we'll keep the job running."
        actions={<button type="button" className="v2-btn v2-btn--danger v2-btn--sm" onClick={cancel}>Cancel</button>}
      >
        <ProcessingConsole state={jobState} />
      </PageShell>
    );
  }

  const platform = detectPlatform(url);

  return (
    <PageShell
      eyebrow="// ATOMIC TRANSCRIPTION"
      title="Turn any video into a transcript"
      subtitle="Paste a URL or upload a file. We'll pull the audio, transcribe it with speakers, and route the result into any feature on the platform."
    >
      <div style={{ maxWidth: 980, width: '100%' }}>
        {error && <div style={{ background: 'rgba(184,68,68,0.10)', border: '1px solid rgba(184,68,68,0.20)', color: 'var(--danger)', padding: '10px 14px', borderRadius: 6, marginBottom: 14, fontSize: 13 }}>{error}</div>}

        {/* Mode selector — two equal cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginBottom: 20 }}>
          <ModeCard
            active={mode === 'url'}
            onClick={() => setMode('url')}
            title="Paste a URL"
            subtitle="YOUTUBE · VIMEO · TIKTOK · X · LOOM"
            icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M7 11l4-4M5 7l-2 2a2.8 2.8 0 104 4l1-1M13 11l2-2a2.8 2.8 0 10-4-4l-1 1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>}
          />
          <ModeCard
            active={mode === 'upload'}
            onClick={() => setMode('upload')}
            title="Upload a file"
            subtitle="MP4 · MOV · WAV · MP3 · M4A · UP TO 2GB"
            icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 12V4M5 8l4-4 4 4M3 14h12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>}
          />
        </div>

        {/* Console */}
        <div className="v2-card" style={{ padding: 18, marginBottom: 16 }}>
          {mode === 'url' ? (
            <div>
              <input
                className="v2-input"
                placeholder="Paste a YouTube, Vimeo, TikTok, X, or Loom URL…"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') submitUrl(); }}
                style={{ fontSize: 15 }}
              />
              {platform && (
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 999, fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em', color: 'var(--success)', border: '1px solid var(--success)' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)' }} />{platform}
                  </span>
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, flexWrap: 'wrap', gap: 8 }}>
                <div className="t-mono-meta">Provider · AssemblyAI · tier {tier}</div>
                <button type="button" className="v2-btn v2-btn--primary" onClick={submitUrl} disabled={!url.trim() || submitting}>
                  {submitting ? 'Starting…' : 'Transcribe →'}
                </button>
              </div>
            </div>
          ) : (
            <UploadDropzone file={file} setFile={setFile} onSubmit={submitUpload} submitting={submitting} tier={tier} />
          )}
        </div>

        {/* Options row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
          <OptionCard label="SPEAKERS" options={[['auto', 'Auto'], ['1', '1'], ['2', '2+']]} value={speakers} onChange={setSpeakers} />
          <OptionCard label="ACCURACY" options={[['fast', 'Fast'], ['best', 'Best']]} value={tier} onChange={setTier} />
          <OptionCard label="TIMESTAMPS" options={[['off', 'Off'], ['para', 'Para'], ['word', 'Word']]} value={timestamps} onChange={setTimestamps} />
        </div>

        {/* Recent transcripts */}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
          <div className="t-mono-label">// RECENT TRANSCRIPTS</div>
          {recent.length > 0 && <button type="button" onClick={() => navigate?.('/atomic/transcription')} style={{ background: 'transparent', border: 'none', padding: 0, color: 'var(--ink-mid)', fontFamily: 'var(--font-sans)', fontSize: 12, cursor: 'pointer' }}>view all →</button>}
        </div>
        {loading ? (
          <div className="t-body-sm" style={{ color: 'var(--ink-light)' }}>Loading…</div>
        ) : recent.length === 0 ? (
          <div className="t-body-sm" style={{ color: 'var(--ink-light)' }}>No transcripts yet. Paste a URL above to start one.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
            {recent.map(r => <RecentCard key={r.id} row={r} onClick={() => navigate?.(`/atomic/transcription/${r.id}`)} />)}
          </div>
        )}
      </div>
    </PageShell>
  );
}

function ModeCard({ active, onClick, title, subtitle, icon }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: 'left',
        padding: 16,
        borderRadius: 6,
        background: active ? 'var(--amber-soft)' : 'var(--surface)',
        border: `1px solid ${active ? 'var(--amber)' : 'var(--border)'}`,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        minWidth: 0,
      }}
    >
      <div style={{ color: active ? 'var(--amber-dark)' : 'var(--ink-mid)', flexShrink: 0 }}>{icon}</div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="t-body" style={{ fontWeight: 500 }}>{title}</div>
        <div className="t-mono-meta clip-1" style={{ marginTop: 2 }}>{subtitle}</div>
      </div>
    </button>
  );
}

function UploadDropzone({ file, setFile, onSubmit, submitting, tier }) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef(null);
  return (
    <div>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault(); setDrag(false);
          const f = e.dataTransfer.files?.[0]; if (f) setFile(f);
        }}
        style={{
          border: `2px dashed ${drag ? 'var(--amber)' : 'var(--border-strong)'}`,
          borderRadius: 6,
          padding: 32,
          textAlign: 'center',
          cursor: 'pointer',
          background: drag ? 'var(--amber-soft)' : 'var(--surface-alt)',
          transition: 'border-color 0.15s, background 0.15s',
          minHeight: 160,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {file ? (
          <div>
            <div className="t-body" style={{ fontWeight: 500 }}>{file.name}</div>
            <div className="t-mono-meta" style={{ marginTop: 4 }}>{(file.size / 1024 / 1024).toFixed(1)} MB</div>
          </div>
        ) : (
          <div>
            <div className="t-body">Drop a file here or click to browse</div>
            <div className="t-mono-meta" style={{ marginTop: 4 }}>MP4 · MOV · WAV · MP3 · M4A</div>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="video/*,audio/*"
          style={{ display: 'none' }}
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, flexWrap: 'wrap', gap: 8 }}>
        <div className="t-mono-meta">Provider · AssemblyAI · tier {tier}</div>
        <button type="button" className="v2-btn v2-btn--primary" onClick={onSubmit} disabled={!file || submitting}>
          {submitting ? 'Uploading…' : 'Transcribe →'}
        </button>
      </div>
    </div>
  );
}

function OptionCard({ label, options, value, onChange }) {
  return (
    <div className="v2-card" style={{ padding: 12 }}>
      <div className="t-mono-label" style={{ marginBottom: 8 }}>{label}</div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {options.map(([v, labelText]) => {
          const active = value === v;
          return (
            <button
              key={v}
              type="button"
              onClick={() => onChange(v)}
              style={{
                padding: '4px 10px',
                borderRadius: 4,
                border: `1px solid ${active ? 'var(--ink)' : 'var(--border-strong)'}`,
                background: active ? 'var(--ink)' : 'transparent',
                color: active ? '#fff' : 'var(--ink-mid)',
                fontFamily: 'var(--font-mono)', fontSize: 10,
                letterSpacing: '0.08em',
                cursor: 'pointer',
                minWidth: 40,
              }}
            >{labelText}</button>
          );
        })}
      </div>
    </div>
  );
}

function RecentCard({ row, onClick }) {
  const dur = row.video_duration_seconds ? `${Math.round(row.video_duration_seconds / 60)}m` : '—';
  const tag = row.source_type?.startsWith('url:') ? row.source_type.slice(4).toUpperCase() : 'UPLOAD';
  return (
    <button
      type="button"
      onClick={onClick}
      className="v2-card v2-card--h132"
      style={{ textAlign: 'left', cursor: 'pointer' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <span className="t-mono-tiny" style={{ color: 'var(--amber)' }}>{tag}</span>
        <span className="t-mono-tiny">{dur}</span>
      </div>
      <div className="clip-2 t-body" style={{ fontWeight: 500, flex: 1 }}>{row.video_title || '(processing…)'}</div>
      <div className="t-mono-meta clip-1" style={{ marginTop: 8 }}>
        {row.speaker_count ? `${row.speaker_count} speaker${row.speaker_count === 1 ? '' : 's'}` : '—'} · {row.status}
      </div>
    </button>
  );
}

function ProcessingConsole({ state }) {
  const currentIdx = STEPS.findIndex(s => s.id === state?.current_step);
  const progress = Math.min(100, Math.max(0, state?.progress_percent || 0));

  return (
    <div style={{ maxWidth: 720, width: '100%' }}>
      <div className="v2-card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <div className="t-mono-label clip-1">{state?.video_title || 'Transcribing…'}</div>
            <div className="t-mono-meta clip-1">{state?.detected_language ? state.detected_language.toUpperCase() : '—'} · ASSEMBLYAI</div>
          </div>
          <div style={{ padding: '4px 10px', borderRadius: 999, background: 'var(--amber-soft)', color: 'var(--amber-dark)', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em' }}>{progress}%</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {STEPS.map((step, i) => {
            const done = i < currentIdx;
            const active = i === currentIdx;
            return (
              <div key={step.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <StepIcon done={done} active={active} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', color: done ? 'var(--success)' : active ? 'var(--amber)' : 'var(--ink-light)' }}>
                    {step.label}
                  </div>
                  <div className="t-body-sm clip-1" style={{ color: 'var(--ink-mid)' }}>{step.desc}</div>
                  {active && (
                    <div style={{ marginTop: 6, height: 3, borderRadius: 2, background: 'var(--surface-alt)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${progress}%`, background: 'var(--amber)', transition: 'width 400ms ease' }} />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {state?.preview && (
          <div style={{ marginTop: 22, padding: '10px 14px', background: 'var(--surface-alt)', borderLeft: '3px solid var(--amber)', borderRadius: 4, maxHeight: 180, overflow: 'auto' }}>
            <div className="t-body-sm" style={{ whiteSpace: 'pre-wrap', color: 'var(--ink-mid)' }}>{state.preview}<span style={{ color: 'var(--amber)' }}>▌</span></div>
          </div>
        )}
      </div>
    </div>
  );
}

function StepIcon({ done, active }) {
  if (done) {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" style={{ flexShrink: 0, marginTop: 2 }}>
        <circle cx="8" cy="8" r="7" fill="var(--success)" />
        <path d="M5 8.5l2 2 4-4.5" stroke="#fff" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (active) {
    return (
      <span style={{ width: 16, height: 16, marginTop: 2, borderRadius: '50%', background: 'var(--amber)', flexShrink: 0, animation: 'pulse 1.2s ease-in-out infinite' }}>
        <style>{`@keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }`}</style>
      </span>
    );
  }
  return (
    <span style={{ width: 16, height: 16, marginTop: 2, borderRadius: '50%', border: '1px solid var(--border-strong)', background: 'var(--surface)', flexShrink: 0 }} />
  );
}
