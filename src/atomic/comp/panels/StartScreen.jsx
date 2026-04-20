// Four-option entry screen. Each option expands inline into a creation form.
// URL / AI Brief / Image-or-PDF all hit their server endpoint and navigate
// the browser directly to the resulting /atomic/comp/:id — the editor's
// mount-time loader then hydrates from the DB row.

import { useEffect, useState } from 'react';
import { DEFAULT_BRAND } from '../brand/BrandConfig';

const CARD_STYLE_BASE = {
  padding: '24px 20px',
  borderRadius: 12,
  border: '1px solid var(--border)',
  background: 'var(--card)',
  cursor: 'pointer',
  textAlign: 'left',
  position: 'relative',
  fontFamily: 'DM Sans, sans-serif',
};
const INPUT_STYLE = {
  width: '100%',
  background: 'var(--surface-inp)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: '10px 12px',
  fontSize: 14,
  fontFamily: 'DM Sans, sans-serif',
  color: 'var(--text)',
  outline: 'none',
  boxSizing: 'border-box',
};
const LABEL_STYLE = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--text-mid)',
  marginBottom: 6,
  fontFamily: 'DM Sans, sans-serif',
};
const BTN_PRIMARY = {
  background: 'var(--green-dark, #2B4030)',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  padding: '10px 22px',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'DM Sans, sans-serif',
};
const BTN_GHOST = {
  background: 'transparent',
  color: 'var(--text-mid)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: '10px 18px',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'DM Sans, sans-serif',
};

const URL_IMPORT_STAGES = [
  { min:  0, msg: 'Fetching page…' },
  { min:  3, msg: 'Reading structure…' },
  { min:  8, msg: 'Extracting brand…' },
  { min: 14, msg: 'Classifying sections…' },
  { min: 22, msg: 'Building blocks…' },
  { min: 32, msg: 'Almost there…' },
];
const BRIEF_STAGES = [
  { min:  0, msg: 'Reading your brief…' },
  { min:  5, msg: 'Writing copy…' },
  { min: 15, msg: 'Composing sections…' },
  { min: 25, msg: 'Polishing…' },
];
const IMAGE_STAGES = [
  { min:  0, msg: 'Reading your design…' },
  { min:  6, msg: 'Identifying sections…' },
  { min: 15, msg: 'Extracting brand…' },
  { min: 22, msg: 'Building blocks…' },
  { min: 32, msg: 'Almost there…' },
];

function useProgressMessage(active, stages) {
  const [msg, setMsg] = useState(stages[0]?.msg || '');
  useEffect(() => {
    if (!active) return;
    const started = Date.now();
    setMsg(stages[0]?.msg || '');
    const iv = setInterval(() => {
      const elapsed = (Date.now() - started) / 1000;
      const current = stages.reduce((acc, s) => (elapsed >= s.min ? s : acc), stages[0]);
      setMsg(current.msg);
    }, 1000);
    return () => clearInterval(iv);
  }, [active, stages]);
  return msg;
}

export function StartScreen({ onCompCreated }) {
  const [activeFlow, setActiveFlow] = useState(null); // 'url' | 'brief' | 'image' | 'blank' | null
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState('');

  // URL import state
  const [urlInput, setUrlInput] = useState('');
  const urlMsg = useProgressMessage(creating && activeFlow === 'url', URL_IMPORT_STAGES);

  // AI brief state
  const [brief, setBrief] = useState({
    brandUrl: '',
    siteName: '',
    pageType: 'Landing Page',
    pageTitle: '',
    targetAudience: '',
    keyMessage: '',
    tone: 'Professional',
    sections: ['nav', 'hero', 'card-grid', 'stats', 'cta', 'footer'],
    additionalContext: '',
  });
  const briefMsg = useProgressMessage(creating && activeFlow === 'brief', BRIEF_STAGES);

  // Image import state
  const [uploadedFile, setUploadedFile] = useState(null);
  const imageMsg = useProgressMessage(creating && activeFlow === 'image', IMAGE_STAGES);

  const navigateToComp = (compId) => {
    window.location.href = `/atomic/comp/${compId}`;
  };

  const startBlank = async () => {
    setCreating(true); setErr('');
    try {
      const res = await fetch('/api/atomic/comp', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Untitled Comp',
          blocks_json: JSON.stringify([]),
          brand_json: JSON.stringify(DEFAULT_BRAND),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.comp?.id) throw new Error(data?.error || `HTTP ${res.status}`);
      onCompCreated({ ...data.comp, blocks: [], brand: DEFAULT_BRAND });
    } catch (e) { setErr(String(e?.message || e)); setCreating(false); }
  };

  const runUrlImport = async () => {
    const u = urlInput.trim();
    if (!u) { setErr('Enter a URL first'); return; }
    setCreating(true); setErr('');
    try {
      const res = await fetch('/api/atomic/comp/import-url', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: u }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.comp_id) throw new Error(data?.error || `HTTP ${res.status}`);
      navigateToComp(data.comp_id);
    } catch (e) { setErr(String(e?.message || e)); setCreating(false); }
  };

  const runBriefGenerate = async () => {
    if (!brief.pageTitle.trim()) { setErr('Page title is required'); return; }
    if (brief.sections.length === 0) { setErr('Pick at least one section'); return; }
    setCreating(true); setErr('');
    try {
      const res = await fetch('/api/atomic/comp/generate-brief', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(brief),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.comp_id) throw new Error(data?.error || `HTTP ${res.status}`);
      navigateToComp(data.comp_id);
    } catch (e) { setErr(String(e?.message || e)); setCreating(false); }
  };

  const runImageImport = async () => {
    if (!uploadedFile) { setErr('Pick a file first'); return; }
    setCreating(true); setErr('');
    try {
      const form = new FormData();
      form.append('file', uploadedFile);
      const res = await fetch('/api/atomic/comp/import-image', {
        method: 'POST', credentials: 'include', body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.comp_id) throw new Error(data?.error || `HTTP ${res.status}`);
      navigateToComp(data.comp_id);
    } catch (e) { setErr(String(e?.message || e)); setCreating(false); }
  };

  const cancelFlow = () => {
    setActiveFlow(null);
    setUrlInput('');
    setUploadedFile(null);
    setErr('');
  };

  // ───────────────────────────────────────────────────────────────
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
        marginBottom: 40, textAlign: 'center',
        maxWidth: 520, lineHeight: 1.5,
      }}>Start from a URL, a description, an image, or a blank canvas.</p>

      <div style={{ width: '100%', maxWidth: 720 }}>
        {activeFlow === null && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 14,
          }}>
            <OptionCard icon="🔗" title="Import URL" desc="Paste a page URL and we'll pull it in editable."
              onClick={() => setActiveFlow('url')} />
            <OptionCard icon="✨" title="AI Brief" desc="Describe what you want — Claude builds it."
              onClick={() => setActiveFlow('brief')} />
            <OptionCard icon="📄" title="Upload Image or PDF" desc="Screenshot or design file → editable blocks."
              onClick={() => setActiveFlow('image')} />
            <OptionCard icon="🧩" title="Start Blank" desc="Add blocks one by one from the block library."
              onClick={startBlank} disabled={creating} loading={creating} />
          </div>
        )}

        {activeFlow === 'url' && (
          <FlowCard title="🔗 Import from URL" onCancel={!creating ? cancelFlow : null}>
            <label style={LABEL_STYLE}>Page URL</label>
            <input
              autoFocus
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !creating) runUrlImport(); }}
              placeholder="https://www.atv.com/content/some-page"
              style={INPUT_STYLE}
              disabled={creating}
            />
            <ButtonRow>
              <button onClick={runUrlImport} disabled={creating} style={BTN_PRIMARY}>
                {creating ? urlMsg : 'Import →'}
              </button>
              {!creating && <button onClick={cancelFlow} style={BTN_GHOST}>Cancel</button>}
            </ButtonRow>
            {creating && (
              <SubText>Usually 15–25 seconds. Page is fetched, brand is extracted, sections are classified.</SubText>
            )}
          </FlowCard>
        )}

        {activeFlow === 'brief' && (
          <FlowCard title="✨ AI Brief" onCancel={!creating ? cancelFlow : null} wide>
            <Row>
              <Field label="Brand URL (optional)">
                <input type="url" value={brief.brandUrl}
                  onChange={(e) => setBrief({ ...brief, brandUrl: e.target.value })}
                  placeholder="https://… for brand extraction" style={INPUT_STYLE} disabled={creating} />
              </Field>
              <Field label="Site name">
                <input type="text" value={brief.siteName}
                  onChange={(e) => setBrief({ ...brief, siteName: e.target.value })}
                  placeholder="Velocity Racing" style={INPUT_STYLE} disabled={creating} />
              </Field>
            </Row>
            <Row>
              <Field label="Page type">
                <select value={brief.pageType}
                  onChange={(e) => setBrief({ ...brief, pageType: e.target.value })}
                  style={{ ...INPUT_STYLE, cursor: 'pointer' }} disabled={creating}>
                  {['Landing Page', 'Hub', 'Campaign', 'Event', 'Sponsor', 'Editorial', 'About', 'Contact'].map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </Field>
              <Field label="Page title">
                <input type="text" value={brief.pageTitle}
                  onChange={(e) => setBrief({ ...brief, pageTitle: e.target.value })}
                  placeholder="2026 Season Sponsorship" style={INPUT_STYLE} disabled={creating} />
              </Field>
            </Row>
            <Field label="Target audience (one line)">
              <input type="text" value={brief.targetAudience}
                onChange={(e) => setBrief({ ...brief, targetAudience: e.target.value })}
                placeholder="Racing sponsors and partners" style={INPUT_STYLE} disabled={creating} />
            </Field>
            <Field label="Key message">
              <input type="text" value={brief.keyMessage}
                onChange={(e) => setBrief({ ...brief, keyMessage: e.target.value })}
                placeholder="Join the fastest growing motorsport brand" style={INPUT_STYLE} disabled={creating} />
            </Field>
            <Field label="Tone">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {['Professional', 'Energetic', 'Editorial', 'Friendly', 'Premium'].map(t => (
                  <button
                    key={t}
                    disabled={creating}
                    onClick={() => setBrief({ ...brief, tone: t })}
                    style={{
                      padding: '6px 14px', borderRadius: 999,
                      fontSize: 12, fontWeight: 600,
                      fontFamily: 'DM Sans, sans-serif',
                      cursor: creating ? 'default' : 'pointer',
                      border: '1px solid ' + (brief.tone === t ? 'var(--green-dark)' : 'var(--border)'),
                      background: brief.tone === t ? 'var(--green-dark)' : 'transparent',
                      color:      brief.tone === t ? '#fff' : 'var(--text)',
                    }}
                  >{t}</button>
                ))}
              </div>
            </Field>
            <Field label="Sections (click to toggle, keep order)">
              <SectionPicker
                value={brief.sections}
                disabled={creating}
                onChange={(next) => setBrief({ ...brief, sections: next })}
              />
            </Field>
            <Field label="Additional context (optional)">
              <textarea
                value={brief.additionalContext}
                onChange={(e) => setBrief({ ...brief, additionalContext: e.target.value })}
                placeholder="Anything specific about the brand, audience, or goal"
                rows={3}
                disabled={creating}
                style={{ ...INPUT_STYLE, resize: 'vertical', lineHeight: 1.5 }}
              />
            </Field>
            <ButtonRow>
              <button onClick={runBriefGenerate} disabled={creating} style={BTN_PRIMARY}>
                {creating ? briefMsg : 'Generate →'}
              </button>
              {!creating && <button onClick={cancelFlow} style={BTN_GHOST}>Cancel</button>}
            </ButtonRow>
            {creating && <SubText>Usually 15–30 seconds.</SubText>}
          </FlowCard>
        )}

        {activeFlow === 'image' && (
          <FlowCard title="📄 Upload Image or PDF" onCancel={!creating ? cancelFlow : null}>
            {!uploadedFile ? (
              <label style={{
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                gap: 10, padding: '36px 20px',
                border: '2px dashed var(--border)',
                borderRadius: 10,
                cursor: creating ? 'default' : 'pointer',
                background: 'var(--surface-inp)',
              }}>
                <div style={{ fontSize: 34 }}>📎</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                  Drop a file here or click to browse
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-mid)' }}>
                  PNG, JPG, or PDF · Max 20 MB
                </div>
                <input
                  type="file" accept="image/*,.pdf" style={{ display: 'none' }}
                  disabled={creating}
                  onChange={(e) => setUploadedFile(e.target.files?.[0] || null)}
                />
              </label>
            ) : (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: 14, border: '1px solid var(--border)',
                borderRadius: 10, background: 'var(--card)',
              }}>
                <div style={{ fontSize: 28 }}>{uploadedFile.type === 'application/pdf' ? '📑' : '🖼'}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {uploadedFile.name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-mid)' }}>
                    {Math.round(uploadedFile.size / 1024).toLocaleString()} KB
                  </div>
                </div>
                {!creating && (
                  <button onClick={() => setUploadedFile(null)} style={BTN_GHOST}>Remove</button>
                )}
              </div>
            )}
            <ButtonRow>
              <button onClick={runImageImport} disabled={!uploadedFile || creating} style={BTN_PRIMARY}>
                {creating ? imageMsg : 'Import →'}
              </button>
              {!creating && <button onClick={cancelFlow} style={BTN_GHOST}>Cancel</button>}
            </ButtonRow>
            {creating && <SubText>Usually 20–40 seconds.</SubText>}
          </FlowCard>
        )}

        {err && (
          <div style={{
            marginTop: 16, padding: '10px 14px', borderRadius: 6,
            fontSize: 13, fontFamily: 'DM Sans, sans-serif',
            color: '#a03030', background: 'rgba(160,48,48,0.08)',
            border: '1px solid rgba(160,48,48,0.25)',
            textAlign: 'center',
          }}>{err}</div>
        )}
      </div>
    </div>
  );
}

function OptionCard({ icon, title, desc, onClick, disabled, loading }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...CARD_STYLE_BASE,
        opacity: disabled ? 0.7 : 1,
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      <div style={{ fontSize: 30, marginBottom: 10 }}>{icon}</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 13, color: 'var(--text-mid)', lineHeight: 1.45 }}>{desc}</div>
      {loading && <div style={{ marginTop: 10, fontSize: 12, color: 'var(--amber)' }}>Creating…</div>}
    </button>
  );
}

function FlowCard({ title, onCancel, children, wide }) {
  return (
    <div style={{
      padding: 28, borderRadius: 14,
      background: 'var(--card)',
      border: '1px solid var(--border)',
      maxWidth: wide ? 720 : 560,
      margin: '0 auto',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>{title}</div>
        {onCancel && (
          <button onClick={onCancel} style={{ ...BTN_GHOST, padding: '4px 10px' }}>Back</button>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>{children}</div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label style={LABEL_STYLE}>{label}</label>
      {children}
    </div>
  );
}
function Row({ children }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>{children}</div>;
}
function ButtonRow({ children }) {
  return <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>{children}</div>;
}
function SubText({ children }) {
  return <div style={{ fontSize: 12, color: 'var(--text-mid)', marginTop: 4, fontFamily: 'DM Sans, sans-serif' }}>{children}</div>;
}

const SECTION_OPTIONS = [
  { key: 'nav',              label: 'Navigation bar' },
  { key: 'hero',             label: 'Hero / banner' },
  { key: 'paragraph',        label: 'Introduction' },
  { key: 'image-full',       label: 'Featured image' },
  { key: 'card-grid',        label: 'Card grid' },
  { key: 'article-grid',     label: 'Article grid' },
  { key: 'stats',            label: 'Stats / numbers' },
  { key: 'testimonial-grid', label: 'Testimonials' },
  { key: 'sponsor-grid',     label: 'Sponsors / partners' },
  { key: 'cta',              label: 'Call to action' },
  { key: 'footer',           label: 'Footer' },
];

function SectionPicker({ value, onChange, disabled }) {
  const toggle = (key) => {
    if (value.includes(key)) onChange(value.filter(k => k !== key));
    else onChange([...value, key]);
  };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
      {SECTION_OPTIONS.map(opt => {
        const on = value.includes(opt.key);
        return (
          <button
            key={opt.key}
            onClick={() => toggle(opt.key)}
            disabled={disabled}
            style={{
              padding: '8px 12px',
              textAlign: 'left',
              borderRadius: 6,
              border: '1px solid ' + (on ? 'var(--green-dark)' : 'var(--border)'),
              background: on ? 'rgba(43,64,48,0.08)' : 'transparent',
              color: on ? 'var(--green-dark)' : 'var(--text-mid)',
              fontSize: 12,
              fontWeight: 600,
              fontFamily: 'DM Sans, sans-serif',
              cursor: disabled ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 8,
            }}
          >
            <span style={{
              display: 'inline-block', width: 14, height: 14, borderRadius: 3,
              border: '1.5px solid ' + (on ? 'var(--green-dark)' : 'var(--border)'),
              background: on ? 'var(--green-dark)' : 'transparent',
              position: 'relative',
              flexShrink: 0,
            }}>
              {on && <span style={{
                position: 'absolute', inset: 0,
                color: '#fff', fontSize: 10, lineHeight: '14px', textAlign: 'center', fontWeight: 700,
              }}>✓</span>}
            </span>
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
