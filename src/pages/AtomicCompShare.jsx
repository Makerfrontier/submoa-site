// Atomic Comp System — public share view at /c/:token.
// Phase 4: renders the real comp. No SubMoa chrome. Same brand-aware
// render functions the editor canvas uses, just without edit affordances.
// Someone opens this link cold and sees a full-page, mobile-responsive
// comp in the client's brand.

import { useEffect, useState } from 'react';
import { getBlockDef } from '../atomic/comp/blocks';
import { DEFAULT_BRAND, normalizeBrand } from '../atomic/comp/brand/BrandConfig';

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
        if (!res.ok || !data?.comp) {
          setState({ phase: 'error', comp: null, error: data?.error || 'This comp is not available.' });
          return;
        }
        const rawBlocks = safeParse(data.comp.blocks_json, []);
        const blocks = Array.isArray(rawBlocks) ? rawBlocks : [];
        const brand = normalizeBrand(safeParse(data.comp.brand_json, {}) || {});
        setState({ phase: 'ok', comp: { ...data.comp, blocks, brand }, error: null });
        if (data.comp.name) document.title = data.comp.name;
        if (typeof document !== 'undefined') {
          document.body.style.margin = '0';
          document.body.style.padding = '0';
          document.body.style.background = brand.background || '#ffffff';
        }
      } catch (e) {
        if (!cancelled) setState({ phase: 'error', comp: null, error: String(e?.message || e) });
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  if (state.phase === 'loading') {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#ffffff',
      }}>
        <div style={{
          width: 32, height: 32,
          border: '3px solid #e6e6e6',
          borderTopColor: '#333',
          borderRadius: '50%',
          animation: 'atomic-share-spin 0.8s linear infinite',
        }} />
        <style>{`@keyframes atomic-share-spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (state.phase === 'error') {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#fafafa', padding: 32,
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}>
        <div style={{ textAlign: 'center', maxWidth: 440 }}>
          <div style={{ fontSize: 44, marginBottom: 14, opacity: 0.6 }}>🔗</div>
          <div style={{ fontSize: 18, color: '#222', marginBottom: 8, fontWeight: 600 }}>
            This comp isn't available
          </div>
          <div style={{ fontSize: 14, color: '#777', lineHeight: 1.6 }}>
            The link may have expired or sharing may have been disabled by the owner.
          </div>
        </div>
      </div>
    );
  }

  const { comp } = state;
  const { blocks, brand } = comp;

  return (
    <div style={{
      background: brand.background || '#ffffff',
      minHeight: '100vh',
      fontFamily: brand.bodyFont || 'system-ui, -apple-system, sans-serif',
      margin: 0, padding: 0,
      color: brand.text || '#111',
    }}>
      {blocks.length === 0 ? (
        <div style={{
          minHeight: '60vh',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: brand.textLight || '#888',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          fontSize: 14,
        }}>
          This comp has no blocks yet.
        </div>
      ) : (
        blocks.map((block) => <ShareBlock key={block.id || Math.random()} block={block} brand={brand} />)
      )}
    </div>
  );
}

function ShareBlock({ block, brand }) {
  // Legacy per-block screenshot replacement (header/footer swaps, etc.)
  if (block?.screenshotUrl) {
    return <img src={block.screenshotUrl} style={{ width: '100%', display: 'block' }} alt="" />;
  }
  const def = getBlockDef(block?.type);
  if (!def) return null;
  let html = '';
  try { html = def.render(block.fields || {}, brand); }
  catch (e) { console.error('[share] block render failed:', block.type, e); return null; }
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

function safeParse(v, fb) {
  if (typeof v !== 'string') return fb;
  try { return JSON.parse(v); } catch { return fb; }
}
