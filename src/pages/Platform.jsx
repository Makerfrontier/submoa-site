// src/pages/Platform.jsx
const S = {
  page: { background: '#0a1a0a', minHeight: '100vh', color: '#c8c8b8', fontFamily: 'sans-serif' },
  container: { maxWidth: 860, margin: '0 auto', padding: '0 24px' },
  hero: { padding: '96px 0 72px', borderBottom: '0.5px solid #1a3a1a' },
  heroLabel: { fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#c8973a', marginBottom: 20 },
  heroTitle: { fontFamily: 'Georgia, serif', fontSize: 'clamp(32px, 5vw, 56px)', fontWeight: 400, lineHeight: 1.15, color: '#e8e0d0', marginBottom: 24 },
  heroSub: { fontSize: 18, lineHeight: 1.7, color: '#8a9a8a', maxWidth: 620 },
  pillars: { padding: '72px 0' },
  pillar: { display: 'grid', gridTemplateColumns: '80px 1fr', gap: 32, padding: '48px 0', borderBottom: '0.5px solid #1a3a1a', alignItems: 'start' },
  pillarNum: { fontFamily: 'Georgia, serif', fontSize: 48, color: '#c8973a', fontWeight: 400, lineHeight: 1, paddingTop: 4 },
  pillarTitle: { fontFamily: 'Georgia, serif', fontSize: 26, color: '#e8e0d0', fontWeight: 400, marginBottom: 12, lineHeight: 1.2 },
  pillarBody: { fontSize: 16, lineHeight: 1.8, color: '#8a9a8a' },
  cta: { padding: '72px 0' },
  ctaTitle: { fontFamily: 'Georgia, serif', fontSize: 28, color: '#e8e0d0', marginBottom: 24, fontWeight: 400 },
  ctaBtn: { background: '#c8973a', color: '#0a1a0a', border: 'none', padding: '14px 32px', fontSize: 14, fontWeight: 600, cursor: 'pointer', letterSpacing: '0.05em' },
};

const pillars = [
  {
    num: '01',
    title: 'Brief',
    body: 'Start with intent. Every piece begins with a structured brief that defines format, optimization target, tone, and author voice. The brief is the contract between editorial intent and production output.',
  },
  {
    num: '02',
    title: 'Generate',
    body: 'Production-grade content. Our generation engine writes to your author\'s voice, optimized for your target platform, with hard editorial standards enforced automatically. Every article is checked for banned patterns before delivery.',
  },
  {
    num: '03',
    title: 'Grade',
    body: 'Quality you can measure. Every article is scored across Grammar, Readability, AI Detection, Plagiarism, and SEO Alignment before it reaches you. Scores are transparent and available in the dashboard.',
  },
  {
    num: '04',
    title: 'Publish',
    body: 'Ready when you are. Download your complete package — formatted article, Word document, and audio version — or mark it published directly from the dashboard. Package is available immediately after grading.',
  },
];

export default function Platform({ navigate }) {
  return (
    <div style={S.page}>
      <div style={S.container}>

        <div style={S.hero}>
          <div style={S.heroLabel}>The Platform</div>
          <h1 style={S.heroTitle}>Four stages. One system.<br />No compromises.</h1>
          <p style={S.heroSub}>
            Every article produced by SubMoa Content passes through the same four-stage pipeline. Brief, Generate, Grade, Publish. No shortcuts, no variance.
          </p>
        </div>

        <div style={S.pillars}>
          {pillars.map(p => (
            <div key={p.num} style={S.pillar}>
              <div style={S.pillarNum}>{p.num}</div>
              <div>
                <div style={S.pillarTitle}>{p.title}</div>
                <div style={S.pillarBody}>{p.body}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={S.cta}>
          <div style={S.ctaTitle}>See the platform in action.</div>
          <button style={S.ctaBtn} onClick={() => navigate('/request')}>Request access</button>
        </div>

      </div>
    </div>
  );
}
