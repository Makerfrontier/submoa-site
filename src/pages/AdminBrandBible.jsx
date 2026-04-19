// Admin Brand Bible — token editor with live sandbox preview + lock flow.
// Route: /admin/brand-bible
// Two-column layout: left = accordion stack of editable controls, right = canvas specimen sheet.

import { useState, useEffect, useMemo, useRef } from 'react';
import { useBrandBible, DEFAULT_BRAND_BIBLE, COLOR_TOKEN_KEYS, TYPE_ROLE_KEYS, FONT_FAMILIES } from '../brand-bible.tsx';

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

const ACCORDION_SECTIONS = [
  { key: 'colors',     label: 'COLORS' },
  { key: 'typography', label: 'TYPOGRAPHY' },
  { key: 'surface',    label: 'SURFACE PREVIEW' },
  { key: 'versions',   label: 'VERSIONS' },
  { key: 'actions',    label: 'ACTIONS' },
];

const eyebrowStyle = {
  fontFamily: 'DM Sans, sans-serif', fontWeight: 600, fontSize: 11, lineHeight: 1.2,
  letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--amber)',
};

const h1Style = {
  fontFamily: 'Playfair Display, serif', fontWeight: 600, fontSize: 40, lineHeight: 1.15,
  letterSpacing: '-0.015em', color: 'var(--green-dark)', margin: 0,
};

export default function AdminBrandBible() {
  const { config: activeConfig, refresh } = useBrandBible();
  const [draft, setDraft] = useState(null);
  const [versions, setVersions] = useState([]);
  const [openSections, setOpenSections] = useState({ colors: true, typography: false, surface: false, versions: false, actions: true });
  const [surface, setSurface] = useState('bg'); // 'bg' | 'card' | 'leather-dark'
  const [changes, setChanges] = useState(0);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [previewMode, setPreviewMode] = useState('specimen'); // 'specimen' | 'live'
  const [compareLocked, setCompareLocked] = useState(false);
  const draftFrameRef = useRef(null);
  const lockedFrameRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const d = await api('/api/admin/brand-bible/draft');
        setDraft(d.config || DEFAULT_BRAND_BIBLE);
      } catch {
        setDraft(JSON.parse(JSON.stringify(activeConfig)));
      }
      try {
        const v = await api('/api/admin/brand-bible/versions');
        setVersions(v.versions || []);
      } catch {}
    })();
  }, []);

  // Debounced persist-and-nudge: any draft-edit saves to /draft and pings the
  // iframe to re-fetch. Debounced so rapid slider drags don't flood the DB.
  const saveTimer = useRef(null);
  const scheduleDraftSync = (nextDraft) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await api('/api/admin/brand-bible/draft', { method: 'PATCH', body: JSON.stringify({ config: nextDraft }) });
        try { draftFrameRef.current?.contentWindow?.postMessage({ type: 'bb-update' }, '*'); } catch {}
      } catch { /* ignore — user can hit Save Draft manually */ }
    }, 250);
  };

  const setColor = (key, hex) => {
    setDraft(d => {
      const next = { ...d, colors: { ...d.colors, [key]: { ...d.colors[key], hex } } };
      scheduleDraftSync(next);
      return next;
    });
    setChanges(c => c + 1);
  };
  const setTypeField = (role, field, value) => {
    setDraft(d => {
      const next = { ...d, typography: { ...d.typography, [role]: { ...d.typography[role], [field]: value } } };
      scheduleDraftSync(next);
      return next;
    });
    setChanges(c => c + 1);
  };
  const resetColor = (key) => setColor(key, DEFAULT_BRAND_BIBLE.colors[key].hex);
  const resetTypeRole = (role) => {
    setDraft(d => ({ ...d, typography: { ...d.typography, [role]: { ...DEFAULT_BRAND_BIBLE.typography[role] } } }));
    setChanges(c => c + 1);
  };
  const resetAll = () => { setDraft(JSON.parse(JSON.stringify(DEFAULT_BRAND_BIBLE))); setChanges(c => c + 1); };

  const saveDraft = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await api('/api/admin/brand-bible/draft', { method: 'PATCH', body: JSON.stringify({ config: draft }) });
      setToast('Draft saved');
      setTimeout(() => setToast(''), 2000);
    } catch (e) {
      setToast(`Error: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const lockDraft = async () => {
    if (!confirm('Lock this as the active brand bible? Site-wide tokens will swap instantly.')) return;
    setSaving(true);
    try {
      await api('/api/admin/brand-bible/draft', { method: 'PATCH', body: JSON.stringify({ config: draft }) });
      const r = await api('/api/admin/brand-bible/lock', { method: 'POST' });
      await refresh();
      const v = await api('/api/admin/brand-bible/versions');
      setVersions(v.versions || []);
      setChanges(0);
      setToast(`Locked as v${r.version_number}`);
      setTimeout(() => setToast(''), 3000);
    } catch (e) {
      setToast(`Error: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const restoreVersion = async (id) => {
    try {
      await api(`/api/admin/brand-bible/restore/${id}`, { method: 'POST' });
      const d = await api('/api/admin/brand-bible/draft');
      setDraft(d.config);
      setChanges(c => c + 1);
      setToast('Restored to draft');
      setTimeout(() => setToast(''), 2000);
    } catch (e) {
      setToast(`Error: ${e.message}`);
    }
  };

  const downloadPrompt = async () => {
    if (!draft) return;
    const md = buildBrandBiblePromptMd(draft, activeConfig.version_number || 1);
    try {
      await navigator.clipboard.writeText(md);
      setToast('Brand Bible prompt copied to clipboard');
      setTimeout(() => setToast(''), 2500);
    } catch {
      setToast('Copy failed — see console');
      console.log(md);
    }
  };

  if (!draft) return <div style={{ padding: 40, color: 'var(--text-mid)' }}>Loading…</div>;

  return (
    <div style={{ display: 'flex', gap: 0, minHeight: 'calc(100vh - 60px)', background: 'var(--bg)' }}>
      {/* LEFT — accordion */}
      <div style={{ width: 440, flexShrink: 0, borderRight: '1px solid var(--border)', background: 'var(--card)', padding: '24px 20px', overflowY: 'auto', maxHeight: 'calc(100vh - 60px)' }}>
        <div style={eyebrowStyle}>✦ BRAND BIBLE</div>
        <h1 style={{ ...h1Style, marginTop: 6 }}>
          v{activeConfig.version_number || 1} · Draft editable
        </h1>
        <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text-mid)', marginTop: 4, marginBottom: 20 }}>
          Edits preview in the canvas. Site-wide tokens update when you Lock.
        </div>

        {ACCORDION_SECTIONS.map(s => (
          <AccordionSection
            key={s.key}
            label={s.label}
            open={openSections[s.key]}
            onToggle={() => setOpenSections(o => ({ ...o, [s.key]: !o[s.key] }))}
          >
            {s.key === 'colors' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {COLOR_TOKEN_KEYS.map(k => (
                  <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 4, background: draft.colors[k].hex, border: '1px solid var(--border)' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>--{k}</div>
                      <div style={{ fontFamily: 'Crimson Pro', fontStyle: 'italic', fontSize: 12, color: 'var(--text-mid)' }}>{draft.colors[k].description}</div>
                    </div>
                    <input
                      type="color"
                      value={draft.colors[k].hex}
                      onChange={e => setColor(k, e.target.value)}
                      style={{ width: 32, height: 28, border: '1px solid var(--border)', background: 'none', padding: 0, cursor: 'pointer' }}
                    />
                    <input
                      type="text"
                      value={draft.colors[k].hex}
                      onChange={e => setColor(k, e.target.value)}
                      style={{ width: 86, fontFamily: 'ui-monospace, SF Mono, Menlo', fontSize: 12, padding: '4px 6px', border: '1px solid var(--border)', background: 'var(--surface-inp)', color: 'var(--text)' }}
                    />
                    <button onClick={() => resetColor(k)} style={resetBtnStyle}>reset</button>
                  </div>
                ))}
              </div>
            )}

            {s.key === 'typography' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {TYPE_ROLE_KEYS.map(role => {
                  const spec = draft.typography[role];
                  return (
                    <div key={role} style={{ border: '1px solid var(--border-light)', padding: 10, borderRadius: 6, background: 'var(--surface-inp)' }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
                        <div style={{ fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{role}</div>
                        <button onClick={() => resetTypeRole(role)} style={resetBtnStyle}>reset</button>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                        <LabeledSelect label="family" value={spec.family} onChange={v => setTypeField(role, 'family', v)} options={FONT_FAMILIES} />
                        <LabeledSelect label="weight" value={String(spec.weight)} onChange={v => setTypeField(role, 'weight', Number(v))} options={['400','500','600','700']} />
                        <LabeledInput label="size (px)" type="number" value={spec.size} onChange={v => setTypeField(role, 'size', Number(v))} />
                        <LabeledInput label="line-height" type="number" step="0.05" value={spec.lh} onChange={v => setTypeField(role, 'lh', Number(v))} />
                        <LabeledInput label="letter-spacing" value={spec.ls} onChange={v => setTypeField(role, 'ls', v)} />
                        <LabeledSelect label="color" value={spec.color} onChange={v => setTypeField(role, 'color', v)} options={COLOR_TOKEN_KEYS} />
                        <LabeledSelect label="transform" value={spec.transform} onChange={v => setTypeField(role, 'transform', v)} options={['none','uppercase','lowercase','capitalize']} />
                        <LabeledSelect label="style" value={spec.style} onChange={v => setTypeField(role, 'style', v)} options={['normal','italic']} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {s.key === 'surface' && (
              <div style={{ display: 'flex', gap: 8 }}>
                {['bg','card','leather-dark'].map(b => (
                  <button
                    key={b}
                    onClick={() => setSurface(b)}
                    style={{
                      padding: '8px 12px', border: surface === b ? '2px solid var(--green)' : '1px solid var(--border)',
                      background: draft.colors[b]?.hex, color: b === 'leather-dark' ? 'var(--card)' : 'var(--text)',
                      fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600, cursor: 'pointer', borderRadius: 4,
                    }}
                  >{b}</button>
                ))}
              </div>
            )}

            {s.key === 'versions' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {versions.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-mid)' }}>No versions yet</div>}
                {versions.map(v => (
                  <div key={v.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-light)' }}>
                    <div>
                      <span style={{ fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13 }}>v{v.version_number}</span>
                      <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-mid)', textTransform: 'uppercase' }}>{v.status}</span>
                      {v.locked_at && <div style={{ fontSize: 11, color: 'var(--text-light)' }}>{new Date(v.locked_at * 1000).toLocaleDateString()}</div>}
                    </div>
                    <button onClick={() => restoreVersion(v.id)} style={secondaryBtnStyle}>Restore</button>
                  </div>
                ))}
              </div>
            )}

            {s.key === 'actions' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button onClick={saveDraft} disabled={saving} style={secondaryBtnStyle}>{saving ? '…' : 'Save Draft'}</button>
                <button onClick={lockDraft} disabled={saving} style={primaryBtnStyle}>Lock Design</button>
                <button onClick={downloadPrompt} style={secondaryBtnStyle}>Download Brand Bible Prompt</button>
                <button onClick={resetAll} style={secondaryBtnStyle}>Reset All to Defaults</button>
              </div>
            )}
          </AccordionSection>
        ))}

        <div style={{ marginTop: 20, padding: '10px 12px', background: 'var(--surface-inp)', borderRadius: 4, fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text-mid)' }}>
          Session changes: <strong style={{ color: 'var(--text)' }}>{changes}</strong>
        </div>
        {toast && <div style={{ marginTop: 10, padding: '8px 12px', background: 'var(--amber)', color: 'var(--card)', fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, borderRadius: 4 }}>{toast}</div>}
      </div>

      {/* RIGHT — canvas */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 60px)', background: previewMode === 'specimen' ? draft.colors[surface]?.hex : 'var(--bg)' }}>
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--card)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => setPreviewMode('specimen')}
            style={{ padding: '6px 12px', border: '1px solid var(--border)', background: previewMode === 'specimen' ? 'var(--amber)' : 'var(--card)', color: previewMode === 'specimen' ? 'var(--card)' : 'var(--text)', fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, cursor: 'pointer', borderRadius: 4 }}
          >Specimen Sheet</button>
          <button
            onClick={() => setPreviewMode('live')}
            style={{ padding: '6px 12px', border: '1px solid var(--border)', background: previewMode === 'live' ? 'var(--amber)' : 'var(--card)', color: previewMode === 'live' ? 'var(--card)' : 'var(--text)', fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, cursor: 'pointer', borderRadius: 4 }}
          >Live Site Preview</button>
          {previewMode === 'live' && (
            <label style={{ marginLeft: 8, fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text-mid)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={compareLocked} onChange={e => setCompareLocked(e.target.checked)} />
              Compare with Locked
            </label>
          )}
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: previewMode === 'specimen' ? 40 : 16 }}>
          {previewMode === 'specimen' && <SpecimenSheet config={draft} surface={surface} />}
          {previewMode === 'live' && (
            <div style={{ display: 'flex', gap: 12, height: '100%', minHeight: 700 }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontFamily: 'DM Sans', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--amber)', marginBottom: 4 }}>Draft</div>
                <iframe
                  ref={draftFrameRef}
                  src="/admin/brand-bible/preview-frame?draft=1"
                  title="Draft preview"
                  style={{ flex: 1, width: '100%', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--card)', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}
                />
              </div>
              {compareLocked && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--green-dark)', marginBottom: 4 }}>Locked (v{activeConfig.version_number || 1})</div>
                  <iframe
                    ref={lockedFrameRef}
                    src="/admin/brand-bible/preview-frame?draft=0"
                    title="Locked preview"
                    style={{ flex: 1, width: '100%', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--card)', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AccordionSection({ label, open, onToggle, children }) {
  return (
    <div style={{ marginBottom: 12, border: '1px solid var(--border-light)', borderRadius: 6, overflow: 'hidden', background: 'var(--card)' }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%', padding: '10px 14px', border: 'none', background: 'transparent', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          ...eyebrowStyle,
        }}
      >
        <span>{label}</span>
        <span style={{ color: 'var(--text-mid)', fontSize: 14 }}>{open ? '−' : '+'}</span>
      </button>
      {open && <div style={{ padding: 14, borderTop: '1px solid var(--border-light)' }}>{children}</div>}
    </div>
  );
}

function LabeledInput({ label, value, onChange, type='text', step }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-mid)', fontFamily: 'DM Sans', fontWeight: 600 }}>{label}</span>
      <input
        type={type} step={step} value={value} onChange={e => onChange(e.target.value)}
        style={{ padding: '4px 6px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontFamily: 'DM Sans', fontSize: 12 }}
      />
    </label>
  );
}
function LabeledSelect({ label, value, onChange, options }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-mid)', fontFamily: 'DM Sans', fontWeight: 600 }}>{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{ padding: '4px 6px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontFamily: 'DM Sans', fontSize: 12 }}
      >
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

const primaryBtnStyle = {
  padding: '10px 14px', background: 'var(--amber)', color: 'var(--card)', border: 'none',
  fontFamily: 'DM Sans', fontWeight: 600, fontSize: 14, cursor: 'pointer', borderRadius: 4,
};
const secondaryBtnStyle = {
  padding: '8px 12px', background: 'var(--card)', color: 'var(--text)', border: '1px solid var(--border)',
  fontFamily: 'DM Sans', fontWeight: 500, fontSize: 13, cursor: 'pointer', borderRadius: 4,
};
const resetBtnStyle = {
  padding: '2px 6px', background: 'transparent', color: 'var(--text-mid)', border: '1px solid var(--border-light)',
  fontFamily: 'DM Sans', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', cursor: 'pointer', borderRadius: 3,
};

function typeStyle(config, role) {
  const s = config.typography[role];
  return {
    fontFamily: `"${s.family.split(',')[0].trim()}", ${s.family.includes('monospace') ? 'monospace' : s.family.includes('Crimson') || s.family.includes('Playfair') ? 'serif' : 'sans-serif'}`,
    fontWeight: s.weight, fontSize: s.size, lineHeight: s.lh, letterSpacing: s.ls,
    color: config.colors[s.color]?.hex || 'inherit', textTransform: s.transform, fontStyle: s.style,
    margin: 0,
  };
}

function SpecimenSheet({ config, surface }) {
  const cardBg = config.colors.card.hex;
  const cardBorder = config.colors.border.hex;
  const surfaceTextColor = surface === 'leather-dark' ? config.colors.card.hex : config.colors.text.hex;
  return (
    <div style={{ maxWidth: 820, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 28 }}>
      <div>
        <div style={typeStyle(config, 'eyebrow')}>✦ PAGE HERO</div>
        <h1 style={{ ...typeStyle(config, 'h1'), marginTop: 8 }}>The brand bible, applied</h1>
        <p style={{ ...typeStyle(config, 'lead'), marginTop: 10 }}>Live preview of the current draft tokens against the selected surface. Every component on this sheet references your typography and color choices.</p>
      </div>

      <div style={{ background: cardBg, border: `1px solid ${cardBorder}`, padding: 20, borderRadius: 8 }}>
        <div style={typeStyle(config, 'eyebrow')}>DASHBOARD TILE</div>
        <h3 style={{ ...typeStyle(config, 'h3'), marginTop: 6 }}>A sample article card</h3>
        <div style={{ ...typeStyle(config, 'small'), marginTop: 4 }}>Published · 3 min read · Sydney</div>
        <p style={{ ...typeStyle(config, 'body-ui'), marginTop: 10 }}>This is the body UI style you see in dashboard cards, lists, tables, and content rows throughout the app.</p>
      </div>

      <div style={{ background: cardBg, border: `1px solid ${cardBorder}`, padding: 24, borderRadius: 8 }}>
        <h2 style={typeStyle(config, 'h2')}>An article excerpt</h2>
        <p style={{ ...typeStyle(config, 'body-article'), marginTop: 12 }}>When we write long-form on-site, paragraphs use Crimson Pro at nineteen pixels on a generous line-height. The intent is to read the way the brand sounds — warm, considered, and a little literary.</p>
        <p style={{ ...typeStyle(config, 'caption'), marginTop: 10 }}>— caption style for figure attributions</p>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button style={{ ...typeStyle(config, 'button'), padding: '10px 16px', background: config.colors.amber.hex, color: config.colors.card.hex, border: 'none', borderRadius: 4 }}>Primary action</button>
        <button style={{ ...typeStyle(config, 'button'), padding: '10px 16px', background: cardBg, color: config.colors.text.hex, border: `1px solid ${cardBorder}`, borderRadius: 4 }}>Secondary</button>
        <button style={{ ...typeStyle(config, 'button'), padding: '10px 16px', background: 'transparent', color: surfaceTextColor, border: 'none' }}>Ghost</button>
      </div>

      <div style={{ background: cardBg, border: `1px solid ${cardBorder}`, padding: 20, borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={typeStyle(config, 'h5')}>Label</span>
          <input placeholder="text input" style={{ ...typeStyle(config, 'body-ui'), padding: '8px 10px', background: config.colors['surface-inp'].hex, border: `1px solid ${cardBorder}`, borderRadius: 4 }} />
          <span style={typeStyle(config, 'small')}>helper text explains what this field means</span>
        </label>
      </div>

      <div style={{ fontFamily: 'ui-monospace', fontSize: 12, color: surfaceTextColor, opacity: 0.8 }}>
        surface: {surface} · text-color: {surfaceTextColor}
      </div>
    </div>
  );
}

function buildBrandBiblePromptMd(config, versionNumber) {
  const date = new Date().toISOString().slice(0, 10);
  const colorLines = Object.entries(config.colors)
    .map(([k, v]) => `--${k.padEnd(14)} ${v.hex}   (${v.description})`).join('\n');
  const typeLines = Object.entries(config.typography)
    .map(([role, s]) => `${role.padEnd(14)}${s.family} · ${s.weight} · ${s.size}px · lh ${s.lh} · ls ${s.ls} · var(--${s.color})${s.transform !== 'none' ? ' · ' + s.transform : ''}${s.style !== 'normal' ? ' · ' + s.style : ''}`).join('\n');
  return `# BRAND BIBLE — v${versionNumber} — Locked ${date}

## ⛔ READ BEFORE ANY UI WORK

Every file you touch must respect these tokens. Do not hardcode colors. Do not use pure #000. Do not invent fonts. Always reference CSS vars.

### Color tokens
${colorLines}

### Type scale
${typeLines}

### Hard rules
1. Never #000 or color: black — use var(--text) for body, var(--green-dark) or var(--leather-dark) for headings.
2. Never hardcode hex values for tokens listed above. Reference var(--token-name).
3. Page titles use H1 spec. Marketing heroes use Display spec.
4. Section labels inside accordions use Eyebrow spec.
5. New editor pages follow the two-column pattern (left accordion / right canvas).
`;
}
