// /brief/presentation — PowerPoint Builder
// Comp Studio-style three-column authoring tool.
// Left: template picker → brief fields (purpose, audience, author, prompt wrapper).
// Center: live deck preview (slide list + active slide canvas).
// Right: content palette (slide reorder, add slide types).
// Desktop-only (<1024px shows the Comp Studio-style gate screen).

import { useEffect, useState } from 'react';
import { PRESENTATION_TEMPLATES } from '../template-baselines';

interface AuthorRow { slug: string; name: string }
interface SlideDraft { id: string; title: string; body: string; type: 'title' | 'content' | 'section' | 'quote' | 'stats' }

// Templates now come from the shared baseline registry (9 entries). Each
// card shows name + description + slide count + default accent color.
const TEMPLATES = Object.values(PRESENTATION_TEMPLATES).map(t => ({
  id: t.id,
  name: t.name,
  desc: t.description,
  slides: t.defaultSlideCount,
  color: t.accentColor,
}));

const SLIDE_TYPES = [
  { id: 'title',   label: 'Title' },
  { id: 'content', label: 'Content' },
  { id: 'section', label: 'Section break' },
  { id: 'quote',   label: 'Pull quote' },
  { id: 'stats',   label: 'Stat block' },
] as const;

function TemplateThumb({ color, slides }: { color: string; slides: number }) {
  return (
    <svg viewBox="0 0 80 50" width="100%" height="72" preserveAspectRatio="xMidYMid meet">
      <rect x="2" y="2" width="76" height="46" rx="3" fill="#FAF7F2" stroke={color} strokeWidth="1"/>
      <rect x="6" y="6" width="68" height="8" fill={color} opacity="0.9"/>
      <rect x="6" y="18" width="40" height="3" fill={color} opacity="0.45"/>
      <rect x="6" y="24" width="52" height="3" fill={color} opacity="0.3"/>
      <rect x="6" y="30" width="44" height="3" fill={color} opacity="0.3"/>
      <rect x="6" y="36" width="20" height="3" fill={color} opacity="0.5"/>
      <text x="76" y="46" fontSize="5" fill={color} textAnchor="end" fontFamily="monospace" opacity="0.6">{slides}</text>
    </svg>
  );
}

// Dashed-border upload thumbnail for the "Upload Your Own" card.
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
        <div className="eyebrow" style={{ marginBottom: 12 }}>✦ POWERPOINT BUILDER</div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, marginBottom: 8 }}>Desktop only</h2>
        <p style={{ color: 'var(--text-mid)', fontSize: 14, lineHeight: 1.6 }}>
          PowerPoint Builder is a precision authoring tool. Please open it on a screen 1024px or wider.
        </p>
      </div>
    </div>
  );
}

export default function PresentationBrief({ navigate }: { navigate?: (p: string) => void }) {
  const [isDesktop, setIsDesktop] = useState(typeof window !== 'undefined' ? window.innerWidth >= 1024 : true);
  useEffect(() => {
    const onResize = () => setIsDesktop(window.innerWidth >= 1024);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const [templateId, setTemplateId] = useState<string | null>(null);
  const [authors, setAuthors] = useState<AuthorRow[]>([]);
  const [author, setAuthor] = useState('');
  const [topic, setTopic] = useState('');
  const [purpose, setPurpose] = useState('');
  const [audience, setAudience] = useState('');
  const [slideCount, setSlideCount] = useState(10);
  const [slides, setSlides] = useState<SlideDraft[]>([]);
  const [activeSlideIdx, setActiveSlideIdx] = useState(0);
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  // Custom PPTX upload analysis (from /api/presentations/analyze-template).
  const [analysis, setAnalysis] = useState<any>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  // Visual tone fields — used when no template file is uploaded. These drive
  // the PPTX base colors and the image-prompt style direction.
  const [primaryColor, setPrimaryColor] = useState('#3D5A3E');
  const [accentColor, setAccentColor] = useState('#B8872E');
  const [backgroundColor, setBackgroundColor] = useState('#FAF7F2');
  const [styleDirection, setStyleDirection] = useState('');
  // Emotional context + brand brief — both optional, both feed the AI
  // optimization pass and the consumer's system prompt when present.
  const [emotionalContext, setEmotionalContext] = useState('');
  const [brandBriefInfo, setBrandBriefInfo] = useState<{ r2_key: string; filename: string } | null>(null);
  const [uploadingBrief, setUploadingBrief] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);
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
    const baseline = (PRESENTATION_TEMPLATES as any)[id];
    const t = TEMPLATES.find(x => x.id === id);
    if (!t) return;
    setSlideCount(t.slides);
    // Seed slides from the baseline's slide array — one draft slide per
    // baseline slide with the matching type. The consumer uses the
    // baseline's placeholder list at generation time.
    const seed: SlideDraft[] = (baseline?.slides || []).map((s: any, i: number) => ({
      id: `slide-${i}`,
      title: i === 0 ? 'Title slide' : `${s.slideType} slide`,
      body: '',
      type: (['title','content','section','quote','stats'] as const).includes(s.slideType) ? s.slideType : 'content',
    }));
    setSlides(seed.length ? seed : Array.from({ length: t.slides }, (_, i) => ({
      id: `slide-${i}`, title: i === 0 ? 'Title slide' : `Slide ${i + 1}`, body: '',
      type: i === 0 ? 'title' : 'content',
    })));
    setActiveSlideIdx(0);
  }

  function updateSlide(i: number, patch: Partial<SlideDraft>) {
    setSlides(prev => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s));
  }
  function addSlide(type: SlideDraft['type']) {
    setSlides(prev => [...prev, { id: `slide-${Date.now()}`, title: 'New slide', body: '', type }]);
    setActiveSlideIdx(slides.length);
  }
  function removeSlide(i: number) {
    setSlides(prev => prev.filter((_, idx) => idx !== i));
    setActiveSlideIdx(Math.max(0, i - 1));
  }
  function moveSlide(i: number, dir: -1 | 1) {
    setSlides(prev => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return next;
      const tmp = next[i]; next[i] = next[j]; next[j] = tmp;
      return next;
    });
    setActiveSlideIdx(i + dir);
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
          category: 'presentation',
          blockType: 'deck-outline',
          blockLabel: topic,
          surroundingContext: JSON.stringify({ purpose, audience, slides: slides.map(s => ({ title: s.title, type: s.type })) }).slice(0, 6000),
          userInstruction: `Produce an optimized ${slideCount}-slide deck outline for audience "${audience}" with the purpose "${purpose}". Return JSON array of {title, body, type} where type ∈ title|content|section|quote|stats. Preserve slide count exactly.`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Optimization failed');
      const raw = String(data.generated_text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setSlides(parsed.slice(0, slideCount).map((s: any, i: number) => ({
          id: `slide-${i}`,
          title: String(s.title || ''),
          body: String(s.body || ''),
          type: (['title','content','section','quote','stats'] as const).includes(s.type) ? s.type : 'content',
        })));
        setToast('Outline optimized.');
        setTimeout(() => setToast(''), 2500);
      }
    } catch (e: any) {
      setError(e?.message || 'Optimization failed');
    } finally {
      setOptimizing(false);
    }
  }

  async function uploadBrandBrief(file: File | null) {
    if (!file) return;
    setUploadingBrief(true); setBriefError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/presentations/upload-brief', { method: 'POST', credentials: 'include', body: fd });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || 'Upload failed');
      setBrandBriefInfo({ r2_key: d.r2_key, filename: d.filename });
    } catch (e: any) { setBriefError(e?.message || 'Upload failed'); }
    setUploadingBrief(false);
  }

  async function handleSubmit() {
    if (!topic.trim()) { setError('Topic is required'); return; }
    if (!templateId) { setError('Pick a template first'); return; }
    setSubmitting(true); setError(null);
    try {
      // The endpoint expects multipart/form-data — we always submit a FormData
      // payload whether or not the user attached a .pptx template file.
      const fd = new FormData();
      fd.append('topic', topic);
      fd.append('author', author || '');
      fd.append('template_id', templateId || '');
      fd.append('purpose', purpose || '');
      fd.append('audience', audience || '');
      fd.append('key_details', purpose || topic);
      fd.append('slide_count_target', String(slideCount));
      fd.append('structured_notes', JSON.stringify(slides));
      fd.append('include_charts', '0');
      fd.append('include_images', '0');
      fd.append('primary_color', primaryColor);
      fd.append('accent_color', accentColor);
      fd.append('background_color', backgroundColor);
      fd.append('style_direction', styleDirection);
      if (templateFile) fd.append('template', templateFile);
      if (analysis?.uploaded_r2_key) fd.append('custom_template_r2_key', analysis.uploaded_r2_key);
      if (analysis) fd.append('template_analysis', JSON.stringify(analysis));
      // New in Part 4: emotional context + brand brief upload.
      if (emotionalContext.trim()) fd.append('emotional_context', emotionalContext.trim());
      if (brandBriefInfo?.r2_key) fd.append('brand_brief_r2_key', brandBriefInfo.r2_key);
      if (brandBriefInfo?.filename) fd.append('brand_brief_filename', brandBriefInfo.filename);

      const res = await fetch('/api/presentation-submissions', {
        method: 'POST',
        credentials: 'include',
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Submit failed');
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
          <h1 className="confirm-title">Presentation brief received.</h1>
          <p className="confirm-sub">Your deck is being assembled. You'll see it on your dashboard once it's ready.</p>
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
    if (!file.name.toLowerCase().endsWith('.pptx')) {
      setUploadError('Only .pptx files are accepted.');
      return;
    }
    setAnalyzing(true); setUploadError(null); setAnalysis(null);
    try {
      const fd = new FormData();
      fd.append('template', file);
      const res = await fetch('/api/presentations/analyze-template', {
        method: 'POST',
        credentials: 'include',
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Analysis failed');
      setAnalysis(data);
      setTemplateFile(file);
      // Use "custom" as the synthetic template id. Seed the slides count
      // from the uploaded deck so the editor opens with the same layout
      // cadence the template expects.
      setSlideCount(Math.max(4, Math.min(40, data.slide_count || 10)));
      const seed: SlideDraft[] = Array.from({ length: Math.max(4, data.slide_count || 10) }, (_, i) => ({
        id: `slide-${i}`,
        title: i === 0 ? 'Title slide' : `Slide ${i + 1}`,
        body: '',
        type: i === 0 ? 'title' : 'content',
      }));
      setSlides(seed);
      setActiveSlideIdx(0);
      setTemplateId('custom');
    } catch (e: any) {
      setUploadError(e?.message || 'Upload failed');
    } finally {
      setAnalyzing(false);
    }
  }

  if (!templateId) {
    return (
      <div className="page"><div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>
        <h1 className="page-title">PowerPoint Builder</h1>
        <p className="page-sub">Pick a template to start. You'll get a three-column editor with a live deck preview.</p>
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
              <TemplateThumb color={t.color} slides={t.slides} />
              <div style={{ marginTop: 10, fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>{t.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-light)', marginTop: 4 }}>{t.desc}</div>
              <div style={{ fontSize: 10, color: 'var(--amber)', textTransform: 'uppercase', letterSpacing: '.06em', marginTop: 8 }}>{t.slides} slides</div>
            </button>
          ))}

          {/* Upload Your Own — dashed-border card at the end of the grid */}
          <label
            style={{
              display: 'block',
              textAlign: 'left', padding: 14, borderRadius: 12,
              background: 'var(--card-alt)',
              border: '2px dashed var(--text-light)',
              cursor: analyzing ? 'progress' : 'pointer',
              boxShadow: 'var(--shadow-card)',
              opacity: analyzing ? 0.7 : 1,
            }}>
            <UploadThumb />
            <div style={{ marginTop: 10, fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>
              Upload Your Own
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-light)', marginTop: 4 }}>
              Use your own template, we'll analyze and match the layout exactly.
            </div>
            <div style={{ fontSize: 10, color: 'var(--amber)', textTransform: 'uppercase', letterSpacing: '.06em', marginTop: 8 }}>
              {analyzing ? 'Analyzing template…' : '.pptx upload'}
            </div>
            <input
              type="file"
              accept=".pptx"
              style={{ display: 'none' }}
              onChange={(e) => handleCustomUpload(e.target.files?.[0] || null)}
            />
          </label>
        </div>

        {analysis && (
          <div style={{
            marginTop: 16,
            padding: '12px 16px',
            borderRadius: 8,
            background: analysis.verdict === 'Layout Locked' ? 'var(--success-bg)' : 'var(--amber-light)',
            border: `1px solid ${analysis.verdict === 'Layout Locked' ? 'var(--success-border)' : 'var(--amber-border)'}`,
            fontSize: 13, color: 'var(--text-mid)',
          }}>
            <div style={{ fontWeight: 700, color: analysis.verdict === 'Layout Locked' ? 'var(--success)' : 'var(--amber)' }}>
              {analysis.verdict}
            </div>
            <div style={{ marginTop: 4 }}>{analysis.verdict_detail}</div>
            <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 6 }}>
              {analysis.slide_count} slide{analysis.slide_count === 1 ? '' : 's'} · {analysis.colors?.length || 0} theme color{(analysis.colors?.length || 0) === 1 ? '' : 's'} · fonts: {analysis.fonts?.major || '—'} / {analysis.fonts?.minor || '—'}
            </div>
          </div>
        )}
      </div></div>
    );
  }

  const activeSlide = slides[activeSlideIdx];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr 280px', height: 'calc(100vh - 48px)', background: 'var(--bg)' }}>
      <aside style={{ borderRight: '1px solid var(--border-light)', padding: 16, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', background: 'var(--card)' }}>
        <div>
          <div className="eyebrow">✦ POWERPOINT BUILDER</div>
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
          <input className="form-input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Deck subject" />
        </div>
        <div>
          <label className="form-label">What is this for?</label>
          <textarea className="form-textarea" rows={2} placeholder="Purpose — e.g. board update, sales pitch, training"
            value={purpose} onChange={(e) => setPurpose(e.target.value)} />
        </div>
        <div>
          <label className="form-label">Who is the audience?</label>
          <textarea className="form-textarea" rows={2} placeholder="Describe the audience — seniority, domain, known context"
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
          <label className="form-label">Slide count target</label>
          <input type="number" min={4} max={40} className="form-input" value={slideCount} onChange={(e) => setSlideCount(parseInt(e.target.value, 10) || 10)} />
        </div>

        <div>
          <label className="form-label">Why does this topic matter to you?</label>
          <textarea
            className="form-textarea" rows={3}
            placeholder="Share the personal or professional significance — this helps shape the narrative arc and emotional resonance of the deck."
            value={emotionalContext}
            onChange={(e) => setEmotionalContext(e.target.value)}
          />
        </div>

        <div>
          <label className="form-label">Brand brief or RFP (optional)</label>
          <input type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(e) => uploadBrandBrief(e.target.files?.[0] || null)}
            style={{ fontSize: 12 }}
            disabled={uploadingBrief}
          />
          {uploadingBrief && <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 4 }}>Uploading…</div>}
          {brandBriefInfo && !uploadingBrief && (
            <div style={{ fontSize: 11, color: 'var(--text-mid)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>{brandBriefInfo.filename}</span>
              <button type="button" className="btn-danger-sm" onClick={() => setBrandBriefInfo(null)} style={{ fontSize: 10 }}>Remove</button>
            </div>
          )}
          {briefError && <div style={{ fontSize: 11, color: 'var(--error)', marginTop: 4 }}>{briefError}</div>}
        </div>

        <div>
          <label className="form-label">Template .pptx (optional)</label>
          <input type="file" accept=".pptx" onChange={(e) => setTemplateFile(e.target.files?.[0] || null)} style={{ fontSize: 12 }} />
          {templateFile && <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 4 }}>{templateFile.name}</div>}
        </div>

        {!templateFile && (
          <div style={{ padding: 12, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="eyebrow">VISUAL TONE</div>
            <div style={{ fontSize: 11, color: 'var(--text-light)', lineHeight: 1.5 }}>
              No template uploaded — the deck will be generated from scratch using these colors and style direction. Text color is derived from the background luminance, never hardcoded.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
              <label style={{ fontSize: 11, color: 'var(--text-mid)' }}>
                Primary
                <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} style={{ width: '100%', height: 28, border: '1px solid var(--border)', borderRadius: 6, marginTop: 2 }} />
              </label>
              <label style={{ fontSize: 11, color: 'var(--text-mid)' }}>
                Accent
                <input type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} style={{ width: '100%', height: 28, border: '1px solid var(--border)', borderRadius: 6, marginTop: 2 }} />
              </label>
              <label style={{ fontSize: 11, color: 'var(--text-mid)' }}>
                Background
                <input type="color" value={backgroundColor} onChange={(e) => setBackgroundColor(e.target.value)} style={{ width: '100%', height: 28, border: '1px solid var(--border)', borderRadius: 6, marginTop: 2 }} />
              </label>
            </div>
            <textarea className="form-textarea" rows={2}
              placeholder="Describe the visual aesthetic — minimal and corporate, bold and editorial, warm and approachable, dark and premium, etc."
              value={styleDirection}
              onChange={(e) => setStyleDirection(e.target.value)} />
          </div>
        )}

        <button className="btn-accent" onClick={optimize} disabled={optimizing}>
          {optimizing ? 'Optimizing…' : '✦ AI Optimize Outline'}
        </button>
        <button className="btn-primary" onClick={handleSubmit} disabled={submitting}>
          {submitting ? 'Submitting…' : 'Build Presentation →'}
        </button>

        <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 6 }}>
          Every AI pass routes through the server-side prompt wrapper — no raw user text hits the model.
        </div>
      </aside>

      <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--card-alt)' }}>
        <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border-light)', fontSize: 12, color: 'var(--text-light)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span>Slide {activeSlideIdx + 1} of {slides.length}</span>
          <div style={{ flex: 1 }} />
          <button className="db-btn" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => moveSlide(activeSlideIdx, -1)} disabled={activeSlideIdx === 0}>↑</button>
          <button className="db-btn" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => moveSlide(activeSlideIdx, 1)} disabled={activeSlideIdx === slides.length - 1}>↓</button>
          <button className="btn-danger-sm" onClick={() => removeSlide(activeSlideIdx)} disabled={slides.length <= 1}>Remove</button>
        </div>
        <div style={{ flex: 1, padding: 40, overflow: 'auto', display: 'flex', justifyContent: 'center' }}>
          {activeSlide ? (
            <div style={{
              width: '100%', maxWidth: 880, aspectRatio: '16/9',
              background: '#fff', border: '1px solid var(--border)', borderRadius: 12,
              padding: 48, boxShadow: 'var(--shadow-card)', display: 'flex', flexDirection: 'column', gap: 16,
            }}>
              <input
                value={activeSlide.title}
                onChange={(e) => updateSlide(activeSlideIdx, { title: e.target.value })}
                style={{
                  border: 'none', outline: 'none', background: 'transparent',
                  fontFamily: 'var(--font-display)', fontSize: activeSlide.type === 'title' ? 40 : 28,
                  color: 'var(--text)', fontWeight: 700,
                }}
              />
              <textarea
                value={activeSlide.body}
                onChange={(e) => updateSlide(activeSlideIdx, { body: e.target.value })}
                placeholder="Slide body — bullets, notes, stats"
                rows={10}
                style={{
                  flex: 1, border: 'none', outline: 'none', background: 'transparent',
                  fontSize: 16, color: 'var(--text-mid)', lineHeight: 1.6, resize: 'none',
                }}
              />
              <div style={{ fontSize: 11, color: 'var(--amber)', textTransform: 'uppercase', letterSpacing: '.08em' }}>
                {activeSlide.type}
              </div>
            </div>
          ) : (
            <div style={{ color: 'var(--text-light)' }}>No slides yet.</div>
          )}
        </div>
      </div>

      <aside style={{ borderLeft: '1px solid var(--border-light)', padding: 14, overflowY: 'auto', background: 'var(--card)' }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>SLIDES</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {slides.map((s, i) => (
            <button key={s.id} type="button" onClick={() => setActiveSlideIdx(i)}
              style={{
                textAlign: 'left', padding: '6px 8px', borderRadius: 6,
                background: i === activeSlideIdx ? 'var(--green)' : 'var(--bg)',
                color: i === activeSlideIdx ? '#fff' : 'var(--text-mid)',
                border: `1px solid ${i === activeSlideIdx ? 'var(--green)' : 'var(--border)'}`,
                cursor: 'pointer', fontSize: 12,
              }}>
              <span style={{ fontFamily: 'monospace', fontSize: 10, opacity: 0.7 }}>{String(i + 1).padStart(2, '0')}</span>
              <span style={{ marginLeft: 6 }}>{s.title || '(untitled)'}</span>
            </button>
          ))}
        </div>

        <div className="eyebrow" style={{ marginTop: 16, marginBottom: 8 }}>ADD SLIDE</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {SLIDE_TYPES.map(t => (
            <button key={t.id} type="button" className="db-btn"
              onClick={() => addSlide(t.id as SlideDraft['type'])}
              style={{ justifyContent: 'flex-start', fontSize: 12 }}>
              + {t.label}
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
