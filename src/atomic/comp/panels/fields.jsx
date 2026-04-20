// Field editor components for the Atomic Comp edit panel.
// One FieldEditor dispatches to the right sub-component based on field.type.

import { useState, useEffect } from 'react';

const INPUT_STYLE = {
  width: '100%',
  background: 'var(--surface-inp)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: '8px 10px',
  fontSize: 13,
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

function TextField({ fieldDef, value, onChange }) {
  return (
    <div>
      <label style={LABEL_STYLE}>{fieldDef.label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={fieldDef.placeholder || ''}
        maxLength={fieldDef.maxLength}
        style={INPUT_STYLE}
      />
    </div>
  );
}

function RichTextField({ fieldDef, value, onChange }) {
  return (
    <div>
      <label style={LABEL_STYLE}>{fieldDef.label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={fieldDef.placeholder || ''}
        rows={4}
        style={{ ...INPUT_STYLE, resize: 'vertical', lineHeight: 1.5 }}
      />
    </div>
  );
}

function UrlField({ fieldDef, value, onChange }) {
  return (
    <div>
      <label style={LABEL_STYLE}>{fieldDef.label}</label>
      <input
        type="url"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={fieldDef.placeholder || 'https://...'}
        style={INPUT_STYLE}
      />
    </div>
  );
}

function ImageField({ fieldDef, value, onChange }) {
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState('');

  const handleFile = async (file) => {
    if (!file) return;
    setUploading(true); setErr('');
    try {
      // Fix 0: upload to R2 via /api/atomic/comp/upload-image instead of
      // inlining base64 into blocks_json (which blew the D1 row limit
      // after a handful of images).
      const form = new FormData();
      form.append('image', file);
      const res = await fetch('/api/atomic/comp/upload-image', {
        method: 'POST', credentials: 'include', body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.url) throw new Error(data?.error || `HTTP ${res.status}`);
      onChange(data.url);
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <label style={LABEL_STYLE}>{fieldDef.label}</label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://..."
          style={{ ...INPUT_STYLE, flex: 1 }}
        />
        {value && (
          <img
            src={value}
            alt=""
            style={{
              width: 48, height: 48, objectFit: 'cover',
              borderRadius: 6, border: '1px solid var(--border)', flexShrink: 0,
            }}
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        )}
      </div>
      <label style={{
        display: 'inline-block', marginTop: 8, fontSize: 11,
        color: uploading ? 'var(--text-mid)' : 'var(--amber)',
        cursor: uploading ? 'default' : 'pointer',
        fontFamily: 'DM Sans, sans-serif', fontWeight: 500,
      }}>
        {uploading ? 'Uploading…' : 'Upload file'}
        <input
          type="file" accept="image/*" style={{ display: 'none' }}
          disabled={uploading}
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </label>
      {err && <div style={{ fontSize: 11, color: '#a03030', marginTop: 4 }}>{err}</div>}
    </div>
  );
}

function ColorField({ fieldDef, value, onChange, brand }) {
  const swatches = brand
    ? [brand.primary, brand.secondary, brand.background, brand.surface, brand.text].filter(Boolean)
    : [];
  return (
    <div>
      <label style={LABEL_STYLE}>{fieldDef.label}</label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          type="color"
          value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: 36, height: 36, border: 'none', borderRadius: 6, cursor: 'pointer', padding: 0, background: 'transparent' }}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#000000"
          style={{ ...INPUT_STYLE, flex: 1 }}
        />
      </div>
      {swatches.length > 0 && (
        <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
          {swatches.map((c, i) => (
            <button
              key={i}
              onClick={() => onChange(c)}
              title={c}
              style={{
                width: 20, height: 20, borderRadius: 4, background: c,
                border: '1px solid rgba(0,0,0,0.15)', cursor: 'pointer', padding: 0,
              }}
            />
          ))}
          <button
            onClick={() => onChange('')}
            title="Clear"
            style={{
              width: 20, height: 20, borderRadius: 4,
              background: 'repeating-linear-gradient(45deg,#ddd 0 4px,#fff 4px 8px)',
              border: '1px solid rgba(0,0,0,0.15)', cursor: 'pointer', padding: 0,
            }}
          />
        </div>
      )}
    </div>
  );
}

function SelectField({ fieldDef, value, onChange }) {
  return (
    <div>
      <label style={LABEL_STYLE}>{fieldDef.label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...INPUT_STYLE, cursor: 'pointer' }}
      >
        {(fieldDef.options || []).map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    </div>
  );
}

function BooleanField({ fieldDef, value, onChange }) {
  const id = 'acs-bool-' + fieldDef.key;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <input
        id={id}
        type="checkbox"
        checked={value === 'true' || value === true}
        onChange={(e) => onChange(e.target.checked ? 'true' : 'false')}
        style={{ width: 16, height: 16 }}
      />
      <label htmlFor={id} style={{
        fontSize: 13, color: 'var(--text)',
        fontFamily: 'DM Sans, sans-serif', cursor: 'pointer',
      }}>{fieldDef.label}</label>
    </div>
  );
}

export function FieldEditor({ fieldDef, value, brand, onChange }) {
  // Debounced local state so typing doesn't re-render the whole canvas per keystroke.
  // Parent state still updates; the debounce just batches the last value.
  const [local, setLocal] = useState(value ?? '');
  useEffect(() => { setLocal(value ?? ''); }, [value]);

  const commit = (v) => {
    setLocal(v);
    onChange(v);
  };

  const props = { fieldDef, value: local, onChange: commit, brand };
  switch (fieldDef.type) {
    case 'text':     return <TextField {...props} />;
    case 'richtext': return <RichTextField {...props} />;
    case 'url':      return <UrlField {...props} />;
    case 'image':    return <ImageField {...props} />;
    case 'color':    return <ColorField {...props} />;
    case 'select':   return <SelectField {...props} />;
    case 'boolean':  return <BooleanField {...props} />;
    default:         return <TextField {...props} />;
  }
}
