// SourceBanner — rendered at the top of any destination feature when the
// user arrived via an Atomic Transcription handoff. Hooks both query params
// (?source_transcript=... &source_derivation=...) and exposes the hydrated
// summary via the `useTranscriptSource` hook so destination pages can
// pre-fill form fields without writing the query-param plumbing themselves.

import { useEffect, useState } from 'react';

export function useTranscriptSource() {
  const [state, setState] = useState({ loading: false, source: null, error: null });

  useEffect(() => {
    const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
    const transcriptId = params.get('source_transcript');
    const derivationId = params.get('source_derivation');
    if (!transcriptId) { setState({ loading: false, source: null, error: null }); return; }
    let cancelled = false;
    setState({ loading: true, source: null, error: null });
    fetch(`/api/transcripts/${encodeURIComponent(transcriptId)}/summary`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(summary => {
        if (cancelled) return;
        setState({
          loading: false,
          source: { transcriptId, derivationId, ...summary },
          error: null,
        });
      })
      .catch(err => { if (!cancelled) setState({ loading: false, source: null, error: err.message }); });
    return () => { cancelled = true; };
  }, []);

  return state;
}

export default function SourceBanner({ source, navigate }) {
  if (!source) return null;
  const title = source.video_title || 'Untitled video';
  const dur = source.video_duration_seconds ? `${Math.round(source.video_duration_seconds / 60)} min` : '';
  const words = source.word_count ? `${source.word_count.toLocaleString()} words` : '';
  const meta = [dur, words].filter(Boolean).join(' · ');
  return (
    <div style={{
      background: 'var(--amber-soft)',
      border: '1px solid var(--amber)',
      borderRadius: 6,
      padding: '12px 16px',
      marginBottom: 16,
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      minWidth: 0,
    }}>
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true" style={{ color: 'var(--amber-dark)', flexShrink: 0 }}>
        <rect x="1.5" y="4" width="11" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
        <path d="M13 8l3.5-2v6L13 10z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      </svg>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 10,
          letterSpacing: '0.12em', textTransform: 'uppercase',
          color: 'var(--amber-dark)', fontWeight: 500,
        }}>// SOURCED FROM VIDEO TRANSCRIPT</div>
        <div style={{
          fontFamily: 'var(--font-sans)', fontSize: 14, fontWeight: 500,
          color: 'var(--ink)', marginTop: 2,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{title}</div>
        {meta && (
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 10,
            color: 'var(--ink-light)', marginTop: 2,
          }}>{meta}</div>
        )}
      </div>
      <button
        type="button"
        onClick={() => {
          if (navigate) navigate(`/atomic/transcription/${source.transcriptId}`);
          else window.location.href = `/atomic/transcription/${source.transcriptId}`;
        }}
        style={{
          padding: '6px 12px',
          background: 'transparent',
          border: '1px solid var(--amber)',
          borderRadius: 4,
          color: 'var(--amber-dark)',
          fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 500,
          cursor: 'pointer', flexShrink: 0,
        }}
      >
        View transcript →
      </button>
    </div>
  );
}
