// BrandBiblePreviewFrame — renders a simulated app shell with the chosen
// brand bible config applied. Lives at /admin/brand-bible/preview-frame and
// is meant to be embedded in an iframe from the AdminBrandBible editor.
//
// Reads ?draft=1 to pull the draft config, ?draft=0 (or absent) to pull the
// locked config. Listens for window 'message' events; on { type: 'bb-update' }
// it re-fetches and re-applies tokens so edits in the parent show up live.

import { useEffect, useState } from 'react';
import { applyBrandBibleToRoot, DEFAULT_BRAND_BIBLE } from '../brand-bible.tsx';

const PREVIEW_PAGES = [
  { key: 'dashboard',        label: 'Dashboard' },
  { key: 'article',          label: 'Build Article' },
  { key: 'comp-studio',      label: 'Comp Studio' },
  { key: 'brief-builder',    label: 'Brief Builder' },
  { key: 'press-release',    label: 'Press Release' },
  { key: 'email-builder',    label: 'Email Builder' },
  { key: 'powerpoint',       label: 'PowerPoint' },
  { key: 'planner',          label: 'Planner' },
  { key: 'infographic',      label: 'Infographic' },
  { key: 'brand-bible',      label: 'Brand Bible (empty to avoid recursion)' },
];

export default function BrandBiblePreviewFrame() {
  const [config, setConfig] = useState(DEFAULT_BRAND_BIBLE);
  const [mode, setMode] = useState('default');
  const [page, setPage] = useState('dashboard');

  const wantDraft = (() => {
    try { return new URLSearchParams(window.location.search).get('draft') === '1'; } catch { return false; }
  })();

  const fetchConfig = async () => {
    try {
      const r = await fetch(`/api/admin/brand-bible/preview-config?draft=${wantDraft ? 1 : 0}`, { credentials: 'include' });
      if (!r.ok) return;
      const d = await r.json();
      if (d?.config) {
        setConfig(d.config);
        setMode(d.mode || 'default');
        applyBrandBibleToRoot(d.config);
      }
    } catch { /* ignore */ }
  };

  useEffect(() => { fetchConfig(); }, []);

  useEffect(() => {
    const onMsg = (e) => {
      if (!e?.data) return;
      if (e.data.type === 'bb-update') fetchConfig();
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      {/* Top banner identifying preview mode */}
      <div style={{ padding: '6px 12px', background: mode === 'draft' ? 'var(--amber-light)' : 'var(--surface-inp)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text-mid)' }}>
        <span>PREVIEW · <strong style={{ color: 'var(--text)' }}>{mode.toUpperCase()}</strong></span>
        <select value={page} onChange={e => setPage(e.target.value)} style={{ padding: '3px 6px', fontFamily: 'DM Sans', fontSize: 12, border: '1px solid var(--border)', background: 'var(--card)' }}>
          {PREVIEW_PAGES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
      </div>

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <FakeSidebar activePage={page} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <FakeTopBar />
          <div style={{ flex: 1, padding: 32, overflowY: 'auto' }}>
            <FakePage pageKey={page} config={config} />
          </div>
        </div>
      </div>
    </div>
  );
}

function FakeSidebar({ activePage }) {
  const items = PREVIEW_PAGES.filter(p => p.key !== 'brand-bible');
  return (
    <div style={{ width: 200, background: 'var(--leather-dark)', color: 'var(--card)', padding: '20px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontFamily: 'DM Sans', fontSize: 10, letterSpacing: '0.12em', color: 'var(--amber)', textTransform: 'uppercase', marginBottom: 6 }}>✦ SUBMOA ✦</div>
      <div style={{ fontFamily: 'Playfair Display', fontSize: 18, fontWeight: 600, marginBottom: 20 }}>Sub Moa Content</div>
      {items.map(p => (
        <div key={p.key}
          style={{
            padding: '6px 10px', fontFamily: 'DM Sans', fontSize: 13, borderRadius: 4,
            background: activePage === p.key ? 'rgba(184,135,46,0.18)' : 'transparent',
            color: activePage === p.key ? 'var(--amber)' : 'var(--card)',
          }}
        >{p.label}</div>
      ))}
    </div>
  );
}

function FakeTopBar() {
  return (
    <div style={{ height: 48, borderBottom: '1px solid var(--border)', background: 'var(--card)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0 18px' }}>
      <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--surface-inp)', border: '1px solid var(--border)' }} />
    </div>
  );
}

function typeStyle(config, role) {
  const s = config.typography?.[role];
  if (!s) return {};
  return {
    fontFamily: `"${s.family.split(',')[0].trim()}", ${s.family.includes('monospace') ? 'monospace' : (s.family.includes('Crimson') || s.family.includes('Playfair')) ? 'serif' : 'sans-serif'}`,
    fontWeight: s.weight, fontSize: s.size, lineHeight: s.lh, letterSpacing: s.ls,
    color: config.colors?.[s.color]?.hex || 'inherit', textTransform: s.transform, fontStyle: s.style, margin: 0,
  };
}

function FakePage({ pageKey, config }) {
  if (pageKey === 'brand-bible') {
    return <div style={{ fontFamily: 'DM Sans', color: 'var(--text-mid)', fontStyle: 'italic' }}>Brand Bible page intentionally omitted from preview (would recurse).</div>;
  }
  const c = config;
  const cardBg = c.colors?.card?.hex;
  const cardBorder = c.colors?.border?.hex;
  switch (pageKey) {
    case 'dashboard':
      return (
        <div style={{ maxWidth: 920, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <div style={typeStyle(c, 'eyebrow')}>✦ DASHBOARD</div>
            <h1 style={{ ...typeStyle(c, 'h1'), marginTop: 6 }}>Your content</h1>
            <p style={{ ...typeStyle(c, 'lead'), marginTop: 6 }}>Recent articles, drafts, and scheduled work.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
            {[1, 2, 3].map(i => (
              <div key={i} style={{ background: cardBg, border: `1px solid ${cardBorder}`, padding: 16, borderRadius: 6 }}>
                <div style={typeStyle(c, 'eyebrow')}>ARTICLE</div>
                <h3 style={{ ...typeStyle(c, 'h3'), marginTop: 4 }}>A sample headline for card {i}</h3>
                <div style={{ ...typeStyle(c, 'small'), marginTop: 4 }}>Published · 3 min read · Sydney</div>
                <p style={{ ...typeStyle(c, 'body-ui'), marginTop: 8 }}>Short snippet of the article or preview text lives here. Two lines max.</p>
              </div>
            ))}
          </div>
        </div>
      );
    case 'article':
      return (
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <div style={typeStyle(c, 'eyebrow')}>BUILD ARTICLE</div>
          <h1 style={{ ...typeStyle(c, 'h1'), marginTop: 6 }}>Start a new piece</h1>
          <p style={{ ...typeStyle(c, 'lead'), marginTop: 10 }}>Pick an author voice and a topic. We'll draft the first pass.</p>
          <div style={{ background: cardBg, border: `1px solid ${cardBorder}`, padding: 20, borderRadius: 6, marginTop: 18 }}>
            <h4 style={typeStyle(c, 'h4')}>Topic</h4>
            <input placeholder="What is the article about?" style={{ ...typeStyle(c, 'body-ui'), width: '100%', padding: '8px 10px', marginTop: 6, background: c.colors?.['surface-inp']?.hex, border: `1px solid ${cardBorder}` }} />
          </div>
        </div>
      );
    default:
      return (
        <div style={{ maxWidth: 720 }}>
          <div style={typeStyle(c, 'eyebrow')}>{pageKey.toUpperCase().replace(/-/g, ' ')}</div>
          <h1 style={{ ...typeStyle(c, 'h1'), marginTop: 6 }}>{PREVIEW_PAGES.find(p => p.key === pageKey)?.label || pageKey}</h1>
          <p style={{ ...typeStyle(c, 'body-ui'), marginTop: 10 }}>This is a simplified stand-in for the {pageKey} page. It shows H1, body UI, and surface styling so you can spot drift before locking.</p>
          <div style={{ background: cardBg, border: `1px solid ${cardBorder}`, padding: 20, borderRadius: 6, marginTop: 18 }}>
            <h2 style={typeStyle(c, 'h2')}>A section heading</h2>
            <p style={{ ...typeStyle(c, 'body-ui'), marginTop: 8 }}>Typical paragraph content appears here so you can check line-height and body color against the current surface.</p>
          </div>
        </div>
      );
  }
}
