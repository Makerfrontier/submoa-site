// /brief-builder — brief type picker → dynamic form → generated output with
// the same highlight-flag inline edit flow used in Press Release.

import { useEffect, useState, useRef } from 'react';
import PageShell from '../components/PageShell.jsx';
import SourceBanner, { useTranscriptSource } from '../components/SourceBanner.jsx';

const TYPES = [
  { id: 'creative', name: 'Creative Brief', icon: '✦', desc: 'For any creative project. Align on vision before the work begins.' },
  { id: 'strategy', name: 'Strategy Brief', icon: '◈', desc: 'For campaigns and initiatives. Define the problem before solving it.' },
  { id: 'content',  name: 'Content Brief',  icon: '¶', desc: 'For articles, videos, and social campaigns. Set the editorial direction.' },
  { id: 'project',  name: 'Project Brief',  icon: '⊞', desc: 'For handing off to developers, agencies, or contractors. Define scope clearly.' },
  { id: 'brand',    name: 'Brand Brief',    icon: '◉', desc: 'For new brand work or rebrands. Capture who you are and who you aren\'t.' },
  { id: 'rfp',      name: 'RFP Response Brief', icon: '→', desc: 'For responding to proposals. Make your case with clarity and confidence.' },
];

const FIELDS = {
  creative: [
    ['client_or_project', 'Client or project name', 'input'],
    ['objective', 'Objective (what must this creative accomplish?)', 'textarea'],
    ['why_it_matters', 'Why does this matter to you or your client?', 'textarea'],
    ['target_audience', 'Target audience', 'textarea'],
    ['tone', 'Tone and personality', 'textarea'],
    ['key_message', 'Key message (one sentence)', 'input'],
    ['deliverables', 'Deliverables', 'textarea'],
    ['timeline', 'Timeline', 'input'],
    ['mandatory_inclusions', 'Mandatory inclusions', 'textarea'],
    ['must_never_be', 'What this must never be', 'textarea'],
    ['success_looks_like', 'What success looks like', 'textarea'],
  ],
  strategy: [
    ['organization', 'Organization or brand', 'input'],
    ['situation_analysis', 'Situation analysis (what is happening right now?)', 'textarea'],
    ['why_now', 'Why is this the right moment to act?', 'textarea'],
    ['objective', 'Objective (specific and measurable)', 'textarea'],
    ['audience_insight', 'Audience insight', 'textarea'],
    ['key_message', 'Key message', 'input'],
    ['channels_tactics', 'Channels and tactics', 'textarea'],
    ['kpis', 'KPIs', 'textarea'],
    ['constraints', 'Constraints and limitations', 'textarea'],
    ['success_looks_like', 'What success looks like', 'textarea'],
  ],
  content: [
    ['topic', 'Topic', 'input'],
    ['angle', 'Angle (what is the specific point of view?)', 'textarea'],
    ['why_now', 'Why does this topic matter right now?', 'textarea'],
    ['target_audience', 'Target audience', 'textarea'],
    ['target_keyword', 'Target keyword or SEO focus', 'input'],
    ['format', 'Format (article, video, social, podcast)', 'input'],
    ['length', 'Desired word count or length', 'input'],
    ['tone', 'Tone', 'input'],
    ['must_include', 'Must include', 'textarea'],
    ['must_avoid', 'Must avoid', 'textarea'],
    ['references', 'References or inspiration', 'textarea'],
  ],
  project: [
    ['project_name', 'Project name', 'input'],
    ['client', 'Client or stakeholder', 'input'],
    ['problem', 'Problem being solved', 'textarea'],
    ['why_important', 'Why is solving this important?', 'textarea'],
    ['scope', 'Scope of work', 'textarea'],
    ['deliverables', 'Deliverables', 'textarea'],
    ['technical_requirements', 'Technical requirements', 'textarea'],
    ['timeline', 'Timeline', 'input'],
    ['budget', 'Budget range', 'input'],
    ['team', 'Team and roles', 'textarea'],
    ['approval_process', 'Approval process', 'textarea'],
    ['success_looks_like', 'What success looks like', 'textarea'],
  ],
  brand: [
    ['brand_name', 'Brand name', 'input'],
    ['brand_story', 'Brand story (origin and purpose)', 'textarea'],
    ['core_values', 'Core values', 'textarea'],
    ['target_audience', 'Target audience', 'textarea'],
    ['competitive_landscape', 'Competitive landscape', 'textarea'],
    ['key_differentiators', 'Key differentiators', 'textarea'],
    ['visual_direction', 'Visual direction', 'textarea'],
    ['voice_tone', 'Voice and tone', 'textarea'],
    ['must_never_be', 'What the brand must never be', 'textarea'],
    ['brand_promise', 'Brand promise (one sentence)', 'input'],
  ],
  rfp: [
    ['client_name', 'Client name', 'input'],
    ['project_overview', 'Project overview from RFP', 'textarea'],
    ['proposed_approach', 'Your proposed approach', 'textarea'],
    ['why_right_choice', 'Why you are the right choice', 'textarea'],
    ['team_credentials', 'Team and credentials', 'textarea'],
    ['timeline', 'Timeline', 'input'],
    ['pricing', 'Pricing structure', 'textarea'],
    ['why_matters', 'Why does winning this matter to you?', 'textarea'],
  ],
};

export default function BriefBuilder({ navigate, editId }) { // eslint-disable-line no-unused-vars
  const { source: transcriptSource } = useTranscriptSource();
  const [typeId, setTypeId] = useState(null);
  const [authors, setAuthors] = useState([]);
  const [authorId, setAuthorId] = useState('');
  const [fields, setFields] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [record, setRecord] = useState(null);
  const [edited, setEdited] = useState('');
  const [hydrating, setHydrating] = useState(false);

  // Accept either an editId prop (from /briefs/:id/edit) or a ?id= query
  // param (from the dashboard card's /brief-builder?id=X link). Either way
  // we fetch the brief and populate typeId + authorId + fields + edited.
  useEffect(() => {
    let idFromQuery = '';
    try {
      const p = new URLSearchParams(window.location.search);
      idFromQuery = p.get('id') || '';
    } catch {}
    const targetId = editId || idFromQuery;
    if (!targetId) return;
    setHydrating(true);
    fetch(`/api/brief-builder/${encodeURIComponent(targetId)}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        if (d?.brief) {
          const b = d.brief;
          setRecord(b);
          setTypeId(b.brief_type || null);
          setAuthorId(b.author_id || '');
          const fd = (b.field_data && typeof b.field_data === 'object') ? b.field_data : {};
          setFields(fd);
          setEdited(b.generated_content || '');
        } else {
          setError(d?.error || 'Brief not found');
        }
      })
      .catch(e => setError(e.message || 'Load failed'))
      .finally(() => setHydrating(false));
  }, [editId]);

  useEffect(() => {
    fetch('/api/authors', { credentials: 'include' })
      .then(r => r.json()).then(d => setAuthors(d.authors || [])).catch(() => {});
  }, []);

  const setField = (k, v) => setFields(f => ({ ...f, [k]: v }));

  async function generate() {
    setBusy(true); setError('');
    try {
      const def = FIELDS[typeId] || [];
      const firstKey = def[0]?.[0];
      const title = (fields[firstKey] || '').slice(0, 120) || (TYPES.find(t => t.id === typeId)?.name || 'Brief');
      const res = await fetch('/api/brief-builder/generate', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brief_type: typeId, title, field_data: fields, author_id: authorId || null }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || 'Generation failed');
      setRecord(d.brief);
      setEdited(d.brief.generated_content || '');
    } catch (e) { setError(e.message); }
    setBusy(false);
  }

  async function saveEdits() {
    if (!record) return;
    try {
      await fetch(`/api/brief-builder/${record.id}`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generated_content: edited }),
      });
    } catch (e) { setError(e.message); }
  }

  // In edit mode (editId present and record loaded), save field_data edits
  // without regenerating. This lets the user correct typos or tweak inputs
  // and come back later to regenerate.
  const [savedFlash, setSavedFlash] = useState('');
  async function saveFieldData() {
    if (!record) return;
    setBusy(true); setError('');
    try {
      const res = await fetch(`/api/brief-builder/${record.id}`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field_data: fields }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || 'Save failed');
      setRecord(d.brief);
      setSavedFlash('Saved');
      setTimeout(() => setSavedFlash(''), 2000);
    } catch (e) { setError(e.message); }
    setBusy(false);
  }

  if (hydrating) {
    return (
      <div className="page"><div style={{ maxWidth: 640, margin: '60px auto', padding: '0 24px', textAlign: 'center', color: 'var(--text-light)' }}>
        Loading brief…
      </div></div>
    );
  }

  if (record?.generated_content) {
    return <BriefOutput record={record} edited={edited} setEdited={setEdited} onSave={saveEdits}
      onBack={() => setRecord(null)} typeLabel={TYPES.find(t => t.id === typeId)?.name || 'Brief'} />;
  }

  if (!typeId) {
    return (
      <PageShell
        eyebrow="// BRIEF BUILDER"
        title="Build a brief"
        subtitle="Structured briefs for any audience. Pick a type to get started."
      >
        {transcriptSource && <SourceBanner source={transcriptSource} navigate={navigate} />}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
          {TYPES.map(t => (
            <button key={t.id} type="button" onClick={() => setTypeId(t.id)}
              style={{ textAlign: 'left', padding: 18, borderRadius: 6, background: 'var(--surface)', border: '1px solid var(--border)', cursor: 'pointer' }}>
              <div style={{ fontSize: 28, color: 'var(--amber)', marginBottom: 6 }}>{t.icon}</div>
              <div style={{ fontFamily: 'var(--font-sans)', fontSize: 16, fontWeight: 500, color: 'var(--ink)' }}>{t.name}</div>
              <div style={{ fontSize: 12, color: 'var(--ink-light)', marginTop: 4 }}>{t.desc}</div>
            </button>
          ))}
        </div>
      </PageShell>
    );
  }

  const def = FIELDS[typeId] || [];
  const activeType = TYPES.find(t => t.id === typeId);
  return (
    <PageShell
      eyebrow={`// BRIEF · ${String(activeType?.name || '').toUpperCase()}`}
      title={activeType?.name || 'Brief'}
      subtitle={activeType?.desc || ''}
      actions={<button className="v2-btn v2-btn--sm" type="button" onClick={() => setTypeId(null)}>← Change type</button>}
    >
      <div style={{ maxWidth: 720, width: '100%' }}>
      {transcriptSource && <SourceBanner source={transcriptSource} navigate={navigate} />}
      {error && <div style={{ background: 'var(--error-bg)', border: '1px solid var(--error-border)', borderRadius: 6, padding: '10px 14px', color: 'var(--error)', fontSize: 13, margin: '0 0 16px' }}>{error}</div>}
      <div style={{ marginTop: 20 }}>
        {def.map(([key, label, type]) => (
          <div key={key} style={{ marginBottom: 14 }}>
            <label className="form-label">{label}</label>
            {type === 'textarea'
              ? <textarea className="form-textarea" rows={3} value={fields[key] || ''} onChange={(e) => setField(key, e.target.value)} />
              : <input className="form-input" value={fields[key] || ''} onChange={(e) => setField(key, e.target.value)} />}
          </div>
        ))}
        <div style={{ marginBottom: 14 }}>
          <label className="form-label">Author style</label>
          <select className="form-select" value={authorId} onChange={(e) => setAuthorId(e.target.value)}>
            <option value="">— default —</option>
            {authors.map(a => <option key={a.slug} value={a.slug}>{a.name}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {editId && record && (
            <button className="btn-ghost" onClick={saveFieldData} disabled={busy}>
              {busy && !record?.generated_content ? 'Saving…' : 'Save changes'}
            </button>
          )}
          <button className="btn-primary" style={{ flex: 1 }} onClick={generate} disabled={busy}>
            {busy ? 'Working…' : (editId && record ? 'Regenerate' : 'Generate Brief')}
          </button>
        </div>
        {savedFlash && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--success)', fontFamily: 'DM Sans' }}>{savedFlash}</div>}
      </div>
      </div>
    </PageShell>
  );
}

function BriefOutput({ record, edited, setEdited, onSave, onBack, typeLabel }) {
  const [popover, setPopover] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [flags, setFlags] = useState([]);
  const [questionOpen, setQuestionOpen] = useState(null);
  const [questionText, setQuestionText] = useState('');
  const ref = useRef(null);

  function onMouseUp() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) { setPopover(null); return; }
    const text = sel.toString().trim();
    if (text.length < 3) { setPopover(null); return; }
    const r = sel.getRangeAt(0);
    const rect = r.getBoundingClientRect();
    const start = edited.indexOf(text);
    setPopover({ x: rect.left + rect.width / 2 + window.scrollX, y: rect.bottom + window.scrollY + 8, text, start });
  }

  async function applyAction(action) {
    if (!popover) return;
    setBusy(action); setError('');
    try {
      const ctxStart = Math.max(0, popover.start - 200);
      const ctxEnd = Math.min(edited.length, popover.start + popover.text.length + 200);
      const res = await fetch('/api/content/edit-selection', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selected_text: popover.text,
          surrounding_context: edited.slice(ctxStart, ctxEnd),
          action_type: action,
          submission_type: 'brief',
          author_id: record.author_id || null,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || 'Edit failed');
      setEdited(edited.replace(popover.text, d.edited_text));
      await onSave();
    } catch (e) { setError(e.message); }
    setBusy(''); setPopover(null);
    window.getSelection()?.removeAllRanges();
  }

  function flagSelection() {
    if (!popover) return;
    setFlags(f => [...f, { id: Date.now(), text: popover.text }]);
    setPopover(null);
    window.getSelection()?.removeAllRanges();
  }

  async function askQuestion() {
    if (!questionOpen || !questionText.trim()) return;
    setBusy('question'); setError('');
    try {
      const res = await fetch('/api/content/edit-selection', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selected_text: questionOpen.text,
          surrounding_context: '',
          action_type: 'custom',
          custom_instruction: questionText,
          submission_type: 'brief',
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || 'Edit failed');
      setEdited(edited.replace(questionOpen.text, d.edited_text));
      await onSave();
    } catch (e) { setError(e.message); }
    setBusy(''); setQuestionOpen(null); setQuestionText('');
    window.getSelection()?.removeAllRanges();
  }

  return (
    <div className="page"><div style={{ maxWidth: 820, margin: '0 auto', padding: '32px 24px', position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <button className="btn-ghost" onClick={onBack}>← Edit brief</button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="db-btn db-btn-gold" onClick={() => navigator.clipboard?.writeText(edited)}>Copy</button>
          <button className="db-btn db-btn-gold" onClick={() => {
            const blob = new Blob([edited], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url;
            a.download = `brief-${record.id}.txt`; a.click();
            URL.revokeObjectURL(url);
          }}>Download .txt</button>
        </div>
      </div>
      <div className="eyebrow" style={{ color: 'var(--amber)', marginBottom: 8 }}>BRIEF BUILDER · {String(typeLabel).toUpperCase()}</div>
      {error && <div style={{ color: 'var(--error)', fontSize: 12, marginBottom: 10 }}>{error}</div>}
      <div ref={ref} onMouseUp={onMouseUp}
        style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 28, fontFamily: 'var(--font-read)', fontSize: 15, lineHeight: 1.7, color: 'var(--text)', whiteSpace: 'pre-wrap', userSelect: 'text' }}>
        {edited}
      </div>

      {flags.length > 0 && (
        <div style={{ marginTop: 14, padding: 12, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }}>
          <div className="eyebrow" style={{ color: 'var(--error)', marginBottom: 8 }}>FLAGGED ({flags.length})</div>
          {flags.map(f => (
            <div key={f.id} style={{ fontSize: 12, padding: 6, borderLeft: '3px solid var(--error)', background: 'var(--error-bg)', marginBottom: 4 }}>"{f.text.slice(0, 160)}"</div>
          ))}
        </div>
      )}

      {popover && (
        <div style={{ position: 'absolute', left: popover.x, top: popover.y, transform: 'translateX(-50%)', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: 6, boxShadow: 'var(--shadow-card)', display: 'flex', gap: 4, zIndex: 20 }}>
          <button className="db-btn db-btn-gold" disabled={!!busy} onClick={() => applyAction('rewrite')}>Rewrite</button>
          <button className="db-btn db-btn-green" disabled={!!busy} onClick={() => applyAction('strengthen')}>Strengthen</button>
          <button className="db-btn db-btn-accent" disabled={!!busy} onClick={() => applyAction('shorten')}>Shorten</button>
          <button className="btn-danger-sm" onClick={flagSelection}>Flag</button>
          <button className="db-btn" onClick={() => { setQuestionOpen(popover); setPopover(null); }}>Question</button>
        </div>
      )}

      {questionOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setQuestionOpen(null)}>
          <div className="card" style={{ padding: 20, maxWidth: 480, width: '90%' }} onClick={(e) => e.stopPropagation()}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>ASK ABOUT SELECTION</div>
            <div style={{ fontSize: 12, color: 'var(--text-mid)', fontStyle: 'italic', marginBottom: 10 }}>"{questionOpen.text.slice(0, 200)}"</div>
            <textarea className="form-textarea" rows={3} placeholder="What do you want to change?"
              value={questionText} onChange={(e) => setQuestionText(e.target.value)} autoFocus />
            <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'flex-end' }}>
              <button className="btn-ghost" onClick={() => setQuestionOpen(null)}>Cancel</button>
              <button className="btn-primary" onClick={askQuestion} disabled={busy === 'question' || !questionText.trim()}>
                {busy === 'question' ? 'Asking…' : 'Apply'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div></div>
  );
}
