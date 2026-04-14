// src/pages/SeoMethodology.jsx
const S = {
  page: { background: '#0a1a0a', minHeight: '100vh', color: '#c8c8b8', fontFamily: 'sans-serif' },
  container: { maxWidth: 860, margin: '0 auto', padding: '0 24px' },
  hero: { padding: '96px 0 72px', borderBottom: '0.5px solid #1a3a1a' },
  heroLabel: { fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#c8973a', marginBottom: 20 },
  heroTitle: { fontFamily: 'Georgia, serif', fontSize: 'clamp(32px, 5vw, 52px)', fontWeight: 400, lineHeight: 1.15, color: '#e8e0d0', marginBottom: 24 },
  heroSub: { fontSize: 18, lineHeight: 1.7, color: '#8a9a8a', maxWidth: 620 },
  section: { padding: '64px 0', borderBottom: '0.5px solid #1a3a1a' },
  sectionTitle: { fontFamily: 'Georgia, serif', fontSize: 26, color: '#e8e0d0', fontWeight: 400, marginBottom: 16, lineHeight: 1.3 },
  body: { fontSize: 16, lineHeight: 1.8, color: '#8a9a8a', marginBottom: 20 },
  signalGrid: { display: 'grid', gap: 0, marginTop: 16 },
  signal: { padding: '16px 0', borderBottom: '0.5px solid #122512', display: 'flex', gap: 20, alignItems: 'flex-start' },
  signalLabel: { fontSize: 13, color: '#c8973a', fontFamily: 'monospace', width: 180, flexShrink: 0, paddingTop: 2 },
  signalDesc: { fontSize: 14, color: '#8a9a8a', lineHeight: 1.7 },
  targetGrid: { display: 'grid', gap: 0, marginTop: 24 },
  targetItem: { padding: '20px 0', borderBottom: '0.5px solid #122512' },
  targetName: { fontSize: 15, color: '#e8e0d0', fontWeight: 500, marginBottom: 6 },
  targetDesc: { fontSize: 14, color: '#8a9a8a', lineHeight: 1.6 },
  gradeBox: { background: '#0f200f', border: '0.5px solid #1e3a1e', padding: 28, borderRadius: 6, marginTop: 24 },
  gradeTitle: { fontFamily: 'Georgia, serif', fontSize: 18, color: '#e8e0d0', marginBottom: 16, fontWeight: 400 },
  gradeDims: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16 },
  gradeDim: { borderTop: '0.5px solid #1a3a1a', paddingTop: 12 },
  gradeDimName: { fontSize: 13, color: '#c8973a', fontWeight: 500, marginBottom: 4 },
  gradeDimMin: { fontSize: 12, color: '#6a8a6a' },
  cta: { padding: '64px 0' },
  ctaTitle: { fontFamily: 'Georgia, serif', fontSize: 26, color: '#e8e0d0', marginBottom: 20, fontWeight: 400 },
  ctaBtn: { background: '#c8973a', color: '#0a1a0a', border: 'none', padding: '14px 32px', fontSize: 14, fontWeight: 600, cursor: 'pointer' },
};

export default function SeoMethodology({ navigate }) {
  return (
    <div style={S.page}>
      <div style={S.container}>

        <div style={S.hero}>
          <div style={S.heroLabel}>SEO Methodology</div>
          <h1 style={S.heroTitle}>Content that performs,<br />not just content that exists.</h1>
          <p style={S.heroSub}>
            Most AI content is built for volume. SubMoa Content is built for performance. There is a difference, and it starts at the brief stage — not after the article is written.
          </p>
        </div>

        {/* The problem */}
        <div style={S.section}>
          <div style={S.sectionTitle}>The problem with generic SEO content</div>
          <p style={S.body}>
            Keyword stuffing produces content that ranks poorly and reads worse. Low readability signals create bounce rates that undermine whatever rankings are achieved. AI-detectable patterns trigger increasing scrutiny from both algorithms and readers.
          </p>
          <p style={S.body}>
            The response from most tools is to solve these problems one at a time, in isolation. Add more keywords. Run a readability plugin. Hope the AI detection score is acceptable. None of this is systematic.
          </p>
        </div>

        {/* Keyword intelligence at brief stage */}
        <div style={S.section}>
          <div style={S.sectionTitle}>Keyword intelligence at the brief stage</div>
          <p style={S.body}>
            Keyword research happens before generation, not after. When you submit a brief with target keywords, the system builds a keyword intelligence block that informs the entire article — structure, subheadings, entity coverage, and semantic depth.
          </p>
          <div style={S.signalGrid}>
            {[
              ['Search volume', 'Which variations of your target terms have sufficient search demand to justify coverage.'],
              ['SERP intent', 'What the current results reveal about what users actually want when they search this term.'],
              ['Competitor headlines', 'What structural patterns are winning for this query — and where the gap is.'],
              ['Semantic entity coverage', 'Which related entities and concepts need to appear for topical authority signals.'],
              ['Related queries', 'Adjacent terms that belong in the article to serve the full intent behind the primary keyword.'],
            ].map(([label, desc]) => (
              <div key={label} style={S.signal}>
                <div style={S.signalLabel}>{label}</div>
                <div style={S.signalDesc}>{desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* How optimization targets work */}
        <div style={S.section}>
          <div style={S.sectionTitle}>How optimization targets work</div>
          <p style={S.body}>
            Different goals require different structures. An article targeting a Google Featured Snippet is built differently than one targeting affiliate conversion. The optimization target field tells the system which structure to apply.
          </p>
          <div style={S.targetGrid}>
            {[
              ['Google Search', 'Traditional keyword-first structure. Entity-dense, hierarchical headings, topical completeness. Built for organic ranking.'],
              ['Featured Snippet', 'Definition-first formatting. One core answer delivered concisely in the opening. Question-structured subheadings throughout.'],
              ['Informational', 'Depth over brevity. Comprehensive coverage of the topic from multiple angles. Designed for readers who want to learn, not buy.'],
              ['Commercial', 'Decision-stage structure. Comparison framing, clear verdict, specificity over generality. Converts readers who are evaluating options.'],
              ['Affiliate Conversion', 'Product-specific structure with factual depth, clear recommendation, and conversion-path awareness throughout.'],
            ].map(([name, desc]) => (
              <div key={name} style={S.targetItem}>
                <div style={S.targetName}>{name}</div>
                <div style={S.targetDesc}>{desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Grading */}
        <div style={S.section}>
          <div style={S.sectionTitle}>Quality grading built in</div>
          <p style={S.body}>
            SEO alignment is one of five dimensions scored on every article before it reaches you. Articles that don't meet keyword coverage minimums can be revised before they enter your content pipeline.
          </p>
          <div style={S.gradeBox}>
            <div style={S.gradeTitle}>Five grading dimensions</div>
            <div style={S.gradeDims}>
              {[
                { name: 'Grammar', min: '85 minimum' },
                { name: 'Readability', min: '50 minimum' },
                { name: 'AI Detection', min: '80 minimum' },
                { name: 'Plagiarism', min: '90 minimum' },
                { name: 'SEO Alignment', min: '70 minimum' },
              ].map(({ name, min }) => (
                <div key={name} style={S.gradeDim}>
                  <div style={S.gradeDimName}>{name}</div>
                  <div style={S.gradeDimMin}>{min}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={S.cta}>
          <div style={S.ctaTitle}>See the methodology in action.</div>
          <button style={S.ctaBtn} onClick={() => navigate('/request')}>Request access</button>
        </div>

      </div>
    </div>
  );
}
