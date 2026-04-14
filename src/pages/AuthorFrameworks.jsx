// src/pages/AuthorFrameworks.jsx
const S = {
  page: { background: '#0a1a0a', minHeight: '100vh', color: '#c8c8b8', fontFamily: 'sans-serif' },
  container: { maxWidth: 860, margin: '0 auto', padding: '0 24px' },
  hero: { padding: '96px 0 72px', borderBottom: '0.5px solid #1a3a1a' },
  heroLabel: { fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#c8973a', marginBottom: 20 },
  heroTitle: { fontFamily: 'Georgia, serif', fontSize: 'clamp(32px, 5vw, 52px)', fontWeight: 400, lineHeight: 1.15, color: '#e8e0d0', marginBottom: 24 },
  heroSub: { fontSize: 18, lineHeight: 1.7, color: '#8a9a8a', maxWidth: 600 },
  section: { padding: '64px 0', borderBottom: '0.5px solid #1a3a1a' },
  sectionTitle: { fontFamily: 'Georgia, serif', fontSize: 26, color: '#e8e0d0', fontWeight: 400, marginBottom: 16, lineHeight: 1.3 },
  body: { fontSize: 16, lineHeight: 1.8, color: '#8a9a8a', marginBottom: 20 },
  methodGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24, marginTop: 32 },
  methodCard: { background: '#0f200f', border: '0.5px solid #1e3a1e', padding: 28, borderRadius: 6 },
  methodTitle: { fontFamily: 'Georgia, serif', fontSize: 18, color: '#e8e0d0', fontWeight: 400, marginBottom: 12 },
  methodBody: { fontSize: 14, color: '#8a9a8a', lineHeight: 1.7 },
  captured: { display: 'grid', gap: 0, marginTop: 24 },
  capturedItem: { padding: '14px 0', borderBottom: '0.5px solid #122512', display: 'flex', gap: 16, alignItems: 'flex-start' },
  capturedDot: { width: 6, height: 6, background: '#c8973a', borderRadius: '50%', marginTop: 8, flexShrink: 0 },
  capturedText: { fontSize: 15, color: '#8a9a8a', lineHeight: 1.6 },
  capturedLabel: { color: '#c8c8b8', fontWeight: 500 },
  privacyBox: { background: '#0f200f', border: '0.5px solid #1e3a1e', padding: 28, borderRadius: 6, marginTop: 32 },
  privacyTitle: { fontFamily: 'Georgia, serif', fontSize: 18, color: '#e8e0d0', marginBottom: 12, fontWeight: 400 },
  privacyBody: { fontSize: 14, color: '#8a9a8a', lineHeight: 1.7 },
  cta: { padding: '64px 0' },
  ctaTitle: { fontFamily: 'Georgia, serif', fontSize: 26, color: '#e8e0d0', marginBottom: 20, fontWeight: 400 },
  ctaBtn: { background: '#c8973a', color: '#0a1a0a', border: 'none', padding: '14px 32px', fontSize: 14, fontWeight: 600, cursor: 'pointer' },
};

export default function AuthorFrameworks({ navigate }) {
  return (
    <div style={S.page}>
      <div style={S.container}>

        <div style={S.hero}>
          <div style={S.heroLabel}>Author Frameworks</div>
          <h1 style={S.heroTitle}>Your content sounds like you,<br />not like AI.</h1>
          <p style={S.heroSub}>
            Author frameworks capture writing voice, rhythm, vocabulary, and perspective — then apply them consistently across every piece produced on your account.
          </p>
        </div>

        {/* What they are */}
        <div style={S.section}>
          <div style={S.sectionTitle}>What gets captured</div>
          <p style={S.body}>
            When you build an author framework, the system analyzes your existing content and extracts the patterns that make that writer identifiable. Not a surface-level style imitation — a structured representation of how that person writes.
          </p>
          <div style={S.captured}>
            {[
              { label: 'Voice and authority register', desc: 'Whether the author writes as an expert, a practitioner, a narrator, or an advisor — and how they signal that authority.' },
              { label: 'Sentence rhythm and structure', desc: 'Short declarative beats versus longer compound sentences. Fragment use. List preferences. Pacing under tension versus pacing in explanation.' },
              { label: 'Vocabulary register', desc: 'Technical precision versus plain-language accessibility. Domain-specific terms, their frequency, and how they are contextualized for the reader.' },
              { label: 'Perspective and positioning', desc: 'First-person field experience, third-person reporting, instructional "you" framing — and how those shift across article types.' },
              { label: 'Signature structures', desc: 'How this author opens, closes, and transitions. Their preferred way to move from anecdote to instruction, from scene to principle.' },
            ].map(({ label, desc }) => (
              <div key={label} style={S.capturedItem}>
                <div style={S.capturedDot} />
                <div style={S.capturedText}>
                  <span style={S.capturedLabel}>{label} — </span>{desc}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Two methods */}
        <div style={S.section}>
          <div style={S.sectionTitle}>Two ways to build a framework</div>
          <div style={S.methodGrid}>
            <div style={S.methodCard}>
              <div style={S.methodTitle}>RSS Feed Ingestion</div>
              <div style={S.methodBody}>
                Paste an RSS feed URL from the author's publication. The system fetches recent articles, processes the content, and builds the framework from their published work. Best for authors with a substantial existing body of content.
              </div>
            </div>
            <div style={S.methodCard}>
              <div style={S.methodTitle}>DOCX Upload</div>
              <div style={S.methodBody}>
                Upload a Word document containing writing samples — articles, essays, or editorial pieces. The system extracts voice patterns from the provided text. Best for authors without a public feed, or for proprietary editorial voices.
              </div>
            </div>
          </div>
        </div>

        {/* Privacy */}
        <div style={S.section}>
          <div style={S.sectionTitle}>Consistency at scale</div>
          <p style={S.body}>
            The practical result is this: ten articles that all sound like the same person wrote them. Same vocabulary register. Same sentence rhythm. Same authority positioning. Consistent from article one to article five hundred.
          </p>
          <p style={S.body}>
            This matters in a vertical where readers develop relationships with writers. It matters for brand credibility. It matters for the kind of trust that converts browsers into subscribers.
          </p>
          <div style={S.privacyBox}>
            <div style={S.privacyTitle}>Your frameworks are private.</div>
            <div style={S.privacyBody}>
              Author frameworks are private to your account. They are never shared with other users, never used to train models, and never accessible outside your organization. The voice you build is yours.
            </div>
          </div>
        </div>

        <div style={S.cta}>
          <div style={S.ctaTitle}>Ready to build your first framework?</div>
          <button style={S.ctaBtn} onClick={() => navigate('/request')}>Request access</button>
        </div>

      </div>
    </div>
  );
}
