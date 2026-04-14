// src/pages/AdminDashboard.jsx
// SubMoa Content — Admin Dashboard
// Route: /admin — protected by role = 'admin'

import { useState, useEffect, useCallback } from 'react';
import './AdminDashboard.css';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const API = (path) => `/api/admin${path}`;

async function apiFetch(path, options = {}) {
  const res = await fetch(API(path), {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...options,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

function scoreClass(score, threshold) {
  if (score === null || score === undefined) return 'blank';
  if (score >= threshold) return 'pass';
  if (score >= threshold - 10) return 'warn';
  return 'fail';
}

const THRESHOLDS = { grammar: 85, readability: 70, ai_detection: 80, plagiarism: 90, seo: 70 };

function ScoreCell({ scores }) {
  if (!scores || scores.overall_score === null) {
    return (
      <div className="adm-scores">
        {['Gr','Rd','AI','Pl','SE','Ov'].map(l => (
          <div key={l} className="adm-sc">
            <div className="adm-sc-l">{l}</div>
            <div className="adm-sc-n blank">—</div>
          </div>
        ))}
      </div>
    );
  }
  const items = [
    { l: 'Gr', v: scores.grammar_score,      t: THRESHOLDS.grammar },
    { l: 'Rd', v: scores.readability_score,  t: THRESHOLDS.readability },
    { l: 'AI', v: scores.ai_detection_score, t: THRESHOLDS.ai_detection },
    { l: 'Pl', v: scores.plagiarism_score,   t: THRESHOLDS.plagiarism },
    { l: 'SE', v: scores.seo_score,          t: THRESHOLDS.seo },
    { l: 'Ov', v: scores.overall_score,      t: 80 },
  ];
  return (
    <div className="adm-scores">
      {items.map(({ l, v, t }) => (
        <div key={l} className="adm-sc">
          <div className="adm-sc-l">{l}</div>
          <div className={`adm-sc-n ${scoreClass(v, t)}`}>{v ?? '—'}</div>
        </div>
      ))}
    </div>
  );
}

function StatusPill({ status, gradeStatus }) {
  const s = gradeStatus === 'needs_review' ? 'review'
    : gradeStatus === 'rewriting' ? 'prog'
    : status === 'article_done' ? 'done'
    : status === 'published' ? 'pub'
    : status === 'generating' ? 'prog'
    : status === 'queued' ? 'queued'
    : status === 'failed' ? 'fail'
    : 'prog';
  const labels = { done: 'Done', prog: 'In Progress', fail: 'Failed', review: 'Needs Review', pub: 'Published', queued: 'Queued' };
  return <span className={`adm-pill ${s}`}>● {labels[s] || status}</span>;
}

// ---------------------------------------------------------------------------
// Submissions section
// ---------------------------------------------------------------------------
function SectionSubmissions() {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [authorFilter, setAuthorFilter] = useState('');
  const [authors, setAuthors] = useState([]);
  const [grading, setGrading] = useState({});
  const [gradingAll, setGradingAll] = useState(false);
  const [stats, setStats] = useState({});
  const [page, setPage] = useState(1);
  const PER_PAGE = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [subData, authData, statData] = await Promise.all([
        apiFetch('/submissions'),
        apiFetch('/authors'),
        apiFetch('/stats'),
      ]);
      setSubmissions(subData.submissions || []);
      setAuthors(authData.authors || []);
      setStats(statData);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = submissions.filter(s => {
    if (filter === 'all') return true;
    if (filter === 'done') return s.status === 'article_done';
    if (filter === 'review') return s.grade_status === 'needs_review';
    if (filter === 'failed') return s.status === 'failed';
    if (filter === 'published') return s.status === 'published';
    if (filter === 'queued') return s.status === 'queued';
    if (filter === 'generating') return s.status === 'generating';
    return true;
  }).filter(s => !authorFilter || s.author === authorFilter);

  const pages = Math.ceil(filtered.length / PER_PAGE);
  const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  async function gradeOne(id) {
    setGrading(g => ({ ...g, [id]: true }));
    try { await apiFetch(`/articles/${id}/grade`, { method: 'POST' }); await load(); }
    catch (e) { console.error(e); }
    setGrading(g => ({ ...g, [id]: false }));
  }

  async function gradeAll() {
    setGradingAll(true);
    try { await apiFetch('/articles/grade-all', { method: 'POST' }); await load(); }
    catch (e) { console.error(e); }
    setGradingAll(false);
  }

  async function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    try {
      await apiFetch('/articles/upload-for-grading', {
        method: 'POST',
        body: JSON.stringify({ content: text, filename: file.name }),
      });
      await load();
    } catch (err) { console.error(err); }
  }

  const filters = ['all','queued','generating','done','review','failed','published'];
  const filterLabels = { all:'All', queued:'Queued', generating:'Generating', done:'Done', review:'Needs Review', failed:'Failed', published:'Published' };

  return (
    <div>
      <div className="adm-page-title">Submissions</div>
      <div className="adm-page-sub">All articles across all authors</div>

      <div className="adm-stats-row">
        <div className="adm-stat"><div className="adm-stat-num">{stats.total ?? '—'}</div><div className="adm-stat-label">Total</div></div>
        <div className="adm-stat"><div className="adm-stat-num gold">{stats.in_progress ?? '—'}</div><div className="adm-stat-label">In Progress</div></div>
        <div className="adm-stat"><div className="adm-stat-num green">{stats.done ?? '—'}</div><div className="adm-stat-label">Done</div></div>
        <div className="adm-stat"><div className="adm-stat-num red">{stats.failed ?? '—'}</div><div className="adm-stat-label">Failed</div></div>
        <div className="adm-stat"><div className="adm-stat-num amber">{stats.needs_review ?? '—'}</div><div className="adm-stat-label">Needs Review</div></div>
      </div>

      <div className="adm-filters">
        {filters.map(f => (
          <button key={f} className={`adm-fpill ${filter === f ? 'active' : ''}`} onClick={() => { setFilter(f); setPage(1); }}>
            {filterLabels[f]}
          </button>
        ))}
        <select className="adm-select" value={authorFilter} onChange={e => setAuthorFilter(e.target.value)}>
          <option value="">All Authors</option>
          {authors.map(a => <option key={a.slug} value={a.slug}>{a.name}</option>)}
        </select>
        <button className="adm-btn solid" onClick={gradeAll} disabled={gradingAll}>
          {gradingAll ? 'Grading...' : 'Grade All Ungraded'}
        </button>
      </div>

      <label className="adm-upload">
        + Upload article for grading (drag & drop or click)
        <input type="file" accept=".txt,.md,.html" style={{ display:'none' }} onChange={handleUpload} />
      </label>

      {loading ? (
        <div className="adm-loading">Loading submissions…</div>
      ) : (
        <>
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Author</th>
                  <th>Format</th>
                  <th>Status</th>
                  <th>Scores</th>
                  <th>Words</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paged.length === 0 && (
                  <tr><td colSpan={7} style={{ color:'#3a5a3a', textAlign:'center', padding:'20px' }}>No submissions match this filter.</td></tr>
                )}
                {paged.map(sub => (
                  <tr key={sub.id}>
                    <td style={{ color:'#fff', maxWidth:200, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }} title={sub.title}>{sub.title}</td>
                    <td style={{ color:'#8aaa8a' }}>{sub.author_display_name || sub.author}</td>
                    <td style={{ color:'#5a7a5a' }}>{sub.article_format || '—'}</td>
                    <td><StatusPill status={sub.status} gradeStatus={sub.grade_status} /></td>
                    <td><ScoreCell scores={sub.grade} /></td>
                    <td style={{ color:'#5a7a5a' }}>{sub.word_count ? sub.word_count.toLocaleString() : '—'}</td>
                    <td>
                      <div className="adm-btn-row">
                        <button className="adm-btn" onClick={() => window.open(`/dashboard?id=${sub.id}`, '_blank')}>View</button>
                        {(sub.status === 'article_done' || sub.grade_status === 'needs_review') && (
                          <button className="adm-btn green" onClick={() => gradeOne(sub.id)} disabled={grading[sub.id]}>
                            {grading[sub.id] ? '…' : 'Grade'}
                          </button>
                        )}
                        {sub.grade_status === 'needs_review' && (
                          <button className="adm-btn" onClick={async () => {
                            await apiFetch(`/articles/${sub.id}/approve`, { method: 'POST' });
                            await load();
                          }}>Approve</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="adm-pagination">
            <span>Showing {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, filtered.length)} of {filtered.length}</span>
            <div className="adm-btn-row">
              <button className="adm-btn" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>← Prev</button>
              <button className="adm-btn" onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages}>Next →</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Queue section
// ---------------------------------------------------------------------------
function SectionQueue() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await apiFetch('/queue')); }
    catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function requeue(id) {
    try { await apiFetch(`/queue/requeue/${id}`, { method: 'POST' }); await load(); }
    catch (e) { console.error(e); }
  }

  async function cancel(id) {
    try { await apiFetch(`/queue/cancel/${id}`, { method: 'POST' }); await load(); }
    catch (e) { console.error(e); }
  }

  if (loading) return <div className="adm-loading">Loading queue…</div>;
  const q = data || {};

  return (
    <div>
      <div className="adm-page-title">Queue</div>
      <div className="adm-page-sub">Generation jobs — processed in submission order</div>

      <div className="adm-health-big">
        <div className="adm-hb"><div className="adm-hb-num">{q.queued_count ?? 0}</div><div className="adm-hb-label">Queued</div></div>
        <div className="adm-hb"><div className="adm-hb-num" style={{color:'#d4a85a'}}>{q.generating_count ?? 0}</div><div className="adm-hb-label">Generating</div></div>
        <div className="adm-hb"><div className="adm-hb-num" style={{color: q.stuck_count ? '#d45a5a' : '#5ab85a'}}>{q.stuck_count ?? 0}</div><div className="adm-hb-label">Stuck</div></div>
        <div className="adm-hb"><div className="adm-hb-num" style={{color: q.dlq_count ? '#d45a5a' : '#5ab85a'}}>{q.dlq_count ?? 0}</div><div className="adm-hb-label">Dead Letter</div></div>
      </div>

      <div className="adm-card">
        <div className="adm-card-title">Currently Processing</div>
        {q.generating?.length ? q.generating.map(item => (
          <div key={item.id} className="adm-q-item">
            <div className="adm-q-pos" style={{background:'#1a2a0a',color:'#d4a85a'}}>▶</div>
            <div style={{flex:1}}>
              <div style={{color:'#fff'}}>{item.title}</div>
              <div style={{color:'#5a7a5a',fontSize:11}}>{item.author_display_name} · {item.article_format} · Started {item.started_ago}</div>
            </div>
            <span className="adm-pill prog">Generating</span>
          </div>
        )) : <div className="adm-empty">Nothing currently generating.</div>}
      </div>

      <div className="adm-card">
        <div className="adm-card-title">Queued — Next Up</div>
        {q.queued?.length ? q.queued.map((item, i) => (
          <div key={item.id} className="adm-q-item">
            <div className="adm-q-pos">{i + 1}</div>
            <div style={{flex:1}}>
              <div style={{color:'#fff'}}>{item.title}</div>
              <div style={{color:'#5a7a5a',fontSize:11}}>{item.author_display_name} · {item.article_format} · Queued {item.queued_ago}</div>
            </div>
            <button className="adm-btn red" onClick={() => cancel(item.id)}>Cancel</button>
          </div>
        )) : <div className="adm-empty">Queue is empty.</div>}
      </div>

      <div className="adm-card">
        <div className="adm-card-title">Dead Letter Queue — Failed Jobs</div>
        {q.dead_letter?.length ? q.dead_letter.map(item => (
          <div key={item.id} className="adm-q-item">
            <div className="adm-q-pos" style={{background:'#2a0a0a',color:'#d45a5a'}}>✕</div>
            <div style={{flex:1}}>
              <div style={{color:'#fff'}}>{item.title}</div>
              <div style={{color:'#d45a5a',fontSize:11}}>Failed {item.failed_ago} · {item.error}</div>
            </div>
            <button className="adm-btn green" onClick={() => requeue(item.id)}>Requeue</button>
          </div>
        )) : <div className="adm-empty">No failed jobs. All clear.</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Health section
// ---------------------------------------------------------------------------
function SectionHealth() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try { setData(await apiFetch('/health')); }
      catch (e) { console.error(e); }
      setLoading(false);
    }
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, []);

  async function requeue(id) {
    try { await apiFetch(`/queue/requeue/${id}`, { method: 'POST' }); }
    catch (e) { console.error(e); }
  }

  if (loading) return <div className="adm-loading">Running health checks…</div>;
  const h = data || {};
  const apis = h.apis || [];
  const stuck = h.stuck || [];

  return (
    <div>
      <div className="adm-page-title">System Health</div>
      <div className="adm-page-sub">Live status across all pipeline services</div>

      {stuck.length > 0 && (
        <div className="adm-alert">
          <span>⚠ {stuck.length} submission{stuck.length > 1 ? 's' : ''} stuck in generating state — intervention may be needed</span>
        </div>
      )}

      <div className="adm-health-big">
        <div className="adm-hb"><div className="adm-hb-num" style={{color:'#5ab85a'}}>{h.uptime ?? '—'}%</div><div className="adm-hb-label">Uptime 30d</div></div>
        <div className="adm-hb"><div className="adm-hb-num">{h.generated_today ?? 0}</div><div className="adm-hb-label">Generated Today</div></div>
        <div className="adm-hb"><div className="adm-hb-num" style={{color:'#5ab85a'}}>{h.pass_rate ?? '—'}%</div><div className="adm-hb-label">Grade Pass Rate</div></div>
        <div className="adm-hb"><div className="adm-hb-num" style={{color: stuck.length ? '#d45a5a' : '#5ab85a'}}>{stuck.length}</div><div className="adm-hb-label">Stuck Jobs</div></div>
      </div>

      <div className="adm-health-grid">
        <div className="adm-card">
          <div className="adm-card-title">External APIs</div>
          {apis.map(api => (
            <div key={api.name} className="adm-api-row">
              <div style={{display:'flex',alignItems:'center'}}>
                <span className={`adm-dot ${api.status === 'ok' ? 'g' : api.status === 'slow' ? 'a' : 'r'}`}></span>
                <span style={{color:'#8aaa8a'}}>{api.name}</span>
              </div>
              <span style={{color: api.status === 'ok' ? '#5a7a5a' : api.status === 'slow' ? '#d4a85a' : '#d45a5a', fontSize:11}}>
                {api.latency ? `${api.latency}ms avg` : api.note || api.status}
              </span>
            </div>
          ))}
        </div>

        <div className="adm-card">
          <div className="adm-card-title">Cron Worker</div>
          <div className="adm-api-row"><span style={{color:'#6a8a6a'}}>Last fired</span><span style={{color:'#8aaa8a',fontSize:11}}>{h.cron_last_fired || '—'}</span></div>
          <div className="adm-api-row"><span style={{color:'#6a8a6a'}}>Next scheduled</span><span style={{color:'#8aaa8a',fontSize:11}}>{h.cron_next || '—'}</span></div>
          <div className="adm-api-row"><span style={{color:'#6a8a6a'}}>Last grading run</span><span style={{color:'#8aaa8a',fontSize:11}}>{h.last_grading_run || '—'}</span></div>
          <div className="adm-api-row"><span style={{color:'#6a8a6a'}}>DLQ depth</span><span style={{color: h.dlq_depth ? '#d45a5a' : '#5ab85a',fontSize:11}}>{h.dlq_depth ?? 0} jobs</span></div>
        </div>

        <div className="adm-card">
          <div className="adm-card-title">Stuck Submissions</div>
          {stuck.length ? stuck.map(s => (
            <div key={s.id} className="adm-q-item">
              <div style={{flex:1}}>
                <div style={{color:'#fff',fontSize:12}}>{s.title}</div>
                <div style={{color:'#d45a5a',fontSize:10,marginTop:2}}>{s.status} · {s.stuck_for} · {s.author_display_name}</div>
              </div>
              <button className="adm-btn green" onClick={() => requeue(s.id)}>Requeue</button>
            </div>
          )) : <div className="adm-empty">No stuck submissions.</div>}
        </div>

        <div className="adm-card">
          <div className="adm-card-title">Last Generation</div>
          {h.last_generation ? (
            <>
              <div className="adm-api-row"><span style={{color:'#6a8a6a'}}>Article</span><span style={{color:'#8aaa8a',fontSize:11}}>{h.last_generation.title}</span></div>
              <div className="adm-api-row"><span style={{color:'#6a8a6a'}}>Completed</span><span style={{color:'#8aaa8a',fontSize:11}}>{h.last_generation.completed_ago}</span></div>
              <div className="adm-api-row"><span style={{color:'#6a8a6a'}}>Word count</span><span style={{color:'#8aaa8a',fontSize:11}}>{h.last_generation.word_count?.toLocaleString()} words</span></div>
              <div className="adm-api-row"><span style={{color:'#6a8a6a'}}>Grade result</span>
                <span style={{color: h.last_generation.grade_passed ? '#5ab85a' : '#d45a5a', fontSize:11}}>
                  {h.last_generation.grade_passed ? `Passed — ${h.last_generation.overall_score}/100` : `Failed — ${h.last_generation.overall_score}/100`}
                </span>
              </div>
            </>
          ) : <div className="adm-empty">No generations yet.</div>}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// API Usage section
// ---------------------------------------------------------------------------
function SectionUsage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('month');

  useEffect(() => {
    async function load() {
      setLoading(true);
      try { setData(await apiFetch(`/usage?period=${period}`)); }
      catch (e) { console.error(e); }
      setLoading(false);
    }
    load();
  }, [period]);

  if (loading) return <div className="adm-loading">Loading usage data…</div>;
  const u = data || {};
  const apis = u.apis || [];
  const log = u.recent_log || [];

  return (
    <div>
      <div className="adm-sec-head">
        <div>
          <div className="adm-page-title">API Usage</div>
          <div className="adm-page-sub">Token tracking and estimated costs</div>
        </div>
        <div className="adm-btn-row">
          {['today','week','month'].map(p => (
            <button key={p} className={`adm-fpill ${period === p ? 'active' : ''}`} onClick={() => setPeriod(p)}>
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="adm-usage-grid">
        {apis.map(api => (
          <div key={api.name} className={`adm-card ${api.is_total ? 'highlight' : ''}`}>
            <div className="adm-usage-api" style={api.is_total ? {color:'#c8973a'} : {}}>{api.name}</div>
            <div className="adm-usage-cost" style={api.is_total ? {fontSize:28} : {}}>${api.cost?.toFixed(2) ?? '0.00'}</div>
            <div style={{fontSize:10,color:'#3a5a3a',fontFamily:'sans-serif',marginTop:2}}>{period === 'today' ? 'Today' : period === 'week' ? 'This week' : 'This month'}</div>
            {api.details?.map((d, i) => (
              <div key={i} className="adm-usage-detail">
                <span className="adm-usage-dl">{d.label}</span>
                <span className="adm-usage-dv">{d.value}</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="adm-card">
        <div className="adm-card-title">Per-Request Log</div>
        <table className="adm-log-table">
          <thead>
            <tr>
              <th>Time</th><th>Article</th><th>API</th><th>In Tokens</th><th>Out Tokens</th><th>Cost</th>
            </tr>
          </thead>
          <tbody>
            {log.length === 0 && (
              <tr><td colSpan={6} style={{color:'#3a5a3a',padding:'12px 0'}}>No usage logged yet.</td></tr>
            )}
            {log.map((row, i) => (
              <tr key={i}>
                <td style={{color:'#5a7a5a'}}>{row.time}</td>
                <td style={{color:'#c8c8b8'}}>{row.article}</td>
                <td style={{color:'#5a7a5a'}}>{row.api}</td>
                <td style={{color:'#8aaa8a'}}>{row.input_tokens ? row.input_tokens.toLocaleString() : '—'}</td>
                <td style={{color:'#8aaa8a'}}>{row.output_tokens ? row.output_tokens.toLocaleString() : '—'}</td>
                <td style={{color:'#c8973a'}}>${row.cost?.toFixed(4) ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Authors section
// ---------------------------------------------------------------------------
function SectionAuthors() {
  const [authors, setAuthors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState({});
  const [editName, setEditName] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try { const d = await apiFetch('/authors'); setAuthors(d.authors || []); }
    catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function saveName(slug) {
    try {
      await apiFetch(`/authors/${slug}`, {
        method: 'PUT',
        body: JSON.stringify({ name: editName[slug] }),
      });
      setEditing(e => ({ ...e, [slug]: false }));
      await load();
    } catch (err) { console.error(err); }
  }

  async function toggleActive(slug, currentlyActive) {
    try {
      await apiFetch(`/authors/${slug}/toggle`, {
        method: 'POST',
        body: JSON.stringify({ is_active: !currentlyActive }),
      });
      await load();
    } catch (err) { console.error(err); }
  }

  if (loading) return <div className="adm-loading">Loading authors…</div>;

  return (
    <div>
      <div className="adm-sec-head">
        <div>
          <div className="adm-page-title">Authors</div>
          <div className="adm-page-sub">Manage author profiles and status</div>
        </div>
        <button className="adm-btn green" onClick={() => window.open('/admin/authors/new', '_self')}>+ Add Author</button>
      </div>

      <div className="adm-author-grid">
        {authors.map(a => (
          <div key={a.slug} className="adm-card">
            {editing[a.slug] ? (
              <div style={{marginBottom:8}}>
                <input
                  className="adm-input"
                  value={editName[a.slug] ?? a.name}
                  onChange={e => setEditName(n => ({ ...n, [a.slug]: e.target.value }))}
                  style={{width:'100%',marginBottom:8}}
                />
                <div className="adm-btn-row">
                  <button className="adm-btn green" onClick={() => saveName(a.slug)}>Save</button>
                  <button className="adm-btn red" onClick={() => setEditing(e => ({ ...e, [a.slug]: false }))}>Cancel</button>
                </div>
              </div>
            ) : (
              <div className="adm-author-name">{a.name}</div>
            )}
            <div className="adm-author-slug">slug: {a.slug} · account: {a.account_id}</div>
            <div className="adm-author-stats">
              <span><span>{a.article_count ?? 0}</span> articles</span>
              <span><span>{a.pass_rate ?? '—'}%</span> pass rate</span>
              <span style={{color: a.is_active ? '#5ab85a' : '#d45a5a'}}>
                {a.is_active ? '● Active' : '● Inactive'}
              </span>
            </div>
            <div className="adm-btn-row">
              {!editing[a.slug] && (
                <button className="adm-btn" onClick={() => {
                  setEditing(e => ({ ...e, [a.slug]: true }));
                  setEditName(n => ({ ...n, [a.slug]: a.name }));
                }}>Edit Name</button>
              )}
              <button
                className={`adm-btn ${a.is_active ? 'red' : 'green'}`}
                onClick={() => toggleActive(a.slug, a.is_active)}
              >
                {a.is_active ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skill Versions section
// ---------------------------------------------------------------------------
function SectionSkill() {
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try { const d = await apiFetch('/skills'); setSkills(d.skills || []); }
      catch (e) { console.error(e); }
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <div className="adm-loading">Loading skill versions…</div>;

  return (
    <div>
      <div className="adm-page-title">Skill Versions</div>
      <div className="adm-page-sub">Writing skill document history — read only</div>

      <div className="adm-card">
        {skills.map(s => (
          <div key={s.id} className="adm-skill-row">
            <div>
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:4}}>
                <span style={{fontSize:14,color: s.active ? '#fff' : '#5a7a5a'}}>Version {s.version}</span>
                {s.active && <span className="adm-pill active-p">Active</span>}
              </div>
              <div style={{fontSize:11,color: s.active ? '#5a7a5a' : '#3a5a3a',fontFamily:'sans-serif'}}>
                {new Date(s.updated_at * 1000).toLocaleDateString('en-US', {year:'numeric',month:'long',day:'numeric'})}
                {s.notes ? ` · ${s.notes}` : ''}
              </div>
            </div>
            <button className="adm-btn" style={s.active ? {} : {opacity:.5}} onClick={() => setViewing(s)}>View</button>
          </div>
        ))}
      </div>

      <div style={{fontFamily:'sans-serif',fontSize:11,color:'#3a5a3a',marginTop:8}}>
        To publish a new version — insert a new row into agent_skills with active = 1 and set previous row to active = 0.
      </div>

      {viewing && (
        <div className="adm-modal-wrap" onClick={() => setViewing(null)}>
          <div className="adm-modal" onClick={e => e.stopPropagation()}>
            <div className="adm-modal-title">Version {viewing.version}</div>
            <textarea
              className="adm-textarea"
              readOnly
              value={viewing.content}
              style={{minHeight:400}}
            />
            <div style={{marginTop:14,display:'flex',justifyContent:'flex-end'}}>
              <button className="adm-btn" onClick={() => setViewing(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Users section
// ---------------------------------------------------------------------------
function SectionUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { const d = await apiFetch('/users'); setUsers(d.users || []); }
    catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggleRole(id, currentRole) {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    if (!window.confirm(`Change this user to ${newRole}?`)) return;
    try {
      await apiFetch(`/users/${id}/role`, { method: 'PUT', body: JSON.stringify({ role: newRole }) });
      await load();
    } catch (e) { console.error(e); }
  }

  if (loading) return <div className="adm-loading">Loading users…</div>;

  return (
    <div>
      <div className="adm-sec-head">
        <div>
          <div className="adm-page-title">Users</div>
          <div className="adm-page-sub">Registered accounts and role management</div>
        </div>
      </div>

      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Name</th><th>Email</th><th>Role</th><th>Account ID</th><th>Joined</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td style={{color:'#fff'}}>{u.name}</td>
                <td style={{color:'#8aaa8a'}}>{u.email}</td>
                <td><span className={`adm-pill ${u.role === 'admin' ? 'admin-p' : 'user-p'}`}>{u.role}</span></td>
                <td style={{color:'#5a7a5a',fontSize:11}}>{u.account_id}</td>
                <td style={{color:'#5a7a5a'}}>{new Date(u.created_at * 1000).toLocaleDateString()}</td>
                <td>
                  <button className="adm-btn" onClick={() => toggleRole(u.id, u.role)}>
                    {u.role === 'admin' ? 'Remove Admin' : 'Make Admin'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main AdminDashboard component
// ---------------------------------------------------------------------------
export default function AdminDashboard() {
  const [section, setSection] = useState('content');
  const [badges, setBadges] = useState({ queue: 0, health: 0 });

  // Poll for badge counts every 60s
  useEffect(() => {
    async function loadBadges() {
      try {
        const d = await apiFetch('/badge-counts');
        setBadges(d);
      } catch (e) {}
    }
    loadBadges();
    const interval = setInterval(loadBadges, 60000);
    return () => clearInterval(interval);
  }, []);

  const navItems = [
    { id: 'content', label: 'Submissions', sec: 'Content' },
    { id: 'queue',   label: 'Queue',       sec: 'Content', badge: badges.queue },
    { id: 'health',  label: 'Health',      sec: 'System',  badge: badges.health },
    { id: 'usage',   label: 'API Usage',   sec: 'System' },
    { id: 'authors', label: 'Authors',     sec: 'Management' },
    { id: 'skill',   label: 'Skill Versions', sec: 'Management' },
    { id: 'users',   label: 'Users',       sec: 'Management' },
  ];

  const sections = ['Content', 'System', 'Management'];

  const renderSection = () => {
    switch (section) {
      case 'content':  return <SectionSubmissions />;
      case 'queue':    return <SectionQueue />;
      case 'health':   return <SectionHealth />;
      case 'usage':    return <SectionUsage />;
      case 'authors':  return <SectionAuthors />;
      case 'skill':    return <SectionSkill />;
      case 'users':    return <SectionUsers />;
      default:         return null;
    }
  };

  return (
    <div className="adm-layout">
      <nav className="adm-sidebar">
        <div className="adm-logo">
          <div className="adm-logo-title">SubMoa</div>
          <div className="adm-logo-sub">Admin Panel</div>
        </div>

        {sections.map(sec => (
          <div key={sec}>
            <div className="adm-nav-sec">{sec}</div>
            {navItems.filter(n => n.sec === sec).map(n => (
              <button
                key={n.id}
                className={`adm-nav-item ${section === n.id ? 'active' : ''}`}
                onClick={() => setSection(n.id)}
              >
                <div className="adm-nav-dot" />
                {n.label}
                {n.badge > 0 && <span className="adm-nav-badge">{n.badge}</span>}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <main className="adm-main">
        {renderSection()}
      </main>
    </div>
  );
}