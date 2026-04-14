// src/pages/About.jsx
const S = {
  page: { background: '#0a1a0a', minHeight: '100vh', color: '#c8c8b8', fontFamily: 'sans-serif' },
  container: { maxWidth: 860, margin: '0 auto', padding: '0 24px' },
  hero: { padding: '96px 0 72px', borderBottom: '0.5px solid #1a3a1a' },
  heroLabel: { fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#c8973a', marginBottom: 20 },
  heroTitle: { fontFamily: 'Georgia, serif', fontSize: 'clamp(32px, 5vw, 56px)', fontWeight: 400, lineHeight: 1.15, color: '#e8e0d0', marginBottom: 24 },
  heroSub: { fontSize: 18, lineHeight: 1.7, color: '#8a9a8a', maxWidth: 620 },
  section: { padding: '72px 0', borderBottom: '0.5px solid #1a3a1a' },
  sectionLabel: { fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#c8973a', marginBottom: 16 },
  sectionTitle: { fontFamily: 'Georgia, serif', fontSize: 'clamp(22px, 3vw, 32px)', fontWeight: 400, color: '#e8e0d0', marginBottom: 20, lineHeight: 1.3 },
  body: { fontSize: 16, lineHeight: 1.8, color: '#9aaa9a', marginBottom: 20 },
  stat: { borderTop: '0.5px solid #1a3a1a', paddingTop: 24, marginTop: 0 },
  statNum: { fontFamily: 'Georgia, serif', fontSize: 48, color: '#c8973a', fontWeight: 400, lineHeight: 1 },
  statLabel: { fontSize: 13, color: '#6a8a6a', marginTop: 6 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 32, marginTop: 48 },
  cta: { padding: '72px 0' },
  ctaTitle: { fontFamily: 'Georgia, serif', fontSize: 28, color: '#e8e0d0', marginBottom: 24, fontWeight: 400 },
  ctaBtn: { background: '#c8973a', color: '#0a1a0a', border: 'none', padding: '14px 32px', fontSize: 14, fontWeight: 600, cursor: 'pointer', letterSpacing: '0.05em' },
};

export default function About({ navigate }) {
  return (
    <div style={S.page}>
      <div style={S.container}>

        {/* Hero */}
        <div style={S.hero}>
          <div style={S.heroLabel}>About SubMoa Content</div>
          <h1 style={S.heroTitle}>Professional content at scale,<br />without sacrificing the author.</h1>
          <p style={S.heroSub}>
            We built SubMoa Content for outdoor, hunting, fishing, and sporting goods publishers who need consistent, high-quality editorial volume — without hiring more writers or lowering standards.
          </p>
        </div>

        {/* The problem */}
        <div style={S.section}>
          <div style={S.sectionLabel}>The Problem</div>
          <h2 style={S.sectionTitle}>Content teams stretched thin. Voice stretched thinner.</h2>
          <p style={S.body}>
            Most publishers face the same pressure: more topics to cover, fewer resources to cover them. The result is generic content — written to a prompt, not to an audience — that sounds like every other site in the vertical.
          </p>
          <p style={S.body}>
            When production pressure increases, author voice is the first casualty. Content becomes interchangeable. Rankings plateau. Readers notice.
          </p>
        </div>

        {/* The solution */}
        <div style={S.section}>
          <div style={S.sectionLabel}>The Solution</div>
          <h2 style={S.sectionTitle}>Editorial standards, baked into the production system itself.</h2>
          <p style={S.body}>
            SubMoa Content is not a writing assistant. It is a content production system. Every article is generated through a structured brief, written to a defined author voice, scored against measurable quality dimensions, and delivered in a publish-ready package.
          </p>
          <p style={S.body}>
            The output sounds like your writers — because it is built from their patterns, vocabulary, and perspective. At scale, across every piece, without drift.
          </p>
        </div>

        {/* Stats */}
        <div style={{ ...S.section, borderBottom: 'none' }}>
          <div style={S.sectionLabel}>Built for this vertical</div>
          <h2 style={S.sectionTitle}>Designed specifically for outdoor, hunting, and sporting content.</h2>
          <p style={S.body}>
            Generic content platforms produce generic content. SubMoa Content is purpose-built for publishers who serve audiences that demand accuracy, authenticity, and authority. Our format library, author framework system, and grading dimensions reflect the specific requirements of this vertical.
          </p>
          <div style={S.grid}>
            {[
              { num: '23', label: 'Article format types' },
              { num: '5', label: 'Quality grading dimensions' },
              { num: '9', label: 'Optimization targets' },
              { num: '∞', label: 'Author frameworks' },
            ].map(({ num, label }) => (
              <div key={label} style={S.stat}>
                <div style={S.statNum}>{num}</div>
                <div style={S.statLabel}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div style={S.cta}>
          <div style={S.ctaTitle}>Ready to see it in action?</div>
          <button style={S.ctaBtn} onClick={() => navigate('/request')}>Request access</button>
        </div>

      </div>
    </div>
  );
}
