// Brand editor surfaced as a tab alongside the block list. Edits here flow
// through onBrandUpdate and re-render every block on the canvas because
// each block render function reads brand.* for its styling.

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

const COLOR_FIELDS = [
  { key: 'primary',    label: 'Primary color' },
  { key: 'secondary',  label: 'Secondary color' },
  { key: 'background', label: 'Background' },
  { key: 'surface',    label: 'Surface / cards' },
  { key: 'text',       label: 'Text color' },
  { key: 'textLight',  label: 'Muted text' },
];

export function BrandPanel({ brand, onBrandUpdate }) {
  const set = (k, v) => onBrandUpdate(k, v);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{
        fontSize: 12, color: 'var(--text-mid)',
        lineHeight: 1.55, padding: 10,
        background: 'var(--bg)', borderRadius: 6,
        fontFamily: 'DM Sans, sans-serif',
      }}>
        Brand edits apply to every block in the canvas instantly.
      </div>

      <div>
        <label style={LABEL_STYLE}>Site name</label>
        <input
          type="text"
          value={brand.siteName || ''}
          onChange={(e) => set('siteName', e.target.value)}
          placeholder="Brand"
          style={INPUT_STYLE}
        />
      </div>

      {COLOR_FIELDS.map(({ key, label }) => (
        <div key={key}>
          <label style={LABEL_STYLE}>{label}</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="color"
              value={/^#[0-9a-f]{6}$/i.test(brand[key] || '') ? brand[key] : '#000000'}
              onChange={(e) => set(key, e.target.value)}
              style={{ width: 36, height: 36, border: 'none', borderRadius: 6, cursor: 'pointer', padding: 0, background: 'transparent' }}
            />
            <input
              type="text"
              value={brand[key] || ''}
              onChange={(e) => set(key, e.target.value)}
              placeholder="#000000"
              style={{ ...INPUT_STYLE, flex: 1 }}
            />
          </div>
        </div>
      ))}

      <div>
        <label style={LABEL_STYLE}>Heading font</label>
        <input
          type="text"
          value={brand.headingFont || ''}
          onChange={(e) => set('headingFont', e.target.value)}
          placeholder='Georgia, serif'
          style={INPUT_STYLE}
        />
      </div>

      <div>
        <label style={LABEL_STYLE}>Body font</label>
        <input
          type="text"
          value={brand.bodyFont || ''}
          onChange={(e) => set('bodyFont', e.target.value)}
          placeholder='system-ui, sans-serif'
          style={INPUT_STYLE}
        />
      </div>

      <div>
        <label style={LABEL_STYLE}>Logo URL</label>
        <input
          type="text"
          value={brand.logoUrl || ''}
          onChange={(e) => set('logoUrl', e.target.value)}
          placeholder="https://…"
          style={INPUT_STYLE}
        />
        {brand.logoUrl && (
          <img
            src={brand.logoUrl}
            alt=""
            style={{
              marginTop: 8, maxHeight: 48, objectFit: 'contain',
              background: 'var(--bg)', padding: 8, borderRadius: 6,
              border: '1px solid var(--border)',
            }}
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        )}
      </div>
    </div>
  );
}
