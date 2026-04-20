// Atomic Comp System — builder page.
// Phase 1: foundation placeholder. The full builder (start screen, canvas,
// edit panel, import flows) ships in Phases 2-5.

import { useEffect, useState } from 'react';

export default function AtomicComp({ navigate }) {
  const pathId = typeof window !== 'undefined'
    ? (window.location.pathname.match(/^\/atomic\/comp\/([^/?#]+)/) || [])[1] || null
    : null;

  const [compId] = useState(pathId);
  const [apiStatus, setApiStatus] = useState('checking');

  useEffect(() => {
    // Light health check so the placeholder shows the endpoints are live.
    // Phase 2 replaces this with real data loading.
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/atomic/comp', { credentials: 'include' });
        if (cancelled) return;
        setApiStatus(res.ok ? 'ready' : `error-${res.status}`);
      } catch {
        if (!cancelled) setApiStatus('error-network');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const sectionBullet = {
    display: 'flex', alignItems: 'baseline', gap: 10,
    fontSize: 13, color: 'var(--text-mid)', lineHeight: 1.65,
  };
  const dot = {
    display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
    background: 'var(--amber)', transform: 'translateY(-2px)', flexShrink: 0,
  };

  return (
    <div style={{ padding: '48px 32px', maxWidth: 760, margin: '0 auto' }}>
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: '.12em',
        textTransform: 'uppercase', color: 'var(--amber)',
      }}>
        ✦ Atomic Comp System
      </div>
      <h1 style={{
        fontFamily: 'var(--font-heading, "DM Sans")',
        fontSize: 32, fontWeight: 700, color: 'var(--text)',
        margin: '6px 0 8px',
      }}>
        Foundation shipped — builder lands in Phase 2
      </h1>
      <p style={{ fontSize: 14, color: 'var(--text-mid)', lineHeight: 1.6, margin: 0 }}>
        The DB table, API endpoints, block/brand type system, and routes are
        live. The virtual canvas, block renderers, and creation flows are
        staged for the next session.
      </p>

      <div style={{
        marginTop: 28, padding: 18, borderRadius: 10,
        background: 'var(--card)', border: '1px solid var(--border)',
      }}>
        <div style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '.08em',
          textTransform: 'uppercase', color: 'var(--text-mid)', marginBottom: 10,
        }}>
          Phase 1 Status
        </div>
        <div style={sectionBullet}><span style={dot} />D1 table <code>atomic_comp_drafts</code> created</div>
        <div style={sectionBullet}><span style={dot} />API: <code>GET/POST /api/atomic/comp</code> — <strong>{apiStatus}</strong></div>
        <div style={sectionBullet}><span style={dot} />API: <code>GET/PUT/DELETE /api/atomic/comp/:id</code></div>
        <div style={sectionBullet}><span style={dot} />API: <code>POST /api/atomic/comp/:id/share</code> → <code>/c/{'{'}token{'}'}</code></div>
        <div style={sectionBullet}><span style={dot} />API: <code>GET /api/atomic/comp/share/:token</code> (public)</div>
        <div style={sectionBullet}><span style={dot} />Types: <code>Block</code>, <code>BlockDef</code>, <code>BrandConfig</code>, <code>compStore</code></div>
        {compId && (
          <div style={{ ...sectionBullet, color: 'var(--amber)' }}>
            <span style={dot} />Comp id from URL: <code>{compId}</code> (hydration deferred to Phase 2)
          </div>
        )}
      </div>

      <div style={{ marginTop: 20, fontSize: 12, color: 'var(--text-light, var(--text-mid))' }}>
        The original Comp Studio remains untouched at <a href="/comp-studio" onClick={(e) => { e.preventDefault(); navigate && navigate('/comp-studio'); }}>/comp-studio</a>.
      </div>
    </div>
  );
}
