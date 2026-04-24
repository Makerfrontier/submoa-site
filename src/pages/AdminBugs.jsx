// Admin Bugs — platform-wide bug log.
// Route: /admin/bugs

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

const severityColor = (s) => s === 'blocker' ? 'var(--error)' : s === 'major' ? 'var(--warning)' : 'var(--text-mid)';

export default function AdminBugs() {
  const [bugs, setBugs] = useState([]);
  const [features, setFeatures] = useState([]);
  const [filter, setFilter] = useState({ feature_slug: '', severity: '', status: 'open', q: '' });
  const [expanded, setExpanded] = useState(null);
  const [view, setView] = useState('flat'); // 'flat' | 'by-feature'
  const [open, setOpen] = useState({ filters: true, view: false, downloads: false });
  const [toast, setToast] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [packageModal, setPackageModal] = useState(null); // { prompt_text, task_id, title }
  const [packaging, setPackaging] = useState(false);

  const load = async () => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filter)) if (v) params.set(k, v);
    const d = await api(`/api/admin/bugs?${params}`);
    setBugs(d.bugs || []);
  };
  useEffect(() => { load().catch(e => setToast(e.message)); }, [filter]);
  useEffect(() => {
    api('/api/admin/features').then(d => setFeatures(d.features || [])).catch(() => {});
  }, []);

  const closeBug = async (id, notes) => {
    try {
      await api(`/api/admin/bugs/${id}/close`, { method: 'POST', body: JSON.stringify({ notes: notes || 'Closed from admin' }) });
      await load();
      setToast('Bug closed');
      setTimeout(() => setToast(''), 2000);
    } catch (e) { setToast(e.message); }
  };
  const reopenBug = async (id) => {
    try {
      await api(`/api/admin/bugs/${id}/reopen`, { method: 'POST' });
      await load();
    } catch (e) { setToast(e.message); }
  };
  const patchBug = async (id, patch) => {
    try {
      await api(`/api/admin/bugs/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
      await load();
    } catch (e) { setToast(e.message); }
  };

  const grouped = useMemo(() => {
    if (view !== 'by-feature') return null;
    const out = {};
    for (const b of bugs) (out[b.feature_slug] ||= []).push(b);
    return out;
  }, [bugs, view]);

  const toggleSelect = (id) => {
    setSelected(s => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };
  const selectAll = () => setSelected(new Set(bugs.map(b => b.id)));
  const selectNone = () => setSelected(new Set());

  const packageForClaude = async () => {
    if (selected.size === 0) return;
    const defaultTitle = `Bug fixes — ${selected.size} bug${selected.size === 1 ? '' : 's'}`;
    const title = prompt('Task title:', defaultTitle);
    if (title === null) return;
    setPackaging(true);
    try {
      const res = await fetch('/api/admin/bugs/package', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bug_ids: [...selected], task_title: title || defaultTitle }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || 'Package failed');
      setPackageModal({ prompt_text: d.prompt_text, task_id: d.task_id, title: title || defaultTitle });
    } catch (e) {
      setToast(e.message);
    } finally {
      setPackaging(false);
    }
  };

  const copyPromptToClipboard = async () => {
    if (!packageModal) return;
    try {
      await navigator.clipboard.writeText(packageModal.prompt_text);
      setToast('Prompt copied');
      setTimeout(() => setToast(''), 2000);
    } catch {
      setToast('Copy failed');
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 60px)', background: 'var(--bg)' }}>
      {/* LEFT */}
      <div style={{ width: 340, flexShrink: 0, borderRight: '1px solid var(--border)', background: 'var(--card)', padding: '24px 20px', overflowY: 'auto', maxHeight: 'calc(100vh - 60px)' }}>
        <div style={eyebrowStyle}>✦ BUG LOG</div>
        <h1 style={{ fontFamily: 'var(--font-sans)', fontSize: 28, fontWeight: 500, lineHeight: 1.2, letterSpacing: '-0.01em', color: 'var(--ink)', margin: '6px 0 20px' }}>
          Bugs
        </h1>

        <AccordionSection label="FILTERS" open={open.filters} onToggle={() => setOpen(o => ({ ...o, filters: !o.filters }))}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <LabeledSelect label="feature" value={filter.feature_slug} onChange={v => setFilter(f => ({ ...f, feature_slug: v }))}
              options={[['','all'], ...features.map(f => [f.slug, f.name])]} />
            <LabeledSelect label="severity" value={filter.severity} onChange={v => setFilter(f => ({ ...f, severity: v }))}
              options={[['','all'],['blocker','blocker'],['major','major'],['minor','minor']]} />
            <LabeledSelect label="status" value={filter.status} onChange={v => setFilter(f => ({ ...f, status: v }))}
              options={[['','all'],['open','open'],['closed','closed']]} />
            <LabeledInput label="search" value={filter.q} onChange={v => setFilter(f => ({ ...f, q: v }))} />
          </div>
        </AccordionSection>

        <AccordionSection label="VIEW" open={open.view} onToggle={() => setOpen(o => ({ ...o, view: !o.view }))}>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setView('flat')} style={view === 'flat' ? primaryBtnStyle : secondaryBtnStyle}>Flat</button>
            <button onClick={() => setView('by-feature')} style={view === 'by-feature' ? primaryBtnStyle : secondaryBtnStyle}>By feature</button>
          </div>
        </AccordionSection>

        <AccordionSection label="PACKAGE" open={open.downloads} onToggle={() => setOpen(o => ({ ...o, downloads: !o.downloads }))}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button
              onClick={packageForClaude}
              disabled={selected.size === 0 || packaging}
              title={selected.size === 0 ? 'Select bugs to package.' : ''}
              style={{ ...primaryBtnStyle, opacity: selected.size === 0 || packaging ? 0.5 : 1 }}
            >
              {packaging ? 'Packaging…' : `Package for Claude Code${selected.size ? ` (${selected.size})` : ''}`}
            </button>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={selectAll} style={{ ...secondaryBtnStyle, flex: 1 }}>Select all</button>
              <button onClick={selectNone} style={{ ...secondaryBtnStyle, flex: 1 }}>Select none</button>
            </div>
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border-light)' }}>
              <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'var(--text-mid)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Download raw (audit)</div>
              <button onClick={() => window.open('/api/admin/features/bugs-md', '_blank')} style={{ ...secondaryBtnStyle, width: '100%', marginBottom: 4 }}>Bugs.md (open only)</button>
              <button onClick={() => window.open('/api/admin/features/bugs-md?include_closed=1', '_blank')} style={{ ...secondaryBtnStyle, width: '100%' }}>Bugs.md (incl. closed)</button>
            </div>
          </div>
        </AccordionSection>

        {toast && <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--amber)', color: 'var(--card)', fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, borderRadius: 4 }}>{toast}</div>}

        <div style={{ marginTop: 20, fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text-mid)' }}>
          {bugs.length} bug{bugs.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* RIGHT */}
      <div style={{ flex: 1, padding: 40, overflowY: 'auto', maxHeight: 'calc(100vh - 60px)' }}>
        <div style={{ maxWidth: 1000, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {bugs.length === 0 && <div style={{ color: 'var(--text-mid)', fontFamily: 'DM Sans' }}>No bugs match.</div>}

          {view === 'flat' && bugs.map(b => (
            <BugRow key={b.id} bug={b} expanded={expanded === b.id} features={features}
              selected={selected.has(b.id)} onToggleSelect={() => toggleSelect(b.id)}
              onExpand={() => setExpanded(e => e === b.id ? null : b.id)}
              onClose={(notes) => closeBug(b.id, notes)}
              onReopen={() => reopenBug(b.id)}
              onPatch={(p) => patchBug(b.id, p)}
            />
          ))}

          {view === 'by-feature' && grouped && Object.entries(grouped).map(([slug, list]) => (
            <div key={slug} style={{ marginBottom: 12 }}>
              <div style={{ ...eyebrowStyle, marginBottom: 6 }}>{slug} ({list.length})</div>
              {list.map(b => (
                <BugRow key={b.id} bug={b} expanded={expanded === b.id} features={features}
                  selected={selected.has(b.id)} onToggleSelect={() => toggleSelect(b.id)}
                  onExpand={() => setExpanded(e => e === b.id ? null : b.id)}
                  onClose={(notes) => closeBug(b.id, notes)}
                  onReopen={() => reopenBug(b.id)}
                  onPatch={(p) => patchBug(b.id, p)}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {packageModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(34,26,16,0.65)', zIndex: 950, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => setPackageModal(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, maxWidth: 900, width: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ ...eyebrowStyle }}>CLAUDE CODE PROMPT</div>
                <div style={{ fontFamily: 'var(--font-sans)', fontSize: 22, fontWeight: 500, color: 'var(--ink)', marginTop: 4 }}>{packageModal.title}</div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--text-mid)', marginTop: 2 }}>Task #{packageModal.task_id.slice(0, 8)}</div>
              </div>
              <button onClick={() => setPackageModal(null)} aria-label="Close" style={{ fontSize: 20, padding: '4px 10px', background: 'transparent', border: 'none', color: 'var(--text-mid)', cursor: 'pointer', fontFamily: 'DM Sans' }}>×</button>
            </div>
            <textarea readOnly value={packageModal.prompt_text}
              style={{ flex: 1, minHeight: 400, padding: 16, border: 'none', background: 'var(--surface-inp)', fontFamily: 'ui-monospace, SF Mono, Menlo', fontSize: 12, color: 'var(--text)', resize: 'none', outline: 'none' }} />
            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setPackageModal(null)} style={secondaryBtnStyle}>Close</button>
              <button onClick={copyPromptToClipboard} style={secondaryBtnStyle}>Copy to Clipboard</button>
              <button onClick={async () => { await copyPromptToClipboard(); setToast(`Task queued · #${packageModal.task_id.slice(0, 8)}`); setPackageModal(null); setTimeout(() => setToast(''), 3500); }} style={primaryBtnStyle}>Send to Claude Code</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BugRow({ bug, expanded, onExpand, onClose, onReopen, onPatch, features, selected, onToggleSelect }) {
  const [notes, setNotes] = useState(bug.notes || '');
  return (
    <div style={{ border: selected ? '1px solid var(--amber)' : '1px solid var(--border-light)', borderRadius: 6, background: 'var(--card)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}>
        <input type="checkbox" checked={!!selected} onChange={onToggleSelect}
          onClick={e => e.stopPropagation()}
          aria-label={`Select bug: ${bug.title}`}
          style={{ margin: 0, cursor: 'pointer', accentColor: 'var(--amber)' }} />
        <div onClick={onExpand} style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, cursor: 'pointer' }}>
        <span style={{ fontFamily: 'DM Sans', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: severityColor(bug.severity), border: '1px solid currentColor', padding: '2px 8px', borderRadius: 3 }}>{bug.severity}</span>
        <span style={{ fontFamily: 'DM Sans', fontSize: 14, fontWeight: 600, color: 'var(--text)', flex: 1 }}>{bug.title}</span>
        <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--text-mid)' }}>{bug.feature_slug}</span>
        <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: bug.status === 'open' ? 'var(--error)' : 'var(--success)' }}>{bug.status}</span>
        <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--text-light)' }}>{new Date(bug.opened_at * 1000).toLocaleDateString()}</span>
        </div>
      </div>
      {expanded && (
        <div style={{ padding: 14, borderTop: '1px solid var(--border-light)', background: 'var(--surface-inp)' }}>
          <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text)', whiteSpace: 'pre-wrap', marginBottom: 10 }}>{bug.description || <em style={{ color: 'var(--text-light)' }}>(no description)</em>}</div>
          {bug.expected && <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text-mid)', marginBottom: 10 }}><strong>Expected:</strong> {bug.expected}</div>}
          {bug.logged_from_url && <div style={{ fontFamily: 'DM Sans', fontSize: 12, marginBottom: 10 }}><a href={bug.logged_from_url} style={{ color: 'var(--green-dark)' }}>{bug.logged_from_url}</a></div>}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
            <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-mid)', fontFamily: 'DM Sans', fontWeight: 600 }}>notes</span>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ padding: '6px 8px', border: '1px solid var(--border)', background: 'var(--card)', fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text)' }} />
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {bug.status === 'open'
              ? <button onClick={() => onClose(notes)} style={primaryBtnStyle}>Close</button>
              : <button onClick={onReopen} style={secondaryBtnStyle}>Reopen</button>}
            <button onClick={() => onPatch({ notes })} style={secondaryBtnStyle}>Save notes</button>
            <select value={bug.severity} onChange={e => onPatch({ severity: e.target.value })} style={{ padding: '6px 8px', border: '1px solid var(--border)', fontFamily: 'DM Sans', fontSize: 12 }}>
              <option value="blocker">blocker</option>
              <option value="major">major</option>
              <option value="minor">minor</option>
            </select>
            <select value={bug.feature_slug} onChange={e => onPatch({ feature_slug: e.target.value })} style={{ padding: '6px 8px', border: '1px solid var(--border)', fontFamily: 'DM Sans', fontSize: 12 }}>
              {features.map(f => <option key={f.slug} value={f.slug}>{f.name}</option>)}
            </select>
          </div>
        </div>
      )}
    </div>
  );
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

function LabeledInput({ label, value, onChange }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-mid)', fontFamily: 'DM Sans', fontWeight: 600 }}>{label}</span>
      <input value={value} onChange={e => onChange(e.target.value)} style={{ padding: '4px 6px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontFamily: 'DM Sans', fontSize: 12 }} />
    </label>
  );
}

const primaryBtnStyle = {
  padding: '8px 14px', background: 'var(--amber)', color: 'var(--card)', border: 'none',
  fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13, cursor: 'pointer', borderRadius: 4,
};
const secondaryBtnStyle = {
  padding: '8px 12px', background: 'var(--card)', color: 'var(--text)', border: '1px solid var(--border)',
  fontFamily: 'DM Sans', fontWeight: 500, fontSize: 13, cursor: 'pointer', borderRadius: 4,
};
