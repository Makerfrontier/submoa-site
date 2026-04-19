// Admin Features — living spec cards for every platform feature.
// Route: /admin/features

import { useState, useEffect, useMemo } from 'react';

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

const eyebrowStyle = {
  fontFamily: 'DM Sans', fontWeight: 600, fontSize: 11, lineHeight: 1.2,
  letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--amber)',
};

const statusColor = (s) => s === 'active' ? 'var(--green)' : s === 'planned' ? 'var(--amber)' : 'var(--leather-dark)';

export default function AdminFeatures() {
  const [features, setFeatures] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [filter, setFilter] = useState({ status: '', sort: 'name' });
  const [open, setOpen] = useState({ filters: true, list: true, downloads: false, actions: false });
  const [toast, setToast] = useState('');
  const [dirty, setDirty] = useState(false);

  const loadList = async () => {
    const d = await api('/api/admin/features');
    setFeatures(d.features || []);
  };
  const loadDetail = async (slug) => {
    const d = await api(`/api/admin/features/${slug}`);
    setDetail(d);
    setDirty(false);
  };

  useEffect(() => { loadList().catch(e => setToast(e.message)); }, []);
  useEffect(() => { if (selected) loadDetail(selected).catch(e => setToast(e.message)); }, [selected]);

  const sorted = useMemo(() => {
    let list = features;
    if (filter.status) list = list.filter(f => f.status === filter.status);
    list = [...list].sort((a, b) =>
      filter.sort === 'name' ? a.name.localeCompare(b.name) : (b.last_updated || 0) - (a.last_updated || 0)
    );
    return list;
  }, [features, filter]);

  const seedAll = async () => {
    try {
      const r = await api('/api/admin/features/seed-all', { method: 'POST' });
      setToast(`Seeded: ${r.inserted} new, ${r.skipped} existing`);
      await loadList();
      setTimeout(() => setToast(''), 3000);
    } catch (e) { setToast(e.message); }
  };

  const downloadStateMd = async () => {
    window.open('/api/admin/features/state-md', '_blank');
  };
  const downloadBugsMd = async () => {
    window.open('/api/admin/features/bugs-md', '_blank');
  };
  const copyStateToClipboard = async () => {
    const r = await fetch('/api/admin/features/state-md', { credentials: 'include' });
    const md = await r.text();
    await navigator.clipboard.writeText(md);
    setToast('State.md copied to clipboard');
    setTimeout(() => setToast(''), 2500);
  };

  const patchDetail = (field, value) => {
    setDetail(d => ({ ...d, feature: { ...d.feature, [field]: value } }));
    setDirty(true);
  };

  const saveDetail = async () => {
    if (!detail) return;
    const f = detail.feature;
    try {
      await api(`/api/admin/features/${f.slug}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: f.name, status: f.status,
          what_it_does: f.what_it_does, how_its_built: f.how_its_built, behavior: f.behavior,
          pending: f.pending, source_files: f.source_files, db_tables: f.db_tables,
          r2_paths: f.r2_paths, endpoints: f.endpoints, external_apis: f.external_apis,
        }),
      });
      setToast('Saved');
      setDirty(false);
      await loadList();
      await loadDetail(f.slug);
      setTimeout(() => setToast(''), 2000);
    } catch (e) { setToast(e.message); }
  };

  const closeBug = async (bugId) => {
    if (!confirm('Close this bug?')) return;
    try {
      await api(`/api/admin/bugs/${bugId}/close`, { method: 'POST', body: JSON.stringify({ notes: 'Closed from feature spec' }) });
      await loadDetail(selected);
    } catch (e) { setToast(e.message); }
  };

  return (
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 60px)', background: 'var(--bg)' }}>
      {/* LEFT */}
      <div style={{ width: 360, flexShrink: 0, borderRight: '1px solid var(--border)', background: 'var(--card)', padding: '24px 20px', overflowY: 'auto', maxHeight: 'calc(100vh - 60px)' }}>
        <div style={eyebrowStyle}>✦ FEATURES</div>
        <h1 style={{ fontFamily: 'Playfair Display', fontSize: 40, fontWeight: 600, lineHeight: 1.15, letterSpacing: '-0.015em', color: 'var(--green-dark)', margin: '6px 0 20px' }}>
          Feature specs
        </h1>

        <AccordionSection label="FILTERS" open={open.filters} onToggle={() => setOpen(o => ({ ...o, filters: !o.filters }))}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <LabeledSelect label="status" value={filter.status} onChange={v => setFilter(f => ({ ...f, status: v }))} options={[['','all'],['active','active'],['planned','planned'],['deprecated','deprecated']]} />
            <LabeledSelect label="sort" value={filter.sort} onChange={v => setFilter(f => ({ ...f, sort: v }))} options={[['name','name'],['last_updated','recent']]} />
          </div>
        </AccordionSection>

        <AccordionSection label={`FEATURES (${sorted.length})`} open={open.list} onToggle={() => setOpen(o => ({ ...o, list: !o.list }))}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {sorted.map(f => (
              <button
                key={f.slug}
                onClick={() => setSelected(f.slug)}
                style={{
                  textAlign: 'left', padding: '8px 10px', border: selected === f.slug ? '1px solid var(--green)' : '1px solid var(--border-light)',
                  background: selected === f.slug ? 'var(--green-glow)' : 'var(--card)',
                  cursor: 'pointer', borderRadius: 4, display: 'flex', flexDirection: 'column', gap: 2,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{f.name}</span>
                  <span style={{ fontFamily: 'DM Sans', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: statusColor(f.status) }}>{f.status}</span>
                </div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--text-mid)' }}>
                  {f.open_bugs > 0 && <span style={{ color: 'var(--error)', fontWeight: 600 }}>{f.open_bugs} bug{f.open_bugs > 1 ? 's' : ''} · </span>}
                  {f.last_updated ? new Date(f.last_updated * 1000).toLocaleDateString() : 'never'}
                </div>
              </button>
            ))}
          </div>
        </AccordionSection>

        <AccordionSection label="DOWNLOADS" open={open.downloads} onToggle={() => setOpen(o => ({ ...o, downloads: !o.downloads }))}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button onClick={downloadStateMd} style={secondaryBtnStyle}>Download State.md</button>
            <button onClick={downloadBugsMd} style={secondaryBtnStyle}>Download Bugs.md</button>
            <button onClick={copyStateToClipboard} style={secondaryBtnStyle}>Copy State to clipboard</button>
          </div>
        </AccordionSection>

        <AccordionSection label="ACTIONS" open={open.actions} onToggle={() => setOpen(o => ({ ...o, actions: !o.actions }))}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button onClick={seedAll} style={secondaryBtnStyle}>Re-seed all feature specs</button>
          </div>
        </AccordionSection>

        {toast && <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--amber)', color: 'var(--card)', fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, borderRadius: 4 }}>{toast}</div>}
      </div>

      {/* RIGHT */}
      <div style={{ flex: 1, padding: 40, overflowY: 'auto', maxHeight: 'calc(100vh - 60px)' }}>
        {!detail && <div style={{ color: 'var(--text-mid)', fontFamily: 'DM Sans' }}>Select a feature on the left.</div>}
        {detail && <FeatureDetail detail={detail} onChange={patchDetail} onSave={saveDetail} dirty={dirty} onCloseBug={closeBug} />}
      </div>
    </div>
  );
}

function FeatureDetail({ detail, onChange, onSave, dirty, onCloseBug }) {
  const f = detail.feature;
  const bugs = detail.bugs || [];
  const openBugs = bugs.filter(b => b.status === 'open');

  const listField = (key) => (
    <textarea
      value={(f[key] || []).join('\n')}
      onChange={e => onChange(key, e.target.value.split('\n').filter(l => l.trim()))}
      rows={Math.max(3, (f[key] || []).length + 1)}
      style={textareaStyle}
      placeholder="one per line"
    />
  );

  return (
    <div style={{ maxWidth: 820, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <h1 style={{ fontFamily: 'Playfair Display', fontSize: 40, fontWeight: 600, lineHeight: 1.15, letterSpacing: '-0.015em', color: 'var(--green-dark)', margin: 0 }}>{f.name}</h1>
        <span style={{ fontFamily: 'DM Sans', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: statusColor(f.status), border: `1px solid ${statusColor(f.status)}`, padding: '2px 6px', borderRadius: 3 }}>{f.status}</span>
      </div>
      <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text-mid)' }}>
        slug: <code>{f.slug}</code> · last updated {f.last_updated ? new Date(f.last_updated * 1000).toLocaleString() : '—'} by {f.last_updated_by || '—'}
      </div>

      <div>
        <Label>Status</Label>
        <select value={f.status} onChange={e => onChange('status', e.target.value)} style={{ ...textareaStyle, height: 'auto' }}>
          <option value="active">active</option>
          <option value="planned">planned</option>
          <option value="deprecated">deprecated</option>
        </select>
      </div>

      <Section label="What it does">
        <textarea value={f.what_it_does || ''} onChange={e => onChange('what_it_does', e.target.value)} rows={3} style={textareaStyle} />
      </Section>
      <Section label="How it's built">
        <textarea value={f.how_its_built || ''} onChange={e => onChange('how_its_built', e.target.value)} rows={6} style={textareaStyle} />
      </Section>
      <Section label="Behavior">
        <textarea value={f.behavior || ''} onChange={e => onChange('behavior', e.target.value)} rows={4} style={textareaStyle} />
      </Section>
      <Section label="Source files">{listField('source_files')}</Section>
      <Section label="DB tables">{listField('db_tables')}</Section>
      <Section label="R2 paths">{listField('r2_paths')}</Section>
      <Section label="Endpoints">{listField('endpoints')}</Section>
      <Section label="External APIs">{listField('external_apis')}</Section>

      <Section label={`Known Issues (${openBugs.length} open)`}>
        {openBugs.length === 0 && <div style={{ color: 'var(--text-mid)', fontFamily: 'DM Sans', fontSize: 13 }}>No open bugs.</div>}
        {openBugs.map(b => (
          <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--border-light)' }}>
            <span style={{ fontFamily: 'DM Sans', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: b.severity === 'blocker' ? 'var(--error)' : b.severity === 'major' ? 'var(--warning)' : 'var(--text-mid)', border: '1px solid currentColor', padding: '1px 6px', borderRadius: 3 }}>{b.severity}</span>
            <span style={{ fontFamily: 'DM Sans', fontSize: 13, flex: 1, color: 'var(--text)' }}>{b.title}</span>
            <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--text-light)' }}>{new Date(b.opened_at * 1000).toLocaleDateString()}</span>
            <button onClick={() => onCloseBug(b.id)} style={resetBtnStyle}>close</button>
          </div>
        ))}
      </Section>

      <Section label="Pending">{listField('pending')}</Section>

      <div style={{ display: 'flex', gap: 10, padding: '16px 0', borderTop: '1px solid var(--border)' }}>
        <button onClick={onSave} disabled={!dirty} style={{ ...primaryBtnStyle, opacity: dirty ? 1 : 0.5 }}>{dirty ? 'Save' : 'Saved'}</button>
      </div>
    </div>
  );
}

function Section({ label, children }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
    </div>
  );
}
function Label({ children }) {
  return <div style={{ fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>{children}</div>;
}

function AccordionSection({ label, open, onToggle, children }) {
  return (
    <div style={{ marginBottom: 12, border: '1px solid var(--border-light)', borderRadius: 6, overflow: 'hidden', background: 'var(--card)' }}>
      <button onClick={onToggle} style={{ width: '100%', padding: '10px 14px', border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', ...eyebrowStyle }}>
        <span>{label}</span><span style={{ color: 'var(--text-mid)', fontSize: 14 }}>{open ? '−' : '+'}</span>
      </button>
      {open && <div style={{ padding: 12, borderTop: '1px solid var(--border-light)' }}>{children}</div>}
    </div>
  );
}

function LabeledSelect({ label, value, onChange, options }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-mid)', fontFamily: 'DM Sans', fontWeight: 600 }}>{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)} style={{ padding: '4px 6px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontFamily: 'DM Sans', fontSize: 12 }}>
        {options.map(o => Array.isArray(o) ? <option key={o[0]} value={o[0]}>{o[1]}</option> : <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

const textareaStyle = {
  width: '100%', padding: '8px 10px', border: '1px solid var(--border)', background: 'var(--card)',
  color: 'var(--text)', fontFamily: 'DM Sans', fontSize: 14, lineHeight: 1.5, borderRadius: 4, resize: 'vertical',
};
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
