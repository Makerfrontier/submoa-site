// src/pages/Dashboard.jsx
// SubMoa Content — User Dashboard
//
// RULES:
// 1. Every card renders the SAME structure, every time, no exceptions
// 2. Data fills in when available, shows blank when not
// 3. Buttons are greyed out (not hidden) when the action isn't available
// 4. No conditional layouts — one card, one render path
//
// DATA INJECTION POINTS are marked with: // ← INJECT: [field name]

import { useState, useEffect, useCallback } from 'react';
import './Dashboard.css';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const FILTERS = [
  { id: 'all',        label: 'All' },
  { id: 'queued',     label: 'Queued' },
  { id: 'progress',   label: 'In Progress' },
  { id: 'done',  label: 'Done' },
  { id: 'published',  label: 'Published' },
];

const SCORE_THRESHOLDS = {
  grammar:     85,
  readability: 50,
  ai_detection: 80,
  plagiarism:  90,
  seo:         70,
  overall:     75,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Returns 'pass' | 'warn' | 'fail' | 'blank' for score coloring
function scoreClass(value, threshold) {
  if (value === null || value === undefined) return 'blank';
  if (value >= threshold) return 'pass';
  if (value >= threshold - 10) return 'warn';
  return 'fail';
}

// Formats a date string → "Apr 11, 2026"
function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(typeof ts === 'number' ? ts : ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Maps submission status → pipeline step index (0-3)
// 0 = Brief, 1 = Generating, 2 = Grading, 3 = Done
function getStepIndex(status, gradeStatus) {
  if (status === 'published')                           return 4; // all complete
  if (status === 'article_done' && (gradeStatus === 'passed' || gradeStatus === 'graded')) return 4; // all complete
  if (status === 'article_done')                        return 3; // done step active
  if (status === 'grading' || gradeStatus === 'grading') return 2;
  if (status === 'generating' || status === 'queued')   return 1;
  return 0; // draft / brief
}

// Maps step index → status message shown next to stepper
function getStatusText(status, gradeStatus) {
  if (status === 'published')                                return null;
  if (gradeStatus === 'graded' || gradeStatus === 'passed') return 'Graded';
  if (status === 'grading' || gradeStatus === 'grading')     return 'Grading in progress...';
  if (status === 'generating')                               return 'Generating your article...';
  if (status === 'queued')                                   return 'Queued for generation...';
  return null;
}

// Maps article_format slug → display label
function formatLabel(format) {
  const map = {
    'sponsored-review':   'Sponsored Review',
    'unsponsored-review': 'Unsponsored Review',
    'top-10':             'Top 10 List',
    'commerce':           'Commerce Article',
    'affiliate-amazon':   'Affiliate / Amazon',
    'affiliate-general':  'Affiliate / General',
    'howto-technical':    'How-To Guide',
    'howto-hillbilly':    'How-To Guide',
    'cornerstone':        'Cornerstone / Evergreen',
    'cornerstone-support':'Cornerstone Support',
    'blog-general':       'Blog Post',
    'news-discover':      'News / Google Discover',
    'news-syndication':   'News / Syndication',
    'scientific':         'Scientific Paper',
    'story':              'Story',
    'quandry':            'Quandry',
    'comparison':         'Comparison Article',
    'buyers-guide':       'Buyers Guide',
    'opinion':            'Opinion / Editorial',
    'faq':                'FAQ Article',
    'roundup':            'Roundup',
    'press-release':      'Press Release',
    'case-study':         'Case Study',
  };
  return map[format] || format || 'Article';
}

// ---------------------------------------------------------------------------
// Checkmark SVG (used inside done step dots)
// ---------------------------------------------------------------------------
const CheckSVG = () => (
  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
    <path d="M1 4l3 3 5-6" stroke="#000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

// ---------------------------------------------------------------------------
// Pipeline stepper — always 4 steps, always rendered
// ---------------------------------------------------------------------------
function Pipeline({ stepIndex }) {
  const steps = ['Brief', 'Generating', 'Grading', 'Done'];

  return (
    <div className="db-pipeline">
      {steps.map((label, i) => {
        const isDone   = stepIndex > i;
        const isActive = stepIndex === i;
        return (
          <>
            <div className="db-step" key={label}>
              <div className={`db-step-dot${isDone ? ' db-done' : isActive ? ' db-active' : ''}`}>
                {isDone && <CheckSVG />}
              </div>
              <div className={`db-step-label${isActive ? ' db-active' : ''}`}>
                {label}
              </div>
            </div>
            {i < steps.length - 1 && (
              <div className={`db-step-line${isDone ? ' db-done' : ''}`} key={`line-${i}`} />
            )}
          </>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Grade row — always rendered, shows blank when no data
// ---------------------------------------------------------------------------
function GradeRow({ grade, gradeStatus }) {
  // Render all blanks when no grade, ungraded, or still queued
  const isBlank = !grade || gradeStatus === 'ungraded' || gradeStatus === 'queued';
  if (isBlank) {
    return (
      <div className="db-grade-row">
        {['Grammar', 'Readability', 'AI Detect', 'Plagiarism', 'SEO'].map(label => (
          <div className="db-grade-pill" key={label}>
            <div className="db-grade-label">{label}</div>
            <div className="db-grade-num db-blank"></div>
          </div>
        ))}
        <div className="db-overall-pill">
          <div className="db-overall-num db-blank"></div>
          <div className="db-overall-label">Overall</div>
        </div>
      </div>
    );
  }

  // grade = { grammar_score, readability_score, ai_detection_score,
  //           plagiarism_score, seo_score, overall_score } | null

  const scores = [
    { label: 'Grammar',      value: grade?.grammar_score,      threshold: SCORE_THRESHOLDS.grammar },
    { label: 'Readability',  value: grade?.readability_score,  threshold: SCORE_THRESHOLDS.readability },
    { label: 'AI Detect',    value: grade?.ai_detection_score, threshold: SCORE_THRESHOLDS.ai_detection },
    { label: 'Plagiarism',   value: grade?.plagiarism_score,   threshold: SCORE_THRESHOLDS.plagiarism },
    { label: 'SEO',          value: grade?.seo_score,          threshold: SCORE_THRESHOLDS.seo },
  ];

  const overall        = grade?.overall_score ?? null;
  const overallClass   = scoreClass(overall, SCORE_THRESHOLDS.overall);

  return (
    <div className="db-grade-row">
      {scores.map(({ label, value, threshold }) => (
        <div className="db-grade-pill" key={label}>
          <div className="db-grade-label">{label}</div>
          <div className={`db-grade-num db-${scoreClass(value, threshold)}`}>
            {value !== null && value !== undefined ? value : ''}
          </div>
        </div>
      ))}
      <div className="db-overall-pill">
        <div className={`db-overall-num db-${overallClass}`}>
          {overall !== null && overall !== undefined ? overall : ''}
        </div>
        <div className="db-overall-label">Overall</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Action buttons — always rendered, greyed when unavailable
// ---------------------------------------------------------------------------
function ActionRow({ submission, onView, onDownload, onPublishClick, onDelete, onEdit, onDiscard, onRequestRevision, onShare, shareOpen, publishingId }) {
  const status      = submission.status;
  const gradeStatus = submission.grade_status;
  const hasArticle  = !!submission.article_content;
  const isDraft     = status === 'draft' || status === 'brief';
  const isGraded    = gradeStatus === 'graded' || gradeStatus === 'passed';
  const isPublished = status === 'published';
  const isPublishing = publishingId === submission.id;

  // View rendered article — active when article exists
  const viewActive     = hasArticle;
  // Download zip — active when package is ready in R2
  const packageStatus  = submission.package_status; // null | 'packaging' | 'ready' | 'failed'
  const downloadActive  = packageStatus === 'ready';
  const downloadLabel   = packageStatus === 'packaging' ? 'Preparing...' : 'Download zip package';
  // Mark as published — active when grading passed and not already published
  const publishActive  = isGraded && !isPublished;

  return (
    <div className="db-action-row">
      {/* Review Now — replaces primary action when flags need resolution */}
      {status === 'review_ready' ? (
        <button
          className="db-btn db-btn-gold"
          onClick={() => { window.location.href = `/content/${submission.id}/review`; }}
          title="Open review page to resolve flagged sections"
          style={{ background: 'var(--amber)', color: '#fff', borderColor: 'var(--amber)' }}
        >
          Review Now →
        </button>
      ) : (
        /* View rendered article */
        <button
          className={`db-btn ${viewActive ? 'db-btn-gold' : 'db-btn-disabled'}`}
          onClick={viewActive ? onView : undefined}
          disabled={!viewActive}
          title={viewActive ? 'View rendered article' : 'Article not yet generated'}
        >
          View rendered article
        </button>
      )}

      {/* Download zip package */}
      <button
        className={`db-btn ${downloadActive ? 'db-btn-gold' : 'db-btn-disabled'}`}
        onClick={downloadActive ? onDownload : undefined}
        disabled={!downloadActive}
        title={
          downloadActive ? 'Download zip package' :
          packageStatus === 'packaging' ? 'Package is being prepared...' :
          'Article must pass grading before download is available'
        }
      >
        {downloadLabel}
      </button>

      {/* Direct per-asset downloads */}
      {submission.has_docx && (
        <a className="db-btn db-btn-gold" href={`/api/submissions/${submission.id}/download/docx`} download title="Download .docx">DOCX</a>
      )}
      {submission.generate_audio && ['article_done', 'published', 'revision_applied'].includes(status) && (
        <a className="db-btn db-btn-gold" href={`/api/submissions/${submission.id}/download/audio`} download title="Download MP3">MP3</a>
      )}
      {submission.infographic_r2_key && (
        <a className="db-btn db-btn-gold" href={`/api/submissions/${submission.id}/download/infographic`} download title="Download infographic">Infographic</a>
      )}
      {submission.generated_image_key && (
        <a className="db-btn db-btn-gold" href={`/api/submissions/${submission.id}/download/featured-image`} download title="Download featured image">Image</a>
      )}

      {/* Mark as published — hidden when already published */}
      {!isPublished && (
        <button
          className={`db-btn ${isPublishing ? 'db-btn-disabled' : publishActive ? 'db-btn-green' : 'db-btn-disabled'}`}
          onClick={publishActive ? onPublishClick : undefined}
          disabled={!publishActive}
          title={publishActive ? 'Mark as published' : 'Not ready to publish'}
        >
          {isPublishing ? 'Cancel' : 'Mark as published'}
        </button>
      )}

      {/* Edit — only shown on draft cards */}
      {isDraft && (
        <button className="db-btn db-btn-gold" onClick={onEdit}>
          Edit
        </button>
      )}

      {/* Discard draft — only shown on draft cards */}
      {isDraft && (
        <button className="db-btn-danger" onClick={onDiscard}>
          Discard draft
        </button>
      )}

      {/* Request revision — shown on graded articles that aren't published */}
      {gradeStatus === 'graded' && status !== 'published' && (
        <button className="db-btn db-btn-gold" onClick={onRequestRevision}>
          Request revision
        </button>
      )}

      {/* Share — public link to rendered article */}
      {(status === 'article_done' || status === 'published' || status === 'revision_applied')
        && submission.article_format !== 'email'
        && submission.article_format !== 'infographic' && (
        <button className="db-btn" onClick={onShare} title="Generate a public share link" style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-mid)' }}>
          {shareOpen ? 'Close share' : 'Share'}
        </button>
      )}

      {/* Download image SEO companion doc — only if this submission had images processed */}
      {submission.featured_image_filename && (
        <a
          href={`/api/submissions/${submission.id}/image-companion`}
          download="image-seo-companion.txt"
          className="db-btn db-btn-gold"
        >
          Image SEO doc
        </a>
      )}

      {/* → Infographic — riff on this article in the infographic builder */}
      {(isGraded || isPublished) && (
        <button
          className="db-btn db-btn-accent"
          onClick={() => {
            try {
              sessionStorage.setItem('infographic_handoff', JSON.stringify({
                source_submission_id: submission.id,
                topic: submission.topic || '',
              }));
            } catch {}
            window.location.href = '/brief/infographic';
          }}
          title="Build an infographic based on this article"
        >
          → Infographic
        </button>
      )}

      {/* Delete — always available */}
      <button className="db-btn-danger" onClick={onDelete}>
        Delete
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Prompt card — blue-tinted, visually distinct from green content cards
// ---------------------------------------------------------------------------
// ─── Email card ─────────────────────────────────────────────────────────────
function getEmailCardColors(primaryHex) {
  const hex = (primaryHex || '#c8973a').trim();
  const m = hex.match(/^#?([a-f0-9]{6}|[a-f0-9]{3})$/i);
  let r = 200, g = 151, b = 58;
  if (m) {
    let h = m[1];
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    r = parseInt(h.slice(0, 2), 16);
    g = parseInt(h.slice(2, 4), 16);
    b = parseInt(h.slice(4, 6), 16);
  }
  // background: primary @ 8% over #0a0a0a
  const bgR = Math.round(r * 0.08 + 10 * 0.92);
  const bgG = Math.round(g * 0.08 + 10 * 0.92);
  const bgB = Math.round(b * 0.08 + 10 * 0.92);
  return {
    background: `rgb(${bgR}, ${bgG}, ${bgB})`,
    border: `rgba(${r}, ${g}, ${b}, 0.4)`,
    accent: `rgb(${r}, ${g}, ${b})`,
    accentSoft: `rgba(${r}, ${g}, ${b}, 0.13)`,
    accentBorder: `rgba(${r}, ${g}, ${b}, 0.27)`,
    text: '#ffffff',
  };
}

function EmailCard({ row }) {
  const c = getEmailCardColors(row.primary_color);
  const date = row.created_at ? new Date(row.created_at).toLocaleDateString() : '';
  const status = row.email_status || 'queued';

  return (
    <div style={{
      background: c.background,
      border: `0.5px solid ${c.border}`,
      borderRadius: 10,
      padding: '18px 22px',
      marginBottom: 12,
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(to right, ${c.accent}, transparent)`, pointerEvents: 'none' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: c.accent, opacity: 0.7, letterSpacing: '.04em', textTransform: 'uppercase' }}>
          {date} · {row.template_type || 'email'}
        </div>
        <span style={{
          fontSize: 10, padding: '2px 8px', borderRadius: 10,
          background: c.accentSoft, color: c.accent,
          border: `0.5px solid ${c.accentBorder}`,
          fontWeight: 500,
        }}>Email</span>
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: c.text, marginBottom: 4 }}>
        {row.template_name || '—'}
      </div>
      <div style={{ fontSize: 12, color: '#8a8a8a', marginBottom: 12 }}>
        {row.subject_line || ''}
      </div>

      {status === 'ready' && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a href={`/email-preview/${row.id}`} target="_blank" rel="noopener noreferrer"
            style={{ padding: '6px 14px', borderRadius: 4, fontSize: 12,
              border: `0.5px solid ${c.accent}`, color: c.accent, background: 'transparent', textDecoration: 'none' }}>
            View Rendered Email
          </a>
          <a href={`/api/submissions/${row.id}/email`} download="email.html"
            style={{ padding: '6px 14px', borderRadius: 4, fontSize: 12,
              border: `0.5px solid ${c.accent}`, color: c.accent, background: 'transparent', textDecoration: 'none' }}>
            Download HTML
          </a>
          <a href={`/api/submissions/${row.id}/email-txt`} download="email.txt"
            style={{ padding: '6px 14px', borderRadius: 4, fontSize: 12,
              border: '0.5px solid #3a3a3a', color: '#6a6a6a', background: 'transparent', textDecoration: 'none' }}>
            Download .txt
          </a>
        </div>
      )}
      {(status === 'rendering' || status === 'queued') && (
        <div style={{ fontSize: 12, color: '#5a7a5a', fontStyle: 'italic' }}>Building email...</div>
      )}
      {status === 'failed' && (
        <div style={{ fontSize: 12, color: '#d45a5a' }}>Build failed — contact support</div>
      )}
    </div>
  );
}

// ─── Share panel ────────────────────────────────────────────────────────────
function SharePanel({ submissionId, onClose }) {
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const r = await fetch(`/api/submissions/${submissionId}/share`, { credentials: 'include' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      setLinks(d.links || []);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, [submissionId]);

  useEffect(() => { load(); }, [load]);

  const generate = async () => {
    setCreating(true); setError('');
    try {
      const r = await fetch(`/api/submissions/${submissionId}/share`, { method: 'POST', credentials: 'include' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      setLinks(l => [d, ...l]);
    } catch (e) { setError(e.message); } finally { setCreating(false); }
  };

  const revoke = async (token) => {
    if (!window.confirm('Revoke this share link? It will stop working immediately.')) return;
    await fetch(`/api/submissions/${submissionId}/share?token=${encodeURIComponent(token)}`, { method: 'DELETE', credentials: 'include' });
    setLinks(l => l.filter(x => x.token !== token));
  };

  const copy = async (link) => {
    try { await navigator.clipboard.writeText(link.share_url); setCopiedId(link.token); setTimeout(() => setCopiedId(null), 1500); } catch {}
  };

  return (
    <div style={{ marginTop: 12, padding: 14, background: 'var(--card-alt)', border: '1px solid var(--border-light)', borderRadius: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--amber)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>Share link</div>
      {loading ? (
        <div style={{ fontSize: 12, color: 'var(--text-mid)' }}>Loading…</div>
      ) : (
        <>
          {links.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-mid)', marginBottom: 10 }}>No active share links. Generate one to share this article publicly.</div>
          ) : (
            links.map(link => {
              const daysLeft = Math.max(0, Math.ceil((Number(link.expires_at) - Math.floor(Date.now() / 1000)) / 86400));
              return (
                <div key={link.token} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                  <input readOnly value={link.share_url} onFocus={e => e.target.select()}
                    style={{ flex: 1, minWidth: 220, padding: '6px 10px', fontSize: 12, background: 'var(--surface-inp)', border: '1px solid var(--border)', borderRadius: 6, fontFamily: 'var(--font-mono)', color: 'var(--text)' }} />
                  <button className="db-btn db-btn-gold" style={{ fontSize: 11, padding: '5px 10px' }} onClick={() => copy(link)}>
                    {copiedId === link.token ? 'Copied ✓' : 'Copy'}
                  </button>
                  <span style={{ fontSize: 11, color: 'var(--text-light)' }}>Expires in {daysLeft}d</span>
                  <button className="db-btn-danger" style={{ fontSize: 11, padding: '5px 10px' }} onClick={() => revoke(link.token)}>Revoke</button>
                </div>
              );
            })
          )}
          {error && <div style={{ fontSize: 12, color: 'var(--error)', marginBottom: 8 }}>{error}</div>}
          <button className="db-btn db-btn-green" onClick={generate} disabled={creating} style={{ marginTop: 4 }}>
            {creating ? 'Generating…' : 'Generate Share Link'}
          </button>
        </>
      )}
    </div>
  );
}

// ─── Itinerary card ─────────────────────────────────────────────────────────
function ItineraryCard({ row }) {
  const accent = '#6A4A8A';
  const date = row.created_at ? new Date((typeof row.created_at === 'number' && row.created_at < 1e12 ? row.created_at * 1000 : row.created_at)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  const status = row.status || 'draft';
  const badges = {
    draft:          { label: 'Draft',          color: 'var(--text-mid)', bg: 'var(--border)' },
    revision_ready: { label: 'Review Ready',   color: 'var(--amber)', bg: 'var(--amber-light)', pulse: true },
    approved:       { label: 'Preparing PDF',  color: 'var(--amber)', bg: 'var(--amber-light)', pulse: true },
    pdf_ready:      { label: 'PDF Ready',      color: 'var(--success)', bg: 'var(--success-bg)' },
    pdf_failed:     { label: 'PDF Failed',     color: 'var(--error)', bg: 'var(--error-bg)' },
  };
  const badge = badges[status] || badges.draft;
  return (
    <div style={{
      background: 'var(--card)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: '18px 22px',
      marginBottom: 12,
      boxShadow: 'var(--shadow-card)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(to right, ${accent}, transparent)`, pointerEvents: 'none' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: accent, letterSpacing: '.04em', textTransform: 'uppercase', fontWeight: 600 }}>
          ◎ Itinerary · {date}
        </div>
        <span style={{
          fontSize: 10, padding: '3px 10px', borderRadius: 100,
          background: badge.bg, color: badge.color,
          fontWeight: 600,
          display: 'inline-flex', alignItems: 'center', gap: 5,
        }}>
          {badge.pulse && <span className="db-review-dot" style={{ background: badge.color }} />}
          {badge.label}
        </span>
      </div>
      <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>
        {row.title || '—'}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {status === 'pdf_ready' ? (
          <a href={`/api/planner/${row.id}/download/pdf`} download
            className="db-btn db-btn-green">Download PDF</a>
        ) : null}
        <a href={`/planner/${row.id}`} className="db-btn db-btn-gold" style={{ textDecoration: 'none' }}>View Plan →</a>
      </div>
    </div>
  );
}

// ─── Presentation card ──────────────────────────────────────────────────────
function PresentationCard({ row }) {
  const date = row.created_at ? new Date(row.created_at).toLocaleDateString() : '';
  const status = row.presentation_status || 'queued';
  const slides = row.slide_count_actual || row.slide_count_target;
  const accent = '#6A4A8A';
  const bg = 'var(--card)';
  const border = 'var(--border)';

  return (
    <div style={{
      background: bg,
      border: `1px solid ${border}`,
      borderRadius: 12,
      padding: '18px 22px',
      marginBottom: 12,
      boxShadow: 'var(--shadow-card)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(to right, ${accent}, transparent)`, pointerEvents: 'none' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: accent, opacity: 0.85, letterSpacing: '.04em', textTransform: 'uppercase', fontWeight: 600 }}>
          {date} · Presentation
        </div>
        <span style={{
          fontSize: 10, padding: '2px 8px', borderRadius: 10,
          background: 'rgba(155,111,212,0.13)', color: accent,
          border: `0.5px solid rgba(155,111,212,0.27)`,
          fontWeight: 500,
        }}>PPTX</span>
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: '#ffffff', marginBottom: 4 }}>
        {row.topic || '—'}
      </div>
      <div style={{ fontSize: 12, color: '#8a8a8a', marginBottom: 12 }}>
        {row.template_filename || ''}
        {slides ? ` · ${slides} slide${slides === 1 ? '' : 's'}${row.slide_count_actual ? '' : ' (target)'}` : ''}
      </div>

      {status === 'ready' && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a href={`/api/submissions/${row.id}/presentation`} download
            style={{ padding: '6px 14px', borderRadius: 4, fontSize: 12,
              border: `0.5px solid ${accent}`, color: accent, background: 'transparent', textDecoration: 'none' }}>
            Download PPTX
          </a>
        </div>
      )}
      {(status === 'rendering' || status === 'queued') && (
        <div style={{ fontSize: 12, color: '#7a6a9a', fontStyle: 'italic' }}>Building deck...</div>
      )}
      {status === 'failed' && (
        <div style={{ fontSize: 12, color: '#d45a5a' }}>Build failed — contact support</div>
      )}
    </div>
  );
}

function PromptCard({ prompt }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const date = new Date(prompt.created_at).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });

  async function handleCopy() {
    await navigator.clipboard.writeText(prompt.prompt_content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const accent = '#2A5A8A';
  return (
    <div style={{
      background: 'var(--card)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: '18px 22px',
      marginBottom: 12,
      boxShadow: 'var(--shadow-card)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(to right, ${accent}, transparent)`, pointerEvents: 'none' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: accent, letterSpacing: '.04em', textTransform: 'uppercase', fontWeight: 600 }}>
          {date} · Prompt
        </div>
        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 100, background: 'var(--info-bg)', color: 'var(--info)', border: '1px solid var(--info-border)', fontWeight: 500 }}>
          {prompt.llm}
        </span>
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: '#c8ddf0', marginBottom: 12, lineHeight: 1.4 }}>
        {prompt.desired_outcome ?? 'Untitled Prompt'}
      </div>
      <div style={{ background: '#050e18', border: '0.5px solid #1e3a5a', borderRadius: 5, padding: '10px 14px', marginBottom: 12, maxHeight: expanded ? 'none' : 80, overflow: 'hidden', position: 'relative' }}>
        <pre style={{ fontSize: 11, color: '#8abacc', lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, fontFamily: 'monospace' }}>
          {prompt.prompt_content}
        </pre>
        {!expanded && (
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 40, background: 'linear-gradient(transparent, #050e18)' }} />
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={() => setExpanded(!expanded)} style={{ padding: '5px 12px', borderRadius: 4, fontSize: 11, cursor: 'pointer', border: '0.5px solid #1e3a5a', color: '#5a9fd4', background: 'transparent' }}>
          {expanded ? 'Show less' : 'Show full prompt'}
        </button>
        <button onClick={handleCopy} style={{ padding: '5px 12px', borderRadius: 4, fontSize: 11, cursor: 'pointer', border: '0.5px solid #1e3a5a', color: copied ? '#5ab85a' : '#5a9fd4', background: 'transparent' }}>
          {copied ? '✓ Copied' : 'Copy'}
        </button>
        <a href={`/api/prompts/${prompt.id}/download?format=txt`} download style={{ padding: '5px 12px', borderRadius: 4, fontSize: 11, cursor: 'pointer', border: '0.5px solid #1e3a5a', color: '#5a9fd4', background: 'transparent', textDecoration: 'none' }}>
          Download .txt
        </a>
        <a href={`/api/prompts/${prompt.id}/download?format=md`} download style={{ padding: '5px 12px', borderRadius: 4, fontSize: 11, cursor: 'pointer', border: '0.5px solid #1e3a5a', color: '#5a9fd4', background: 'transparent', textDecoration: 'none' }}>
          Download .md
        </a>
      </div>
    </div>
  );
}

const OPT_TARGETS = [
  'affiliate-seo', 'amazon-affiliate', 'brand-awareness', 'commerce-seo',
  'comparison-seo', 'cornerstone-seo', 'discovery-seo', 'ecommerce-seo',
  'email-newsletter', 'faq-seo', 'howto-seo', 'local-seo',
  'news-discover', 'news-syndication', 'product-review-seo', 'sponsored-content',
];
const TONE_STANCES = [
  'authoritative', 'balanced', 'casual', 'conversational', 'enthusiastic',
  'formal', 'humorous', 'inspirational', 'neutral', 'opinionated', 'technical',
];
const VOCAL_TONES = [
  'direct', 'educational', 'empathetic', 'engaging', 'friendly',
  'professional', 'storytelling', 'witty',
];

// ---------------------------------------------------------------------------
// Revision panel — inline below action row
// ---------------------------------------------------------------------------
function RevisionPanel({ panel, setPanel, onSubmit }) {
  const [fields, setFields] = useState({
    optimization_target: panel.optimization_target || '',
    tone_stance:         panel.tone_stance || '',
    vocal_tone:          panel.vocal_tone || '',
    min_word_count:      panel.min_word_count || '',
    target_keywords:     (() => {
      try { return Array.isArray(panel.target_keywords) ? panel.target_keywords.join(', ') : JSON.parse(panel.target_keywords || '[]').join(', '); }
      catch { return panel.target_keywords || ''; }
    })(),
    revision_notes:      panel.revision_notes || '',
  });

  const set = (k, v) => setFields(f => ({ ...f, [k]: v }));

  const inputStyle = {
    background: '#0a1a0a', border: '0.5px solid #2e5a2e', borderRadius: 4,
    color: '#d4e8d4', fontSize: 12, padding: '6px 8px', width: '100%',
    fontFamily: 'sans-serif', boxSizing: 'border-box',
  };
  const labelStyle = { fontSize: 10, fontWeight: 600, color: '#5a7a5a', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 4 };

  return (
    <div style={{
      marginTop: 12, padding: '14px 0 2px',
      borderTop: '0.5px solid #1e3a1e',
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#c8973a', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
        Revision Request
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 14px', marginBottom: 10 }}>
        <div>
          <label style={labelStyle}>Optimization Target</label>
          <select value={fields.optimization_target} onChange={e => set('optimization_target', e.target.value)} style={inputStyle}>
            <option value="">— keep current —</option>
            {OPT_TARGETS.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Tone / Stance</label>
          <select value={fields.tone_stance} onChange={e => set('tone_stance', e.target.value)} style={inputStyle}>
            <option value="">— keep current —</option>
            {TONE_STANCES.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Vocal Tone</label>
          <select value={fields.vocal_tone} onChange={e => set('vocal_tone', e.target.value)} style={inputStyle}>
            <option value="">— keep current —</option>
            {VOCAL_TONES.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Min Word Count</label>
          <input type="number" min="300" step="100" value={fields.min_word_count} onChange={e => set('min_word_count', e.target.value)} style={inputStyle} placeholder="keep current" />
        </div>
      </div>

      <div style={{ marginBottom: 10 }}>
        <label style={labelStyle}>Target Keywords (comma-separated)</label>
        <input type="text" value={fields.target_keywords} onChange={e => set('target_keywords', e.target.value)} style={inputStyle} placeholder="keep current" />
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Revision Notes — What specifically needs to change?</label>
        <textarea
          value={fields.revision_notes}
          onChange={e => set('revision_notes', e.target.value)}
          style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }}
          placeholder="Be specific: tone felt too formal, conclusion didn't address the reader's concern, missing comparison to product X..."
        />
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          className="db-btn db-btn-gold"
          onClick={() => {
            const payload = { ...fields };
            // Clean up empty fields so server uses COALESCE fallback
            if (!payload.optimization_target) delete payload.optimization_target;
            if (!payload.tone_stance) delete payload.tone_stance;
            if (!payload.vocal_tone) delete payload.vocal_tone;
            if (!payload.min_word_count) delete payload.min_word_count;
            if (!payload.target_keywords) {
              delete payload.target_keywords;
            } else {
              payload.target_keywords = JSON.stringify(
                fields.target_keywords.split(',').map(k => k.trim()).filter(Boolean)
              );
            }
            if (!payload.revision_notes) delete payload.revision_notes;
            onSubmit(panel.submissionId, payload);
            setPanel(null);
          }}
        >
          Requeue with changes
        </button>
        <button className="db-btn db-btn-disabled" onClick={() => setPanel(null)}>Cancel</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Audio player row — three states: ready | generating | not requested
// ---------------------------------------------------------------------------
function AudioRow({ submission, onRequestAudio }) {
  const [requesting, setRequesting] = useState(false);
  const [error, setError]           = useState(null);

  const genAudio = Number(submission.generate_audio) === 1;
  const audioReq = Number(submission.audio_requested) === 1;
  const pkgReady = submission.package_status === 'ready';

  const state1 = genAudio && pkgReady;              // audio exists — play controls
  const state3 = !genAudio && !audioReq;            // never requested — show button
  // state2 = everything else (generate_audio=1 but not ready yet, or audio_requested)

  const containerBase = {
    marginBottom: 12,
    padding: '10px 12px',
    background: '#081508',
    border: '0.5px solid #1e3a1e',
    borderRadius: 5,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    minHeight: 48,
    boxSizing: 'border-box',
  };

  if (state1) {
    return (
      <div style={containerBase}>
        <span style={{ fontFamily: 'sans-serif', fontSize: 10, color: '#5a7a5a', textTransform: 'uppercase', letterSpacing: '.06em', flexShrink: 0 }}>
          Audio
        </span>
        <audio
          controls
          preload="none"
          style={{ flex: 1, height: 28, accentColor: '#c8973a' }}
          src={`/api/submissions/${submission.id}/audio`}
        />
      </div>
    );
  }

  if (state3) {
    const handleClick = async () => {
      setRequesting(true);
      setError(null);
      try {
        await onRequestAudio(submission.id);
      } catch (e) {
        setError(e.message || 'Request failed');
      }
      setRequesting(false);
    };
    return (
      <div style={containerBase}>
        <span style={{ color: '#c8973a', fontSize: 12, flexShrink: 0 }}>✦</span>
        <span style={{ flex: 1, fontSize: 12, color: 'var(--text-light)' }}>
          {error ? <span style={{ color: '#b55' }}>{error}</span> : 'No audio yet'}
        </span>
        <button
          className="db-btn"
          onClick={handleClick}
          disabled={requesting}
          style={{ fontSize: 11, padding: '4px 10px', flexShrink: 0 }}
        >
          {requesting ? 'Generating…' : 'Generate Audio'}
        </button>
      </div>
    );
  }

  // state2 — generating
  return (
    <div style={{ ...containerBase, opacity: 0.5 }}>
      <span style={{ fontFamily: 'sans-serif', fontSize: 10, color: '#5a7a5a', textTransform: 'uppercase', letterSpacing: '.06em', flexShrink: 0 }}>
        Audio
      </span>
      <audio
        controls
        preload="none"
        muted
        disabled
        style={{ flex: 1, height: 28, accentColor: '#c8973a', pointerEvents: 'none' }}
      />
      <span style={{ fontSize: 11, color: 'var(--text-light)', fontStyle: 'italic', flexShrink: 0, animation: 'audioGenPulse 1.6s ease-in-out infinite' }}>
        Audio generating…
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single card — one structure, always identical
// ---------------------------------------------------------------------------
function SubmissionCard({ submission, onView, onDownload, onPublishClick, onPublish, onDelete, onEdit, onDiscard, onRequestRevision, onRequestAudio, publishingId, publishUrl, setPublishUrl, revisionPanel, setRevisionPanel }) {
  const [shareOpen, setShareOpen] = useState(false);
  const {
    topic,               // ← INJECT: topic field
    article_format,      // ← INJECT: article_format field
    optimization_target, // ← INJECT: optimization_target field
    created_at,          // ← INJECT: created_at timestamp
    status,              // ← INJECT: status field
    grade_status,        // ← INJECT: grade_status field
    author_display_name, // ← INJECT: from JOIN with author_profiles ap ON s.author = ap.slug
    word_count,          // ← INJECT: word_count field
    grade,               // ← INJECT: { grammar_score, readability_score, ai_detection_score, plagiarism_score, seo_score, overall_score } from grades table JOIN
    zip_url,             // ← INJECT: zip_url field (set when zip is packaged)
    article_content,     // ← INJECT: article_content field (used to determine if view button is active)
    featured_image_filename,
    generated_image_key,
    content_rating,
    llm_display_name,
  } = submission;

  // LLM slot badge — hide for slot 1 / null; amber for slot 2; red for slot 3.
  const llmBadge = (() => {
    if (!content_rating || content_rating === 1) return null;
    if (!llm_display_name) return null;
    const palette = content_rating === 3
      ? { bg: '#fce7e7', fg: '#b91c1c', bd: '#f4c2c2' }
      : { bg: '#fdf3d8', fg: '#a56a12', bd: '#ecd79a' };
    return (
      <span style={{
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        background: palette.bg,
        color: palette.fg,
        border: `1px solid ${palette.bd}`,
        padding: '1px 6px',
        borderRadius: 999,
        marginLeft: 8,
        whiteSpace: 'nowrap',
      }}>{llm_display_name}</span>
    );
  })();

  const stepIndex  = getStepIndex(status, grade_status);
  const statusText = getStatusText(status, grade_status);
  const isPublished = status === 'published';
  // Card border variant
  const cardClass = `db-card${isPublished ? ' db-card-published' : ''}`;

  // Badge type — 'Brief' for most, 'Analysis' for published
  const badge = isPublished
    ? <span className="db-badge-analysis">Analysis</span>
    : <span className="db-badge-brief">Brief</span>;

  return (
    <div className={cardClass}>

      {/* ── Card top: meta + badge ── */}
      <div className="db-card-top">
        <div className="db-card-meta">
          {formatDate(created_at)}
          {article_format ? ` · ${formatLabel(article_format)}` : ''}
          {llmBadge}
        </div>
        {badge}
      </div>

      {/* ── Featured image thumbnail ── */}
      {(generated_image_key || featured_image_filename) && (
        <div style={{
          marginBottom: 12,
          borderRadius: 6,
          overflow: 'hidden',
          border: '0.5px solid #1e3a1e',
        }}>
          <img
            src={generated_image_key
              ? `/api/submissions/${submission.id}/featured-image`
              : `/api/submissions/${submission.id}/images/${featured_image_filename}`}
            alt={topic || ''}
            style={{
              width: '100%',
              height: 180,
              objectFit: 'cover',
              display: 'block',
            }}
          />
        </div>
      )}

      {/* ── Title ── */}
      <div className="db-card-title">
        {topic || '—'}
      </div>

      {/* ── Published badge (only when published) ── */}
      {isPublished && (
        <div className="db-published-badge">
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
            <circle cx="4" cy="4" r="3" fill="#5ab85a"/>
          </svg>
          Published
        </div>
      )}

      {/* ── Review Ready / Revised status badges ── */}
      {status === 'review_ready' && (
        <div className="db-review-badge">
          <span className="db-review-dot" />
          Review Ready
        </div>
      )}
      {status === 'revision_applied' && (
        <div className="db-revised-badge">
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><circle cx="4" cy="4" r="3" fill="#3D5A3E"/></svg>
          Revised
        </div>
      )}

      {/* ── Live URL — shown when published and URL is set ── */}
      {isPublished && submission.live_url && (
        <div style={{ marginTop: 6, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <a
            href={submission.live_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 12, color: '#c8973a', textDecoration: 'none', wordBreak: 'break-all' }}
          >
            &#128279; {submission.live_url}
          </a>
          <button
            className="db-btn db-btn-gold"
            style={{ fontSize: 11, padding: '3px 10px' }}
            onClick={() => onPublishClick(submission.live_url)}
          >
            Edit URL
          </button>
        </div>
      )}

      {/* ── Pipeline stepper — always 4 steps ── */}
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, minWidth: 0 }}>
        <div style={{ flex: '1 1 auto', minWidth: 0 }}>
          <Pipeline stepIndex={stepIndex} />
        </div>
        {statusText && (
          <span style={{ fontSize: 12, color: 'var(--text-light)', fontStyle: 'italic', marginBottom: 13, flexShrink: 0 }}>
            {statusText}
          </span>
        )}
      </div>

      {/* ── Grade row — always rendered ── */}
      <GradeRow grade={grade} gradeStatus={grade_status} />

      {/* ── Audio player — always visible ── */}
      <AudioRow submission={submission} onRequestAudio={onRequestAudio} />

      {/* ── Author + word count — always rendered ── */}
      <div className="db-author-row">
        {author_display_name ? (
          <>By <span>{author_display_name}</span>{word_count ? ` · ${word_count.toLocaleString()} words` : ''}</>
        ) : (
          <span style={{ color: '#1e3a1e' }}>&nbsp;</span>
        )}
      </div>

      {/* ── Action row — always rendered, buttons grey when unavailable ── */}
      <ActionRow
        submission={submission}
        onView={onView}
        onDownload={onDownload}
        onPublishClick={onPublishClick}
        onDelete={onDelete}
        onEdit={onEdit}
        onDiscard={onDiscard}
        onRequestRevision={() => onRequestRevision(submission)}
        onShare={() => setShareOpen(o => !o)}
        shareOpen={shareOpen}
        publishingId={publishingId}
      />

      {shareOpen && <SharePanel submissionId={submission.id} onClose={() => setShareOpen(false)} />}

      {/* ── Revision panel — inline, opened by Request revision button ── */}
      {revisionPanel && revisionPanel.submissionId === submission.id && (
        <RevisionPanel
          panel={revisionPanel}
          setPanel={setRevisionPanel}
          onSubmit={onRequestRevision}
        />
      )}

      {/* ── Publish URL input — shown when Mark as published is clicked ── */}
      {publishingId === submission.id && (
        <div style={{
          marginTop: 12,
          padding: '12px 0',
          borderTop: '0.5px solid #1e3a1e',
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}>
          <input
            className="db-input"
            type="url"
            placeholder="https://yoursite.com/article-slug"
            value={publishUrl}
            onChange={e => setPublishUrl(e.target.value)}
            style={{ flex: 1, minWidth: 200 }}
            autoFocus
          />
          <button
            className="db-btn db-btn-green"
            onClick={() => onPublish(submission.id, publishUrl)}
            disabled={!publishUrl.trim()}
          >
            Confirm publish
          </button>
          <button
            className="db-btn db-btn-disabled"
            onClick={onPublishClick}
          >
            Cancel
          </button>
        </div>
      )}

    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard page
// ---------------------------------------------------------------------------
export default function Dashboard() {
  const [submissions, setSubmissions] = useState([]);  // ← INJECT: from GET /api/submissions
  const [emailSubs, setEmailSubs]     = useState([]);
  const [presentationSubs, setPresentationSubs] = useState([]);
  const [prompts, setPrompts]         = useState([]);
  const [itineraries, setItineraries] = useState([]);
  const [filter, setFilter]           = useState('all');
  const [loading, setLoading]         = useState(true);
  const [user, setUser]               = useState(null); // ← INJECT: from GET /api/me or session
  const [confirmModal, setConfirmModal] = useState(null); // { message, onConfirm }
  const [toast, setToast] = useState(null);
  const [publishingId, setPublishingId] = useState(null);
  const [publishUrl, setPublishUrl] = useState('');
  const [pausePoll, setPausePoll] = useState(false);
  const [revisionPanel, setRevisionPanel] = useState(null); // { submissionId, ...fields }

  // ── Load submissions ──
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [subRes, promptRes, emailRes, presRes, itinRes] = await Promise.all([
        fetch('/api/submissions', { credentials: 'include' }),
        fetch('/api/prompts', { credentials: 'include' }),
        fetch('/api/email-submissions', { credentials: 'include' }),
        fetch('/api/presentation-submissions', { credentials: 'include' }),
        fetch('/api/planner/list', { credentials: 'include' }),
      ]);
      const data = await subRes.json();
      setUser(data.user);
      setSubmissions(data.submissions || []);
      if (promptRes.ok) {
        const promptData = await promptRes.json();
        setPrompts(Array.isArray(promptData) ? promptData : []);
      }
      if (emailRes.ok) {
        const emailData = await emailRes.json();
        setEmailSubs(Array.isArray(emailData.submissions) ? emailData.submissions : []);
      }
      if (presRes.ok) {
        const presData = await presRes.json();
        setPresentationSubs(Array.isArray(presData.submissions) ? presData.submissions : []);
      }
      if (itinRes.ok) {
        const itinData = await itinRes.json();
        setItineraries(Array.isArray(itinData.itineraries) ? itinData.itineraries : []);
      }
    } catch (e) {
      console.error('Failed to load dashboard:', e);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(() => {
      if (!pausePoll) load();
    }, 60000);
    return () => clearInterval(interval);
  }, [load, pausePoll]);

  // ── Filter logic ──
  const filtered = submissions.filter(s => {
    if (s.article_format === 'email') return false; // emails get their own card section
    if (s.article_format === 'presentation') return false; // presentations get their own section
    if (filter === 'all')       return true;
    if (filter === 'queued')    return s.status === 'queued';
    if (filter === 'progress')  return ['generating', 'grading'].includes(s.status) || s.grade_status === 'grading';
    if (filter === 'done')      return s.grade_status === 'passed' || s.grade_status === 'graded';
    if (filter === 'published') return s.status === 'published';
    return true;
  });

  // ── Action handlers ──
  // INJECT: replace these with your actual API calls

  async function handleView(id) {
    // INJECT: open the rendered article preview
    // e.g. window.open(`/articles/${id}/preview`, '_blank')
    window.open(`/content/${id}`, '_blank');
  }

  async function handleDownload(id) {
    // INJECT: trigger zip download
    // e.g. window.location.href = `/api/submissions/${id}/download`
    window.location.href = `/api/submissions/${id}/download`;
  }

  function handlePublishClick(id, existingUrl = '') {
    // Coerce: when the button passes a React SyntheticEvent (no explicit arg),
    // existingUrl is the event object — treat it as no URL.
    const url = (typeof existingUrl === 'string') ? existingUrl : '';
    // Toggle URL input on the card; pre-populate if editing an existing URL
    if (publishingId === id) {
      setPublishingId(null);
      setPublishUrl('');
    } else {
      setPublishingId(id);
      setPublishUrl(url);
    }
  }

  async function handlePublish(id, liveUrl) {
    const url = (typeof liveUrl === 'string') ? liveUrl.trim() : '';
    if (!url) {
      setToast({ message: 'Live URL is required to publish.', type: 'error' });
      return;
    }
    // Optimistic update
    setSubmissions(prev => prev.map(s => s.id === id ? { ...s, status: 'published', live_url: url } : s));
    setPublishingId(null);
    setPublishUrl('');
    try {
      const res = await fetch(`/api/submissions/${id}/publish`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ live_url: url }),
      });
      if (!res.ok) {
        // Roll back optimistic state by reloading from server
        await load();
        setToast({ message: 'Publish failed — server error.', type: 'error' });
        return;
      }
      // Background sync
      await load();
    } catch (e) {
      await load();
      setToast({ message: 'Publish failed — network error.', type: 'error' });
    }
  }

  async function handleDelete(id) {
    setConfirmModal({
      message: 'Delete this submission? This cannot be undone.',
      onConfirm: async () => {
        await fetch(`/api/submissions/${id}`, { method: 'DELETE', credentials: 'include' });
        await load();
      }
    });
  }

  async function handleEdit(id) {
    // INJECT: navigate to edit brief page
    window.location.href = `/briefs/${id}/edit`;
  }

  async function handleDiscard(id) {
    setConfirmModal({
      message: 'Discard this draft? This cannot be undone.',
      onConfirm: async () => {
        await fetch(`/api/submissions/${id}`, { method: 'DELETE', credentials: 'include' });
        await load();
      }
    });
  }

  async function handleRequestAudio(id) {
    const res = await fetch(`/api/submissions/${id}/request-audio`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
    let data = {};
    try { data = await res.json(); } catch {}
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    setSubmissions(subs => subs.map(s =>
      s.id === id ? { ...s, generate_audio: 1, audio_requested: 1 } : s
    ));
    return data;
  }

  function handleRequestRevision(submissionOrId, overrides) {
    // When called with a submission object (from button click) — open the panel
    if (typeof submissionOrId === 'object' && submissionOrId !== null && !overrides) {
      const sub = submissionOrId;
      setRevisionPanel({
        submissionId:        sub.id,
        optimization_target: sub.optimization_target || '',
        tone_stance:         sub.tone_stance || '',
        vocal_tone:          sub.vocal_tone || '',
        min_word_count:      sub.min_word_count || '',
        target_keywords:     sub.target_keywords || '',
        revision_notes:      sub.revision_notes || '',
      });
      return;
    }

    // When called from RevisionPanel with (submissionId, payload) — submit
    const id = submissionOrId;
    const payload = overrides || {};

    // Hard local reset — replace submission in state immediately
    setSubmissions(prev => prev.map(s => s.id === id ? {
      ...s,
      status: 'queued',
      grade_status: 'queued',
      article_content: null,
      word_count: null,
      package_status: null,
      zip_url: null,
      live_url: null,
      grade: null,
      revision_notes: payload.revision_notes !== undefined ? payload.revision_notes : s.revision_notes,
    } : s));

    setToast('Revision requested — your article has been requeued.');
    setTimeout(() => setToast(null), 4000);

    // Pause polling for 10s so optimistic state isn't clobbered by stale server data
    setPausePoll(true);
    setTimeout(() => setPausePoll(false), 10000);

    // Fire API in background — do not await, do not reload
    fetch(`/api/submissions/${id}/revise`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(err => console.error('Revise failed:', err));
  }

  // ── Render ──
  return (
    <div className="db-page">

      {/* Header */}
      <div className="db-header">
        <h1 style={{
          fontFamily: "'Playfair Display', Georgia, serif",
          fontSize: 28,
          fontWeight: 700,
          color: 'var(--text)',
          letterSpacing: '-0.3px',
        }}>
          Dashboard
        </h1>
        <div className="db-stats-row">
          <div className="db-stat-item">
            <span className="db-stat-num" style={{ color: 'var(--green)' }}>{submissions.length}</span>
            <span className="db-stat-label">Total</span>
          </div>
          <div className="db-stat-divider" />
          <div className="db-stat-item">
            <span className="db-stat-num" style={{ color: 'var(--green)' }}>{submissions.filter(s => s.grade_status === 'passed').length}</span>
            <span className="db-stat-label">Passed</span>
          </div>
          <div className="db-stat-divider" />
          <div className="db-stat-item">
            <span className="db-stat-num" style={{ color: 'var(--green)' }}>{submissions.filter(s => s.status === 'published').length}</span>
            <span className="db-stat-label">Published</span>
          </div>
        </div>
      </div>

      <hr className="db-divider" />

      {toast && (
        <div style={{
          background: '#0a2a0a',
          border: '0.5px solid #1e3a1e',
          borderRadius: 6,
          padding: '10px 16px',
          marginBottom: 16,
          fontFamily: 'sans-serif',
          fontSize: 12,
          color: '#5ab85a'
        }}>
          {toast}
        </div>
      )}

      {/* Filter bar */}
      <div className="db-filter-row">
        {FILTERS.map(f => (
          <button
            key={f.id}
            className={`db-filter-btn${filter === f.id ? ' active' : ''}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Cards */}
      {loading ? (
        <div style={{ color: '#3a5a3a', fontFamily: 'sans-serif', fontSize: 13, padding: '20px 0' }}>
          Loading...
        </div>
      ) : (filtered.length === 0 && emailSubs.length === 0 && presentationSubs.length === 0 && prompts.length === 0 && itineraries.length === 0) ? (
        <div className="db-empty">
          <span className="db-empty-icon">✦</span>
          <div className="db-empty-title">No articles yet.</div>
          <div className="db-empty-sub">{filter === 'all' ? 'Submit your first brief to get started.' : `No ${filter} submissions.`}</div>
          <a href="#" className="btn-primary" onClick={e => { e.preventDefault(); window.location.href = '/author' }}>Build your first article →</a>
        </div>
      ) : (
        <div className="db-cards-container">
          {itineraries.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: '#6A4A8A', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 10 }}>
                Itineraries
              </div>
              {itineraries.map(row => <ItineraryCard key={row.id} row={row} />)}
            </div>
          )}
          {presentationSubs.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: '#9b6fd4', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 10 }}>
                Presentations
              </div>
              {presentationSubs.map(row => <PresentationCard key={row.id} row={row} />)}
            </div>
          )}
          {emailSubs.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: '#c8973a', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 10 }}>
                Email Templates
              </div>
              {emailSubs.map(row => <EmailCard key={row.id} row={row} />)}
            </div>
          )}
          {prompts.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: '#4a6a8a', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 10 }}>
                Saved Prompts
              </div>
              {prompts.map(p => <PromptCard key={p.id} prompt={p} />)}
            </div>
          )}
          {filtered.map(sub => (
          <SubmissionCard
            key={sub.id}
            submission={sub}
            onView={() => handleView(sub.id)}
            onDownload={() => handleDownload(sub.id)}
            onPublishClick={(existingUrl) => handlePublishClick(sub.id, existingUrl)}
            onPublish={handlePublish}
            onDelete={() => handleDelete(sub.id)}
            onEdit={() => handleEdit(sub.id)}
            onDiscard={() => handleDiscard(sub.id)}
            onRequestRevision={handleRequestRevision}
            onRequestAudio={handleRequestAudio}
            publishingId={publishingId}
            publishUrl={publishUrl}
            setPublishUrl={setPublishUrl}
            revisionPanel={revisionPanel}
            setRevisionPanel={setRevisionPanel}
          />
        ))}
        </div>
      )}

      {/* Confirmation modal */}
      {confirmModal && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000}}>
          <div style={{background:'#0f200f',border:'0.5px solid #2e5a2e',borderRadius:8,padding:24,width:360,fontFamily:'sans-serif'}}>
            <div style={{color:'#fff',fontSize:14,marginBottom:20}}>{confirmModal.message}</div>
            <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
              <button className="db-btn db-btn-disabled" onClick={() => setConfirmModal(null)}>Cancel</button>
              <button className="db-btn db-btn-danger-solid" onClick={() => { confirmModal.onConfirm(); setConfirmModal(null); }}>Confirm</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
