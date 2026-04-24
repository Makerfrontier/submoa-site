// AdminHosts — reusable persona library for the Podcast Studio.
// Route: /admin/hosts

import { useState, useEffect, useMemo, useRef } from 'react';
import { XAI_VOICES } from '../xai-tts';

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

// Voice → accent color (keeps avatars visually distinct without needing images)
const VOICE_COLORS = {
  eve: '#C8582A', ara: '#B8872E', rex: '#2B4030', sal: '#2A5A6A', leo: '#3A2410',
};

export default function AdminHosts() {
  const [hosts, setHosts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [filter, setFilter] = useState({ search: '', voice: '', tag: '' });
  const [open, setOpen] = useState({ filters: true, list: true, create: false });
  const [toast, setToast] = useState('');
  const seedAttempted = useRef(false);

  const loadList = async () => {
    const d = await api('/api/admin/hosts');
    setHosts(d.hosts || []);
    return d.hosts || [];
  };

  // Auto-seed starters on first visit if account has zero hosts
  useEffect(() => {
    (async () => {
      try {
        const list = await loadList();
        if (list.length === 0 && !seedAttempted.current) {
          seedAttempted.current = true;
          await api('/api/admin/hosts/seed-starters', { method: 'POST' });
          await loadList();
        }
      } catch (e) { setToast(e.message); }
    })();
  }, []);

  useEffect(() => {
    if (!selected) return;
    api(`/api/admin/hosts/${selected}`).then(d => { setDetail(d.host); setDirty(false); }).catch(e => setToast(e.message));
  }, [selected]);

  const filtered = useMemo(() => {
    let list = hosts;
    if (filter.search) list = list.filter(h => h.name.toLowerCase().includes(filter.search.toLowerCase()));
    if (filter.voice) list = list.filter(h => h.voice_id === filter.voice);
    if (filter.tag) list = list.filter(h => (h.tags || []).includes(filter.tag));
    return list;
  }, [hosts, filter]);

  const allTags = useMemo(() => {
    const s = new Set();
    for (const h of hosts) for (const t of (h.tags || [])) s.add(t);
    return [...s].sort();
  }, [hosts]);

  const createHost = async () => {
    try {
      const r = await api('/api/admin/hosts', { method: 'POST', body: JSON.stringify({ name: 'New Host', voice_id: 'eve' }) });
      await loadList();
      setSelected(r.id);
    } catch (e) { setToast(e.message); }
  };

  const patchDetail = (field, value) => { setDetail(d => ({ ...d, [field]: value })); setDirty(true); };

  const saveDetail = async () => {
    if (!detail) return;
    try {
      await api(`/api/admin/hosts/${detail.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: detail.name, tagline: detail.tagline, voice_id: detail.voice_id,
          personality: detail.personality, recurring_viewpoint: detail.recurring_viewpoint,
          vocal_direction: detail.vocal_direction,
          catchphrases: detail.catchphrases || [], tags: detail.tags || [],
        }),
      });
      setToast('Saved');
      setDirty(false);
      await loadList();
      setTimeout(() => setToast(''), 2000);
    } catch (e) { setToast(e.message); }
  };

  const deleteHost = async () => {
    if (!detail) return;
    if (!confirm(`Delete host "${detail.name}"?`)) return;
    try {
      await api(`/api/admin/hosts/${detail.id}`, { method: 'DELETE' });
      setSelected(null); setDetail(null);
      await loadList();
    } catch (e) { setToast(e.message); }
  };

  const playSample = (voiceId) => {
    const audio = new Audio(`/api/tts/voice-sample/${voiceId}`);
    audio.play();
  };

  return (
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 60px)', background: 'var(--bg)' }}>
      {/* LEFT */}
      <div style={{ width: 340, flexShrink: 0, borderRight: '1px solid var(--border)', background: 'var(--card)', padding: '24px 20px', overflowY: 'auto', maxHeight: 'calc(100vh - 60px)' }}>
        <div style={eyebrowStyle}>✦ HOSTS</div>
        <h1 style={{ fontFamily: 'var(--font-sans)', fontSize: 28, fontWeight: 500, lineHeight: 1.2, letterSpacing: '-0.01em', color: 'var(--ink)', margin: '6px 0 20px' }}>
          Host library
        </h1>

        <AccordionSection label="FILTERS" open={open.filters} onToggle={() => setOpen(o => ({ ...o, filters: !o.filters }))}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <LabeledInput label="search" value={filter.search} onChange={v => setFilter(f => ({ ...f, search: v }))} />
            <LabeledSelect label="voice" value={filter.voice} onChange={v => setFilter(f => ({ ...f, voice: v }))} options={[['', 'all'], ...XAI_VOICES.map(x => [x.id, x.name])]} />
            <LabeledSelect label="tag" value={filter.tag} onChange={v => setFilter(f => ({ ...f, tag: v }))} options={[['', 'all'], ...allTags.map(t => [t, t])]} />
          </div>
        </AccordionSection>

        <AccordionSection label={`HOSTS (${filtered.length})`} open={open.list} onToggle={() => setOpen(o => ({ ...o, list: !o.list }))}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {filtered.map(h => (
              <button key={h.id} onClick={() => setSelected(h.id)}
                style={{ textAlign: 'left', padding: 8, border: selected === h.id ? '1px solid var(--amber)' : '1px solid var(--border-light)', background: selected === h.id ? 'var(--amber-tint)' : 'var(--surface)', cursor: 'pointer', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: VOICE_COLORS[h.voice_id] || 'var(--amber)', color: 'var(--card)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-sans)', fontSize: 14, fontWeight: 600, flexShrink: 0 }}>
                  {h.name.charAt(0)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{h.name}</div>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--text-mid)' }}>{h.voice_id}</div>
                </div>
                {h.is_starter === 1 && (
                  <span style={{ fontFamily: 'DM Sans', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--amber)', border: '1px solid var(--amber-border)', padding: '1px 5px', borderRadius: 3 }}>STARTER</span>
                )}
              </button>
            ))}
          </div>
        </AccordionSection>

        <AccordionSection label="CREATE" open={open.create} onToggle={() => setOpen(o => ({ ...o, create: !o.create }))}>
          <button onClick={createHost} style={{ ...primaryBtnStyle, width: '100%' }}>+ New Host</button>
        </AccordionSection>

        {toast && <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--amber)', color: 'var(--card)', fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, borderRadius: 4 }}>{toast}</div>}
      </div>

      {/* RIGHT */}
      <div style={{ flex: 1, padding: 40, overflowY: 'auto', maxHeight: 'calc(100vh - 60px)' }}>
        {!detail && <div style={{ color: 'var(--text-mid)', fontFamily: 'DM Sans' }}>Select a host to edit, or click + New Host.</div>}
        {detail && (
          <div style={{ maxWidth: 680, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 72, height: 72, borderRadius: '50%', background: VOICE_COLORS[detail.voice_id] || 'var(--amber)', color: 'var(--card)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-sans)', fontSize: 36, fontWeight: 600 }}>
                {detail.name?.charAt(0) || '?'}
              </div>
              <div style={{ flex: 1 }}>
                <input value={detail.name || ''} onChange={e => patchDetail('name', e.target.value)}
                  style={{ fontFamily: 'var(--font-sans)', fontSize: 28, fontWeight: 500, lineHeight: 1.2, letterSpacing: '-0.01em', color: 'var(--ink)', border: 'none', background: 'transparent', outline: 'none', padding: 0, width: '100%' }} />
                <input value={detail.tagline || ''} onChange={e => patchDetail('tagline', e.target.value)}
                  placeholder="tagline"
                  style={{ fontFamily: 'DM Sans', fontSize: 18, lineHeight: 1.55, color: 'var(--text-mid)', border: 'none', background: 'transparent', outline: 'none', padding: 0, marginTop: 4, width: '100%' }} />
              </div>
            </div>

            <Section label="Voice">
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select value={detail.voice_id || 'eve'} onChange={e => patchDetail('voice_id', e.target.value)}
                  style={{ ...textareaStyle, width: 'auto', flex: 1 }}>
                  {XAI_VOICES.map(v => <option key={v.id} value={v.id}>{v.name} — {v.description}</option>)}
                </select>
                <button onClick={() => playSample(detail.voice_id)} style={secondaryBtnStyle}>▸ Play sample</button>
              </div>
            </Section>

            <Section label="Personality">
              <textarea value={detail.personality || ''} onChange={e => patchDetail('personality', e.target.value)} rows={4} style={textareaStyle} />
            </Section>
            <Section label="Recurring viewpoint">
              <textarea value={detail.recurring_viewpoint || ''} onChange={e => patchDetail('recurring_viewpoint', e.target.value)} rows={3} style={textareaStyle} />
            </Section>
            <Section label="Vocal direction">
              <textarea value={detail.vocal_direction || ''} onChange={e => patchDetail('vocal_direction', e.target.value)} rows={3} style={textareaStyle} />
            </Section>
            <Section label="Catchphrases (one per line)">
              <textarea value={(detail.catchphrases || []).join('\n')}
                onChange={e => patchDetail('catchphrases', e.target.value.split('\n').filter(l => l.trim()))}
                rows={3} style={textareaStyle} />
            </Section>
            <Section label="Tags (comma-separated)">
              <input value={(detail.tags || []).join(', ')}
                onChange={e => patchDetail('tags', e.target.value.split(',').map(t => t.trim()).filter(Boolean))}
                style={{ ...textareaStyle, height: 'auto' }} />
            </Section>

            <div style={{ display: 'flex', gap: 10, padding: '16px 0', borderTop: '1px solid var(--border)' }}>
              <button onClick={saveDetail} disabled={!dirty} style={{ ...primaryBtnStyle, opacity: dirty ? 1 : 0.5 }}>{dirty ? 'Save' : 'Saved'}</button>
              <button onClick={() => setDirty(false)} disabled={!dirty} style={{ ...secondaryBtnStyle, opacity: dirty ? 1 : 0.5 }}>Discard</button>
              <div style={{ flex: 1 }} />
              <button onClick={deleteHost} style={{ ...secondaryBtnStyle, color: 'var(--error)' }}>Delete</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ label, children }) {
  return (
    <div>
      <div style={{ fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>{label}</div>
      {children}
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

function LabeledInput({ label, value, onChange }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-mid)', fontFamily: 'DM Sans', fontWeight: 600 }}>{label}</span>
      <input value={value} onChange={e => onChange(e.target.value)} style={{ padding: '4px 6px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontFamily: 'DM Sans', fontSize: 12 }} />
    </label>
  );
}

function LabeledSelect({ label, value, onChange, options }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-mid)', fontFamily: 'DM Sans', fontWeight: 600 }}>{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)} style={{ padding: '4px 6px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontFamily: 'DM Sans', fontSize: 12 }}>
        {options.map(o => <option key={o[0]} value={o[0]}>{o[1]}</option>)}
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
