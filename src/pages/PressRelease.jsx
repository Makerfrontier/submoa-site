// /press-release — brief form + generated output with highlight-flag edits.

import { useEffect, useState, useRef } from 'react';

export default function PressRelease({ navigate }) { // eslint-disable-line no-unused-vars
  const [view, setView] = useState('form'); // 'form' | 'output'
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [authors, setAuthors] = useState([]);
  const [form, setForm] = useState({
    product_or_news: '',
    emotional_context: '',
    links: '',
    business_name: '',
    business_location: '',
    business_website: '',
    cited_quotes: '',
    pr_contact: '',
    about_brand: '',
    author_id: '',
    brand_brief_r2_key: '',
    brand_brief_filename: '',
  });
  const [record, setRecord] = useState(null);
  const [edited, setEdited] = useState('');

  useEffect(() => {
    fetch('/api/authors', { credentials: 'include' })
      .then(r => r.json()).then(d => setAuthors(d.authors || [])).catch(() => {});
  }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function uploadBrief(file) {
    if (!file) return;
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/presentations/upload-brief', { method: 'POST', credentials: 'include', body: fd });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || 'Upload failed');
      set('brand_brief_r2_key', d.r2_key);
      set('brand_brief_filename', d.filename);
    } catch (e) { setError(e.message); }
  }

  async function generate() {
    if (!form.product_or_news.trim() || !form.business_name.trim()) { setError('Product/news and business name required'); return; }
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/press-release/generate', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || 'Generation failed');
      setRecord(d.press_release);
      setEdited(d.press_release.generated_content || '');
      setView('output');
    } catch (e) { setError(e.message); }
    setBusy(false);
  }

  async function saveEdits() {
    if (!record) return;
    try {
      await fetch(`/api/press-release/${record.id}`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generated_content: edited }),
      });
    } catch (e) { setError(e.message); }
  }

  if (view === 'output' && record) {
    return (
      <PressReleaseOutput
        record={record}
        edited={edited}
        setEdited={setEdited}
        onSave={saveEdits}
        onBack={() => setView('form')}
      />
    );
  }

  const field = (label, key, type = 'input', placeholder = '', rows = 3, required = false) => (
    <div style={{ marginBottom: 14 }}>
      <label className="form-label">
        {label}{required && <span style={{ color: 'var(--error)', marginLeft: 4 }}>*</span>}
      </label>
      {type === 'textarea' ? (
        <textarea className="form-textarea" rows={rows} placeholder={placeholder}
          value={form[key]} onChange={(e) => set(key, e.target.value)} />
      ) : (
        <input className="form-input" placeholder={placeholder}
          value={form[key]} onChange={(e) => set(key, e.target.value)} />
      )}
    </div>
  );

  return (
    <div className="page"><div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 24px' }}>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, color: 'var(--text)' }}>Press Release</h1>
      <p style={{ color: 'var(--text-mid)', marginTop: 6 }}>Fill in what you have. The more context the better.</p>
      {error && <div style={{ background: 'var(--error-bg)', border: '1px solid var(--error-border)', borderRadius: 6, padding: '10px 14px', color: 'var(--error)', fontSize: 13, margin: '16px 0' }}>{error}</div>}

      <div style={{ marginTop: 20 }}>
        {field('Product or News', 'product_or_news', 'textarea', 'What is being announced? New product launch, event, milestone, partnership, award…', 4, true)}
        {field('Why does this matter?', 'emotional_context', 'textarea', 'Share the significance — what problem does this solve, what milestone does this represent, why now?', 3)}
        {field('Links', 'links', 'textarea', 'Product page, event page, press kit, images — paste URLs one per line', 3)}
        {field('Business name', 'business_name', 'input', '', 1, true)}
        {field('Business location', 'business_location', 'input', 'City, State or City, Country')}
        {field('Business website', 'business_website', 'input')}
        {field('Quoted statement from brand rep', 'cited_quotes', 'textarea', 'Paste a direct quote from the CEO, founder, or spokesperson. Name and title will be included.', 3)}
        {field('PR contact information', 'pr_contact', 'textarea', 'Contact name, email, phone for media inquiries', 2)}
        {field('About the brand', 'about_brand', 'textarea', 'Standard boilerplate paragraph about your company — this appears at the bottom of every release', 3)}

        <div style={{ marginBottom: 14 }}>
          <label className="form-label">Author style</label>
          <select className="form-select" value={form.author_id} onChange={(e) => set('author_id', e.target.value)}>
            <option value="">— default —</option>
            {authors.map(a => <option key={a.slug} value={a.slug}>{a.name}</option>)}
          </select>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label className="form-label">Brand brief (optional)</label>
          <input type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(e) => uploadBrief(e.target.files?.[0])} style={{ fontSize: 12 }} />
          {form.brand_brief_filename && (
            <div style={{ fontSize: 11, color: 'var(--text-mid)', marginTop: 4 }}>{form.brand_brief_filename}</div>
          )}
        </div>

        <button className="btn-primary" style={{ width: '100%' }} onClick={generate} disabled={busy}>
          {busy ? 'Generating…' : 'Generate Press Release'}
        </button>
      </div>
    </div></div>
  );
}

function PressReleaseOutput({ record, edited, setEdited, onSave, onBack }) {
  const [popover, setPopover] = useState(null); // { x, y, text, start, end }
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
          submission_type: 'press-release',
          author_id: record.author_id || null,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || 'Edit failed');
      const newContent = edited.replace(popover.text, d.edited_text);
      setEdited(newContent);
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
          submission_type: 'press-release',
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
            a.download = `press-release-${record.id}.txt`; a.click();
            URL.revokeObjectURL(url);
          }}>Download .txt</button>
        </div>
      </div>
      {error && <div style={{ color: 'var(--error)', fontSize: 12, marginBottom: 10 }}>{error}</div>}

      <div ref={ref} onMouseUp={onMouseUp}
        style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 28, fontFamily: 'var(--font-read)', fontSize: 15, lineHeight: 1.7, color: 'var(--text)', whiteSpace: 'pre-wrap', userSelect: 'text' }}>
        {edited}
      </div>

      {flags.length > 0 && (
        <div style={{ marginTop: 14, padding: 12, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }}>
          <div className="eyebrow" style={{ color: 'var(--error)', marginBottom: 8 }}>FLAGGED FOR REVIEW ({flags.length})</div>
          {flags.map(f => (
            <div key={f.id} style={{ fontSize: 12, padding: 6, borderLeft: '3px solid var(--error)', background: 'var(--error-bg)', marginBottom: 4 }}>
              "{f.text.slice(0, 160)}"
            </div>
          ))}
        </div>
      )}

      {popover && (
        <div style={{
          position: 'absolute', left: popover.x, top: popover.y,
          transform: 'translateX(-50%)',
          background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8,
          padding: 6, boxShadow: 'var(--shadow-card)', display: 'flex', gap: 4, zIndex: 20,
        }}>
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
