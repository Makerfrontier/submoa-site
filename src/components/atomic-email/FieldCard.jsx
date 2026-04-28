// All five field type cards live here as named exports plus a polymorphic
// FieldCard router that dispatches by field.type. Keeps the surface area small
// while preserving per-type ergonomics.

import { useState, useEffect, useRef } from 'react';

const TYPE_LABELS = {
  headline: 'HEADLINE',
  body: 'BODY',
  image: 'IMAGE',
  link: 'LINK',
  cta: 'CTA',
};

export default function FieldCard({
  field,
  active,
  onChange,
  onFocus,
  onBlur,
  onRegenerateAlt,
  cardRef,
}) {
  const props = { field, onChange, onFocus, onBlur, onRegenerateAlt };
  return (
    <div
      ref={cardRef}
      data-ae-card-id={field.id}
      onMouseEnter={() => onFocus?.(field.id, 'hover')}
      onClick={() => onFocus?.(field.id, 'click')}
      style={{
        background: active ? 'var(--amber-soft)' : 'var(--surface)',
        border: `1px solid ${active ? 'var(--amber)' : 'var(--border)'}`,
        borderRadius: 6,
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        transition: 'background 120ms, border-color 120ms',
      }}
    >
      <div style={badgeRow}>
        <span style={badge}>{TYPE_LABELS[field.type]}</span>
        {field.type === 'headline' && <span style={subBadge}>{field.level}</span>}
        {field.type === 'image' && field.is_data_uri && <span style={{ ...subBadge, color: 'var(--warning)' }}>DATA URI</span>}
        {field.type === 'image' && field.wrapped_in_link && <span style={subBadge}>+ LINK</span>}
      </div>
      {field.type === 'headline' && <HeadlineField {...props} />}
      {field.type === 'body' && <BodyField {...props} />}
      {field.type === 'image' && <ImageField {...props} />}
      {field.type === 'link' && <LinkField {...props} />}
      {field.type === 'cta' && <CTAField {...props} />}
    </div>
  );
}

// ---- Per-type field UIs ----

export function HeadlineField({ field, onChange, onFocus, onBlur }) {
  return (
    <input
      type="text"
      value={field.text}
      placeholder="Headline text"
      onFocus={() => onFocus?.(field.id, 'click')}
      onBlur={() => onBlur?.(field.id)}
      onChange={(e) => onChange({ ...field, text: e.target.value, raw_html: e.target.value })}
      style={inputStyle}
    />
  );
}

export function BodyField({ field, onChange, onFocus, onBlur }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    el.style.height = 'auto'; el.style.height = `${Math.max(64, el.scrollHeight)}px`;
  }, [field.html]);
  return (
    <textarea
      ref={ref}
      value={stripTags(field.html)}
      placeholder="Paragraph text"
      onFocus={() => onFocus?.(field.id, 'click')}
      onBlur={() => onBlur?.(field.id)}
      onChange={(e) => {
        // Naive: replace whole inner with new text, preserving any <br/> the user typed via newline → <br/>
        const next = e.target.value.replace(/\n\s*\n/g, '<br/><br/>').replace(/\n/g, ' ');
        onChange({ ...field, html: next, text_preview: e.target.value.slice(0, 200) });
      }}
      style={{ ...inputStyle, resize: 'vertical', minHeight: 64, fontFamily: 'var(--font-sans)', lineHeight: 1.5 }}
    />
  );
}

export function ImageField({ field, onChange, onFocus, onBlur, onRegenerateAlt }) {
  const [regenStatus, setRegenStatus] = useState('');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <div style={{
          width: 60, height: 60, flexShrink: 0,
          background: 'var(--surface-alt)',
          border: '1px solid var(--border)',
          borderRadius: 4, overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {field.src ? (
            <img src={field.src} alt="" style={{ maxWidth: '100%', maxHeight: '100%' }}
                 onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          ) : (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="var(--ink-light)" strokeWidth="1.2">
              <rect x="2" y="3" width="16" height="14" rx="1.5" />
              <path d="M2 14l5-4 4 3 2-2 5 5" />
            </svg>
          )}
        </div>
        <input
          type="text"
          value={field.src}
          placeholder="https://… image URL"
          onFocus={() => onFocus?.(field.id, 'click')}
          onBlur={() => onBlur?.(field.id)}
          onChange={(e) => onChange({ ...field, src: e.target.value })}
          style={{ ...inputStyle, flex: 1 }}
        />
      </div>
      <div>
        <div style={altLabelRow}>
          <span style={subLabelStyle}>Alt text</span>
          <button
            type="button"
            onClick={async () => {
              setRegenStatus('busy');
              try {
                const alt = await onRegenerateAlt(field);
                if (alt) onChange({ ...field, alt });
                setRegenStatus('');
              } catch (e) {
                setRegenStatus(e.message || 'failed');
                setTimeout(() => setRegenStatus(''), 4000);
              }
            }}
            disabled={regenStatus === 'busy' || !/^https?:\/\//i.test(field.src)}
            title={!/^https?:\/\//i.test(field.src) ? 'Paste a public HTTP(S) URL to regenerate' : 'Generate alt text via Claude vision'}
            style={regenBtn}
          >
            ✦ Regenerate <span style={costStyle}>1 cr</span>
          </button>
        </div>
        <textarea
          rows={2}
          value={field.alt}
          placeholder="Describe the image for screen readers"
          onFocus={() => onFocus?.(field.id, 'click')}
          onBlur={() => onBlur?.(field.id)}
          onChange={(e) => onChange({ ...field, alt: e.target.value })}
          style={{ ...inputStyle, resize: 'vertical', minHeight: 48 }}
        />
        {regenStatus && regenStatus !== 'busy' && (
          <div style={{ marginTop: 4, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--danger)' }}>{regenStatus}</div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <LabeledMini label="Width" value={field.width}
          onChange={v => onChange({ ...field, width: v })} />
        <LabeledMini label="Height" value={field.height}
          onChange={v => onChange({ ...field, height: v })} />
      </div>
      {field.wrapped_in_link && (
        <div>
          <div style={subLabelStyle}>Wrapping link</div>
          <input
            type="text"
            value={field.link_href || ''}
            placeholder="Link href"
            onChange={(e) => onChange({ ...field, link_href: e.target.value })}
            style={inputStyle}
          />
        </div>
      )}
    </div>
  );
}

export function LinkField({ field, onChange, onFocus, onBlur }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <input
        type="text"
        value={field.text}
        placeholder="Anchor text"
        onFocus={() => onFocus?.(field.id, 'click')}
        onBlur={() => onBlur?.(field.id)}
        onChange={(e) => onChange({ ...field, text: e.target.value })}
        style={inputStyle}
      />
      <input
        type="text"
        value={field.href}
        placeholder="https://… or *|MERGE|*"
        onChange={(e) => onChange({ ...field, href: e.target.value })}
        style={inputStyle}
      />
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-mid)' }}>
        <input
          type="checkbox"
          checked={field.target === '_blank'}
          onChange={(e) => onChange({
            ...field,
            target: e.target.checked ? '_blank' : '',
            rel: e.target.checked ? 'noopener' : '',
          })}
        />
        Open in new tab
      </label>
    </div>
  );
}

export function CTAField({ field, onChange, onFocus, onBlur }) {
  const previewStyle = parsePreviewStyle(field.button_style);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <input
        type="text"
        value={field.text}
        placeholder="Button label"
        onFocus={() => onFocus?.(field.id, 'click')}
        onBlur={() => onBlur?.(field.id)}
        onChange={(e) => onChange({ ...field, text: e.target.value })}
        style={inputStyle}
      />
      <input
        type="text"
        value={field.href}
        placeholder="https://…"
        onChange={(e) => onChange({ ...field, href: e.target.value })}
        style={inputStyle}
      />
      <div style={{
        background: 'var(--surface-alt)',
        border: '1px solid var(--border)',
        borderRadius: 4, padding: '10px 12px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{
          background: previewStyle.bg, color: previewStyle.fg,
          padding: '8px 18px', borderRadius: previewStyle.radius,
          fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 500,
        }}>{field.text || 'Button preview'}</span>
      </div>
    </div>
  );
}

// ---- Helpers ----

function LabeledMini({ label, value, onChange }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={subLabelStyle}>{label}</div>
      <input
        type="text"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...inputStyle, padding: '6px 8px', fontSize: 12 }}
      />
    </div>
  );
}

function stripTags(html) { return String(html || '').replace(/<[^>]+>/g, ''); }

function parsePreviewStyle(s) {
  const out = { bg: '#1A1F2E', fg: '#FFFFFF', radius: 4 };
  if (!s) return out;
  const get = (k) => {
    const m = String(s).match(new RegExp(`${k}\\s*:\\s*([^;]+)`, 'i'));
    return m ? m[1].trim() : null;
  };
  const bg = get('background-color') || get('background');
  const fg = get('color');
  const radius = get('border-radius');
  if (bg) out.bg = bg.split(' ')[0];
  if (fg) out.fg = fg;
  if (radius) out.radius = radius;
  return out;
}

const inputStyle = {
  width: '100%', boxSizing: 'border-box',
  padding: '8px 10px',
  background: 'var(--surface-alt)',
  border: '1px solid var(--border-strong)',
  borderRadius: 4,
  fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink)',
  outline: 'none', resize: 'none',
};

const badgeRow = { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' };

const badge = {
  fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.12em',
  textTransform: 'uppercase', color: 'var(--ink-mid)', fontWeight: 500,
  background: 'var(--surface-alt)',
  padding: '2px 6px', borderRadius: 2,
};

const subBadge = {
  fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.12em',
  textTransform: 'uppercase', color: 'var(--ink-light)', fontWeight: 500,
  padding: '2px 6px', borderRadius: 2,
  border: '1px solid var(--border)',
};

const subLabelStyle = {
  fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em',
  textTransform: 'uppercase', color: 'var(--ink-light)', fontWeight: 500,
  marginBottom: 4,
};

const altLabelRow = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 };

const regenBtn = {
  padding: '4px 8px',
  background: 'var(--surface-alt)',
  border: '1px solid var(--border-strong)',
  borderRadius: 3,
  fontFamily: 'var(--font-mono)', fontSize: 10,
  color: 'var(--ink)', cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 6,
};

const costStyle = {
  fontFamily: 'var(--font-mono)', fontSize: 9,
  color: 'var(--ink-light)',
  background: 'var(--bg)', padding: '1px 4px', borderRadius: 2,
};
