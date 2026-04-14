// src/pages/Documentation.jsx
const S = {
  page: { background: '#0a1a0a', minHeight: '100vh', color: '#c8c8b8', fontFamily: 'sans-serif' },
  container: { maxWidth: 860, margin: '0 auto', padding: '0 24px' },
  hero: { padding: '72px 0 56px', borderBottom: '0.5px solid #1a3a1a' },
  heroLabel: { fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#c8973a', marginBottom: 16 },
  heroTitle: { fontFamily: 'Georgia, serif', fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 400, color: '#e8e0d0', marginBottom: 16, lineHeight: 1.2 },
  heroSub: { fontSize: 16, color: '#8a9a8a', lineHeight: 1.7 },
  section: { padding: '56px 0', borderBottom: '0.5px solid #1a3a1a' },
  sectionTitle: { fontFamily: 'Georgia, serif', fontSize: 22, color: '#e8e0d0', fontWeight: 400, marginBottom: 20 },
  step: { display: 'flex', gap: 20, marginBottom: 24, alignItems: 'flex-start' },
  stepNum: { background: '#c8973a', color: '#0a1a0a', width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0, marginTop: 2 },
  stepBody: { fontSize: 15, lineHeight: 1.7, color: '#9aaa9a' },
  stepTitle: { color: '#e8e0d0', fontWeight: 600, display: 'block', marginBottom: 4 },
  fieldGrid: { display: 'grid', gap: 0 },
  field: { padding: '16px 0', borderBottom: '0.5px solid #122512' },
  fieldName: { fontSize: 13, color: '#c8973a', fontFamily: 'monospace', marginBottom: 6 },
  fieldDesc: { fontSize: 14, color: '#8a9a8a', lineHeight: 1.6 },
  formatGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, marginTop: 16 },
  formatItem: { fontSize: 13, color: '#8a9a8a', padding: '8px 0', borderTop: '0.5px solid #122512' },
  formatName: { color: '#c8c8b8', fontWeight: 500 },
  faqItem: { padding: '20px 0', borderBottom: '0.5px solid #122512' },
  faqQ: { fontSize: 15, color: '#e8e0d0', fontWeight: 500, marginBottom: 8 },
  faqA: { fontSize: 14, color: '#8a9a8a', lineHeight: 1.7 },
  cta: { padding: '56px 0' },
  ctaBtn: { background: '#c8973a', color: '#0a1a0a', border: 'none', padding: '12px 28px', fontSize: 14, fontWeight: 600, cursor: 'pointer' },
};

const formats = [
  ['sponsored-review', 'Sponsored Review'],
  ['unsponsored-review', 'Unsponsored Review'],
  ['top-10', 'Top 10 List'],
  ['commerce', 'Commerce Article'],
  ['affiliate-amazon', 'Affiliate / Amazon'],
  ['affiliate-general', 'Affiliate / General'],
  ['howto-technical', 'How-To Guide (Technical)'],
  ['howto-hillbilly', 'How-To Guide (Conversational)'],
  ['cornerstone', 'Cornerstone / Evergreen'],
  ['cornerstone-support', 'Cornerstone Support'],
  ['blog-general', 'Blog Post'],
  ['news-discover', 'News / Google Discover'],
  ['news-syndication', 'News / Syndication'],
  ['scientific', 'Scientific Paper'],
  ['story', 'Story'],
  ['quandry', 'Quandry'],
  ['comparison', 'Comparison Article'],
  ['buyers-guide', 'Buyers Guide'],
  ['opinion', 'Opinion / Editorial'],
  ['faq', 'FAQ Article'],
  ['roundup', 'Roundup'],
  ['press-release', 'Press Release'],
  ['case-study', 'Case Study'],
];

const targets = [
  ['Google Search', 'Traditional keyword-first SEO structure. Headers, entities, and topical depth optimized for organic ranking.'],
  ['Google Discover', 'Broader topical coverage with strong opening hooks. Optimized for content cards, not exact-match queries.'],
  ['Featured Snippet', 'Structured to answer one core question directly, with definition-first formatting and concise section headers.'],
  ['Informational', 'Thorough, authoritative coverage of a topic. Depth over brevity. Suitable for educational content.'],
  ['Commercial', 'Intent-aligned for buyers in the decision stage. Comparison structure, specificity, and clear verdict required.'],
  ['Social Traffic', 'Engaging headlines, narrative flow, shareable framing. Less keyword-dependent, more reader-dependent.'],
  ['Email List', 'Long-form value delivery. Built for readers who opted in — deeper coverage, less SEO scaffolding.'],
  ['Brand Authority', 'Voice-forward content that builds category ownership. Prioritizes expert positioning over keyword density.'],
  ['Affiliate Conversion', 'Product-specific content with clear structure, CTAs, and factual specificity. Conversion-path aware.'],
];

const faqs = [
  { q: 'How do I set up an author voice?', a: 'Go to your account settings and create an Author Framework. You can build one from an RSS feed of existing content or upload a DOCX sample. The system ingests the content and extracts voice patterns automatically.' },
  { q: 'What file formats are in the download package?', a: 'Each package includes a formatted HTML article, a Word document (.docx), and optionally an audio file (.mp3) if audio generation was enabled on the brief.' },
  { q: 'How long does generation take?', a: 'Most articles complete within 2-4 minutes of submission. You will receive a notification when your article is ready.' },
  { q: 'Can I request a revision?', a: 'Yes. Once your article is graded, you can click "Request revision" on the card. The article is reset and requeued for regeneration using the same brief.' },
  { q: 'What does the grading score measure?', a: 'Five dimensions: Grammar (85 minimum), Readability (50 minimum), AI Detection (80 minimum — higher means more human-like), Plagiarism (90 minimum), and SEO Alignment (70 minimum). Scores are displayed on the dashboard.' },
  { q: 'Is my content kept private?', a: 'Yes. Your submissions, author frameworks, and generated content are private to your account and never shared or used to improve any external model.' },
];

export default function Documentation({ navigate }) {
  return (
    <div style={S.page}>
      <div style={S.container}>

        <div style={S.hero}>
          <div style={S.heroLabel}>Documentation</div>
          <h1 style={S.heroTitle}>Getting started with SubMoa Content</h1>
          <p style={S.heroSub}>Everything you need to go from account creation to published article.</p>
        </div>

        {/* Getting started */}
        <div style={S.section}>
          <div style={S.sectionTitle}>Getting started</div>
          {[
            { title: 'Create your account', body: 'Request access at submoacontent.com/request. Accounts are approved manually. You will receive an email with login instructions.' },
            { title: 'Set up an author voice', body: 'Before submitting your first brief, create an Author Framework in account settings. Paste an RSS feed URL or upload a DOCX document with writing samples. The system processes the content and builds the author profile.' },
            { title: 'Submit a brief', body: 'Click "Submit brief" in the nav. Fill out the topic, format, optimization target, tone, author, and any human observation notes. Submit when ready.' },
            { title: 'Wait for generation', body: 'Your submission enters the queue. You will see the card update from Queued → Generating → Grading → Done in your dashboard. A toast notification appears when grading is complete.' },
            { title: 'Download your package', body: 'Once graded, click "Download zip package" on the card. Your package includes the article HTML, Word document, and audio file if enabled.' },
          ].map((s, i) => (
            <div key={i} style={S.step}>
              <div style={S.stepNum}>{i + 1}</div>
              <div style={S.stepBody}>
                <span style={S.stepTitle}>{s.title}</span>
                {s.body}
              </div>
            </div>
          ))}
        </div>

        {/* Brief fields */}
        <div style={S.section}>
          <div style={S.sectionTitle}>Brief field reference</div>
          <div style={S.fieldGrid}>
            {[
              { name: 'topic', desc: 'The subject of the article. Be specific — this drives keyword research and structure decisions.' },
              { name: 'article_format', desc: 'Defines the structural template used. Each format applies different sectioning, content requirements, and output conventions.' },
              { name: 'optimization_target', desc: 'The platform or intent the content is being optimized for. Affects structure, hook, and keyword usage strategy.' },
              { name: 'vocal_tone', desc: 'The tonal register of the output — from analytical and journalistic to conversational and entertaining.' },
              { name: 'author', desc: 'The author framework to write through. The system writes in this voice for the entire article.' },
              { name: 'min_word_count', desc: 'Minimum word count target. The generation engine enforces this floor and does not pad to hit it.' },
              { name: 'target_keywords', desc: 'Primary and secondary keywords. Used to seed keyword intelligence and ensure topical coverage.' },
              { name: 'human_observation', desc: 'Your editorial direction, angle, or notes. This is the most influential field — use it to inject unique insight the system cannot generate on its own.' },
              { name: 'anecdotal_stories', desc: 'Optional field to supply personal anecdotes or specific examples for the author to work with.' },
              { name: 'product_link', desc: 'A URL for the system to scrape for product details. Used for reviews and affiliate content.' },
              { name: 'include_faq', desc: 'When enabled, the article closes with a 5-7 question FAQ section with FAQPage JSON-LD schema appended.' },
              { name: 'generate_audio', desc: 'When enabled, an audio file is generated from the article text and included in the download package.' },
            ].map(f => (
              <div key={f.name} style={S.field}>
                <div style={S.fieldName}>{f.name}</div>
                <div style={S.fieldDesc}>{f.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Formats */}
        <div style={S.section}>
          <div style={S.sectionTitle}>Article formats ({formats.length})</div>
          <div style={S.formatGrid}>
            {formats.map(([slug, label]) => (
              <div key={slug} style={S.formatItem}>
                <span style={S.formatName}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Optimization targets */}
        <div style={S.section}>
          <div style={S.sectionTitle}>Optimization targets</div>
          <div style={S.fieldGrid}>
            {targets.map(([name, desc]) => (
              <div key={name} style={S.field}>
                <div style={S.fieldName}>{name}</div>
                <div style={S.fieldDesc}>{desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* FAQ */}
        <div style={S.section}>
          <div style={S.sectionTitle}>Frequently asked questions</div>
          {faqs.map((f, i) => (
            <div key={i} style={S.faqItem}>
              <div style={S.faqQ}>{f.q}</div>
              <div style={S.faqA}>{f.a}</div>
            </div>
          ))}
        </div>

        <div style={S.cta}>
          <button style={S.ctaBtn} onClick={() => navigate('/request')}>Request access</button>
        </div>

      </div>
    </div>
  );
}
