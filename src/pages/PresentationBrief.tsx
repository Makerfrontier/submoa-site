// src/pages/PresentationBrief.tsx
// /brief/presentation — PowerPoint deck builder.
// Range slider for slide count, per-slide plan table, tag-style keywords.

import { useEffect, useState } from "react";

interface SlideRow { slide_type: string; notes: string }
interface AuthorRow { slug: string; name: string }

// Display label → internal slide_type value the assembler understands.
const SLIDE_TYPES: { value: string; label: string }[] = [
  { value: "title",      label: "Title Slide" },
  { value: "section",    label: "Section Header" },
  { value: "content",    label: "Content + Image" },
  { value: "content",    label: "Full Image" },
  { value: "chart",      label: "Data / Chart" },
  { value: "content",    label: "Bullet Points" },
  { value: "quote",      label: "Quote" },
  { value: "comparison", label: "Two-Column" },
  { value: "closing",    label: "Call to Action" },
  { value: "closing",    label: "Thank You" },
];

export default function PresentationBrief({ navigate }: { navigate?: (p: string) => void }) {
  const [topic, setTopic] = useState("");
  const [author, setAuthor] = useState("");
  const [authors, setAuthors] = useState<AuthorRow[]>([]);
  const [keyDetails, setKeyDetails] = useState("");
  const [slideCount, setSlideCount] = useState(8);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState("");
  const [includeCharts, setIncludeCharts] = useState(false);
  const [includeImages, setIncludeImages] = useState(false);
  const [images, setImages] = useState<File[]>([]);
  const [template, setTemplate] = useState<File | null>(null);
  const [plan, setPlan] = useState<SlideRow[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/authors", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { authors: [] }))
      .then((d) => {
        const list: AuthorRow[] = (d.authors || []).filter((a: any) => a.slug && a.slug !== "infographic-agent");
        setAuthors(list);
        if (list.length && !author) setAuthor(list[0].slug);
      })
      .catch(() => {});
  }, []);

  function addKeyword() {
    const k = keywordInput.trim().replace(/,$/, "").trim();
    if (!k || keywords.includes(k)) { setKeywordInput(""); return; }
    setKeywords([...keywords, k]);
    setKeywordInput("");
  }
  function removeKeyword(i: number) { setKeywords(keywords.filter((_, idx) => idx !== i)); }

  function addSlide() { if (plan.length >= 40) return; setPlan([...plan, { slide_type: "content", notes: "" }]); }
  function updateSlide(i: number, key: keyof SlideRow, val: string) {
    setPlan(plan.map((s, idx) => (idx === i ? { ...s, [key]: val } : s)));
  }
  function removeSlide(i: number) { setPlan(plan.filter((_, idx) => idx !== i)); }

  function onPickImages(e: React.ChangeEvent<HTMLInputElement>) {
    setImages(Array.from(e.target.files || []).slice(0, 10));
  }

  function validate(): string | null {
    if (!topic.trim()) return "Topic / title is required";
    if (!keyDetails.trim()) return "Key details are required";
    if (!template) return "Upload a .pptx template";
    if (!template.name.toLowerCase().endsWith(".pptx")) return "Template must be a .pptx file";
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const v = validate();
    if (v) { setError(v); return; }
    setSubmitting(true);

    try {
      const fd = new FormData();
      fd.append("topic", topic.trim());
      fd.append("author", author);
      fd.append("key_details", keyDetails.trim());
      fd.append("target_keywords", keywords.length ? keywords.join(", ") : "");
      fd.append("slide_count_target", String(slideCount));
      fd.append("include_charts", includeCharts ? "1" : "0");
      fd.append("include_images", includeImages ? "1" : "0");
      const cleanedPlan = plan.filter((s) => s.notes.trim());
      if (cleanedPlan.length) fd.append("structured_notes", JSON.stringify(cleanedPlan));
      fd.append("template", template!, template!.name);
      if (includeImages) for (const f of images) fd.append("images", f, f.name);

      const res = await fetch("/api/presentation-submissions", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Submit failed");
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
          <h1 className="confirm-title">Presentation brief received.</h1>
          <p className="confirm-sub">Your deck is being assembled. You'll see it on your dashboard once it's ready.</p>
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
      <h1 className="page-title">Build Deck</h1>
      <p className="page-sub">Upload a .pptx template and brief us. We'll generate a fresh deck styled to match your template's colors and fonts.</p>

      {error && (
        <div style={{ background: "var(--error-bg)", border: "1px solid var(--error-border)", borderRadius: 6, padding: "10px 14px", fontSize: 13, color: "var(--error)", marginBottom: 16 }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Content */}
        <div style={sectionTitleStyle}>Content</div>

        <div className="form-group">
          <label className="form-label">Topic / Title <span className="required">✦</span></label>
          <input type="text" className="form-input" value={topic} onChange={(e) => setTopic(e.target.value)} required placeholder="What is this presentation about?" />
        </div>

        <div className="form-group">
          <label className="form-label">Author Voice</label>
          <select className="form-input form-select" value={author} onChange={(e) => setAuthor(e.target.value)}>
            {authors.length === 0 ? <option value="">No author profiles available</option> : authors.map((a) => <option key={a.slug} value={a.slug}>{a.name}</option>)}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Key Details <span className="required">✦</span></label>
          <textarea className="form-input form-textarea" rows={5} value={keyDetails} onChange={(e) => setKeyDetails(e.target.value)} required
            placeholder="Main points, data highlights, thesis — what the deck needs to communicate." />
        </div>

        {/* Specs */}
        <div style={sectionTitleStyle}>Specs</div>

        <div className="form-group">
          <label className="form-label">Target Slide Count</label>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <input type="range" min={5} max={40} value={slideCount} onChange={(e) => setSlideCount(Number(e.target.value))}
              style={{ flex: 1, accentColor: "var(--green)" }} />
            <div style={{ minWidth: 64, textAlign: "right" }}>
              <span style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 700, color: "var(--green)" }}>{slideCount}</span>
              <span style={{ fontSize: 12, color: "var(--text-light)", marginLeft: 6 }}>slides</span>
            </div>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Target Keywords</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: 8, border: "1.5px solid var(--border)", borderRadius: 8, background: "var(--surface-inp)", minHeight: 44, alignItems: "center", cursor: "text" }}
            onClick={() => document.getElementById("kw-input")?.focus()}>
            {keywords.map((kw, i) => (
              <span key={i} className="tag">
                {i === 0 && <span className="tag-star">★</span>}
                {kw}
                <button type="button" className="tag-remove" onClick={() => removeKeyword(i)}>×</button>
              </span>
            ))}
            <input id="kw-input" type="text" value={keywordInput} onChange={(e) => setKeywordInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addKeyword(); } else if (e.key === "Backspace" && !keywordInput && keywords.length) { removeKeyword(keywords.length - 1); } }}
              onBlur={() => { if (keywordInput.trim()) addKeyword(); }}
              placeholder={keywords.length ? "" : "Type keyword, press Enter"}
              style={{ border: "none", outline: "none", background: "transparent", fontSize: 14, color: "var(--text)", flex: 1, minWidth: 120, padding: "2px 4px", fontFamily: "inherit" }} />
          </div>
        </div>

        <label className="checkbox-label" style={{ marginBottom: 8 }}>
          <input type="checkbox" checked={includeCharts} onChange={(e) => setIncludeCharts(e.target.checked)} />
          <span><strong>Include Charts</strong> <span style={{ color: "var(--text-light)", fontWeight: "normal", fontSize: 12 }}>— requires data upload or numeric details</span></span>
        </label>
        <label className="checkbox-label" style={{ marginBottom: 16 }}>
          <input type="checkbox" checked={includeImages} onChange={(e) => setIncludeImages(e.target.checked)} />
          <span><strong>Include Images</strong> <span style={{ color: "var(--text-light)", fontWeight: "normal", fontSize: 12 }}>— place uploaded images into relevant slides</span></span>
        </label>

        {includeImages && (
          <div className="form-group">
            <label className="form-label">Images (up to 10, jpg/png/webp)</label>
            <input type="file" multiple accept=".jpg,.jpeg,.png,.webp,image/*" onChange={onPickImages} />
            {images.length > 0 && (
              <p className="form-hint">{images.length} image{images.length === 1 ? "" : "s"} selected</p>
            )}
          </div>
        )}

        {/* Per-slide plan */}
        <div style={sectionTitleStyle}>Per-Slide Plan (optional)</div>

        {plan.length > 0 && (
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", marginBottom: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "var(--card-alt)", borderBottom: "1px solid var(--border)" }}>
                  <th style={{ padding: "8px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "var(--text-light)", textTransform: "uppercase", letterSpacing: "0.06em", width: 36 }}>#</th>
                  <th style={{ padding: "8px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "var(--text-light)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Type</th>
                  <th style={{ padding: "8px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "var(--text-light)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Notes</th>
                  <th style={{ width: 40 }}></th>
                </tr>
              </thead>
              <tbody>
                {plan.map((row, i) => (
                  <tr key={i} style={{ borderTop: i > 0 ? "1px solid var(--border-faint)" : "none" }}>
                    <td style={{ padding: "8px 12px", color: "var(--text-mid)", fontFamily: "var(--font-mono)", fontSize: 12 }}>{i + 1}</td>
                    <td style={{ padding: "6px 8px" }}>
                      <select className="form-input form-select" value={row.slide_type} onChange={(e) => updateSlide(i, "slide_type", e.target.value)}
                        style={{ padding: "6px 28px 6px 10px", fontSize: 13 }}>
                        {SLIDE_TYPES.map((t, idx) => <option key={`${idx}-${t.label}`} value={t.value}>{t.label}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: "6px 8px" }}>
                      <input type="text" className="form-input" value={row.notes} onChange={(e) => updateSlide(i, "notes", e.target.value)}
                        placeholder="What goes on this slide?" style={{ padding: "6px 10px", fontSize: 13 }} />
                    </td>
                    <td style={{ padding: "6px 8px", textAlign: "center" }}>
                      <button type="button" onClick={() => removeSlide(i)}
                        style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--error)", fontSize: 18, padding: 4, lineHeight: 1 }}
                        aria-label="Remove">×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {plan.length < 40 && (
          <button type="button" onClick={addSlide} className="btn-ghost">+ Add Slide</button>
        )}

        {/* Template */}
        <div style={sectionTitleStyle}>Template</div>

        <div className="form-group">
          <label className="form-label">Upload your .pptx template <span className="required">✦</span></label>
          <label
            htmlFor="pptx-template-input"
            style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "12px 16px",
              background: "var(--surface-inp)",
              border: "1.5px dashed var(--border)",
              borderRadius: 8,
              cursor: "pointer",
              transition: "border-color 0.15s, background 0.15s",
              fontFamily: "var(--font-ui)",
              fontSize: 13,
              color: "var(--text-mid)",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLLabelElement).style.borderColor = "var(--green)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLLabelElement).style.borderColor = "var(--border)"; }}
          >
            <span style={{
              padding: "6px 14px",
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              fontWeight: 600,
              color: "var(--green)",
              flexShrink: 0,
            }}>
              Choose file
            </span>
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {template ? template.name : "No file selected"}
            </span>
          </label>
          <input
            id="pptx-template-input"
            type="file"
            accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
            onChange={(e) => setTemplate(e.target.files?.[0] || null)}
            required
            style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0,0,0,0)", border: 0 }}
          />
          <p className="form-hint">Theme colors and fonts will be detected and matched. Slides are generated fresh.</p>
          {template && <p className="form-hint" style={{ color: "var(--green)" }}>Selected: {template.name} ({(template.size / 1024 / 1024).toFixed(2)} MB)</p>}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}>
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? "Building…" : "Build Deck →"}
          </button>
        </div>
      </form>
    </div></div>
  );
}
