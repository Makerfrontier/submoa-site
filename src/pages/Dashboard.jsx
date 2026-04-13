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
  { id: 'done',       label: 'Done' },
  { id: 'failed',     label: 'Failed' },
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
  if (status === 'article_done' && gradeStatus === 'passed') return 4; // all complete
  if (status === 'article_done')                        return 3; // done step active
  if (status === 'grading' || gradeStatus === 'grading' || gradeStatus === 'rewriting') return 2;
  if (status === 'generating' || status === 'queued')   return 1;
  return 0; // draft / brief
}

// Maps step index → status message shown next to stepper
function getStatusText(status, gradeStatus) {
  if (status === 'published')                                return null;
  if (gradeStatus === 'passed')                              return null;
  if (gradeStatus === 'needs_review')                        return 'Needs review';
  if (gradeStatus === 'rewriting')                           return 'Rewriting...';
  if (status === 'grading' || gradeStatus === 'grading')     return 'Grading in progress...';
  if (status === 'generating')                               return 'Generating your article...';
  if (status === 'queued')                                   return 'Queued for generation...';
  if (status === 'failed')                                   return null;
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
function GradeRow({ grade }) {
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
function ActionRow({ submission, onView, onDownload, onPublish, onDelete, onEdit, onDiscard, onRequestRevision }) {
  const status      = submission.status;
  const gradeStatus = submission.grade_status;
  const hasArticle  = !!submission.article_content;
  const hasZip      = !!submission.article_content; // zip available whenever article exists
  const isDraft     = status === 'draft' || status === 'brief';
  const isFailed    = gradeStatus === 'needs_review' || status === 'failed';
  const isPassed    = gradeStatus === 'passed';
  const isPublished = status === 'published';

  // View rendered article — active when article exists
  const viewActive     = hasArticle;
  // Download zip — active when zip has been packaged
  const downloadActive = hasZip;
  // Mark as published — active when grading passed and not already published
  const publishActive  = isPassed && !isPublished;

  return (
    <div className="db-action-row">
      {/* View rendered article */}
      <button
        className={`db-btn ${viewActive ? 'db-btn-gold' : 'db-btn-disabled'}`}
        onClick={viewActive ? onView : undefined}
        disabled={!viewActive}
        title={viewActive ? 'View rendered article' : 'Article not yet generated'}
      >
        View rendered article
      </button>

      {/* Download zip package */}
      <button
        className={`db-btn ${downloadActive ? 'db-btn-gold' : 'db-btn-disabled'}`}
        onClick={downloadActive ? onDownload : undefined}
        disabled={!downloadActive}
        title={downloadActive ? 'Download zip package' : 'Package not yet available'}
      >
        Download zip package
      </button>

      {/* Mark as published */}
      <button
        className={`db-btn ${publishActive ? 'db-btn-green' : 'db-btn-disabled'}`}
        onClick={publishActive ? onPublish : undefined}
        disabled={!publishActive}
        title={publishActive ? 'Mark as published' : isPublished ? 'Already published' : 'Not ready to publish'}
      >
        Mark as published
      </button>

      {/* Edit — only shown on draft cards */}
      {isDraft && (
        <button className="db-btn db-btn-gold" onClick={onEdit}>
          Edit
        </button>
      )}

      {/* Request revision — only shown on failed/needs_review */}
      {isFailed && (
        <button className="db-btn db-btn-gold" onClick={onRequestRevision}>
          Request revision
        </button>
      )}

      {/* Discard draft — only shown on draft cards */}
      {isDraft && (
        <button className="db-btn-danger" onClick={onDiscard}>
          Discard draft
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
// Single card — one structure, always identical
// ---------------------------------------------------------------------------
function SubmissionCard({ submission, onView, onDownload, onPublish, onDelete, onEdit, onDiscard, onRequestRevision }) {
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
  } = submission;

  const stepIndex  = getStepIndex(status, grade_status);
  const statusText = getStatusText(status, grade_status);
  const isPublished = status === 'published';
  const isFailed    = grade_status === 'needs_review' || status === 'failed';

  // Card border variant
  const cardClass = `db-card${isFailed ? ' db-card-failed' : isPublished ? ' db-card-published' : ''}`;

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
        </div>
        {badge}
      </div>

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

      {/* ── Alert bar (only when failed/needs_review) ── */}
      {isFailed && grade?.overall_score !== null && grade?.overall_score !== undefined && (
        <div className="db-alert-bar">
          Generation failed after 2 attempts. Overall score {grade.overall_score} — review required.
        </div>
      )}

      {/* ── Pipeline stepper — always 4 steps ── */}
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <Pipeline stepIndex={stepIndex} />
        {statusText && (
          <span style={{ fontSize: 12, color: '#5a7a5a', fontStyle: 'italic', marginLeft: 8, marginBottom: 13, whiteSpace: 'nowrap' }}>
            {statusText}
          </span>
        )}
      </div>

      {/* ── Grade row — always rendered ── */}
      <GradeRow grade={grade} />

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
        onPublish={onPublish}
        onDelete={onDelete}
        onEdit={onEdit}
        onDiscard={onDiscard}
        onRequestRevision={onRequestRevision}
      />

    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard page
// ---------------------------------------------------------------------------
export default function Dashboard() {
  const [submissions, setSubmissions] = useState([]);  // ← INJECT: from GET /api/submissions
  const [filter, setFilter]           = useState('all');
  const [loading, setLoading]         = useState(true);
  const [user, setUser]               = useState(null); // ← INJECT: from GET /api/me or session
  const [confirmModal, setConfirmModal] = useState(null); // { message, onConfirm }
  const [toast, setToast] = useState(null);

  // ── Load submissions ──
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch('/api/submissions', { credentials: 'include' });
      const data = await res.json();
      setUser(data.user);
      setSubmissions(data.submissions || []);
    } catch (e) {
      console.error('Failed to load submissions:', e);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    // Poll every 60 seconds to catch status changes
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, [load]);

  // ── Filter logic ──
  const filtered = submissions.filter(s => {
    if (filter === 'all')       return true;
    if (filter === 'queued')    return s.status === 'queued';
    if (filter === 'progress')  return ['generating', 'grading', 'rewriting'].includes(s.status) || ['grading', 'rewriting'].includes(s.grade_status);
    if (filter === 'done')      return s.grade_status === 'passed';
    if (filter === 'failed')    return s.grade_status === 'needs_review' || s.status === 'failed';
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

  async function handlePublish(id) {
    // INJECT: mark as published
    await fetch(`/api/submissions/${id}/publish`, { method: 'PATCH', credentials: 'include' });
    await load();
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

  async function handleRequestRevision(id) {
    // INJECT: trigger revision request
    await fetch(`/api/submissions/${id}/revise`, { method: 'POST', credentials: 'include' });
    setToast('Revision requested — your article has been requeued.');
    setTimeout(() => setToast(null), 4000);
    await load();
  }

  // ── Render ──
  return (
    <div className="db-page">

      {/* Header */}
      <div className="db-header">
        <h1>Your Content.</h1>
        <div className="db-stats-row">
          <div className="db-stat-item">
            <span className="db-stat-num">{submissions.length}</span>
            <span className="db-stat-label">Total</span>
          </div>
          <div className="db-stat-divider" />
          <div className="db-stat-item">
            <span className="db-stat-num green">{submissions.filter(s => s.grade_status === 'passed').length}</span>
            <span className="db-stat-label">Passed</span>
          </div>
          <div className="db-stat-divider" />
          <div className="db-stat-item">
            <span className="db-stat-num blue">{submissions.filter(s => s.status === 'published').length}</span>
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
      ) : filtered.length === 0 ? (
        <div style={{ color: '#3a5a3a', fontFamily: 'sans-serif', fontSize: 13, padding: '20px 0' }}>
          {filter === 'all' ? 'No submissions yet.' : `No ${filter} submissions.`}
        </div>
      ) : (
        filtered.map(sub => (
          <SubmissionCard
            key={sub.id}
            submission={sub}
            onView={() => handleView(sub.id)}
            onDownload={() => handleDownload(sub.id)}
            onPublish={() => handlePublish(sub.id)}
            onDelete={() => handleDelete(sub.id)}
            onEdit={() => handleEdit(sub.id)}
            onDiscard={() => handleDiscard(sub.id)}
            onRequestRevision={() => handleRequestRevision(sub.id)}
          />
        ))
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
