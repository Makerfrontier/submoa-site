// src/pages/EmailBrief.tsx
// /brief/email — HTML Email Template Builder brief

import { useEffect, useMemo, useState } from "react";

interface Section { title: string; brief: string }
interface SavedTemplate {
  id: string;
  template_name: string;
  template_type: string;
  subject_line?: string | null;
  preheader_text?: string | null;
  brand_name?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  brand_voice?: string | null;
  logo_url?: string | null;
  cta_text?: string | null;
  cta_url?: string | null;
  unsubscribe_url?: string | null;
  company_address?: string | null;
  sections?: string | null;
}
interface AssetRow { id: string; filename: string; url: string }
interface AuthorRow { slug: string; name: string }

const TEMPLATE_TYPES = [
  { value: "newsletter", label: "Newsletter" },
  { value: "transactional", label: "Process / Transactional" },
  { value: "marketing", label: "Marketing / Email Blast" },
];

export default function EmailBrief({ navigate }: { navigate?: (p: string) => void }) {
  // ── Setup
  const [templateType, setTemplateType] = useState("newsletter");
  const [templateName, setTemplateName] = useState("");
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);

  // ── Load Saved
  const [templates, setTemplates] = useState<SavedTemplate[]>([]);
  const [loadId, setLoadId] = useState("");

  // ── Identity
  const [brandName, setBrandName] = useState("");
  const [brandVoice, setBrandVoice] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [author, setAuthor] = useState("");
  const [authors, setAuthors] = useState<AuthorRow[]>([]);
  const [assets, setAssets] = useState<AssetRow[]>([]);

  // ── Colors
  const [primaryColor, setPrimaryColor] = useState("#c8973a");
  const [secondaryColor, setSecondaryColor] = useState("#1e3a1e");

  // ── Content
  const [subjectLine, setSubjectLine] = useState("");
  const [preheaderText, setPreheaderText] = useState("");
  const [contentBrief, setContentBrief] = useState("");
  const [sections, setSections] = useState<Section[]>([]);
  const [ctaText, setCtaText] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");

  // ── Compliance
  const [unsubscribeUrl, setUnsubscribeUrl] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");

  // ── API push
  const [pushOpen, setPushOpen] = useState(false);
  const [apiPushEnabled, setApiPushEnabled] = useState(false);
  const [apiPushService, setApiPushService] = useState("sendgrid");
  const [sendgridApiKey, setSendgridApiKey] = useState("");
  const [sendgridListId, setSendgridListId] = useState("");
  const [aweberAccount, setAweberAccount] = useState("");

  // ── State
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load templates, assets, authors on mount
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/email-templates", { credentials: "include" });
        if (r.ok) {
          const d = await r.json();
          setTemplates(d.templates || []);
        }
      } catch {}

      try {
        const r = await fetch("/api/email-assets", { credentials: "include" });
        if (r.ok) {
          const d = await r.json();
          setAssets(d.assets || []);
        }
      } catch {}

      try {
        const r = await fetch("/api/authors", { credentials: "include" });
        if (r.ok) {
          const d = await r.json();
          const list: AuthorRow[] = (d.authors || []).filter(
            (a: any) => a.slug && a.slug !== "infographic-agent"
          );
          setAuthors(list);
          if (list.length > 0 && !author) setAuthor(list[0].slug);
        }
      } catch {}
    })();
  }, []);

  // Apply selected saved template
  useEffect(() => {
    if (!loadId) return;
    const t = templates.find((x) => x.id === loadId);
    if (!t) return;
    setTemplateType(t.template_type || templateType);
    setTemplateName(t.template_name || "");
    setSubjectLine(t.subject_line || "");
    setPreheaderText(t.preheader_text || "");
    setBrandName(t.brand_name || "");
    setBrandVoice(t.brand_voice || "");
    setLogoUrl(t.logo_url || "");
    if (t.primary_color) setPrimaryColor(t.primary_color);
    if (t.secondary_color) setSecondaryColor(t.secondary_color);
    setCtaText(t.cta_text || "");
    setCtaUrl(t.cta_url || "");
    setUnsubscribeUrl(t.unsubscribe_url || "");
    setCompanyAddress(t.company_address || "");
    if (t.sections) {
      try {
        const parsed = JSON.parse(t.sections);
        if (Array.isArray(parsed)) setSections(parsed);
      } catch {}
    }
  }, [loadId, templates]);

  const isMarketing = templateType === "marketing";

  function addSection() {
    if (sections.length >= 5) return;
    setSections([...sections, { title: "", brief: "" }]);
  }
  function updateSection(i: number, key: keyof Section, val: string) {
    setSections(sections.map((s, idx) => (idx === i ? { ...s, [key]: val } : s)));
  }
  function removeSection(i: number) {
    setSections(sections.filter((_, idx) => idx !== i));
  }

  function validate(): string | null {
    if (!templateType) return "Template type is required";
    if (!templateName.trim()) return "Template name is required";
    if (!brandName.trim()) return "Brand name is required";
    if (!subjectLine.trim()) return "Subject line is required";
    if (!contentBrief.trim()) return "Content brief is required";
    if (isMarketing) {
      if (!unsubscribeUrl.trim()) return "Unsubscribe URL is required for marketing emails";
      if (!companyAddress.trim()) return "Company address is required for marketing emails (CAN-SPAM)";
    }
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
        template_type: templateType,
        template_name: templateName.trim(),
        subject_line: subjectLine.trim(),
        preheader_text: preheaderText.trim() || null,
        brand_name: brandName.trim(),
        primary_color: primaryColor,
        secondary_color: secondaryColor,
        brand_voice: brandVoice.trim() || null,
        logo_url: logoUrl.trim() || null,
        author: author || null,
        content_brief: contentBrief.trim(),
        sections: sections.filter((s) => s.title.trim() && s.brief.trim()),
        cta_text: ctaText.trim() || null,
        cta_url: ctaUrl.trim() || null,
        unsubscribe_url: unsubscribeUrl.trim() || null,
        company_address: companyAddress.trim() || null,
        sendgrid_api_key: apiPushEnabled && apiPushService === "sendgrid" ? sendgridApiKey.trim() : null,
        aweber_account: apiPushEnabled && apiPushService === "aweber" ? aweberAccount.trim() : null,
        api_push_enabled: apiPushEnabled ? 1 : 0,
        api_push_service: apiPushEnabled ? apiPushService : null,
        save_as_template: saveAsTemplate,
      };

      const res = await fetch("/api/email-submissions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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
      <div className="page"><div className="container">
        <div className="form-card" style={{ maxWidth: 640, margin: "60px auto", textAlign: "center" }}>
          <div className="confirm-icon">✓</div>
          <h1 className="confirm-title">Email brief received.</h1>
          <p className="confirm-sub">Your email is being assembled. You'll see it on your dashboard once it's ready.</p>
          <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap", marginTop: "1.5rem" }}>
            <button className="btn-primary" onClick={() => navigate?.("/dashboard")}>View Dashboard</button>
            <button className="btn-secondary" onClick={() => window.location.reload()}>Submit Another</button>
          </div>
        </div>
      </div></div>
    );
  }

  // ── UI helpers
  const sectionTitleStyle: React.CSSProperties = {
    fontFamily: "Georgia, serif", fontSize: 16, color: "var(--amber)",
    marginTop: 32, marginBottom: 12, paddingBottom: 6,
    borderBottom: "0.5px solid var(--border)",
  };

  return (
    <div className="page"><div className="container">
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "3rem 0" }}>
        <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "1.625rem", fontWeight: 700, color: "var(--cream)", marginBottom: "1.5rem" }}>
          Email Builder.
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-light)", marginBottom: "2rem" }}>
          Build a bulletproof, table-based HTML email with inline CSS, plain-text fallback, and (optionally) one-click push to your ESP.
        </p>

        {error && (
          <div style={{ background: "#1f0a0a", border: "0.5px solid #5a1a1a", borderRadius: 5, padding: "10px 14px", fontSize: 13, color: "var(--error)", marginBottom: 16 }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Template Setup */}
          <div style={sectionTitleStyle}>Template Setup</div>

          <div className="form-group">
            <label className="form-label">Template Type *</label>
            <select className="form-input" value={templateType} onChange={(e) => setTemplateType(e.target.value)} required>
              {TEMPLATE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Template Name *</label>
            <input className="form-input" type="text" placeholder="Save this template as..."
              value={templateName} onChange={(e) => setTemplateName(e.target.value)} required />
          </div>

          <label style={{ display: "flex", gap: 8, alignItems: "center", margin: "0 0 12px 0", fontSize: 13, color: "var(--text)" }}>
            <input type="checkbox" checked={saveAsTemplate} onChange={(e) => setSaveAsTemplate(e.target.checked)} />
            Save as reusable template
          </label>

          {templates.length > 0 && (
            <div className="form-group">
              <label className="form-label">Load saved template (optional)</label>
              <select className="form-input" value={loadId} onChange={(e) => setLoadId(e.target.value)}>
                <option value="">— none —</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.template_name} ({t.template_type})</option>)}
              </select>
            </div>
          )}

          {/* Identity */}
          <div style={sectionTitleStyle}>Identity</div>

          <div className="form-group">
            <label className="form-label">Brand Name *</label>
            <input className="form-input" type="text" value={brandName} onChange={(e) => setBrandName(e.target.value)} required />
          </div>

          <div className="form-group">
            <label className="form-label">Brand Voice / Tagline</label>
            <input className="form-input" type="text" placeholder="One line describing your brand"
              value={brandVoice} onChange={(e) => setBrandVoice(e.target.value)} />
          </div>

          <div className="form-group">
            <label className="form-label">Logo URL</label>
            <input className="form-input" type="text" placeholder="https://..."
              value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} />
            {assets.length > 0 && (
              <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-light)" }}>
                Or pick an uploaded asset:{" "}
                {assets.map((a) => (
                  <button key={a.id} type="button"
                    onClick={() => setLogoUrl(a.url)}
                    style={{ marginRight: 6, padding: "2px 8px", borderRadius: 4, fontSize: 11,
                      border: "0.5px solid var(--border)", background: "transparent", color: "var(--amber)", cursor: "pointer" }}>
                    {a.filename}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Author Voice</label>
            <select className="form-input" value={author} onChange={(e) => setAuthor(e.target.value)}>
              {authors.length === 0
                ? <option value="">No author profiles available</option>
                : authors.map((a) => <option key={a.slug} value={a.slug}>{a.name}</option>)}
            </select>
          </div>

          {/* Colors */}
          <div style={sectionTitleStyle}>Colors</div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <ColorField label="Primary" sub="header, CTA, accents" value={primaryColor} onChange={setPrimaryColor} />
            <ColorField label="Secondary" sub="body, footer, dividers" value={secondaryColor} onChange={setSecondaryColor} />
          </div>
          <p style={{ fontSize: 12, color: "var(--text-light)", marginTop: 8 }}>
            The agent will derive complementary sub-colors automatically.
          </p>

          {/* Content */}
          <div style={sectionTitleStyle}>Content</div>

          <div className="form-group">
            <label className="form-label">Subject Line *</label>
            <input className="form-input" type="text" value={subjectLine} onChange={(e) => setSubjectLine(e.target.value)} required maxLength={120} />
          </div>

          <div className="form-group">
            <label className="form-label">Preheader Text</label>
            <input className="form-input" type="text"
              placeholder="Preview text shown in inbox before opening. Agent generates if blank."
              value={preheaderText} onChange={(e) => setPreheaderText(e.target.value)} maxLength={150} />
          </div>

          <div className="form-group">
            <label className="form-label">Content Brief *</label>
            <textarea className="form-input" rows={5}
              placeholder="What is this email about? Be as brief or detailed as you like."
              value={contentBrief} onChange={(e) => setContentBrief(e.target.value)} required />
          </div>

          <div className="form-group">
            <label className="form-label">Sections (up to 5)</label>
            {sections.map((s, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 8 }}>
                <input className="form-input" style={{ flex: "1 1 200px", minWidth: 0 }}
                  placeholder="Section title"
                  value={s.title} onChange={(e) => updateSection(i, "title", e.target.value)} />
                <input className="form-input" style={{ flex: "2 1 300px", minWidth: 0 }}
                  placeholder="Section brief"
                  value={s.brief} onChange={(e) => updateSection(i, "brief", e.target.value)} />
                <button type="button" onClick={() => removeSection(i)}
                  style={{ flexShrink: 0, padding: "8px 12px", border: "0.5px solid #5a1a1a", color: "var(--error)", background: "transparent", borderRadius: 4, cursor: "pointer", fontSize: 12 }}>
                  Remove
                </button>
              </div>
            ))}
            {sections.length < 5 && (
              <button type="button" onClick={addSection}
                style={{ padding: "6px 12px", border: "0.5px solid var(--border)", color: "var(--amber)", background: "transparent", borderRadius: 4, cursor: "pointer", fontSize: 12 }}>
                + Add Section
              </button>
            )}
          </div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div className="form-group" style={{ flex: "1 1 200px", minWidth: 0 }}>
              <label className="form-label">CTA Button Text</label>
              <input className="form-input" type="text" value={ctaText} onChange={(e) => setCtaText(e.target.value)} maxLength={40} />
            </div>
            <div className="form-group" style={{ flex: "2 1 300px", minWidth: 0 }}>
              <label className="form-label">CTA URL</label>
              <input className="form-input" type="text" value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} placeholder="https://..." />
            </div>
          </div>

          {/* Compliance */}
          {isMarketing && (
            <>
              <div style={sectionTitleStyle}>Compliance (CAN-SPAM)</div>
              <div className="form-group">
                <label className="form-label">Unsubscribe URL *</label>
                <input className="form-input" type="text" value={unsubscribeUrl} onChange={(e) => setUnsubscribeUrl(e.target.value)} required />
              </div>
              <div className="form-group">
                <label className="form-label">Company Address *</label>
                <input className="form-input" type="text" value={companyAddress} onChange={(e) => setCompanyAddress(e.target.value)} required />
              </div>
            </>
          )}

          {/* API push */}
          <div style={sectionTitleStyle}>
            <button type="button" onClick={() => setPushOpen((v) => !v)}
              style={{ all: "unset", cursor: "pointer", color: "var(--amber)", fontFamily: "Georgia, serif", fontSize: 16 }}>
              API Push (optional) {pushOpen ? "▾" : "▸"}
            </button>
          </div>
          {pushOpen && (
            <>
              <label style={{ display: "flex", gap: 8, alignItems: "center", margin: "0 0 12px 0", fontSize: 13, color: "var(--text)" }}>
                <input type="checkbox" checked={apiPushEnabled} onChange={(e) => setApiPushEnabled(e.target.checked)} />
                Push to email service after building
              </label>

              {apiPushEnabled && (
                <>
                  <div className="form-group">
                    <label className="form-label">Service</label>
                    <div style={{ display: "flex", gap: 16 }}>
                      <label style={{ display: "flex", gap: 6, alignItems: "center", color: "var(--text)", fontSize: 13 }}>
                        <input type="radio" name="apiSvc" value="sendgrid" checked={apiPushService === "sendgrid"} onChange={() => setApiPushService("sendgrid")} />
                        SendGrid
                      </label>
                      <label style={{ display: "flex", gap: 6, alignItems: "center", color: "var(--text)", fontSize: 13 }}>
                        <input type="radio" name="apiSvc" value="aweber" checked={apiPushService === "aweber"} onChange={() => setApiPushService("aweber")} />
                        AWeber
                      </label>
                    </div>
                  </div>

                  {apiPushService === "sendgrid" && (
                    <>
                      <div className="form-group">
                        <label className="form-label">SendGrid API Key</label>
                        <input className="form-input" type="password" value={sendgridApiKey} onChange={(e) => setSendgridApiKey(e.target.value)} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">SendGrid List ID</label>
                        <input className="form-input" type="text" value={sendgridListId} onChange={(e) => setSendgridListId(e.target.value)} />
                      </div>
                    </>
                  )}

                  {apiPushService === "aweber" && (
                    <div className="form-group">
                      <label className="form-label">AWeber Account ID</label>
                      <input className="form-input" type="text" value={aweberAccount} onChange={(e) => setAweberAccount(e.target.value)} />
                    </div>
                  )}
                </>
              )}
            </>
          )}

          <button type="submit" className="btn-primary" disabled={submitting}
            style={{ width: "100%", marginTop: 24 }}>
            {submitting ? "Building..." : "Build Email"}
          </button>
        </form>
      </div>
    </div></div>
  );
}

function ColorField({ label, sub, value, onChange }: { label: string; sub: string; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ flex: "1 1 240px", minWidth: 0 }}>
      <label className="form-label" style={{ display: "block" }}>{label}</label>
      <div style={{ fontSize: 11, color: "var(--text-light)", marginBottom: 6 }}>{sub}</div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input type="color" value={normalizeHex(value)} onChange={(e) => onChange(e.target.value)}
          style={{ width: 44, height: 36, padding: 0, border: "0.5px solid var(--border)", borderRadius: 4, background: "transparent", cursor: "pointer" }} />
        <input className="form-input" type="text" value={value} onChange={(e) => onChange(e.target.value)}
          style={{ flex: 1, fontFamily: "monospace", textTransform: "lowercase", letterSpacing: ".05em" }}
          placeholder="#000000" maxLength={9} />
      </div>
    </div>
  );
}

function normalizeHex(v: string): string {
  if (!v) return "#000000";
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v;
  if (/^#[0-9a-fA-F]{3}$/.test(v)) {
    const c = v.slice(1);
    return "#" + c.split("").map((x) => x + x).join("");
  }
  return "#000000";
}
