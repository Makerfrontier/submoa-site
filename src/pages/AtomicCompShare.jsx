// Atomic Comp System — public share view at /c/:token.
// Phase 1: stub that calls the public share endpoint and confirms routing
// works end-to-end. Real block render ships in Phase 4.

import { useEffect, useState } from 'react';

export default function AtomicCompShare() {
  const token = typeof window !== 'undefined'
    ? (window.location.pathname.match(/^\/c\/([^/?#]+)/) || [])[1] || ''
    : '';

  const [state, setState] = useState({ phase: 'loading', comp: null, error: null });

  useEffect(() => {
    if (!token) {
      setState({ phase: 'error', comp: null, error: 'Missing share token' });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/atomic/comp/share/${encodeURIComponent(token)}`);
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setState({ phase: 'error', comp: null, error: data?.error || `HTTP ${res.status}` });
          return;
        }
        setState({ phase: 'ok', comp: data.comp, error: null });
        if (data?.comp?.name) document.title = data.comp.name;
      } catch (e) {
        if (!cancelled) setState({ phase: 'error', comp: null, error: String(e?.message || e) });
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  if (state.phase === 'loading') {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#fafafa' }}>
        <div style={{ fontFamily: 'system-ui, sans-serif', color: '#666', fontSize: 14 }}>Loading…</div>
      </div>
    );
  }

  if (state.phase === 'error') {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#fafafa', padding: 32 }}>
        <div style={{ fontFamily: 'system-ui, sans-serif', textAlign: 'center' }}>
          <div style={{ fontSize: 18, color: '#333', marginBottom: 8 }}>This comp is not available.</div>
          <div style={{ fontSize: 12, color: '#999' }}>{state.error}</div>
        </div>
      </div>
    );
  }

  // Phase 1 placeholder render — shows the raw comp name + block count.
  // Phase 4 replaces this with the brand-rendered block stream.
  const { comp } = state;
  let blockCount = 0;
  try { blockCount = Array.isArray(JSON.parse(comp.blocks_json)) ? JSON.parse(comp.blocks_json).length : 0; } catch {}

  return (
    <div style={{ minHeight: '100vh', background: '#fafafa', padding: 48 }}>
      <div style={{ maxWidth: 640, margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: '#999' }}>
          Shared comp
        </div>
        <h1 style={{ fontSize: 28, color: '#111', margin: '4px 0 16px' }}>{comp.name}</h1>
        <p style={{ fontSize: 14, color: '#666', lineHeight: 1.6 }}>
          Phase 1 foundation is live. The block renderer that turns this comp
          into a real web page lands in Phase 4. {blockCount} block{blockCount === 1 ? '' : 's'} stored.
        </p>
      </div>
    </div>
  );
}
