// src/pages/InfographicBrief.tsx
// /brief/infographic — research-first flow.
// 1. User states intent. 2. We search for ≥3 verified sources. 3. User reviews
// / removes sources or supplies more. 4. Visual styling fields unlock. 5.
// All confirmed sources ship to the generator as full citations.

import { useEffect, useState } from "react";
import PageShell from '../components/PageShell.jsx';
import SourceBanner, { useTranscriptSource } from '../components/SourceBanner.jsx';

interface AuthorRow { slug: string; name: string }

interface ResearchSource {
  claim: string;
  source_name: string;
  source_url: string;
  year: string;
  confidence: 'high' | 'medium' | 'low';
}

const TEMPLATES = [
  { id: "data-story",  name: "Data Story",  desc: "Bar/column charts, statistics-led" },
  { id: "timeline",    name: "Timeline",    desc: "Sequential horizontal flow" },
  { id: "process-map", name: "Process Map", desc: "Circular or vertical steps" },
  { id: "comparison",  name: "Comparison",  desc: "Side-by-side two-column layout" },
];

const COLOR_PALETTES = [
  { id: 'warm',       name: 'Warm — amber, terracotta, cream' },
  { id: 'cool',       name: 'Cool — slate, sage, mist' },
  { id: 'monochrome', name: 'Monochrome — black, white, gray' },
  { id: 'vibrant',    name: 'Vibrant — saturated, high-energy' },
];

const CHART_TYPES = [
  { id: 'bar',       name: 'Bar / Column' },
  { id: 'line',      name: 'Line' },
  { id: 'pie',       name: 'Pie / Donut' },
  { id: 'stat',      name: 'Stat Block' },
  { id: 'mixed',     name: 'Mixed (designer chooses)' },
];

function TemplatePreview({ id }: { id: string }) {
  const stroke = "var(--text-mid)";
  const fill = "var(--green)";
  const accent = "var(--amber)";
  if (id === "data-story") {
    return (
      <svg viewBox="0 0 80 50" width="100%" height="64" preserveAspectRatio="xMidYMid meet">
        <rect x="6"  y="32" width="10" height="14" fill={fill} opacity="0.7"/>
        <rect x="20" y="22" width="10" height="24" fill={fill}/>
        <rect x="34" y="14" width="10" height="32" fill={fill} opacity="0.85"/>
        <rect x="48" y="26" width="10" height="20" fill={fill} opacity="0.6"/>
        <rect x="62" y="18" width="10" height="28" fill={accent} opacity="0.85"/>
        <line x1="2" y1="46" x2="78" y2="46" stroke={stroke} strokeWidth="0.8"/>
      </svg>
    );
  }
  if (id === "timeline") {
    return (
      <svg viewBox="0 0 80 50" width="100%" height="64" preserveAspectRatio="xMidYMid meet">
        <line x1="6" y1="25" x2="74" y2="25" stroke={stroke} strokeWidth="1"/>
        {[10, 25, 40, 55, 70].map((cx, i) => (
          <circle key={i} cx={cx} cy="25" r="4" fill={i === 2 ? accent : fill}/>
        ))}
      </svg>
    );
  }
  if (id === "process-map") {
    return (
      <svg viewBox="0 0 80 50" width="100%" height="64" preserveAspectRatio="xMidYMid meet">
        <rect x="6"  y="6"  width="22" height="14" rx="3" fill={fill} opacity="0.85"/>
        <rect x="52" y="6"  width="22" height="14" rx="3" fill={fill} opacity="0.6"/>
        <rect x="6"  y="30" width="22" height="14" rx="3" fill={fill} opacity="0.6"/>
        <rect x="52" y="30" width="22" height="14" rx="3" fill={accent} opacity="0.85"/>
        <line x1="28" y1="13" x2="52" y2="13" stroke={stroke} strokeWidth="0.8"/>
        <line x1="17" y1="20" x2="17" y2="30" stroke={stroke} strokeWidth="0.8"/>
        <line x1="63" y1="20" x2="63" y2="30" stroke={stroke} strokeWidth="0.8"/>
        <line x1="28" y1="37" x2="52" y2="37" stroke={stroke} strokeWidth="0.8"/>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 80 50" width="100%" height="64" preserveAspectRatio="xMidYMid meet">
      <rect x="6"  y="6" width="32" height="38" rx="3" fill={fill} opacity="0.7"/>
      <rect x="42" y="6" width="32" height="38" rx="3" fill={accent} opacity="0.7"/>
      <line x1="40" y1="6" x2="40" y2="44" stroke="var(--card)" strokeWidth="0.8" strokeDasharray="2 2"/>
    </svg>
  );
}

export default function InfographicBrief({ navigate }: { navigate?: (p: string) => void }) {
  const { source: transcriptSource } = useTranscriptSource();
  const [handoff, setHandoff] = useState<{ source_submission_id: string; topic: string } | null>(null);

  // Phase 1 — intent + research
  const [intent, setIntent] = useState("");
  const [searching, setSearching] = useState(false);
  const [sources, setSources] = useState<ResearchSource[] | null>(null);
  const [totalFound, setTotalFound] = useState<number | null>(null);
  const [extraSource, setExtraSource] = useState({ claim: '', source_name: '', source_url: '', year: '' });
  const [dataConfirmed, setDataConfirmed] = useState(false);

  // Phase 2 — visual styling (only unlocks when dataConfirmed)
  const [styleId, setStyleId] = useState("");
  const [chartType, setChartType] = useState("mixed");
  const [colorPalette, setColorPalette] = useState("warm");
  const [outputFormat, setOutputFormat] = useState<"html" | "jpeg">("html");
  const [author, setAuthor] = useState("infographic-agent");
  const [authors, setAuthors] = useState<AuthorRow[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("infographic_handoff");
      if (raw) {
        const p = JSON.parse(raw);
        if (p?.topic) { setHandoff(p); setIntent(p.topic); }
      }
    } catch {}

    fetch("/api/authors", { credentials: "include" })
      .then((r) => r.ok ? r.json() : { authors: [] })
      .then((d) => {
        const list: AuthorRow[] = d.authors || [];
        setAuthors(list);
        const ig = list.find((a) => a.slug === "infographic-agent");
        if (ig) setAuthor(ig.slug);
      })
      .catch(() => {});
  }, []);

  function dismissBanner() {
    sessionStorage.removeItem("infographic_handoff");
    setHandoff(null);
    setIntent("");
  }

  async function runResearch(opts: { broaden?: boolean } = {}) {
    if (!intent.trim()) { setError('Please describe what you want to show.'); return; }
    setError(null); setSearching(true); setSources(null); setTotalFound(null); setDataConfirmed(false);
    try {
      const res = await fetch('/api/infographic/research', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intent: intent.trim(), broaden: !!opts.broaden }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Research failed');
      setSources(Array.isArray(data.sources) ? data.sources : []);
      setTotalFound(typeof data.total_found === 'number' ? data.total_found : (data.sources?.length ?? 0));
    } catch (e: any) {
      setError(e?.message || 'Research failed');
    } finally {
      setSearching(false);
    }
  }

  function removeSource(i: number) {
    if (!sources) return;
    const next = sources.filter((_, idx) => idx !== i);
    setSources(next);
    setTotalFound(next.length);
  }

  function addExtraSource() {
    if (!extraSource.source_url.trim() || !extraSource.claim.trim()) return;
    const next: ResearchSource = {
      claim: extraSource.claim.trim(),
      source_name: extraSource.source_name.trim() || 'User-supplied',
      source_url: extraSource.source_url.trim(),
      year: extraSource.year.trim() || '',
      confidence: 'high',
    };
    const list = (sources || []).concat(next);
    setSources(list);
    setTotalFound(list.length);
    setExtraSource({ claim: '', source_name: '', source_url: '', year: '' });
  }

  function confirmData() {
    if ((sources?.length ?? 0) < 3) {
      setError('Need at least 3 verified sources before continuing.');
      return;
    }
    setError(null);
    setDataConfirmed(true);
  }

  async function handleSubmit() {
    if (!dataConfirmed) return;
    if (!styleId) { setError('Pick a style template.'); return; }
    setError(null); setSubmitting(true);
    try {
      const body = {
        topic: intent.slice(0, 120),
        author,
        article_format: 'infographic',
        optimization_target: 'social-sharing',
        tone_stance: 'neutral',
        min_word_count: '300',
        human_observation: intent,
        infographic: {
          design_style: styleId,
          output_format: outputFormat,
          chart_type: chartType,
          color_palette: colorPalette,
          sources: sources || [],
        },
      };

      const res = await fetch('/api/infographic-submissions', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Submit failed');

      sessionStorage.removeItem('infographic_handoff');
      setDone(true);
    } catch (e: any) {
      setError(e?.message || 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="page"><div style={{ maxWidth: 640, margin: "60px auto", padding: "0 24px" }}>
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: 40, textAlign: "center", boxShadow: "var(--shadow-card)" }}>
          <div className="confirm-icon">✓</div>
          <h1 className="confirm-title">Infographic brief received.</h1>
          <p className="confirm-sub">Your infographic is being assembled. All sources you confirmed will be rendered as full citations in the output.</p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginTop: 16 }}>
            <button className="btn-primary" onClick={() => navigate?.("/dashboard")}>View Dashboard</button>
            <button className="btn-secondary" onClick={() => window.location.reload()}>Submit Another</button>
          </div>
        </div>
      </div></div>
    );
  }

  const sectionTitleStyle: React.CSSProperties = {
    fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 600,
    color: "var(--text)", marginTop: 32, marginBottom: 16,
    paddingBottom: 8, borderBottom: "1px solid var(--border)",
  };
  const confidenceColor = (c: string) =>
    c === 'high' ? 'var(--success)' : c === 'medium' ? 'var(--amber)' : 'var(--text-light)';

  const phase1Complete = dataConfirmed;
  const gap = (totalFound ?? 0) < 3 && sources !== null;

  return (
    <PageShell
      eyebrow="// INFOGRAPHIC"
      title="Build an infographic"
      subtitle="Research-backed visual storytelling. Every claim gets a citation."
    >
      <div style={{ maxWidth: 760, width: '100%' }}>
      {transcriptSource && <SourceBanner source={transcriptSource} navigate={navigate} />}

      {handoff && (
        <div style={{
          background: "var(--amber-light)", border: "1px solid var(--amber-border)",
          borderRadius: 8, padding: "10px 14px", display: "flex",
          justifyContent: "space-between", alignItems: "center",
          fontSize: 13, color: "var(--amber-dim)", marginBottom: 16, gap: 12,
        }}>
          <span>Based on article: <strong style={{ color: "var(--text)" }}>{handoff.topic}</strong></span>
          <button type="button" onClick={dismissBanner}
            style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--amber-dim)", fontSize: 18, padding: 4, lineHeight: 1 }}
            aria-label="Dismiss">×</button>
        </div>
      )}

      {error && (
        <div style={{ background: "var(--error-bg)", border: "1px solid var(--error-border)", borderRadius: 6, padding: "10px 14px", fontSize: 13, color: "var(--error)", marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Phase 1 — Intent */}
      <div style={sectionTitleStyle}>Phase 1 — Intent</div>
      <div className="form-group">
        <label className="form-label">What do you want your infographic to show? <span className="required">✦</span></label>
        <textarea
          className="form-input form-textarea"
          rows={4}
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          placeholder="Example: I want to show that nicotine products like Zyn and vapes have made teen nicotine use worse over the last 50 years."
          disabled={phase1Complete}
        />
      </div>
      {!phase1Complete && (
        <button type="button" className="btn-primary" onClick={() => runResearch()} disabled={searching || !intent.trim()}>
          {searching ? 'Searching for verified data sources…' : 'Find Data'}
        </button>
      )}

      {/* Sources review */}
      {sources !== null && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 12, color: 'var(--amber)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
            {totalFound} source{totalFound === 1 ? '' : 's'} found · minimum 3 required
          </div>

          {sources.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {sources.map((s, i) => (
                <div key={i} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: 'var(--text)', marginBottom: 4 }}>{s.claim}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-light)' }}>
                        <strong style={{ color: 'var(--text-mid)' }}>{s.source_name}</strong>
                        {s.year ? ` · ${s.year}` : ''}
                        {' · '}
                        <a href={s.source_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--green)' }}>View source</a>
                        <span style={{ marginLeft: 8, color: confidenceColor(s.confidence), fontWeight: 600, textTransform: 'uppercase' }}>
                          {s.confidence}
                        </span>
                      </div>
                    </div>
                    {!phase1Complete && (
                      <button className="btn-danger-sm" onClick={() => removeSource(i)}>Remove</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {!phase1Complete && gap && (
            <div style={{ background: 'var(--warning-bg)', border: '1px solid var(--warning-border)', borderRadius: 8, padding: 14, marginTop: 12, fontSize: 13, color: 'var(--text-mid)', lineHeight: 1.6 }}>
              To build an accurate and credible infographic I require a minimum of 3 verified data sources. I found {totalFound} that meet the standard. You have three options: upload additional data and its source URL directly, broaden your topic to surface more results, or choose a different angle entirely. All data used in your infographic will be fully cited.
            </div>
          )}

          {!phase1Complete && (
            <>
              {/* Manual add */}
              <div style={{ marginTop: 14, padding: 14, background: 'var(--card-alt)', border: '1px solid var(--border-light)', borderRadius: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>Add your own verified source</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 6 }}>
                  <textarea
                    className="form-input form-textarea"
                    rows={2}
                    placeholder="Claim / data point (e.g. 'Teen nicotine use rose 27% from 2015-2020')"
                    value={extraSource.claim}
                    onChange={(e) => setExtraSource({ ...extraSource, claim: e.target.value })}
                  />
                  <input
                    className="form-input"
                    placeholder="Source name (CDC, NIH, etc.)"
                    value={extraSource.source_name}
                    onChange={(e) => setExtraSource({ ...extraSource, source_name: e.target.value })}
                  />
                  <input
                    className="form-input"
                    placeholder="https://source-url.com/…"
                    value={extraSource.source_url}
                    onChange={(e) => setExtraSource({ ...extraSource, source_url: e.target.value })}
                  />
                  <input
                    className="form-input"
                    placeholder="Year (optional)"
                    value={extraSource.year}
                    onChange={(e) => setExtraSource({ ...extraSource, year: e.target.value })}
                  />
                  <button type="button" className="btn-secondary" onClick={addExtraSource}
                    disabled={!extraSource.claim.trim() || !extraSource.source_url.trim()}>
                    Add source
                  </button>
                </div>
              </div>

              {/* Broaden + confirm */}
              <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                <button type="button" className="btn-ghost" onClick={() => runResearch({ broaden: true })} disabled={searching}>
                  {searching ? 'Broadening…' : 'Broaden topic'}
                </button>
                <button type="button" className="btn-primary" disabled={(totalFound ?? 0) < 3} onClick={confirmData}>
                  Confirm Data and Continue →
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Phase 2 — unlocks after dataConfirmed */}
      {phase1Complete && (
        <>
          <div style={sectionTitleStyle}>Phase 2 — Visual Styling</div>
          <div className="form-group">
            <label className="form-label">Chart Type</label>
            <select className="form-input form-select" value={chartType} onChange={(e) => setChartType(e.target.value)}>
              {CHART_TYPES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Color Palette</label>
            <select className="form-input form-select" value={colorPalette} onChange={(e) => setColorPalette(e.target.value)}>
              {COLOR_PALETTES.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Layout / Style Template <span className="required">✦</span></label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {TEMPLATES.map((t) => (
                <button key={t.id} type="button" onClick={() => setStyleId(t.id)}
                  style={{
                    background: styleId === t.id ? "var(--green-glow)" : "var(--card)",
                    border: styleId === t.id ? "1.5px solid var(--green)" : "1px solid var(--border)",
                    borderRadius: 12, padding: 14, cursor: "pointer", textAlign: "left",
                    transition: "all 0.15s",
                    boxShadow: styleId === t.id ? "0 0 0 3px var(--green-glow)" : "var(--shadow-card)",
                  }}>
                  <div style={{ background: "var(--bg)", borderRadius: 6, padding: 6, marginBottom: 10 }}>
                    <TemplatePreview id={t.id} />
                  </div>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 600, color: "var(--text)", marginBottom: 2 }}>{t.name}</div>
                  <div style={{ fontSize: 12, color: "var(--text-light)" }}>{t.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Output Format</label>
            <div style={{ display: "flex", gap: 12 }}>
              {(["html", "jpeg"] as const).map((fmt) => (
                <button key={fmt} type="button" onClick={() => setOutputFormat(fmt)}
                  style={{
                    flex: 1, padding: "12px 16px", borderRadius: 8,
                    border: outputFormat === fmt ? "1.5px solid var(--green)" : "1.5px solid var(--border)",
                    background: outputFormat === fmt ? "var(--green-glow)" : "var(--surface-inp)",
                    color: outputFormat === fmt ? "var(--green)" : "var(--text-mid)",
                    fontFamily: "var(--font-ui)", fontSize: 14, fontWeight: 600,
                    cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.04em",
                    transition: "all 0.15s",
                  }}>
                  {fmt}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Author Voice</label>
            <input className="form-input" value={authors.find(a => a.slug === author)?.name || "Infographic"} disabled style={{ opacity: 0.7, cursor: "not-allowed" }} />
            <p className="form-hint">Locked to the Infographic agent voice.</p>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24, gap: 8 }}>
            <button type="button" className="btn-secondary" onClick={() => { setDataConfirmed(false); setStyleId(''); }}>
              ← Edit sources
            </button>
            <button type="button" className="btn-primary" onClick={handleSubmit} disabled={submitting || !styleId}>
              {submitting ? "Building…" : "Build Infographic →"}
            </button>
          </div>
        </>
      )}
      </div>
    </PageShell>
  );
}
