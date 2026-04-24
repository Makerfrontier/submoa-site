// src/pages/AdminDashboard.jsx
// SubMoa Content — Admin Dashboard
// Route: /admin — protected by role = 'admin'

import { useState, useEffect, useCallback } from 'react';
import AdminTemplates from './AdminTemplates';
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
  if (!res.ok) {
    let msg = `API error: ${res.status}`;
    try { const body = await res.json(); if (body?.error) msg = body.error; } catch {}
    throw new Error(msg);
  }
  return res.json();
}

function formatDate(ts) {
  if (!ts) return '—';
  const ms = ts > 1e10 ? ts : ts * 1000;
  return new Date(ms).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
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
  const [stats, setStats] = useState({});
  const [page, setPage] = useState(1);
  // Two-step delete — tracks which row is currently armed for confirmation.
  const [deleteArmed, setDeleteArmed] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(null);

  async function handleDelete(id) {
    if (deleteArmed !== id) { setDeleteArmed(id); return; }
    setDeleteBusy(id);
    try {
      const res = await fetch(`/api/admin/submissions/${id}`, { method: 'DELETE', credentials: 'include' });
      if (res.ok) {
        setSubmissions(prev => prev.filter(s => s.id !== id));
      } else {
        const d = await res.json().catch(() => ({}));
        alert(d.error || 'Delete failed');
      }
    } catch (e) {
      alert(e.message);
    }
    setDeleteArmed(null);
    setDeleteBusy(null);
  }
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
      </div>

      <label className="adm-upload">
        + Upload article for grading (drag &amp; drop or click)
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
                  <tr><td colSpan={7} style={{ color:'var(--text-light)', textAlign:'center', padding:'20px' }}>No submissions match this filter.</td></tr>
                )}
                {paged.map(sub => (
                  <tr key={sub.id}>
                    <td style={{ color:'var(--text)', maxWidth:200, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }} title={sub.title}>{sub.title}</td>
                    <td style={{ color:'var(--text-mid)' }}>{sub.author_display_name || sub.author}</td>
                    <td style={{ color:'var(--text-light)' }}>{sub.article_format || '—'}</td>
                    <td><StatusPill status={sub.status} gradeStatus={sub.grade_status} /></td>
                    <td><ScoreCell scores={sub.grade} /></td>
                    <td style={{ color:'var(--text-light)' }}>{sub.word_count ? sub.word_count.toLocaleString() : '—'}</td>
                    <td>
                      <div className="adm-btn-row">
                        <button className="adm-btn" onClick={() => window.open(`/content/${sub.id}`, '_blank')}>View</button>
                        <button
                          className={deleteArmed === sub.id ? 'adm-btn red' : 'adm-btn'}
                          disabled={deleteBusy === sub.id}
                          onClick={() => handleDelete(sub.id)}
                          onBlur={() => { if (deleteArmed === sub.id) setDeleteArmed(null); }}
                        >
                          {deleteBusy === sub.id ? '…' : deleteArmed === sub.id ? 'Confirm?' : 'Delete'}
                        </button>
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
  const [audioState, setAudioState] = useState(null); // null | 'running' | {generated,skipped,failed,results}

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

  async function pushAudioNow() {
    setAudioState('running');
    try {
      const res = await apiFetch('/articles/generate-audio', { method: 'POST' });
      setAudioState(res);
    } catch (e) {
      setAudioState({ error: e.message });
    }
  }

  if (loading) return <div className="adm-loading">Loading queue…</div>;
  const q = data || {};

  return (
    <div>
      <div className="adm-page-title">Queue</div>
      <div className="adm-page-sub">Generation jobs — processed in submission order</div>

      {/* Audio push panel */}
      <div className="adm-card" style={{ marginBottom: 20 }}>
        <div className="adm-card-title">Audio Generation</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <button
            className="adm-btn green"
            onClick={pushAudioNow}
            disabled={audioState === 'running'}
            style={{ minWidth: 160 }}
          >
            {audioState === 'running' ? 'Generating…' : 'Push Audio Now'}
          </button>
          {audioState && audioState !== 'running' && (
            audioState.error
              ? <span style={{ fontSize: 12, color: 'var(--error)' }}>{audioState.error}</span>
              : <span style={{ fontSize: 12, color: 'var(--text-light)' }}>
                  {audioState.generated} generated · {audioState.skipped} skipped · {audioState.failed} failed
                  {audioState.results?.map(r => (
                    <span key={r.id} style={{ display: 'block', fontSize: 11, color: r.status === 'generated' ? 'var(--success)' : r.skipped ? 'var(--text-light)' : 'var(--error)', marginTop: 2 }}>
                      {r.topic.slice(0, 50)} — {r.status}
                    </span>
                  ))}
                </span>
          )}
        </div>
      </div>

      <div className="adm-health-big">
        <div className="adm-hb"><div className="adm-hb-num">{q.queued_count ?? 0}</div><div className="adm-hb-label">Queued</div></div>
        <div className="adm-hb"><div className="adm-hb-num" style={{color:'var(--warning)'}}>{q.generating_count ?? 0}</div><div className="adm-hb-label">Generating</div></div>
        <div className="adm-hb"><div className="adm-hb-num" style={{color: q.stuck_count ? 'var(--error)' : 'var(--success)'}}>{q.stuck_count ?? 0}</div><div className="adm-hb-label">Stuck</div></div>
        <div className="adm-hb"><div className="adm-hb-num" style={{color: q.dlq_count ? 'var(--error)' : 'var(--success)'}}>{q.dlq_count ?? 0}</div><div className="adm-hb-label">Dead Letter</div></div>
      </div>

      <div className="adm-card">
        <div className="adm-card-title">Currently Processing</div>
        {q.generating?.length ? q.generating.map(item => (
          <div key={item.id} className="adm-q-item">
            <div className="adm-q-pos" style={{background:'var(--warning-bg)',color:'var(--warning)'}}>▶</div>
            <div style={{flex:1}}>
              <div style={{color:'var(--text)'}}>{item.title}</div>
              <div style={{color:'var(--text-light)',fontSize:11}}>{item.author_display_name} · {item.article_format} · Started {item.started_ago}</div>
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
              <div style={{color:'var(--text)'}}>{item.title}</div>
              <div style={{color:'var(--text-light)',fontSize:11}}>{item.author_display_name} · {item.article_format} · Queued {item.queued_ago}</div>
            </div>
            <button className="adm-btn red" onClick={() => cancel(item.id)}>Cancel</button>
          </div>
        )) : <div className="adm-empty">Queue is empty.</div>}
      </div>

      <div className="adm-card">
        <div className="adm-card-title">Dead Letter Queue — Failed Jobs</div>
        {q.dead_letter?.length ? q.dead_letter.map(item => (
          <div key={item.id} className="adm-q-item">
            <div className="adm-q-pos" style={{background:'var(--error-bg)',color:'var(--error)'}}>✕</div>
            <div style={{flex:1}}>
              <div style={{color:'var(--text)'}}>{item.title}</div>
              <div style={{color:'var(--error)',fontSize:11}}>Failed {item.failed_ago} · {item.error}</div>
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
        <div className="adm-hb"><div className="adm-hb-num" style={{color:'var(--success)'}}>{h.uptime ?? '—'}%</div><div className="adm-hb-label">Uptime 30d</div></div>
        <div className="adm-hb"><div className="adm-hb-num">{h.generated_today ?? 0}</div><div className="adm-hb-label">Generated Today</div></div>
        <div className="adm-hb"><div className="adm-hb-num" style={{color:'var(--success)'}}>{h.pass_rate ?? '—'}%</div><div className="adm-hb-label">Grade Pass Rate</div></div>
        <div className="adm-hb"><div className="adm-hb-num" style={{color: stuck.length ? 'var(--error)' : 'var(--success)'}}>{stuck.length}</div><div className="adm-hb-label">Stuck Jobs</div></div>
      </div>

      <div className="adm-health-grid">
        <div className="adm-card">
          <div className="adm-card-title">External APIs</div>
          {apis.map(api => (
            <div key={api.name} className="adm-api-row">
              <div style={{display:'flex',alignItems:'center'}}>
                <span className={`adm-dot ${api.status === 'ok' ? 'g' : api.status === 'slow' ? 'a' : 'r'}`}></span>
                <span style={{color:'var(--text-mid)'}}>{api.name}</span>
              </div>
              <span style={{color: api.status === 'ok' ? 'var(--text-light)' : api.status === 'slow' ? 'var(--warning)' : 'var(--error)', fontSize:11}}>
                {api.latency ? `${api.latency}ms avg` : api.note || api.status}
              </span>
            </div>
          ))}
        </div>

        <div className="adm-card">
          <div className="adm-card-title">Cron Worker</div>
          <div className="adm-api-row"><span style={{color:'var(--text-light)'}}>Last fired</span><span style={{color:'var(--text-mid)',fontSize:11}}>{h.cron_last_fired || '—'}</span></div>
          <div className="adm-api-row"><span style={{color:'var(--text-light)'}}>Next scheduled</span><span style={{color:'var(--text-mid)',fontSize:11}}>{h.cron_next || '—'}</span></div>
          <div className="adm-api-row"><span style={{color:'var(--text-light)'}}>Last grading run</span><span style={{color:'var(--text-mid)',fontSize:11}}>{h.last_grading_run || '—'}</span></div>
          <div className="adm-api-row"><span style={{color:'var(--text-light)'}}>DLQ depth</span><span style={{color: h.dlq_depth ? 'var(--error)' : 'var(--success)',fontSize:11}}>{h.dlq_depth ?? 0} jobs</span></div>
        </div>

        <div className="adm-card">
          <div className="adm-card-title">Stuck Submissions</div>
          {stuck.length ? stuck.map(s => (
            <div key={s.id} className="adm-q-item">
              <div style={{flex:1}}>
                <div style={{color:'var(--text)',fontSize:12}}>{s.title}</div>
                <div style={{color:'var(--error)',fontSize:10,marginTop:2}}>{s.status} · {s.stuck_for} · {s.author_display_name}</div>
              </div>
              <button className="adm-btn green" onClick={() => requeue(s.id)}>Requeue</button>
            </div>
          )) : <div className="adm-empty">No stuck submissions.</div>}
        </div>

        <div className="adm-card">
          <div className="adm-card-title">Last Generation</div>
          {h.last_generation ? (
            <>
              <div className="adm-api-row"><span style={{color:'var(--text-light)'}}>Article</span><span style={{color:'var(--text-mid)',fontSize:11}}>{h.last_generation.title}</span></div>
              <div className="adm-api-row"><span style={{color:'var(--text-light)'}}>Completed</span><span style={{color:'var(--text-mid)',fontSize:11}}>{h.last_generation.completed_ago}</span></div>
              <div className="adm-api-row"><span style={{color:'var(--text-light)'}}>Word count</span><span style={{color:'var(--text-mid)',fontSize:11}}>{h.last_generation.word_count?.toLocaleString()} words</span></div>
              <div className="adm-api-row"><span style={{color:'var(--text-light)'}}>Grade result</span>
                <span style={{color: h.last_generation.grade_passed ? 'var(--success)' : 'var(--error)', fontSize:11}}>
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
            <div className="adm-usage-api" style={api.is_total ? {color:'var(--amber)'} : {}}>{api.name}</div>
            <div className="adm-usage-cost" style={api.is_total ? {fontSize:28} : {}}>${api.cost?.toFixed(2) ?? '0.00'}</div>
            <div style={{fontSize:10,color:'var(--text-light)',fontFamily:'sans-serif',marginTop:2}}>{period === 'today' ? 'Today' : period === 'week' ? 'This week' : 'This month'}</div>
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
              <tr><td colSpan={6} style={{color:'var(--text-light)',padding:'12px 0'}}>No usage logged yet.</td></tr>
            )}
            {log.map((row, i) => (
              <tr key={i}>
                <td style={{color:'var(--text-light)'}}>{row.time}</td>
                <td style={{color:'var(--text)'}}>{row.article}</td>
                <td style={{color:'var(--text-light)'}}>{row.api}</td>
                <td style={{color:'var(--text-mid)'}}>{row.input_tokens ? row.input_tokens.toLocaleString() : '—'}</td>
                <td style={{color:'var(--text-mid)'}}>{row.output_tokens ? row.output_tokens.toLocaleString() : '—'}</td>
                <td style={{color:'var(--amber)'}}>${row.cost?.toFixed(4) ?? '—'}</td>
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
  const [editingStyle, setEditingStyle] = useState({});
  const [styleText, setStyleText] = useState({});
  const [ingestMode, setIngestMode] = useState(null); // null | 'rss' | 'docx' | 'generate'
  const [rssUrl, setRssUrl] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [ingesting, setIngesting] = useState(false);
  const [ingestPreview, setIngestPreview] = useState(null);
  const [ingestError, setIngestError] = useState('');
  const [docxFile, setDocxFile] = useState(null);
  const [savingAuthor, setSavingAuthor] = useState(false);
  // Prompt-driven generation state
  const [genDescription, setGenDescription] = useState('');
  const [genVariations, setGenVariations] = useState(false);
  const [genProfiles, setGenProfiles] = useState(null); // array of profile drafts
  const [genEditing, setGenEditing] = useState({}); // idx → {name, bio, voice_guide}

  const load = useCallback(async () => {
    setLoading(true);
    try { const d = await apiFetch('/authors'); setAuthors(d.authors || []); }
    catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  async function handleRssIngest() {
    if (!rssUrl) return;
    setIngesting(true); setIngestError(''); setIngestPreview(null);
    try {
      const d = await apiFetch('/authors/ingest', { method: 'POST', body: JSON.stringify({ rss_url: rssUrl, name: authorName }) });
      if (d.error) { setIngestError(d.error); } else { setIngestPreview(d); }
    } catch (e) { setIngestError(e.message); }
    setIngesting(false);
  }

  async function handleDocxIngest() {
    if (!docxFile) return;
    setIngesting(true); setIngestError(''); setIngestPreview(null);
    try {
      const formData = new FormData();
      formData.append('document', docxFile);
      if (authorName) formData.append('name', authorName);
      const res = await fetch('/api/admin/authors/ingest', { method: 'POST', credentials: 'include', body: formData });
      const d = await res.json();
      if (d.error) { setIngestError(d.error); } else { setIngestPreview(d); }
    } catch (e) { setIngestError(e.message); }
    setIngesting(false);
  }

  async function saveIngestedAuthor() {
    if (!ingestPreview) return;
    setSavingAuthor(true);
    try {
      const d = await apiFetch('/authors/save', { method: 'POST', body: JSON.stringify(ingestPreview) });
      if (d.success || d.ok) {
        setIngestPreview(null); setIngestMode(null); setRssUrl(''); setAuthorName(''); setDocxFile(null);
        await load();
      } else { setIngestError(d.error || 'Failed to save'); }
    } catch (e) { setIngestError(e.message); }
    setSavingAuthor(false);
  }

  async function handleGenerate() {
    if (!genDescription.trim()) return;
    setIngesting(true); setIngestError(''); setGenProfiles(null); setGenEditing({});
    try {
      const d = await apiFetch('/authors/generate', {
        method: 'POST',
        body: JSON.stringify({ description: genDescription, variations: genVariations }),
      });
      if (d.error) { setIngestError(d.error); }
      else if (genVariations && Array.isArray(d.profiles)) {
        setGenProfiles(d.profiles);
        const e = {}; d.profiles.forEach((p, i) => { e[i] = { ...p }; });
        setGenEditing(e);
      } else if (!genVariations && d.profile) {
        setGenProfiles([d.profile]);
        setGenEditing({ 0: { ...d.profile } });
      } else {
        setIngestError('Unexpected response');
      }
    } catch (e) { setIngestError(e.message); }
    setIngesting(false);
  }

  async function saveGeneratedProfile(idx) {
    const profile = genEditing[idx];
    if (!profile || !profile.name) { setIngestError('Name is required'); return; }
    if (!profile.voice_guide || !profile.voice_guide.trim()) {
      setIngestError('Voice guide is required');
      return;
    }
    setSavingAuthor(true); setIngestError('');
    try {
      // /api/admin/authors/save requires slug + name + style_guide. Derive
      // slug from name (URL-safe, lowercased, whitespace → dash, punctuation stripped).
      const slug = profile.name
        .toLowerCase()
        .trim()
        .replace(/['"]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      if (!slug) {
        setIngestError('Could not derive a slug from the name');
        setSavingAuthor(false);
        return;
      }
      const payload = {
        slug,
        name: profile.name,
        style_guide: profile.voice_guide,
        description: profile.bio || '',
        keyword_themes: Array.isArray(profile.tone_tags) ? profile.tone_tags : [],
        semantic_entities: [],
        source_type: 'generated',
        scope: 'user',
      };
      const d = await apiFetch('/authors/save', { method: 'POST', body: JSON.stringify(payload) });
      if (d.success || d.ok) {
        setGenProfiles(prev => prev.filter((_, i) => i !== idx));
        setGenEditing(prev => {
          const next = { ...prev };
          delete next[idx];
          return next;
        });
        await load();
      } else {
        setIngestError(d.error || 'Failed to save');
        console.error('[authors/save] failed:', d);
      }
    } catch (e) {
      setIngestError(e.message);
      console.error('[authors/save] error:', e);
    }
    setSavingAuthor(false);
  }

  useEffect(() => { load(); }, [load]);

  async function saveName(slug) {
    try {
      await apiFetch(`/authors/${slug}`, {
        method: 'PUT',
        body: JSON.stringify({ name: editName[slug], style_guide: authors.find(a => a.slug === slug)?.style_guide }),
      });
      setEditing(e => ({ ...e, [slug]: false }));
      await load();
    } catch (err) { console.error(err); }
  }

  async function saveStyleGuide(slug) {
    try {
      await apiFetch(`/authors/${slug}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: authors.find(a => a.slug === slug)?.name,
          style_guide: styleText[slug],
        }),
      });
      setEditingStyle(s => ({ ...s, [slug]: false }));
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
      </div>

      {/* Ingest block */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 10, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '.08em', fontFamily: 'sans-serif', marginBottom: 12 }}>
          Ingest Author Voice
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="adm-btn" style={{ flex: 1, padding: '10px 0', fontSize: 12 }} onClick={() => setIngestMode(ingestMode === 'rss' ? null : 'rss')}>
            Ingest via RSS
          </button>
          <button className="adm-btn" style={{ flex: 1, padding: '10px 0', fontSize: 12 }} onClick={() => setIngestMode(ingestMode === 'docx' ? null : 'docx')}>
            Ingest via DOCX
          </button>
          <button className="adm-btn" style={{ flex: 1, padding: '10px 0', fontSize: 12 }} onClick={() => setIngestMode(ingestMode === 'generate' ? null : 'generate')}>
            Generate
          </button>
        </div>

        {ingestMode && (
          <div style={{ marginTop: 12, background: 'var(--surface-inp)', border: '0.5px solid var(--border)', borderRadius: 6, padding: 16 }}>
            {ingestMode === 'rss' && (
              <>
                <input className="adm-input" placeholder="RSS feed URL" value={rssUrl} onChange={e => setRssUrl(e.target.value)} style={{ width: '100%', marginBottom: 8 }} />
                <input className="adm-input" placeholder="Author display name" value={authorName} onChange={e => setAuthorName(e.target.value)} style={{ width: '100%', marginBottom: 8 }} />
                <button className="adm-btn solid" onClick={handleRssIngest} disabled={ingesting || !rssUrl} style={{ width: '100%' }}>
                  {ingesting ? 'Analyzing feed...' : 'Analyze RSS Feed'}
                </button>
              </>
            )}
            {ingestMode === 'docx' && (
              <>
                <input type="file" accept=".docx" onChange={e => setDocxFile(e.target.files?.[0] || null)} style={{ marginBottom: 8, color: 'var(--text-mid)', fontFamily: 'sans-serif', fontSize: 12 }} />
                <input className="adm-input" placeholder="Author display name" value={authorName} onChange={e => setAuthorName(e.target.value)} style={{ width: '100%', marginBottom: 8 }} />
                <button className="adm-btn solid" onClick={handleDocxIngest} disabled={ingesting || !docxFile} style={{ width: '100%' }}>
                  {ingesting ? 'Analyzing document...' : 'Analyze DOCX'}
                </button>
              </>
            )}
            {ingestMode === 'generate' && (
              <>
                <textarea
                  className="adm-textarea"
                  placeholder="Describe the author you need. Example: A casual C-suite executive who works in the firearms industry and speaks plainly without jargon."
                  value={genDescription}
                  onChange={e => setGenDescription(e.target.value)}
                  style={{ width: '100%', minHeight: 100, marginBottom: 8 }}
                />
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-mid)', fontFamily: 'sans-serif', marginBottom: 10 }}>
                  <input type="checkbox" checked={genVariations} onChange={e => setGenVariations(e.target.checked)} />
                  Give me 3 variations
                </label>
                <button className="adm-btn solid" onClick={handleGenerate} disabled={ingesting || !genDescription.trim()} style={{ width: '100%' }}>
                  {ingesting ? 'Generating…' : 'Generate Author'}
                </button>
              </>
            )}
            {ingestError && <div style={{ color: 'var(--error)', fontSize: 12, fontFamily: 'sans-serif', marginTop: 8 }}>{ingestError}</div>}
          </div>
        )}

        {genProfiles && genProfiles.length > 0 && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {genProfiles.map((p, i) => {
              const draft = genEditing[i] || p;
              const set = (k, v) => setGenEditing(prev => ({ ...prev, [i]: { ...(prev[i] || p), [k]: v } }));
              return (
                <div key={i} className="adm-card">
                  <div style={{ color: 'var(--amber)', fontSize: 11, fontFamily: 'sans-serif', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                    Generated Profile {genProfiles.length > 1 ? `${i + 1}` : ''}
                  </div>
                  <input className="adm-input" value={draft.name || ''} onChange={e => set('name', e.target.value)} placeholder="Name" style={{ width: '100%', marginBottom: 8 }} />
                  <textarea className="adm-textarea" value={draft.bio || ''} onChange={e => set('bio', e.target.value)} placeholder="Bio" style={{ width: '100%', minHeight: 60, marginBottom: 8 }} />
                  <textarea className="adm-textarea" value={draft.voice_guide || ''} onChange={e => set('voice_guide', e.target.value)} placeholder="Voice guide" style={{ width: '100%', minHeight: 140, marginBottom: 8 }} />
                  {Array.isArray(draft.tone_tags) && draft.tone_tags.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                      {draft.tone_tags.map((t, j) => (
                        <span key={j} style={{ fontSize: 10, background: 'var(--amber-light)', color: 'var(--amber-dim)', padding: '2px 8px', borderRadius: 100 }}>{t}</span>
                      ))}
                    </div>
                  )}
                  {Array.isArray(draft.sample_phrases) && draft.sample_phrases.length > 0 && (
                    <div style={{ fontSize: 11, color: 'var(--text-mid)', marginBottom: 10, fontStyle: 'italic' }}>
                      {draft.sample_phrases.slice(0, 3).map((s, j) => (
                        <div key={j}>“{s}”</div>
                      ))}
                    </div>
                  )}
                  <div className="adm-btn-row">
                    <button className="adm-btn green" onClick={() => saveGeneratedProfile(i)} disabled={savingAuthor}>
                      {savingAuthor ? 'Saving...' : 'Activate Author'}
                    </button>
                    <button className="adm-btn red" onClick={() => {
                      setGenProfiles(prev => prev.filter((_, idx) => idx !== i));
                      setGenEditing(prev => { const n = { ...prev }; delete n[i]; return n; });
                    }}>Reject</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {ingestPreview && (
          <div className="adm-card" style={{ marginTop: 12 }}>
            <div style={{ color: 'var(--amber)', fontSize: 12, fontFamily: 'sans-serif', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.06em' }}>Author Preview</div>
            <div style={{ color: 'var(--text)', fontSize: 14, fontFamily: 'sans-serif', marginBottom: 4 }}>{ingestPreview.name}</div>
            {ingestPreview.slug && <div style={{ color: 'var(--text-light)', fontSize: 11, fontFamily: 'monospace', marginBottom: 8 }}>slug: {ingestPreview.slug}</div>}
            {ingestPreview.style_guide && (
              <pre style={{ fontFamily: 'sans-serif', fontSize: 11, color: 'var(--text-light)', lineHeight: 1.6, whiteSpace: 'pre-wrap', background: 'var(--surface-inp)', border: '0.5px solid var(--border-light)', borderRadius: 4, padding: '8px 10px', marginBottom: 8, maxHeight: 120, overflow: 'auto' }}>
                {ingestPreview.style_guide.slice(0, 400)}
              </pre>
            )}
            <div className="adm-btn-row" style={{ marginTop: 12 }}>
              <button className="adm-btn green" onClick={saveIngestedAuthor} disabled={savingAuthor}>{savingAuthor ? 'Saving...' : 'Activate Author'}</button>
              <button className="adm-btn red" onClick={() => setIngestPreview(null)}>Reject</button>
            </div>
          </div>
        )}
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
              <span style={{color: a.is_active ? 'var(--success)' : 'var(--error)'}}>
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

            {/* Style guide editor */}
            <div style={{ marginTop: 12, borderTop: '0.5px solid var(--border-light)', paddingTop: 12 }}>
              <div style={{ fontSize: 10, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '.06em', fontFamily: 'sans-serif', marginBottom: 8 }}>
                Voice Guide
              </div>
              {editingStyle[a.slug] ? (
                <>
                  <textarea
                    className="adm-textarea"
                    value={styleText[a.slug] ?? a.style_guide ?? ''}
                    onChange={e => setStyleText(s => ({ ...s, [a.slug]: e.target.value }))}
                    style={{ width: '100%', minHeight: 120, marginBottom: 8 }}
                  />
                  <div className="adm-btn-row">
                    <button className="adm-btn green" onClick={() => saveStyleGuide(a.slug)}>Save</button>
                    <button className="adm-btn red" onClick={() => setEditingStyle(s => ({ ...s, [a.slug]: false }))}>Cancel</button>
                  </div>
                </>
              ) : (
                <>
                  <pre style={{
                    fontFamily: 'sans-serif',
                    fontSize: 11,
                    color: 'var(--text-light)',
                    lineHeight: 1.6,
                    whiteSpace: 'pre-wrap',
                    background: 'var(--surface-inp)',
                    border: '0.5px solid var(--border-light)',
                    borderRadius: 4,
                    padding: '8px 10px',
                    marginBottom: 8,
                    maxHeight: 100,
                    overflow: 'auto',
                  }}>
                    {a.style_guide || 'No voice guide set'}
                  </pre>
                  <button className="adm-btn" onClick={() => {
                    setEditingStyle(s => ({ ...s, [a.slug]: true }));
                    setStyleText(s => ({ ...s, [a.slug]: a.style_guide ?? '' }));
                  }}>
                    Edit Voice Guide
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skill Versions section — living inventory of every skill / tool / feature in
// the system, plus a static per-skill changelog. Add an entry here as part of
// every deployment. This is a component constant, not a DB table.
// ---------------------------------------------------------------------------
const SKILLS_INVENTORY = [
  {
    id: 'comp-studio',
    label: 'Comp Studio v2',
    summary: 'Two-column accordion editor for HTML comps. Block detection, master prompt, locks, draft save, full copy replacement, ad unit sweep, AI image generation for photo blocks.',
    status: 'active',
    changelog: [
      { version: '2.0.0', date: '2026-04-18', added: ['Two-column accordion layout', 'Master prompt flow with lock system', 'Full-draft copy replacement with mapping preview', 'AI image generation for photo blocks (not just ads)', 'Click-to-edit from canvas with connector', 'Human-readable block names', 'Ad unit sweep covering aside/sidebar/position:sticky', 'DB write confirmation on mount + first save'], removed: ['Right-rail tab layout', 'Raw tag-name block labels', '"CTA a" classification for card-grid anchors'] },
      { version: '1.1.0', date: '2026-04-15', added: ['Draft auto-save every 3 minutes', 'Zoom override', '/comp-studio?draft=… load handler'], removed: [] },
      { version: '1.0.0', date: '2026-04-10', added: ['Initial Comp Studio release', 'stripAndClean pipeline', 'AI ad creative generation', 'JPG export via Browser Rendering'], removed: [] },
    ],
  },
  {
    id: 'presentation-builder',
    label: 'Presentation Builder',
    summary: 'PPTX deck authoring. Template library, author style selector, audience + purpose fields, AI optimization pass before build.',
    status: 'active',
    changelog: [
      { version: '1.2.0', date: '2026-04-18', added: ['Audience field', 'Purpose field', 'AI optimization pass before deck build'], removed: [] },
      { version: '1.0.0', date: '2026-04-05', added: ['Template library', 'Author style selector', 'PPTX export pipeline'], removed: [] },
    ],
  },
  {
    id: 'email-builder',
    label: 'Email Builder',
    summary: 'Template library + OpenRouter optimization suite. Alt-text enforcement, email-client hardening, clean HTML export.',
    status: 'active',
    changelog: [
      { version: '1.1.0', date: '2026-04-18', added: ['OpenRouter optimization suite', 'Alt-text enforcement', 'Email-client hardening'], removed: [] },
      { version: '1.0.0', date: '2026-04-02', added: ['Initial release', 'Template library', 'Clean HTML export'], removed: [] },
    ],
  },
  {
    id: 'infographic-brief',
    label: 'Infographic Brief',
    summary: 'Research-first flow. 3-source minimum, full citations in output, DataforSEO SEO pass.',
    status: 'active',
    changelog: [
      { version: '2.0.0', date: '2026-04-18', added: ['Research-first intent field', 'Find Data → OpenRouter research with web search', '3-source minimum gate', 'User-supplied source input', 'Broaden Topic rerun', 'Full citations in pipeline'], removed: ['One-step form flow', 'Theory-only brief'] },
      { version: '1.0.0', date: '2026-04-01', added: ['Initial release with style template picker'], removed: [] },
    ],
  },
  {
    id: 'prompt-builder',
    label: 'Prompt Builder',
    summary: 'Model-first prompt engineering assistant. Output syntax adapts per target model.',
    status: 'active',
    changelog: [
      { version: '2.0.0', date: '2026-04-18', added: ['Model selector as first step (Claude, GPT-4o, Gemini, Llama, Mistral, Other)', 'Model-specific structural guidance', 'Format note explaining structural choices'], removed: ['SubMoa option (handled by backend wrappers, not user-facing)'] },
      { version: '1.0.0', date: '2026-03-28', added: ['Initial chat-driven prompt engineer'], removed: [] },
    ],
  },
  {
    id: 'author-admin',
    label: 'Author Admin',
    summary: 'Prompt-driven author generation alongside existing RSS and DOCX ingest paths.',
    status: 'active',
    changelog: [
      { version: '1.2.0', date: '2026-04-18', added: ['Generate tab with freeform description textarea', '3-variation mode', 'Inline review / edit of generated profiles'], removed: [] },
      { version: '1.1.0', date: '2026-04-10', added: ['DOCX ingest path'], removed: [] },
      { version: '1.0.0', date: '2026-03-20', added: ['RSS ingest path'], removed: [] },
    ],
  },
  {
    id: 'html-templates-admin',
    label: 'HTML Templates Admin',
    summary: 'Editable HTML templates in R2. Dropdown selector + chat interface with picker mode.',
    status: 'active',
    changelog: [
      { version: '1.2.0', date: '2026-04-18', added: ['Dropdown template selector (primary load path)', 'Chat panel with Claude Sonnet 4.5', 'Element picker mode (selector + computed styles)', '7 full-page seed templates'], removed: [] },
      { version: '1.0.0', date: '2026-04-12', added: ['Initial release'], removed: [] },
    ],
  },
  {
    id: 'card-config',
    label: 'Card Config System',
    summary: 'Unified dashboard card actions. Condition-based rendering — dead links are impossible.',
    status: 'active',
    changelog: [
      { version: '1.0.0', date: '2026-04-18', added: ['CARD_CONFIG with per-type actions', 'evalCondition helper supporting field/==/!=/AND/OR/NOT', 'CardActions component', 'Itinerary delete + request edits', 'card_config DB table seed'], removed: [] },
    ],
  },
  {
    id: 'planner',
    label: 'Planner',
    summary: 'Async queue-backed itinerary generator with building page + 3-step tracker.',
    status: 'active',
    changelog: [
      { version: '1.1.0', date: '2026-04-14', added: ['Async queue generation', '/planner/building/:id progress page', 'Retry endpoint', 'Itinerary delete endpoint'], removed: [] },
      { version: '1.0.0', date: '2026-03-25', added: ['Initial release', 'PDF export'], removed: [] },
    ],
  },
  {
    id: 'article-flagging',
    label: 'Article Flagging',
    summary: 'Selection-based flag UI. Fact-check, revision, review page workflow.',
    status: 'active',
    changelog: [
      { version: '1.0.0', date: '2026-04-08', added: ['Initial release', 'Fact-check endpoint', 'Review page'], removed: [] },
    ],
  },
  {
    id: 'featured-image',
    label: 'Featured Image',
    summary: 'AI-generated 16:9 hero image via OpenRouter gemini-2.5-flash-image. Freeform direction field.',
    status: 'active',
    changelog: [
      { version: '2.0.0', date: '2026-04-18', added: ['Single freeform "Image direction" textarea', 'image_prompt_direction column'], removed: ['Mood/Perspective/Setting/Style/Color Palette dropdowns (5 columns deprecated)'] },
      { version: '1.0.0', date: '2026-04-06', added: ['Initial release', 'OpenRouter + R2 pipeline'], removed: [] },
    ],
  },
  {
    id: 'tts-voice',
    label: 'TTS Voice Selection',
    summary: '6 OpenAI voices. Dropdown appears only when Generate Audio is checked.',
    status: 'active',
    changelog: [
      { version: '1.0.0', date: '2026-04-18', added: ['tts_voice_id column (default onyx)', '6 voices: alloy/echo/fable/nova/onyx/shimmer', 'Conditional dropdown'], removed: [] },
    ],
  },
  {
    id: 'audio-on-demand',
    label: 'On-Demand Audio Request',
    summary: 'User-triggered audio generation directly from dashboard cards.',
    status: 'active',
    changelog: [
      { version: '1.0.0', date: '2026-04-16', added: ['/api/submissions/:id/request-audio', 'Generate Audio button on dashboard'], removed: [] },
    ],
  },
  {
    id: 'downloads',
    label: 'Direct Downloads',
    summary: 'Per-asset download endpoints: DOCX, MP3, infographic, featured image, planner PDF.',
    status: 'active',
    changelog: [
      { version: '1.0.0', date: '2026-04-11', added: ['DOCX', 'MP3', 'Infographic', 'Featured image', 'Planner PDF'], removed: [] },
    ],
  },
  {
    id: 'share-links',
    label: 'Public Share Links',
    summary: 'No-auth public article links with 7-day expiry. Generate / copy / revoke.',
    status: 'active',
    changelog: [
      { version: '1.0.0', date: '2026-04-09', added: ['7-day token', 'Share panel on dashboard'], removed: [] },
    ],
  },
  {
    id: 'image-seo',
    label: 'Image SEO Pipeline',
    summary: 'Auto SEO companion doc per submission. Rename, optimize, alt text, captions.',
    status: 'ready-to-deploy',
    changelog: [
      { version: '1.0.0', date: '2026-04-17', added: ['Ready to deploy'], removed: [] },
    ],
  },
  {
    id: 'youtube-transcript',
    label: 'YouTube Transcript Page',
    summary: '/youtube-transcript — paste a URL, get raw transcript, AI summary, and optional blog draft.',
    status: 'planned',
    changelog: [
      { version: '1.0.0', date: '2026-04-18', added: ['Planned this deployment'], removed: [] },
    ],
  },
];

function SectionSkill() {
  const [expanded, setExpanded] = useState({}); // { [id]: bool }
  const toggle = (id) => setExpanded(p => ({ ...p, [id]: !p[id] }));

  return (
    <div>
      <div className="adm-page-title">Skill Versions</div>
      <div className="adm-page-sub">Living inventory of every skill, tool, and feature. <strong style={{ color: 'var(--amber)' }}>Update this changelog as part of every deployment. Each feature change gets a version entry.</strong></div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
        {SKILLS_INVENTORY.map(sk => {
          const isOpen = !!expanded[sk.id];
          const latest = sk.changelog?.[0];
          return (
            <div key={sk.id} className="adm-card" style={{ padding: 12 }}>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
                onClick={() => toggle(sk.id)}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{sk.label}</span>
                    {latest && (
                      <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', background: 'var(--amber-light)', color: 'var(--amber-dim)', padding: '1px 6px', borderRadius: 100 }}>
                        v{latest.version}
                      </span>
                    )}
                    <span style={{
                      fontSize: 10, padding: '1px 6px', borderRadius: 100,
                      background: sk.status === 'active' ? 'var(--success-bg)' : sk.status === 'ready-to-deploy' ? 'var(--amber-light)' : 'var(--border)',
                      color: sk.status === 'active' ? 'var(--success)' : sk.status === 'ready-to-deploy' ? 'var(--amber-dim)' : 'var(--text-mid)',
                      textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600,
                    }}>{sk.status}</span>
                    {latest && (
                      <span style={{ fontSize: 10, color: 'var(--text-light)', fontFamily: 'sans-serif' }}>
                        {latest.date}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-mid)', lineHeight: 1.5 }}>{sk.summary}</div>
                </div>
                <span style={{ color: 'var(--text-light)', fontSize: 12, flexShrink: 0 }}>{isOpen ? '▲' : '▼'}</span>
              </div>

              {isOpen && Array.isArray(sk.changelog) && sk.changelog.length > 0 && (
                <div style={{ marginTop: 12, borderTop: '1px solid var(--border-light)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {sk.changelog.map((entry, i) => (
                    <div key={i} style={{ paddingLeft: 8, borderLeft: '2px solid var(--amber-border)' }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
                        v{entry.version} <span style={{ color: 'var(--text-light)', fontWeight: 400 }}>· {entry.date}</span>
                      </div>
                      {Array.isArray(entry.added) && entry.added.length > 0 && (
                        <div style={{ marginTop: 4 }}>
                          <div style={{ fontSize: 10, color: 'var(--success)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600, marginBottom: 2 }}>Added</div>
                          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--text-mid)', lineHeight: 1.6 }}>
                            {entry.added.map((a, j) => <li key={j}>{a}</li>)}
                          </ul>
                        </div>
                      )}
                      {Array.isArray(entry.removed) && entry.removed.length > 0 && (
                        <div style={{ marginTop: 4 }}>
                          <div style={{ fontSize: 10, color: 'var(--error)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600, marginBottom: 2 }}>Removed / Replaced</div>
                          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--text-mid)', lineHeight: 1.6 }}>
                            {entry.removed.map((a, j) => <li key={j}>{a}</li>)}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Danger Zone (super_admin only) — master delete by type + single delete by ID
// ---------------------------------------------------------------------------
const DANGER_TYPES = [
  { id: 'submissions',        label: 'Submissions' },
  { id: 'itineraries',        label: 'Itineraries' },
  { id: 'comp_drafts',        label: 'Comp Drafts' },
  { id: 'legislation',        label: 'Legislation' },
  { id: 'legislative_briefs', label: 'Legislative Briefs' },
  { id: 'html_templates',     label: 'HTML Templates' },
];

function SectionDangerZone() {
  const [counts, setCounts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null); // id of type currently deleting
  const [armed, setArmed] = useState(null); // {type, count} — first click armed delete
  const [toast, setToast] = useState('');
  const [singleType, setSingleType] = useState('submissions');
  const [singleId, setSingleId] = useState('');
  const [singleBusy, setSingleBusy] = useState(false);

  const loadCounts = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const d = await apiFetch('/danger/counts');
      setCounts(d.counts || {});
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { loadCounts(); }, [loadCounts]);

  async function deleteAll(type, count) {
    setBusy(type); setError('');
    try {
      const d = await apiFetch('/danger/delete-all', {
        method: 'POST',
        body: JSON.stringify({ content_type: type }),
      });
      setToast(`Deleted ${d.deleted ?? count} rows from ${type}.`);
      setTimeout(() => setToast(''), 4000);
      setArmed(null);
      await loadCounts();
    } catch (e) { setError(e.message); }
    setBusy(null);
  }

  async function deleteSingle() {
    if (!singleId.trim()) return;
    setSingleBusy(true); setError('');
    try {
      const d = await apiFetch('/danger/delete-item', {
        method: 'POST',
        body: JSON.stringify({ content_type: singleType, id: singleId.trim() }),
      });
      if (d.success) {
        setToast(`Deleted ${singleType} ${singleId}.`);
        setSingleId('');
        setTimeout(() => setToast(''), 4000);
        await loadCounts();
      } else {
        setError(d.error || 'Delete failed');
      }
    } catch (e) { setError(e.message); }
    setSingleBusy(false);
  }

  return (
    <div>
      <div className="adm-page-title" style={{ color: 'var(--error)' }}>⚠ Danger Zone</div>
      <div className="adm-page-sub">
        Super-admin only. Operations here are destructive and cannot be undone. Every delete is logged to <code>legislative_audit_log</code>.
      </div>

      {error && <div style={{ color: 'var(--error)', fontSize: 12, marginTop: 10, fontFamily: 'sans-serif' }}>{error}</div>}
      {toast && <div style={{ color: 'var(--success)', fontSize: 12, marginTop: 10, fontFamily: 'sans-serif' }}>{toast}</div>}

      {/* Per-type master delete */}
      <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {DANGER_TYPES.map(t => {
          const count = counts?.[t.id];
          const notTracked = count === -1 || count === undefined;
          const isArmed = armed?.type === t.id;
          const isBusy = busy === t.id;
          return (
            <div key={t.id} className="adm-card" style={{ padding: 14, borderLeft: '3px solid var(--error)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{t.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-light)', fontFamily: 'monospace' }}>
                    {loading ? '…' : notTracked ? 'Not tracked in this deployment' : `${count} row${count === 1 ? '' : 's'}`}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {!notTracked && !isArmed && (
                    <button
                      className="adm-btn red"
                      disabled={count === 0 || isBusy}
                      onClick={() => setArmed({ type: t.id, count })}
                    >
                      Delete All
                    </button>
                  )}
                  {!notTracked && isArmed && (
                    <>
                      <button
                        className="adm-btn red"
                        disabled={isBusy}
                        onClick={() => deleteAll(t.id, count)}
                        style={{ background: 'var(--error)', color: '#fff', borderColor: 'var(--error)', fontWeight: 700 }}
                      >
                        {isBusy ? 'Deleting…' : `Confirm — permanently delete all ${count} ${t.label.toLowerCase()}`}
                      </button>
                      <button className="adm-btn" onClick={() => setArmed(null)} disabled={isBusy}>Cancel</button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Single item delete */}
      <div className="adm-card" style={{ padding: 14, marginTop: 20, borderLeft: '3px solid var(--error)' }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--error)', marginBottom: 10 }}>
          Delete Single Item
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr auto', gap: 8, alignItems: 'center' }}>
          <select className="adm-input" value={singleType} onChange={(e) => setSingleType(e.target.value)}>
            {DANGER_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          <input
            className="adm-input"
            placeholder="Row id"
            value={singleId}
            onChange={(e) => setSingleId(e.target.value)}
            style={{ fontFamily: 'monospace' }}
          />
          <button
            className="adm-btn red"
            disabled={singleBusy || !singleId.trim()}
            onClick={deleteSingle}
          >
            {singleBusy ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Users & Access (super_admin only) — user list + access matrix
// ---------------------------------------------------------------------------
function SectionAccess() {
  const [tab, setTab] = useState('users'); // 'users' | 'matrix'
  const [data, setData] = useState(null);  // { users, grants, page_keys }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selfId, setSelfId] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const d = await apiFetch('/access/matrix');
      setData(d);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    // Fetch current user so we can guard "cannot demote self"
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => r.json()).then(d => setSelfId(d?.user?.id || '')).catch(() => {});
  }, [load]);

  async function toggleFlag(userId, flag, newValue) {
    try {
      await apiFetch('/access/toggle-flag', {
        method: 'POST',
        body: JSON.stringify({ user_id: userId, flag, value: newValue ? 1 : 0 }),
      });
      await load();
    } catch (e) { setError(e.message); }
  }

  async function grant(userId, pageKey, actionKey) {
    try {
      await apiFetch('/access/grant', { method: 'POST', body: JSON.stringify({ user_id: userId, page_key: pageKey, action_key: actionKey }) });
      await load();
    } catch (e) { setError(e.message); }
  }
  async function revoke(userId, pageKey, actionKey) {
    try {
      await apiFetch('/access/revoke', { method: 'POST', body: JSON.stringify({ user_id: userId, page_key: pageKey, action_key: actionKey }) });
      await load();
    } catch (e) { setError(e.message); }
  }

  if (loading) return <div className="adm-loading">Loading access matrix…</div>;
  if (!data) return <div className="adm-empty">No data.</div>;

  const grantSet = new Set((data.grants || []).map(g => `${g.user_id}|${g.page_key}|${g.action_key}`));

  return (
    <div>
      <div className="adm-page-title">Users & Access</div>
      <div className="adm-page-sub">Super-admin only. Manage per-user flags and page/action grants.</div>

      {error && <div style={{ color: 'var(--error)', fontSize: 12, marginTop: 10 }}>{error}</div>}

      <div className="adm-tabs" style={{ marginTop: 12 }}>
        {[['users', 'Users'], ['matrix', 'Access Matrix']].map(([id, label]) => (
          <button key={id} className={`db-btn ${tab === id ? 'db-btn-accent' : ''}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {tab === 'users' && (
        <div className="adm-table-wrap" style={{ marginTop: 14 }}>
          <table className="adm-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Name</th>
                <th>Role</th>
                <th>Super Admin</th>
                <th>Intel Access</th>
                <th>Admin</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {data.users.map(u => {
                const isSelf = u.id === selfId;
                const isOtherSuper = Number(u.super_admin) === 1 && !isSelf;
                return (
                  <tr key={u.id}>
                    <td style={{ fontSize: 12 }}>{u.email}</td>
                    <td style={{ fontSize: 12 }}>{u.name}</td>
                    <td style={{ fontSize: 11 }}>{u.role}</td>
                    <td>
                      {Number(u.super_admin) === 1 ? (
                        <span style={{ fontSize: 11, background: 'var(--amber)', color: '#fff', padding: '2px 8px', borderRadius: 100 }}>★ Super Admin</span>
                      ) : (
                        <button className="adm-btn" style={{ fontSize: 10, padding: '2px 8px' }}
                          disabled={isOtherSuper}
                          onClick={() => toggleFlag(u.id, 'super_admin', true)}>Make Super</button>
                      )}
                    </td>
                    <td>
                      <button className="adm-btn" style={{ fontSize: 10, padding: '2px 8px' }}
                        disabled={isOtherSuper}
                        onClick={() => toggleFlag(u.id, 'intel_access', Number(u.intel_access) !== 1)}>
                        {Number(u.intel_access) === 1 ? '● Yes' : '○ No'}
                      </button>
                    </td>
                    <td>
                      <button className="adm-btn" style={{ fontSize: 10, padding: '2px 8px' }}
                        disabled={isOtherSuper}
                        onClick={() => toggleFlag(u.id, 'admin', u.role !== 'admin' && u.role !== 'super_admin')}>
                        {u.role === 'admin' || u.role === 'super_admin' ? '● Yes' : '○ No'}
                      </button>
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--text-light)' }}>{formatDate(u.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'matrix' && (
        <div style={{ marginTop: 14, overflowX: 'auto' }}>
          <table className="adm-table" style={{ minWidth: 1200 }}>
            <thead>
              <tr>
                <th style={{ position: 'sticky', left: 0, background: 'var(--card)', zIndex: 1 }}>User</th>
                {Object.entries(data.page_keys).flatMap(([page, actions]) =>
                  page === 'admin-users' ? [] : (actions).map(act => (
                    <th key={`${page}|${act}`} style={{ fontSize: 10, writingMode: 'vertical-rl', transform: 'rotate(180deg)', padding: 6, minWidth: 28 }}>
                      {page}:{act}
                    </th>
                  ))
                )}
              </tr>
            </thead>
            <tbody>
              {data.users.map(u => {
                const isSuper = Number(u.super_admin) === 1;
                return (
                  <tr key={u.id}>
                    <td style={{ fontSize: 11, position: 'sticky', left: 0, background: 'var(--card)', zIndex: 1 }}>
                      {isSuper && '★ '}{u.email}
                    </td>
                    {Object.entries(data.page_keys).flatMap(([page, actions]) =>
                      page === 'admin-users' ? [] : (actions).map(act => {
                        const key = `${u.id}|${page}|${act}`;
                        const granted = isSuper || grantSet.has(key);
                        return (
                          <td key={key} style={{ textAlign: 'center', padding: 4 }}>
                            {isSuper ? (
                              <span style={{ color: 'var(--amber)' }}>★</span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => granted ? revoke(u.id, page, act) : grant(u.id, page, act)}
                                style={{
                                  width: 22, height: 22, borderRadius: 4,
                                  background: granted ? 'var(--success)' : 'transparent',
                                  border: `1px solid ${granted ? 'var(--success)' : 'var(--border)'}`,
                                  color: granted ? '#fff' : 'var(--text-light)',
                                  cursor: 'pointer', fontSize: 12, padding: 0,
                                }}
                              >
                                {granted ? '✓' : ''}
                              </button>
                            )}
                          </td>
                        );
                      })
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Users section
// ---------------------------------------------------------------------------
function SectionUsers({ currentUserRole: roleFromParent }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, me] = await Promise.all([
        apiFetch('/users'),
        fetch('/api/auth/me', { credentials: 'include' }).then(r => r.json()),
      ]);
      setUsers(d.users || []);
      setCurrentUser(me.user || null);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function updateRole(id, newRole) {
    if (!window.confirm(`Change this user to ${newRole}?`)) return;
    try {
      const res = await apiFetch(`/users/${id}/role`, { method: 'PUT', body: JSON.stringify({ role: newRole }) });
      if (res.error) { alert(res.error); return; }
      await load();
    } catch (e) { console.error(e); }
  }

  function handleDeleteUser(id, name) {
    setConfirmModal({
      message: `Delete ${name}? Their content will be reassigned to a deleted user placeholder and never removed.`,
      onConfirm: async () => {
        try {
          await apiFetch(`/users/${id}/delete`, { method: 'DELETE' });
          await load();
        } catch (err) { console.error('Delete user failed:', err); }
      },
    });
  }

  const rolePillClass = (role) => {
    if (role === 'super_admin') return 'super-admin';
    if (role === 'admin') return 'admin-p';
    return 'user-p';
  };

  if (loading) return <div className="adm-loading">Loading users…</div>;

  return (
    <div>
      <div className="adm-sec-head">
        <div>
          <div className="adm-page-title">Users</div>
          <div className="adm-page-sub">Registered accounts and role management</div>
        </div>
      </div>

      {/* Desktop table */}
      <div className="adm-table-wrap adm-desktop-only">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Name</th><th>Email</th><th>Role</th><th>Account ID</th><th>Joined</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td style={{color:'var(--text)'}}>{u.name}</td>
                <td style={{color:'var(--text-mid)'}}>{u.email}</td>
                <td><span className={`adm-pill ${rolePillClass(u.role)}`}>{u.role}</span></td>
                <td style={{color:'var(--text-light)',fontSize:11}}>{u.account_id}</td>
                <td style={{color:'var(--text-light)'}}>{formatDate(u.created_at)}</td>
                <td>
                  {currentUser?.role === 'super_admin' && (
                    <div className="adm-btn-row">
                      {u.role === 'user' && (
                        <button className="adm-btn" onClick={() => updateRole(u.id, 'admin')}>Make Admin</button>
                      )}
                      {u.role === 'admin' && (
                        <>
                          <button className="adm-btn" onClick={() => updateRole(u.id, 'super_admin')}>Make Super Admin</button>
                          <button className="adm-btn red" onClick={() => updateRole(u.id, 'user')}>Remove Admin</button>
                        </>
                      )}
                      {u.role === 'super_admin' && u.id !== currentUser?.id && (
                        <button className="adm-btn red" onClick={() => updateRole(u.id, 'admin')}>Demote</button>
                      )}
                      {u.role !== 'super_admin' && (
                        <button className="adm-btn red" style={{ fontSize: 10 }} onClick={() => handleDeleteUser(u.id, u.name)}>
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="adm-mobile-only">
        {users.map(u => (
          <div key={u.id} className="adm-user-card">
            <div className="adm-user-card-header">
              <div>
                <div className="adm-user-card-name">{u.name}</div>
                <div className="adm-user-card-email">{u.email}</div>
              </div>
              <span className={`adm-pill ${rolePillClass(u.role)}`}>{u.role}</span>
            </div>
            <div className="adm-user-card-meta">
              <span>Joined {formatDate(u.created_at)}</span>
              <span>{u.account_id}</span>
            </div>
            {currentUser?.role === 'super_admin' && (
              <div className="adm-user-card-actions">
                {u.role === 'user' && (
                  <button className="adm-btn" onClick={() => updateRole(u.id, 'admin')}>Make Admin</button>
                )}
                {u.role === 'admin' && (
                  <>
                    <button className="adm-btn" onClick={() => updateRole(u.id, 'super_admin')}>Make Super Admin</button>
                    <button className="adm-btn red" onClick={() => updateRole(u.id, 'user')}>Remove Admin</button>
                  </>
                )}
                {u.role === 'super_admin' && u.id !== currentUser?.id && (
                  <button className="adm-btn red" onClick={() => updateRole(u.id, 'admin')}>Demote</button>
                )}
                {u.role !== 'super_admin' && (
                  <button className="adm-btn red" onClick={() => handleDeleteUser(u.id, u.name)}>Delete</button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Confirm modal */}
      {confirmModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--surface-inp)', border: '0.5px solid var(--amber)', borderRadius: 8, padding: 24, width: 380, fontFamily: 'sans-serif' }}>
            <div style={{ color: 'var(--text)', fontSize: 14, marginBottom: 20, lineHeight: 1.6 }}>{confirmModal.message}</div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="adm-btn" onClick={() => setConfirmModal(null)}>Cancel</button>
              <button className="adm-btn red" onClick={() => { confirmModal.onConfirm(); setConfirmModal(null); }}>Confirm Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Invite Codes section
// ---------------------------------------------------------------------------
function SectionInvites({ currentUserRole }) {
  if (currentUserRole !== 'super_admin') {
    return <div className="adm-empty">Invite code management is restricted to super admins.</div>;
  }
  const [inviteCode, setInviteCode] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState('');

  async function generateInvite() {
    setInviteLoading(true);
    setInviteCode('');
    setInviteError('');
    try {
      const res = await fetch('/api/auth/invite', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ max_uses: 1, expires_in_days: 30 }),
      });
      const data = await res.json();
      if (data.code) { setInviteCode(data.code); }
      else { setInviteError(data.error || 'Failed to generate code'); }
    } catch (e) { setInviteError(e.message); }
    setInviteLoading(false);
  }

  return (
    <div>
      <div className="adm-sec-head">
        <div>
          <div className="adm-page-title">Invite Codes</div>
          <div className="adm-page-sub">Generate single-use invite codes for new users</div>
        </div>
      </div>

      <div className="adm-card" style={{ maxWidth: 520 }}>
        <div style={{ fontFamily: 'sans-serif', fontSize: 13, color: 'var(--text-mid)', lineHeight: 1.6, marginBottom: 16 }}>
          Creates a single-use invite code valid for 30 days. Share the code with the user — they enter it on the registration page with any email address.
        </div>
        {inviteError && <div style={{ color: 'var(--error)', fontSize: 12, fontFamily: 'sans-serif', marginBottom: 12 }}>{inviteError}</div>}
        {!inviteCode ? (
          <button className="adm-btn solid" onClick={generateInvite} disabled={inviteLoading} style={{ width: '100%' }}>
            {inviteLoading ? 'Generating...' : 'Generate Invite Code'}
          </button>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
              <input
                className="adm-input"
                readOnly
                value={inviteCode}
                style={{ flex: 1, width: 'auto', fontFamily: 'monospace', fontSize: 18, letterSpacing: '0.15em', textTransform: 'uppercase' }}
              />
              <button className="adm-btn" onClick={() => navigator.clipboard.writeText(inviteCode)}>Copy</button>
            </div>
            <button className="adm-btn" onClick={() => setInviteCode('')} style={{ fontSize: 11 }}>Generate Another</button>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LLM Configuration section — three slot editors + searchable model picker
// ---------------------------------------------------------------------------
function ModelPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [models, setModels] = useState(null); // null = not yet fetched
  const [loadingModels, setLoadingModels] = useState(false);
  const [err, setErr] = useState('');

  async function ensureLoaded() {
    if (models !== null || loadingModels) return;
    setLoadingModels(true);
    setErr('');
    try {
      const d = await apiFetch('/openrouter-models');
      setModels(d.models || []);
    } catch (e) {
      setErr(e.message);
      setModels([]);
    }
    setLoadingModels(false);
  }

  const filtered = (models || []).filter(m => {
    if (!query) return true;
    const q = query.toLowerCase();
    return m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q);
  }).slice(0, 50);

  return (
    <div style={{ position: 'relative' }}>
      <input
        className="adm-input"
        placeholder="Search model by name or id…"
        value={open ? query : (value || '')}
        onFocus={() => { setOpen(true); setQuery(''); ensureLoaded(); }}
        onBlur={() => { setTimeout(() => setOpen(false), 200); }}
        onChange={e => setQuery(e.target.value)}
        style={{ width: '100%' }}
      />
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
          background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: 6,
          marginTop: 4, maxHeight: 260, overflowY: 'auto', boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
        }}>
          {loadingModels && <div style={{ padding: 10, fontSize: 12, color: 'var(--text-light)' }}>Loading models…</div>}
          {err && <div style={{ padding: 10, fontSize: 12, color: 'var(--error)' }}>{err}</div>}
          {!loadingModels && !err && filtered.length === 0 && (
            <div style={{ padding: 10, fontSize: 12, color: 'var(--text-light)' }}>No matches.</div>
          )}
          {filtered.map(m => (
            <div
              key={m.id}
              onMouseDown={() => { onChange(m.id); setOpen(false); }}
              style={{ padding: '8px 10px', fontSize: 12, cursor: 'pointer', borderBottom: '0.5px solid var(--border-light)' }}
            >
              <div style={{ color: 'var(--text)' }}>{m.name}</div>
              <div style={{ color: 'var(--text-light)', fontFamily: 'monospace', fontSize: 10 }}>{m.id}</div>
            </div>
          ))}
        </div>
      )}
      {value && (
        <div style={{
          fontFamily: 'monospace', fontSize: 11, color: 'var(--text-light)',
          background: 'var(--surface-inp)', border: '0.5px solid var(--border-light)',
          borderRadius: 4, padding: '4px 8px', marginTop: 6, display: 'inline-block',
        }}>{value}</div>
      )}
    </div>
  );
}

function SectionLlmConfig() {
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const d = await apiFetch('/llm-config');
      const byslot = new Map((d.slots || []).map(s => [s.slot, s]));
      const normalized = [1, 2, 3].map(slot => {
        const s = byslot.get(slot) || {};
        return {
          slot,
          model_string: s.model_string || '',
          display_name: s.display_name || '',
          descriptor: s.descriptor || '',
          warning_badge: s.warning_badge || '',
        };
      });
      setSlots(normalized);
    } catch (e) { setErr(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function updateSlot(slot, key, val) {
    setSlots(prev => prev.map(s => s.slot === slot ? { ...s, [key]: val } : s));
  }

  async function save() {
    setSaving(true);
    setErr('');
    setToast('');
    try {
      await apiFetch('/llm-config', {
        method: 'POST',
        body: JSON.stringify({ slots: slots.map(s => ({
          slot: s.slot,
          model_string: s.model_string,
          display_name: s.display_name,
          descriptor: s.descriptor,
          warning_badge: s.warning_badge || null,
        })) }),
      });
      setToast('Saved.');
      setTimeout(() => setToast(''), 3000);
    } catch (e) { setErr(e.message); }
    setSaving(false);
  }

  if (loading) return <div className="adm-loading">Loading LLM configuration…</div>;

  return (
    <div>
      <div className="adm-page-title">LLM Configuration</div>
      <div className="adm-page-sub">Three model slots exposed to authors on the Build Article form</div>

      {err && <div style={{ color: 'var(--error)', fontSize: 12, fontFamily: 'sans-serif', marginBottom: 12 }}>{err}</div>}
      {toast && <div style={{ color: 'var(--success)', fontSize: 12, fontFamily: 'sans-serif', marginBottom: 12 }}>{toast}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 20 }}>
        {slots.map(s => (
          <div key={s.slot} className="adm-card">
            <div style={{ fontSize: 10, color: 'var(--amber)', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 700, marginBottom: 10 }}>
              Slot {s.slot}
            </div>

            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Display Name</div>
              <input className="adm-input" value={s.display_name} onChange={e => updateSlot(s.slot, 'display_name', e.target.value)} style={{ width: '100%' }} />
            </div>

            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Descriptor</div>
              <input className="adm-input" value={s.descriptor} onChange={e => updateSlot(s.slot, 'descriptor', e.target.value)} style={{ width: '100%' }} />
            </div>

            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Warning Badge</div>
              <input className="adm-input" value={s.warning_badge} onChange={e => updateSlot(s.slot, 'warning_badge', e.target.value)} placeholder="Internal Only — or leave blank" style={{ width: '100%' }} />
            </div>

            <div>
              <div style={{ fontSize: 10, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Model</div>
              <ModelPicker value={s.model_string} onChange={v => updateSlot(s.slot, 'model_string', v)} />
            </div>
          </div>
        ))}
      </div>

      <button className="adm-btn solid" onClick={save} disabled={saving}>
        {saving ? 'Saving…' : 'Save LLM Configuration'}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main AdminDashboard component
// ---------------------------------------------------------------------------
export default function AdminDashboard() {
  const [section, setSection] = useState('content');
  const [badges, setBadges] = useState({ queue: 0, health: 0 });
  const [currentUserRole, setCurrentUserRole] = useState(null);

  // Load current user role. Treat super_admin flag as the authoritative source.
  useEffect(() => {
    async function loadRole() {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' });
        const d = await res.json();
        const u = d.user || {};
        const role = u.super_admin ? 'super_admin' : (u.role ?? 'admin');
        setCurrentUserRole(role);
      } catch (e) {}
    }
    loadRole();
  }, []);

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
    { id: 'content', label: 'Submissions',    sec: 'Content' },
    { id: 'queue',   label: 'Queue',          sec: 'Content',    badge: badges.queue },
    { id: 'health',  label: 'Health',         sec: 'System',     badge: badges.health },
    { id: 'usage',   label: 'API Usage',      sec: 'System' },
    { id: 'authors', label: 'Authors',        sec: 'Management' },
    { id: 'llm',     label: 'LLM Config',     sec: 'Management' },
    { id: 'invites', label: 'Invite Codes',   sec: 'Management', superAdminOnly: true },
    { id: 'skill',   label: 'Skill Versions', sec: 'Management', superAdminOnly: true },
    { id: 'users',   label: 'Users',          sec: 'Management' },
    { id: 'viewas',  label: 'View as User',   sec: 'Management' },
    { id: 'templates', label: '⊞ HTML Templates', sec: 'Management' },
    { id: 'access',  label: 'Users & Access',  sec: 'Management', superAdminOnly: true },
    { id: 'danger',  label: '⚠ Danger Zone',  sec: 'System',     superAdminOnly: true },
  ];

  const renderSection = () => {
    // Guard super_admin-only sections
    if ((section === 'skill' || section === 'invites' || section === 'danger' || section === 'access') && currentUserRole !== 'super_admin') {
      return <div className="adm-empty">Access restricted.</div>;
    }
    switch (section) {
      case 'content':  return <SectionSubmissions />;
      case 'queue':    return <SectionQueue />;
      case 'health':   return <SectionHealth />;
      case 'usage':    return <SectionUsage />;
      case 'authors':  return <SectionAuthors />;
      case 'llm':      return <SectionLlmConfig />;
      case 'invites':  return <SectionInvites currentUserRole={currentUserRole} />;
      case 'skill':    return <SectionSkill />;
      case 'users':    return <SectionUsers currentUserRole={currentUserRole} />;
      case 'viewas':   return <SectionViewAsUser />;
      case 'templates':return <AdminTemplates />;
      case 'danger':   return <SectionDangerZone />;
      case 'access':   return <SectionAccess />;
      default:         return null;
    }
  };

  // Section accent colors — applied as a top stripe on the .card wrapping each section.
  const SECTION_ACCENT = {
    content: 'var(--green)',
    queue:   'var(--green)',
    health:  'var(--success)',
    usage:   'var(--info)',
    authors: 'var(--amber)',
    llm:     '#6A4A8A',
    invites: 'var(--amber)',
    skill:   'var(--leather-light)',
    users:   'var(--leather-light)',
    viewas:  'var(--amber)',
    templates: 'var(--amber)',
    danger:  'var(--error)',
    access:  'var(--leather)',
  };
  const accent = SECTION_ACCENT[section] || 'var(--green)';

  const visibleNav = navItems.filter(n => !n.superAdminOnly || currentUserRole === 'super_admin');

  return (
    <div className="adm-page">
      <div className="adm-tabs" role="tablist" aria-label="Admin sections">
        {visibleNav.map(n => (
          <button
            key={n.id}
            role="tab"
            aria-selected={section === n.id}
            className={`db-btn ${section === n.id ? 'db-btn-accent' : ''}`}
            onClick={() => setSection(n.id)}
          >
            {n.label}
            {n.badge > 0 && <span className="adm-nav-badge">{n.badge}</span>}
          </button>
        ))}
      </div>

      <div className="adm-content">
        <div className="card" style={{ position: 'relative', overflow: 'hidden', padding: '20px 24px' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(to right, ${accent}, transparent)`, pointerEvents: 'none' }} />
          {renderSection()}
        </div>
      </div>
    </div>
  );
}
// ─── SectionViewAsUser ──────────────────────────────────────────────────────
function SectionViewAsUser() {
  const [users, setUsers] = useState([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [state, setState] = useState({ impersonating: false, target_id: null });

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const d = await apiFetch(`/users-list${q ? `?q=${encodeURIComponent(q)}` : ''}`);
      setUsers(d.users || []);
      const s = await apiFetch('/impersonate');
      setState(s);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, [q]);

  useEffect(() => { load(); }, [load]);

  const viewAs = async (u) => {
    try {
      await apiFetch('/impersonate', { method: 'POST', body: JSON.stringify({ user_id: u.id }) });
      // Full reload so /api/auth/me reruns and the banner appears everywhere.
      window.location.href = '/dashboard';
    } catch (e) { alert(e.message); }
  };

  const stop = async () => {
    try {
      await apiFetch('/impersonate', { method: 'DELETE' });
      window.location.reload();
    } catch (e) { alert(e.message); }
  };

  return (
    <div>
      <div className="adm-page-title">View as User</div>
      <div className="adm-page-sub">Super-user feature — impersonate a user to confirm their view of the site. Actions you take while impersonating run as that user.</div>

      {state.impersonating && (
        <div style={{ background: 'var(--error-bg)', border: '1px solid var(--error-border)', color: 'var(--error)', padding: '10px 14px', borderRadius: 8, marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>Currently impersonating <strong>{state.target_id}</strong>.</div>
          <button className="db-btn db-btn-gold" onClick={stop}>Stop impersonating</button>
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <input className="adm-input" placeholder="Search by name or email…" value={q} onChange={e => setQ(e.target.value)} style={{ width: '100%', maxWidth: 420 }} />
      </div>

      {error && <div style={{ color: 'var(--error)', marginBottom: 10 }}>{error}</div>}
      {loading ? (
        <div className="adm-empty">Loading…</div>
      ) : users.length === 0 ? (
        <div className="adm-empty">No users match.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--text-light)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              <th style={{ padding: '8px 10px' }}>Name</th>
              <th style={{ padding: '8px 10px' }}>Email</th>
              <th style={{ padding: '8px 10px' }}>Role</th>
              <th style={{ padding: '8px 10px' }}>Account</th>
              <th style={{ padding: '8px 10px', textAlign: 'right' }}></th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} style={{ borderTop: '1px solid var(--border-faint)' }}>
                <td style={{ padding: '10px', color: 'var(--text)' }}>{u.name || '—'}</td>
                <td style={{ padding: '10px', color: 'var(--text-mid)' }}>{u.email}</td>
                <td style={{ padding: '10px', color: 'var(--text-mid)' }}>{u.role || 'user'}</td>
                <td style={{ padding: '10px', color: 'var(--text-mid)' }}>{u.account_id || '—'}</td>
                <td style={{ padding: '10px', textAlign: 'right' }}>
                  <button className="db-btn db-btn-gold" onClick={() => viewAs(u)}>View as →</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
