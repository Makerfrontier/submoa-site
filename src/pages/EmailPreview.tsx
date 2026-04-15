// src/pages/EmailPreview.tsx
// /email-preview/:id — renders the assembled HTML email inline.

import { useEffect, useState } from "react";

interface Props { id: string; navigate?: (p: string) => void }

export default function EmailPreview({ id, navigate }: Props) {
  const [html, setHtml] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/submissions/${id}/email`, { credentials: "include" });
        if (!res.ok) throw new Error(`Failed to load email (HTTP ${res.status})`);
        const text = await res.text();
        if (!cancelled) { setHtml(text); setLoading(false); }
      } catch (e: any) {
        if (!cancelled) { setError(e?.message || "Failed to load"); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  if (loading) {
    return <div style={{ padding: 40, textAlign: "center", color: "#6a8a6a", fontSize: 13 }}>Loading...</div>;
  }
  if (error) {
    return <div style={{ padding: 40, textAlign: "center", color: "#d45a5a", fontSize: 13 }}>{error}</div>;
  }

  return (
    <div style={{ margin: "0 auto", maxWidth: 720, padding: "24px 16px" }}>
      <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <a href="#" onClick={(e) => { e.preventDefault(); navigate?.("/dashboard"); }}
          style={{ fontSize: 12, color: "#6a8a6a", textDecoration: "none" }}>← Dashboard</a>
        <a href={`/api/submissions/${id}/email`} download="email.html"
          style={{ fontSize: 12, color: "#c8973a", textDecoration: "none" }}>
          Download HTML
        </a>
      </div>
      <iframe
        title="Email preview"
        srcDoc={html}
        style={{ width: "100%", minHeight: "70vh", border: "0.5px solid #1e3a1e", borderRadius: 6, background: "#ffffff" }}
      />
    </div>
  );
}
