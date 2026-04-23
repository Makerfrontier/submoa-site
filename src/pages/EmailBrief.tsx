// /brief/email — Email Builder
// Comp Studio-style three-column authoring tool.
// Left: template picker → brief fields (purpose, audience, author, prompt wrapper).
// Center: live email preview iframe.
// Right: content palette (subject, preheader, CTA, sections).
// Desktop-only (<1024px shows the Comp Studio-style gate screen).

import { useEffect, useState } from 'react';
import { stripAndClean } from '../comp-utils';
import { EMAIL_TEMPLATES } from '../template-baselines';
import PageShell from '../components/PageShell.jsx';

interface AuthorRow { slug: string; name: string }

interface EmailSection { id: string; kind: 'hero' | 'paragraph' | 'cta' | 'divider' | 'quote'; text: string; cta?: { label: string; href: string } }

// Templates now drawn from the shared baseline registry. Each card shows
// name + description + the accent color; the HTML baseline is fetched at
// generation time from the same registry on the server-side.
const TEMPLATES = Object.values(EMAIL_TEMPLATES).map(t => ({
  id: t.id,
  name: t.name,
  desc: t.description,
  color: t.accentColor,
}));

function TemplateThumb({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 80 50" width="100%" height="72" preserveAspectRatio="xMidYMid meet">
      <rect x="2" y="2" width="76" height="46" rx="3" fill="#FAF7F2" stroke={color} strokeWidth="1"/>
      <rect x="6" y="6" width="68" height="14" fill={color} opacity="0.9"/>
      <rect x="6" y="24" width="56" height="3" fill={color} opacity="0.4"/>
      <rect x="6" y="30" width="44" height="3" fill={color} opacity="0.3"/>
      <rect x="6" y="36" width="50" height="3" fill={color} opacity="0.3"/>
      <rect x="6" y="42" width="20" height="4" rx="1" fill={color}/>
    </svg>
  );
}

function UploadThumb() {
  return (
    <svg viewBox="0 0 80 50" width="100%" height="72" preserveAspectRatio="xMidYMid meet">
      <rect x="2" y="2" width="76" height="46" rx="3" fill="#EDE8DF" stroke="#A09080" strokeWidth="1" strokeDasharray="3 2"/>
      <circle cx="40" cy="25" r="10" fill="none" stroke="#6B5744" strokeWidth="1.5"/>
      <path d="M40 20v10M35 25h10" stroke="#6B5744" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

function DesktopOnlyGate() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 32 }}>
      <div className="card" style={{ padding: 40, maxWidth: 440, textAlign: 'center' }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>✦ EMAIL BUILDER</div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, marginBottom: 8 }}>Desktop only</h2>
        <p style={{ color: 'var(--text-mid)', fontSize: 14, lineHeight: 1.6 }}>
          Email Builder is a precision authoring tool. Please open it on a screen 1024px or wider.
        </p>
      </div>
    </div>
  );
}

function renderEmailHtml(state: {
  subject: string; preheader: string; primaryColor: string; sections: EmailSection[];
}) {
  const { subject, preheader, primaryColor, sections } = state;
  const parts = sections.map(s => {
    if (s.kind === 'hero') return `<h1 style="margin:0 0 16px;font-family:Georgia,serif;font-size:28px;color:#221A10;line-height:1.2">${escape(s.text)}</h1>`;
    if (s.kind === 'paragraph') return `<p style="margin:0 0 16px;font-family:Arial,sans-serif;font-size:15px;color:#4a4a4a;line-height:1.6">${escape(s.text)}</p>`;
    if (s.kind === 'cta') return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0"><tr><td style="background:${primaryColor};border-radius:6px;padding:12px 22px"><a href="${escape(s.cta?.href || '#')}" style="color:#fff;text-decoration:none;font-family:Arial,sans-serif;font-size:14px;font-weight:600">${escape(s.cta?.label || s.text || 'Click here')}</a></td></tr></table>`;
    if (s.kind === 'divider') return `<hr style="border:none;border-top:1px solid #CDC5B4;margin:24px 0" />`;
    if (s.kind === 'quote') return `<blockquote style="margin:20px 0;padding:16px 20px;border-left:3px solid ${primaryColor};background:#F5EDD8;font-family:Georgia,serif;font-size:16px;color:#221A10;line-height:1.5">${escape(s.text)}</blockquote>`;
    return '';
  }).join('\n');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escape(subject)}</title></head><body style="margin:0;padding:0;background:#EDE8DF;font-family:Arial,sans-serif"><div style="display:none;max-height:0;overflow:hidden">${escape(preheader)}</div><table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#EDE8DF;padding:24px 0"><tr><td align="center"><table role="presentation" cellpadding="0" cellspacing="0" width="600" style="background:#FAF7F2;padding:32px;border-radius:8px">${parts ? `<tr><td>${parts}</td></tr>` : ''}</table></td></tr></table></body></html>`;
}

function escape(str: string) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
}

export default function EmailBrief({ navigate }: { navigate?: (p: string) => void }) {
  const [isDesktop, setIsDesktop] = useState(typeof window !== 'undefined' ? window.innerWidth >= 1024 : true);
  useEffect(() => {
    const onResize = () => setIsDesktop(window.innerWidth >= 1024);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const [templateId, setTemplateId] = useState<string | null>(null);
  // Session-only custom HTML template from the Upload Your Own card. When set,
  // the preview iframe renders this html directly (not the assembled template).
  const [customHtml, setCustomHtml] = useState<string | null>(null);
  const [customFilename, setCustomFilename] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [authors, setAuthors] = useState<AuthorRow[]>([]);
  const [author, setAuthor] = useState('');
  const [topic, setTopic] = useState('');
  const [purpose, setPurpose] = useState('');
  const [audience, setAudience] = useState('');
  const [subject, setSubject] = useState('');
  const [preheader, setPreheader] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#B8872E');
  const [sections, setSections] = useState<EmailSection[]>([]);
  const [optimizing, setOptimizing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState('');

  useEffect(() => {
    fetch('/api/authors', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { authors: [] })
      .then(d => {
        const list: AuthorRow[] = d.authors || [];
        setAuthors(list);
        if (list.length > 0) setAuthor(list[0].slug);
      })
      .catch(() => {});
  }, []);

  function pickTemplate(id: string) {
    setTemplateId(id);
    const t = TEMPLATES.find(x => x.id === id);
    if (!t) return;
    setPrimaryColor(t.color);
    const seed: EmailSection[] = [
      { id: 's1', kind: 'hero',      text: 'Your headline goes here' },
      { id: 's2', kind: 'paragraph', text: 'Opening paragraph — what the reader needs to know in the first 30 seconds.' },
      { id: 's3', kind: 'cta',       text: '', cta: { label: 'Read more', href: 'https://…' } },
      { id: 's4', kind: 'divider',   text: '' },
      { id: 's5', kind: 'paragraph', text: 'Closing note or sign-off.' },
    ];
    setSections(seed);
  }

  function updateSection(i: number, patch: Partial<EmailSection>) {
    setSections(prev => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s));
  }
  function addSection(kind: EmailSection['kind']) {
    setSections(prev => [...prev, { id: `s-${Date.now()}`, kind, text: '', cta: kind === 'cta' ? { label: 'Click here', href: '#' } : undefined }]);
  }
  function removeSection(i: number) {
    setSections(prev => prev.filter((_, idx) => idx !== i));
  }
  function moveSection(i: number, dir: -1 | 1) {
    setSections(prev => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return next;
      const tmp = next[i]; next[i] = next[j]; next[j] = tmp;
      return next;
    });
  }

  async function optimize() {
    if (!topic.trim() || !purpose.trim() || !audience.trim()) {
      setError('Topic, purpose, and audience are required before optimization.');
      return;
    }
    setOptimizing(true); setError(null);
    try {
      const res = await fetch('/api/comp-studio/generate-copy', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: 'email',
          blockType: 'email-outline',
          blockLabel: topic,
          surroundingContext: JSON.stringify({ purpose, audience, current: sections }).slice(0, 6000),
          userInstruction: `Rewrite this email for audience "${audience}" with purpose "${purpose}". Return JSON {subject, preheader, sections:[{kind, text, cta?}]} where kind ∈ hero|paragraph|cta|divider|quote. Email client-safe copy only.`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Optimization failed');
      const raw = String(data.generated_text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
      const parsed = JSON.parse(raw);
      if (parsed.subject) setSubject(parsed.subject);
      if (parsed.preheader) setPreheader(parsed.preheader);
      if (Array.isArray(parsed.sections)) {
        setSections(parsed.sections.map((s: any, i: number) => ({
          id: `s-${i}`,
          kind: (['hero','paragraph','cta','divider','quote'] as const).includes(s.kind) ? s.kind : 'paragraph',
          text: String(s.text || ''),
          cta: s.cta ? { label: String(s.cta.label || 'Click here'), href: String(s.cta.href || '#') } : undefined,
        })));
      }
      setToast('Email optimized.');
      setTimeout(() => setToast(''), 2500);
    } catch (e: any) {
      setError(e?.message || 'Optimization failed');
    } finally {
      setOptimizing(false);
    }
  }

  async function handleSubmit() {
    if (!topic.trim() || !subject.trim()) { setError('Topic and subject line are required'); return; }
    if (!templateId) { setError('Pick a template first'); return; }
    setSubmitting(true); setError(null);
    try {
      // Custom uploaded HTML bypasses the baseline entirely.
      let html: string;
      if (customHtml && templateId === 'custom') {
        html = customHtml;
      } else {
        // Use the baseline via the new /api/email/generate endpoint which
        // calls OpenRouter for copy, fills tokens, applies luminance-derived
        // text color, and returns the final HTML.
        const genRes = await fetch('/api/email/generate', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            template_id: templateId,
            topic,
            subject,
            preheader,
            purpose,
            audience,
            author,
            primary_color: primaryColor,
            background_color: '#EDE8DF',
          }),
        });
        const genData = await genRes.json();
        if (!genRes.ok) throw new Error(genData?.error || 'Email generation failed');
        html = genData.html;
      }

      const res = await fetch('/api/email-submissions', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          author,
          template_type: templateId,
          template_name: topic,
          subject_line: subject,
          preheader,
          primary_color: primaryColor,
          purpose,
          audience,
          html_content: html,
          sections,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Submit failed');
      setCustomHtml(html); // render the final in the preview iframe
      setDone(true);
    } catch (e: any) {
      setError(e?.message || 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  }

  if (!isDesktop) return <DesktopOnlyGate />;

  if (done) {
    return (
      <div className="page"><div style={{ maxWidth: 640, margin: '60px auto', padding: '0 24px' }}>
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 40, textAlign: 'center', boxShadow: 'var(--shadow-card)' }}>
          <div className="confirm-icon">✓</div>
          <h1 className="confirm-title">Email brief received.</h1>
          <p className="confirm-sub">Your email is being rendered and hardened for every major client.</p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 16 }}>
            <button className="btn-primary" onClick={() => navigate?.('/dashboard')}>View Dashboard</button>
            <button className="btn-secondary" onClick={() => window.location.reload()}>Build Another</button>
          </div>
        </div>
      </div></div>
    );
  }

  async function handleCustomUpload(file: File | null) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.html') && file.type !== 'text/html') {
      setUploadError('Only .html files are accepted.');
      return;
    }
    setUploadError(null);
    try {
      const raw = await file.text();
      const cleaned = stripAndClean(raw);
      // Session-only — the custom template is not saved to the admin library
      // unless the user explicitly saves it later.
      setCustomHtml(cleaned);
      setCustomFilename(file.name);
      // Seed a minimal section list so the brief editor has something to edit.
      setSections([
        { id: 's1', kind: 'paragraph', text: 'Custom template loaded. Replace this copy with your own.' },
      ]);
      setTemplateId('custom');
    } catch (e: any) {
      setUploadError(e?.message || 'Upload failed');
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _customFilenameUnused = customFilename;
  if (!templateId) {
    return (
      <PageShell
        eyebrow="// EMAIL BUILDER"
        title="Email Builder"
        subtitle="Marketing emails in your voice. Pick a template to start — you'll get a three-column editor with a live preview."
      >
        <div style={{ maxWidth: 1100, width: '100%' }}>
        {uploadError && (
          <div style={{ marginTop: 16, background: 'var(--error-bg)', border: '1px solid var(--error-border)', borderRadius: 6, padding: '10px 14px', color: 'var(--error)', fontSize: 13 }}>
            {uploadError}
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginTop: 24 }}>
          {TEMPLATES.map(t => (
            <button key={t.id} type="button" onClick={() => pickTemplate(t.id)}
              style={{
                textAlign: 'left', padding: 14, borderRadius: 12,
                background: 'var(--card)', border: '1px solid var(--border)',
                cursor: 'pointer', boxShadow: 'var(--shadow-card)',
              }}>
              <TemplateThumb color={t.color} />
              <div style={{ marginTop: 10, fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>{t.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-light)', marginTop: 4 }}>{t.desc}</div>
            </button>
          ))}

          {/* Upload Your Own — dashed-border card at the end of the grid */}
          <label
            style={{
              display: 'block',
              textAlign: 'left', padding: 14, borderRadius: 12,
              background: 'var(--card-alt)',
              border: '2px dashed var(--text-light)',
              cursor: 'pointer',
              boxShadow: 'var(--shadow-card)',
            }}>
            <UploadThumb />
            <div style={{ marginTop: 10, fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>
              Upload Your Own
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-light)', marginTop: 4 }}>
              Use your own template, we'll analyze and match the layout exactly.
            </div>
            <div style={{ fontSize: 10, color: 'var(--amber)', textTransform: 'uppercase', letterSpacing: '.06em', marginTop: 8 }}>
              .html upload · session only
            </div>
            <input
              type="file"
              accept=".html,text/html"
              style={{ display: 'none' }}
              onChange={(e) => handleCustomUpload(e.target.files?.[0] || null)}
            />
          </label>
        </div>
        </div>
      </PageShell>
    );
  }

  // Custom uploaded HTML takes precedence over the generated preview.
  const html = customHtml ?? renderEmailHtml({ subject, preheader, primaryColor, sections });

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr 280px', height: 'calc(100vh - 48px)', background: 'var(--bg)' }}>
      <aside style={{ borderRight: '1px solid var(--border-light)', padding: 16, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', background: 'var(--card)' }}>
        <div>
          <div className="eyebrow">✦ EMAIL BUILDER</div>
          <button type="button" onClick={() => setTemplateId(null)} className="btn-ghost" style={{ fontSize: 11, marginTop: 4, padding: '2px 6px' }}>
            ← Change template
          </button>
        </div>

        {error && (
          <div style={{ background: 'var(--error-bg)', border: '1px solid var(--error-border)', borderRadius: 6, padding: '8px 10px', fontSize: 12, color: 'var(--error)' }}>
            {error}
          </div>
        )}

        <div>
          <label className="form-label">Topic <span className="required">✦</span></label>
          <input className="form-input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Email subject matter" />
        </div>
        <div>
          <label className="form-label">What is this for?</label>
          <textarea className="form-textarea" rows={2} placeholder="Purpose — e.g. weekly digest, product launch"
            value={purpose} onChange={(e) => setPurpose(e.target.value)} />
        </div>
        <div>
          <label className="form-label">Who is the audience?</label>
          <textarea className="form-textarea" rows={2} placeholder="Describe the subscriber list"
            value={audience} onChange={(e) => setAudience(e.target.value)} />
        </div>
        <div>
          <label className="form-label">Author style</label>
          <select className="form-select" value={author} onChange={(e) => setAuthor(e.target.value)}>
            {authors.length === 0 && <option value="">No authors available</option>}
            {authors.map(a => <option key={a.slug} value={a.slug}>{a.name}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Subject line <span className="required">✦</span></label>
          <input className="form-input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Inbox headline" />
        </div>
        <div>
          <label className="form-label">Preheader</label>
          <input className="form-input" value={preheader} onChange={(e) => setPreheader(e.target.value)} placeholder="Preview text shown after subject" />
        </div>
        <div>
          <label className="form-label">Primary color</label>
          <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} style={{ width: '100%', height: 32, border: '1px solid var(--border)', borderRadius: 6 }} />
        </div>

        <button className="btn-accent" onClick={optimize} disabled={optimizing}>
          {optimizing ? 'Optimizing…' : '✦ AI Optimize Email'}
        </button>
        <button className="btn-primary" onClick={handleSubmit} disabled={submitting}>
          {submitting ? 'Submitting…' : 'Build Email →'}
        </button>
        <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 6 }}>
          Every AI pass routes through the server-side prompt wrapper — no raw user text hits the model.
        </div>
      </aside>

      <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--card-alt)' }}>
        <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border-light)', fontSize: 12, color: 'var(--text-light)' }}>
          Live preview
        </div>
        <div style={{ flex: 1, padding: 20, overflow: 'auto', display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: '100%', maxWidth: 720, background: '#fff', border: '1px solid var(--border)', borderRadius: 8, boxShadow: 'var(--shadow-card)', overflow: 'hidden' }}>
            <iframe
              title="Email preview"
              srcDoc={html}
              style={{ width: '100%', height: '100%', minHeight: 720, border: 'none' }}
              sandbox="allow-same-origin"
            />
          </div>
        </div>
      </div>

      <aside style={{ borderLeft: '1px solid var(--border-light)', padding: 14, overflowY: 'auto', background: 'var(--card)' }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>SECTIONS</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sections.map((s, i) => (
            <div key={s.id} style={{ padding: 8, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--amber)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>
                <span>{s.kind}</span>
                <div style={{ flex: 1 }} />
                <button className="db-btn" style={{ fontSize: 10, padding: '2px 6px' }} onClick={() => moveSection(i, -1)} disabled={i === 0}>↑</button>
                <button className="db-btn" style={{ fontSize: 10, padding: '2px 6px' }} onClick={() => moveSection(i, 1)} disabled={i === sections.length - 1}>↓</button>
                <button className="btn-danger-sm" style={{ fontSize: 10, padding: '2px 6px' }} onClick={() => removeSection(i)}>×</button>
              </div>
              {s.kind === 'divider' ? (
                <div style={{ fontSize: 11, color: 'var(--text-light)', fontStyle: 'italic' }}>Horizontal divider</div>
              ) : s.kind === 'cta' ? (
                <>
                  <input className="form-input" style={{ fontSize: 12, padding: 6, marginBottom: 4 }}
                    placeholder="Button label"
                    value={s.cta?.label || ''}
                    onChange={(e) => updateSection(i, { cta: { ...(s.cta || { href: '#' }), label: e.target.value } })} />
                  <input className="form-input" style={{ fontSize: 12, padding: 6 }}
                    placeholder="https://…"
                    value={s.cta?.href || ''}
                    onChange={(e) => updateSection(i, { cta: { ...(s.cta || { label: 'Click' }), href: e.target.value } })} />
                </>
              ) : (
                <textarea className="form-textarea" rows={2} value={s.text}
                  onChange={(e) => updateSection(i, { text: e.target.value })}
                  style={{ fontSize: 12, padding: 6 }} />
              )}
            </div>
          ))}
        </div>

        <div className="eyebrow" style={{ marginTop: 14, marginBottom: 8 }}>ADD SECTION</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {(['hero','paragraph','cta','divider','quote'] as const).map(k => (
            <button key={k} type="button" className="db-btn"
              onClick={() => addSection(k)}
              style={{ justifyContent: 'flex-start', fontSize: 12 }}>
              + {k}
            </button>
          ))}
        </div>

        {toast && (
          <div style={{ marginTop: 14, fontSize: 12, color: 'var(--success)', fontFamily: 'sans-serif' }}>{toast}</div>
        )}
      </aside>
    </div>
  );
}
