// Four-option entry screen shown when /atomic/comp is opened with no id.
// Phase 2 only wires "Start Blank" — the other three options are scaffolded
// but disabled with a "Coming in Phase 3" badge.

import { useState } from 'react';
import { DEFAULT_BRAND } from '../brand/BrandConfig';

export function StartScreen({ onCompCreated }) {
  const [creating, setCreating] = useState(null);
  const [err, setErr] = useState('');

  const startBlank = async () => {
    setCreating('blank'); setErr('');
    try {
      const res = await fetch('/api/atomic/comp', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Untitled Comp',
          blocks_json: JSON.stringify([]),
          brand_json:  JSON.stringify(DEFAULT_BRAND),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.comp?.id) throw new Error(data?.error || `HTTP ${res.status}`);
      onCompCreated({ ...data.comp, blocks: [], brand: DEFAULT_BRAND });
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setCreating(null);
    }
  };

  const options = [
    { key: 'url',   icon: '🔗', title: 'Import URL',           desc: 'Paste any page URL and we pull it in editable', disabled: true, badge: 'Phase 3' },
    { key: 'brief', icon: '✨', title: 'AI Brief',             desc: 'Describe what you want — Claude builds it',     disabled: true, badge: 'Phase 3' },
    { key: 'image', icon: '📄', title: 'Upload Image or PDF',  desc: 'Screenshot or design file → editable blocks',   disabled: true, badge: 'Phase 3' },
    { key: 'blank', icon: '🧩', title: 'Start Blank',          desc: 'Add blocks one by one from the block library',  onClick: startBlank },
  ];

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: 40,
      fontFamily: 'DM Sans, sans-serif',
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700, letterSpacing: '0.15em',
        color: 'var(--amber)', textTransform: 'uppercase', marginBottom: 20,
      }}>✦ Atomic Comp System</div>

      <h1 style={{
        fontSize: 'clamp(2rem, 4vw, 3rem)',
        fontWeight: 700, color: 'var(--green-dark)',
        marginBottom: 12, textAlign: 'center', lineHeight: 1.1,
      }}>Build a comp in seconds</h1>

      <p style={{
        fontSize: 18, color: 'var(--text-mid)',
        marginBottom: 48, textAlign: 'center',
        maxWidth: 480, lineHeight: 1.5,
      }}>Start from a URL, a description, an image, or scratch. Share a link when you're done.</p>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 16, width: '100%', maxWidth: 640, marginBottom: 32,
      }}>
        {options.map((opt) => (
          <button
            key={opt.key}
            onClick={opt.onClick}
            disabled={opt.disabled || !!creating}
            style={{
              padding: '24px 20px', borderRadius: 12,
              border: '1px solid var(--border)',
              background: opt.disabled ? 'var(--bg)' : 'var(--card)',
              cursor: opt.disabled ? 'default' : 'pointer',
              textAlign: 'left',
              opacity: opt.disabled ? 0.55 : 1,
              position: 'relative',
              fontFamily: 'DM Sans, sans-serif',
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 12 }}>{opt.icon}</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>{opt.title}</div>
            <div style={{ fontSize: 13, color: 'var(--text-mid)', lineHeight: 1.4 }}>{opt.desc}</div>
            {opt.badge && (
              <div style={{
                position: 'absolute', top: 12, right: 12,
                fontSize: 10, fontWeight: 600, color: 'var(--amber)',
                background: 'rgba(184,135,46,0.1)',
                padding: '2px 8px', borderRadius: 4,
                letterSpacing: '0.05em', textTransform: 'uppercase',
              }}>{opt.badge}</div>
            )}
            {creating === opt.key && (
              <div style={{ marginTop: 10, fontSize: 12, color: 'var(--amber)' }}>Creating…</div>
            )}
          </button>
        ))}
      </div>

      {err && (
        <div style={{ marginTop: 8, fontSize: 12, color: '#a03030' }}>{err}</div>
      )}
    </div>
  );
}
