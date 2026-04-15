// src/pages/InfographicBrief.tsx
// /brief/infographic — single-step infographic brief.
// Pre-fills topic from the dashboard "→ Infographic" handoff via sessionStorage.

import { useEffect, useState } from "react";

interface AuthorRow { slug: string; name: string }

const TEMPLATES = [
  { id: "data-story",  name: "Data Story",  desc: "Bar/column charts, statistics-led" },
  { id: "timeline",    name: "Timeline",    desc: "Sequential horizontal flow" },
  { id: "process-map", name: "Process Map", desc: "Circular or vertical steps" },
  { id: "comparison",  name: "Comparison",  desc: "Side-by-side two-column layout" },
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
  // comparison
  return (
    <svg viewBox="0 0 80 50" width="100%" height="64" preserveAspectRatio="xMidYMid meet">
      <rect x="6"  y="6" width="32" height="38" rx="3" fill={fill} opacity="0.7"/>
      <rect x="42" y="6" width="32" height="38" rx="3" fill={accent} opacity="0.7"/>
      <line x1="40" y1="6" x2="40" y2="44" stroke="var(--card)" strokeWidth="0.8" strokeDasharray="2 2"/>
    </svg>
  );
}

export default function InfographicBrief({ navigate }: { navigate?: (p: string) => void }) {
  // Handoff banner from dashboard
  const [handoff, setHandoff] = useState<{ source_submission_id: string; topic: string } | null>(null);

  const [topic, setTopic] = useState("");
  const [theory, setTheory] = useState("");
  const [author, setAuthor] = useState("infographic-agent");
  const [authors, setAuthors] = useState<AuthorRow[]>([]);
  const [styleId, setStyleId] = useState("");
  const [outputFormat, setOutputFormat] = useState<"html" | "jpeg">("html");
  const [csv, setCsv] = useState<File | null>(null);
  const [rawDataUrl, setRawDataUrl] = useState("");
  const [relevantLinks, setRelevantLinks] = useState<string[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("infographic_handoff");
      if (raw) {
        const p = JSON.parse(raw);
        if (p?.topic) {
          setHandoff(p);
          setTopic(p.topic);
        }
      }
    } catch {}

    fetch("/api/authors", { credentials: "include" })
      .then((r) => r.ok ? r.json() : { authors: [] })
      .then((d) => {
        const list: AuthorRow[] = d.authors || [];
        setAuthors(list);
        // Lock to infographic-agent if available
        const ig = list.find((a) => a.slug === "infographic-agent");
        if (ig) setAuthor(ig.slug);
      })
      .catch(() => {});
  }, []);

  function dismissBanner() {
    sessionStorage.removeItem("infographic_handoff");
    setHandoff(null);
    setTopic("");
  }

  function addLink() { setRelevantLinks([...relevantLinks, ""]); }
  function setLink(i: number, v: string) { setRelevantLinks(relevantLinks.map((u, idx) => idx === i ? v : u)); }
  function removeLink(i: number) { setRelevantLinks(relevantLinks.filter((_, idx) => idx !== i)); }

  function validate(): string | null {
    if (!topic.trim()) return "Topic is required";
    if (!theory.trim()) return "Theory / outcome is required";
    if (!styleId) return "Pick a style template";
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const v = validate();
    if (v) { setError(v); return; }
    setSubmitting(true);

    try {
      const body = {
        topic: topic.trim(),
        author,
        article_format: "infographic",
        optimization_target: "social-sharing",
        tone_stance: "neutral",
        min_word_count: "300",
        human_observation: theory.trim(),
        infographic: {
          design_style: styleId,
          output_format: outputFormat,
        },
      };

      const res = await fetch("/api/infographic-submissions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Submit failed");

      // Clear handoff so it doesn't pre-fill again on the next visit
      sessionStorage.removeItem("infographic_handoff");
      setDone(true);
    } catch (err: any) {
      setError(err?.message || "Submit failed");
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
          <p className="confirm-sub">Your infographic is being assembled. You'll see it on your dashboard once it's ready.</p>
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

  return (
    <div className="page"><div style={{ maxWidth: 680, margin: "0 auto", padding: "32px 24px" }}>
      <h1 className="page-title">Build Infographic</h1>
      <p className="page-sub">Turn data into a visual that gets shared.</p>

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

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">Topic <span className="required">✦</span></label>
          <input type="text" className="form-input" value={topic} onChange={(e) => setTopic(e.target.value)} required placeholder="What's the infographic about?" />
        </div>

        <div className="form-group">
          <label className="form-label">What theory or outcome should this infographic support? <span className="required">✦</span></label>
          <textarea className="form-input form-textarea" rows={4} value={theory} onChange={(e) => setTheory(e.target.value)} required placeholder="The single point the visual should drive home." />
        </div>

        <div className="form-group">
          <label className="form-label">Relevant Links</label>
          {relevantLinks.map((u, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
              <input type="url" className="form-input" placeholder="https://..." value={u} onChange={(e) => setLink(i, e.target.value)} style={{ flex: 1, minWidth: 0 }} />
              <button type="button" onClick={() => removeLink(i)} className="btn-danger-sm">Remove</button>
            </div>
          ))}
          <button type="button" onClick={addLink} className="btn-ghost" style={{ marginTop: 4 }}>+ Add link</button>
        </div>

        <div style={sectionTitleStyle}>Data Sources</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Excel / CSV upload</label>
            <label
              htmlFor="csv-upload-input"
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "10px 14px",
                background: "var(--surface-inp)",
                border: "1.5px dashed var(--border)",
                borderRadius: 8,
                cursor: "pointer",
                fontFamily: "var(--font-ui)",
                fontSize: 13,
                color: "var(--text-mid)",
                minWidth: 0,
              }}
            >
              <span style={{
                padding: "5px 12px",
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                fontWeight: 600,
                color: "var(--green)",
                flexShrink: 0,
                fontSize: 12,
              }}>Choose file</span>
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {csv ? csv.name : "No file selected"}
              </span>
            </label>
            <input
              id="csv-upload-input"
              type="file"
              accept=".csv,.xlsx,.xls,text/csv"
              onChange={(e) => setCsv(e.target.files?.[0] || null)}
              style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0,0,0,0)", border: 0 }}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 0 }}>
            <label className="form-label">Raw data link</label>
            <input type="url" className="form-input" placeholder="Sheet, doc, or page URL" value={rawDataUrl} onChange={(e) => setRawDataUrl(e.target.value)} />
          </div>
        </div>

        <div className="form-group" style={{ marginTop: 16 }}>
          <label className="form-label">Author Voice</label>
          <input className="form-input" value={authors.find(a => a.slug === author)?.name || "Infographic"} disabled style={{ opacity: 0.7, cursor: "not-allowed" }} />
          <p className="form-hint">Locked to the Infographic agent voice.</p>
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
          <label className="form-label">Style Template <span className="required">✦</span></label>
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

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}>
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? "Building…" : "Build Infographic →"}
          </button>
        </div>
      </form>
    </div></div>
  );
}
