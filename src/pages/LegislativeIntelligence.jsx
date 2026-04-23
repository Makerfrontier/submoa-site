// /legislative-intelligence — Four-mode workspace. Super-admin sees everything.
// Other users need legislative-intelligence:view. Drill-down chat is always
// available via the floating button in the bottom-right corner.
//
// Modes: Morning Brief · Party Intelligence · Rep Intelligence · Narrative Craft

import { useEffect, useState, useCallback, useRef } from 'react';

const MODES = [
  { id: 'morning', label: 'Morning Brief' },
  { id: 'party',   label: 'Party Intelligence' },
  { id: 'rep',     label: 'Rep Intelligence' },
  { id: 'craft',   label: 'Narrative Craft' },
];

const PARTIES = [
  { id: 'R', label: 'Republican', color: 'var(--error)' },
  { id: 'D', label: 'Democrat',   color: 'var(--info)'  },
  { id: 'I', label: 'Independent', color: 'var(--text-mid)' },
];

async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

// ─── US states table ───────────────────────────────────────────────────────
const US_STATES = [
  ['AL','Alabama'],['AK','Alaska'],['AZ','Arizona'],['AR','Arkansas'],['CA','California'],
  ['CO','Colorado'],['CT','Connecticut'],['DE','Delaware'],['FL','Florida'],['GA','Georgia'],
  ['HI','Hawaii'],['ID','Idaho'],['IL','Illinois'],['IN','Indiana'],['IA','Iowa'],
  ['KS','Kansas'],['KY','Kentucky'],['LA','Louisiana'],['ME','Maine'],['MD','Maryland'],
  ['MA','Massachusetts'],['MI','Michigan'],['MN','Minnesota'],['MS','Mississippi'],['MO','Missouri'],
  ['MT','Montana'],['NE','Nebraska'],['NV','Nevada'],['NH','New Hampshire'],['NJ','New Jersey'],
  ['NM','New Mexico'],['NY','New York'],['NC','North Carolina'],['ND','North Dakota'],['OH','Ohio'],
  ['OK','Oklahoma'],['OR','Oregon'],['PA','Pennsylvania'],['RI','Rhode Island'],['SC','South Carolina'],
  ['SD','South Dakota'],['TN','Tennessee'],['TX','Texas'],['UT','Utah'],['VT','Vermont'],
  ['VA','Virginia'],['WA','Washington'],['WV','West Virginia'],['WI','Wisconsin'],['WY','Wyoming'],
];

// ─── Bill detail slide-out ─────────────────────────────────────────────────
// Fetches /api/legislative/bills/:bill_id, offers Read Full Text + Analyze.
function BillDetailPanel({ billId, onClose, onAnalyze }) {
  const [bill, setBill] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fullText, setFullText] = useState('');
  const [textLoading, setTextLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    if (!billId) return;
    setLoading(true); setError(''); setFullText('');
    api(`/legislative/bills/${encodeURIComponent(billId)}`)
      .then(setBill)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [billId]);

  async function loadFullText() {
    if (!bill) return;
    setTextLoading(true);
    try {
      const d = await api(`/legislative/bills/${encodeURIComponent(bill.bill_id)}/text`);
      setFullText(d.full_text || '(no text available)');
    } catch (e) { setError(e.message); }
    setTextLoading(false);
  }

  async function analyze() {
    if (!bill) return;
    setAnalyzing(true);
    try {
      console.log(`[analyze-bill] bill_id=${bill.bill_id} source=bill-detail-panel`);
      const d = await api('/legislative/analyze', {
        method: 'POST',
        body: JSON.stringify({ legislation_id: bill.bill_id, mode: 'party', party: bill.sponsor_party?.startsWith('D') ? 'D' : 'R' }),
      });
      onAnalyze?.({ briefId: d.brief_id, bill });
      onClose?.();
    } catch (e) { setError(e.message); }
    setAnalyzing(false);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 450, display: 'flex', justifyContent: 'flex-end' }} onClick={onClose}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.25)' }} />
      <div style={{ position: 'relative', width: 560, maxWidth: '95vw', height: '100%', background: 'var(--card)', boxShadow: '-4px 0 24px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border-light)' }}>
          <div className="eyebrow">BILL DETAIL</div>
          <button onClick={onClose} className="btn-ghost" style={{ fontSize: 16, padding: 4 }}>×</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 20px' }}>
          {loading && <div style={{ color: 'var(--text-light)' }}>Loading…</div>}
          {error && <div style={{ color: 'var(--error)', fontSize: 12 }}>{error}</div>}
          {bill && (
            <>
              <div style={{ fontSize: 11, color: 'var(--amber)', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 700 }}>
                {bill.bill_id}
              </div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, margin: '6px 0 12px', color: 'var(--text)' }}>{bill.title}</h2>
              <div style={{ fontSize: 12, color: 'var(--text-mid)', marginBottom: 12 }}>
                <div><strong>Sponsor:</strong> {bill.sponsor_name || 'Unknown'} {bill.sponsor_party && <>({bill.sponsor_party}{bill.sponsor_state ? `-${bill.sponsor_state}` : ''})</>}</div>
                <div><strong>Status:</strong> {bill.status || '—'}</div>
                <div><strong>Introduced:</strong> {bill.introduced_date || '—'}</div>
                <div><strong>Last action:</strong> {bill.last_action_date || '—'}</div>
                <div><strong>Co-sponsors:</strong> {(bill.cosponsors_json || []).length}</div>
              </div>
              {(bill.subjects || []).length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
                  {(bill.subjects || []).slice(0, 10).map((s, i) => (
                    <span key={i} style={{ fontSize: 10, background: 'var(--amber-light)', color: 'var(--amber-dim)', padding: '2px 8px', borderRadius: 100 }}>{s}</span>
                  ))}
                </div>
              )}
              {bill.summary && (
                <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6, marginBottom: 12 }}>{bill.summary}</div>
              )}
              {fullText && (
                <div style={{ marginTop: 10, padding: 12, background: 'var(--surface-inp)', border: '1px solid var(--border-light)', borderRadius: 6, maxHeight: 280, overflowY: 'auto', fontSize: 12, color: 'var(--text-mid)', lineHeight: 1.6, whiteSpace: 'pre-wrap', fontFamily: 'var(--font-mono)' }}>
                  {fullText.slice(0, 12000)}
                  {fullText.length > 12000 && <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 8, fontStyle: 'italic' }}>— truncated at 12k chars —</div>}
                </div>
              )}
            </>
          )}
        </div>
        {bill && (
          <div style={{ display: 'flex', gap: 8, padding: 14, borderTop: '1px solid var(--border-light)' }}>
            <button className="btn-ghost" onClick={loadFullText} disabled={textLoading}>{textLoading ? 'Fetching…' : 'Read Full Text'}</button>
            <button className="btn-primary" onClick={analyze} disabled={analyzing}>{analyzing ? 'Analyzing…' : 'Analyze Bill'}</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Stat card ─────────────────────────────────────────────────────────────
function StatCard({ label, value, accent = 'var(--green)' }) {
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', boxShadow: 'var(--shadow-card)' }}>
      <div style={{ fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--amber)', fontWeight: 600 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, color: accent, marginTop: 4 }}>{value}</div>
    </div>
  );
}

// ─── Morning Brief mode ────────────────────────────────────────────────────
function MorningBrief({ onBillOpen }) {
  const [snapshot, setSnapshot] = useState(null);
  const [allSnapshots, setAllSnapshots] = useState([]); // for scope pill status dots
  const [loading, setLoading] = useState(true);
  const [pulling, setPulling] = useState(false);
  const [pullingAll, setPullingAll] = useState(false);
  const [error, setError] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showScopeConfig, setShowScopeConfig] = useState(false);
  const [config, setConfig] = useState({ watched_topics: [], watched_bills: [], watched_reps: [], watched_committees: [], watched_donor_categories: [] });
  const [openstates, setOpenstates] = useState([]);  // configured state rows
  const [localDocs, setLocalDocs] = useState([]);
  const [scope, setScope] = useState('federal');

  const loadOpenstates = useCallback(async () => {
    try { const d = await api('/legislative/openstates-config'); setOpenstates(d.states || []); } catch {}
  }, []);
  const loadLocal = useCallback(async () => {
    try { const d = await api('/legislative/local/list'); setLocalDocs(d.local || []); } catch {}
  }, []);
  const loadAll = useCallback(async () => {
    try { const d = await api('/legislative/latest-snapshot?all=1'); setAllSnapshots(d.snapshots || []); } catch {}
  }, []);

  const load = useCallback(async (targetScope = scope) => {
    setLoading(true); setError('');
    try {
      const d = await api(`/legislative/latest-snapshot?scope=${encodeURIComponent(targetScope)}`);
      setSnapshot(d.snapshot);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, [scope]);
  const loadConfig = useCallback(async () => {
    try {
      const d = await api('/legislative/intel-config');
      if (d.config) setConfig(d.config);
    } catch {}
  }, []);

  useEffect(() => { load(scope); }, [scope, load]);
  useEffect(() => { loadConfig(); loadOpenstates(); loadLocal(); loadAll(); }, [loadConfig, loadOpenstates, loadLocal, loadAll]);

  const pull = async (targetScope = scope) => {
    setPulling(true); setError('');
    try {
      const body = targetScope.startsWith('state-')
        ? { scope: targetScope }
        : targetScope === 'local' ? { scope: 'local' } : { scope: 'federal' };
      const s = await api('/legislative/pull-brief', { method: 'POST', body: JSON.stringify(body) });
      setSnapshot(s);
      await loadAll();
    } catch (e) { setError(e.message); }
    setPulling(false);
  };

  const pullAll = async () => {
    setPullingAll(true); setError('');
    try {
      await api('/legislative/pull-brief', { method: 'POST', body: JSON.stringify({ scope: 'federal' }) });
      for (const s of openstates.filter(x => x.enabled)) {
        await api('/legislative/pull-brief', { method: 'POST', body: JSON.stringify({ scope: `state-${s.state_code}` }) });
      }
      if (localDocs.length > 0) {
        await api('/legislative/pull-brief', { method: 'POST', body: JSON.stringify({ scope: 'local' }) });
      }
      await loadAll();
      await load(scope);
    } catch (e) { setError(e.message); }
    setPullingAll(false);
  };

  const saveConfig = async (patch) => {
    const next = { ...config, ...patch };
    setConfig(next);
    try { await api('/legislative/intel-config', { method: 'PUT', body: JSON.stringify(next) }); } catch (e) { setError(e.message); }
  };

  // Build scope list: federal (always), each enabled openstates state, local if any docs.
  const scopes = [
    { key: 'federal', label: 'Federal' },
    ...openstates.filter(s => s.enabled).map(s => ({ key: `state-${s.state_code}`, label: s.state_code })),
    ...(localDocs.length > 0 ? [{ key: 'local', label: 'Local' }] : []),
  ];

  function scopeDotColor(scopeKey) {
    const snap = allSnapshots.find(s => s.scope === scopeKey);
    if (!snap) return 'var(--text-light)';
    const ageHrs = (Date.now() / 1000 - snap.pulled_at) / 3600;
    if (ageHrs < 20) return 'var(--success)';
    if (ageHrs < 48) return 'var(--amber)';
    return 'var(--text-light)';
  }

  if (loading) return <div style={{ padding: 40, color: 'var(--text-light)' }}>Loading brief…</div>;

  const hasSnap = !!snapshot;
  const hot = snapshot?.hot_bills_data || [];
  const focus = snapshot?.party_focus_data || { R: [], D: [] };
  const anomalies = snapshot?.anomaly_alerts || [];
  const crossovers = snapshot?.crossover_votes || [];
  const delta = snapshot?.has_meaningful_delta;
  const lastPull = snapshot?.pulled_at ? new Date(snapshot.pulled_at * 1000).toLocaleString() : null;

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
      {error && <div style={{ background: 'var(--error-bg)', border: '1px solid var(--error-border)', borderRadius: 6, padding: 10, color: 'var(--error)', fontSize: 12 }}>{error}</div>}

      {/* Scope bar — one pill per configured scope + plus button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', padding: '8px 10px', background: 'var(--card)', border: '1px solid var(--border-light)', borderRadius: 10 }}>
        <div style={{ fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-light)', marginRight: 6 }}>SCOPE</div>
        {scopes.map(s => {
          const active = s.key === scope;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => setScope(s.key)}
              style={{
                padding: '5px 12px', borderRadius: 100, border: `1px solid ${active ? 'var(--green)' : 'var(--border)'}`,
                background: active ? 'var(--green-glow)' : 'var(--card-alt)',
                color: active ? 'var(--green)' : 'var(--text-mid)',
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: scopeDotColor(s.key) }} />
              {s.label}
            </button>
          );
        })}
        <button type="button" onClick={() => setShowScopeConfig(true)}
          style={{ padding: '4px 10px', borderRadius: 100, border: '1px dashed var(--border)', background: 'transparent', color: 'var(--text-light)', fontSize: 12, cursor: 'pointer' }}>
          + Add scope
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>
            Morning Brief — {scopes.find(s => s.key === scope)?.label || scope}
          </h2>
          {lastPull && <div style={{ fontSize: 11, color: 'var(--text-light)' }}>Last pulled {lastPull}</div>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-primary" onClick={() => pull()} disabled={pulling || pullingAll}>{pulling ? 'Pulling…' : 'Pull Latest'}</button>
          <button className="btn-ghost" onClick={pullAll} disabled={pulling || pullingAll}>{pullingAll ? 'Pulling all…' : 'Pull All'}</button>
          <button className="btn-ghost" onClick={() => setShowSettings(true)}>⚙ Personalize</button>
        </div>
      </div>

      {!hasSnap ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, marginBottom: 8 }}>No brief pulled yet.</div>
          <div style={{ fontSize: 13, color: 'var(--text-light)', marginBottom: 20 }}>Pull your first Morning Brief to see what is moving in Congress right now.</div>
          <button className="btn-primary" onClick={pull} disabled={pulling}>{pulling ? 'Pulling…' : 'Pull Brief'}</button>
        </div>
      ) : (
        <>
          {snapshot.delta_summary && (
            <div style={{ background: delta ? 'var(--amber-light)' : 'var(--card-alt)', border: `1px solid ${delta ? 'var(--amber-border)' : 'var(--border-light)'}`, borderRadius: 8, padding: '10px 14px', fontSize: 13, color: delta ? 'var(--amber-dim)' : 'var(--text-mid)' }}>
              {delta ? '✦ ' : ''}{snapshot.delta_summary}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <StatCard label="Hot Bills" value={hot.length} />
            <StatCard label="Party Priorities" value={(focus.R?.length || 0) + (focus.D?.length || 0)} accent="var(--amber)" />
            <StatCard label="Anomaly Alerts" value={anomalies.length} accent="var(--error)" />
            <StatCard label="Crossover Votes" value={crossovers.length} accent="var(--info)" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
            <Panel title="Republican Focus" color="var(--error)">
              {(focus.R || []).length === 0 ? <div style={{ color: 'var(--text-light)', fontSize: 13 }}>No data in cache yet.</div> :
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {(focus.R || []).map((r, i) => (
                    <li key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-faint)', fontSize: 13 }}>
                      <span>{r.topic}</span><span style={{ color: 'var(--text-light)' }}>{r.count}</span>
                    </li>
                  ))}
                </ul>}
            </Panel>
            <Panel title="Democrat Focus" color="var(--info)">
              {(focus.D || []).length === 0 ? <div style={{ color: 'var(--text-light)', fontSize: 13 }}>No data in cache yet.</div> :
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {(focus.D || []).map((r, i) => (
                    <li key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-faint)', fontSize: 13 }}>
                      <span>{r.topic}</span><span style={{ color: 'var(--text-light)' }}>{r.count}</span>
                    </li>
                  ))}
                </ul>}
            </Panel>
            <Panel title="Hot Bills This Week" color="var(--amber)">
              {hot.length === 0 ? <div style={{ color: 'var(--text-light)', fontSize: 13 }}>None in cache.</div> :
                hot.map((b, i) => (
                  <div
                    key={b.bill_id || i}
                    onClick={() => onBillOpen?.(b.bill_id)}
                    style={{
                      padding: '8px 10px', marginBottom: 4, borderRadius: 6,
                      cursor: 'pointer',
                      borderLeft: '3px solid transparent',
                      background: 'transparent',
                      fontSize: 13,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--green-glow)'; e.currentTarget.style.borderLeftColor = 'var(--green)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderLeftColor = 'transparent'; }}
                  >
                    <div style={{ fontWeight: 600, color: 'var(--text)' }}>{b.bill_id}</div>
                    <div style={{ color: 'var(--text-light)', fontSize: 11 }}>{(b.title || '').slice(0, 90)}{(b.title || '').length > 90 ? '…' : ''}</div>
                  </div>
                ))}
            </Panel>
            <Panel title="Funding Anomalies & Crossovers" color="var(--leather)">
              {anomalies.length === 0 && crossovers.length === 0 ? (
                <div style={{ color: 'var(--text-light)', fontSize: 13 }}>FEC integration pending for this account. Live anomaly detection unlocks when FEC_API_KEY is set and watch lists are configured.</div>
              ) : (
                <>
                  {anomalies.map((a, i) => <div key={i} style={{ fontSize: 13, padding: '4px 0' }}>⚠ {JSON.stringify(a)}</div>)}
                  {crossovers.map((c, i) => <div key={i} style={{ fontSize: 13, padding: '4px 0' }}>↔ {JSON.stringify(c)}</div>)}
                </>
              )}
            </Panel>
          </div>
        </>
      )}

      {showSettings && (
        <SettingsDrawer config={config} onClose={() => setShowSettings(false)} onChange={saveConfig} />
      )}
      {showScopeConfig && (
        <ScopeConfigDrawer
          openstates={openstates}
          localDocs={localDocs}
          onClose={() => setShowScopeConfig(false)}
          onChange={async () => { await Promise.all([loadOpenstates(), loadLocal(), loadAll()]); }}
        />
      )}
    </div>
  );
}

// ─── Scope configuration drawer ────────────────────────────────────────────
function ScopeConfigDrawer({ openstates, localDocs, onClose, onChange }) {
  const [query, setQuery] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [localList, setLocalList] = useState(localDocs || []);
  useEffect(() => { setLocalList(localDocs || []); }, [localDocs]);

  const filtered = US_STATES.filter(([code, name]) =>
    !query.trim() ||
    name.toLowerCase().includes(query.toLowerCase()) ||
    code.toLowerCase().includes(query.toLowerCase())
  );

  const stateState = (code) => openstates.find(s => s.state_code === code);

  async function toggleState(code, name) {
    const existing = stateState(code);
    try {
      await api('/legislative/openstates-config', {
        method: 'POST',
        body: JSON.stringify({ state_code: code, state_name: name, enabled: !(existing?.enabled) }),
      });
      await onChange?.();
    } catch (e) { setError(e.message); }
  }

  async function toggleIncludeLocal(row) {
    try {
      await api('/legislative/openstates-config', {
        method: 'POST',
        body: JSON.stringify({ state_code: row.state_code, state_name: row.state_name, enabled: !!row.enabled, include_local: !row.include_local }),
      });
      await onChange?.();
    } catch (e) { setError(e.message); }
  }

  async function uploadLocal(file) {
    if (!file) return;
    setUploading(true); setError('');
    try {
      const fd = new FormData();
      fd.append('document', file);
      fd.append('title', file.name);
      const res = await fetch('/api/legislative/local/upload', { method: 'POST', credentials: 'include', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Upload failed');
      await onChange?.();
      const refreshed = await api('/legislative/local/list');
      setLocalList(refreshed.local || []);
    } catch (e) { setError(e.message); }
    setUploading(false);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 500, display: 'flex', justifyContent: 'flex-end' }} onClick={onClose}>
      <div style={{ width: 500, maxWidth: '95vw', background: 'var(--card)', padding: 20, overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>Scope configuration</h3>
          <button className="btn-ghost" onClick={onClose}>Close</button>
        </div>
        {error && <div style={{ color: 'var(--error)', fontSize: 12, marginBottom: 10 }}>{error}</div>}

        <div style={{ padding: 12, background: 'var(--success-bg)', border: '1px solid var(--success-border)', borderRadius: 8, marginBottom: 16 }}>
          <div className="eyebrow" style={{ color: 'var(--success)', marginBottom: 6 }}>FEDERAL ✓</div>
          <div style={{ fontSize: 12, color: 'var(--text-mid)' }}>Always enabled. Powered by Congress.gov API.</div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>STATES</div>
          <input className="form-input" placeholder="Search states…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ marginBottom: 8 }} />
          <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid var(--border-light)', borderRadius: 6 }}>
            {filtered.map(([code, name]) => {
              const row = stateState(code);
              const enabled = !!row?.enabled;
              return (
                <div key={code} style={{ display: 'flex', alignItems: 'center', padding: '6px 10px', borderBottom: '1px solid var(--border-faint)', gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => toggleState(code, name)}
                    style={{
                      width: 20, height: 20, borderRadius: 4,
                      background: enabled ? 'var(--success)' : 'transparent',
                      border: `1px solid ${enabled ? 'var(--success)' : 'var(--border)'}`,
                      color: '#fff', fontSize: 12, cursor: 'pointer', padding: 0,
                    }}
                  >{enabled ? '✓' : ''}</button>
                  <div style={{ flex: 1, fontSize: 12 }}>
                    <strong>{code}</strong> — {name}
                  </div>
                  {enabled && (
                    <label style={{ fontSize: 10, color: 'var(--text-light)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <input type="checkbox" checked={!!row?.include_local} onChange={() => toggleIncludeLocal(row)} />
                      Include local
                    </label>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 6 }}>
            Requires OPENSTATES_API_KEY. Get a free key at openstates.org/accounts/signup
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>LOCAL / MANUAL</div>
          <label className="btn-secondary" style={{ display: 'block', textAlign: 'center', cursor: uploading ? 'progress' : 'pointer', padding: '10px 14px' }}>
            {uploading ? 'Uploading…' : 'Upload PDF ordinance'}
            <input type="file" accept=".pdf,application/pdf" style={{ display: 'none' }}
              onChange={(e) => uploadLocal(e.target.files?.[0])} />
          </label>
          {localList.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11, color: 'var(--text-light)', marginBottom: 4 }}>UPLOADED</div>
              {localList.map((d) => (
                <div key={d.id} style={{ fontSize: 12, padding: '4px 8px', background: 'var(--card-alt)', borderRadius: 4, marginBottom: 2 }}>
                  <strong>{d.bill_id}</strong> — {d.title} {d.sponsor_state && <span style={{ color: 'var(--text-light)' }}>· {d.sponsor_state}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Panel({ title, color, children }) {
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, boxShadow: 'var(--shadow-card)', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(to right, ${color}, transparent)` }} />
      <div style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color, fontWeight: 700, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

function SettingsDrawer({ config, onClose, onChange }) {
  const [local, setLocal] = useState(config);
  useEffect(() => { setLocal(config); }, [config]);
  const setArr = (k, v) => setLocal(p => ({ ...p, [k]: v.split(',').map(s => s.trim()).filter(Boolean) }));

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 500, display: 'flex', justifyContent: 'flex-end' }} onClick={onClose}>
      <div style={{ width: 420, background: 'var(--card)', padding: 24, overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>Personalize Brief</h3>
          <button className="btn-ghost" onClick={onClose}>Close</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            { k: 'watched_topics', label: 'Watched topics' },
            { k: 'watched_bills', label: 'Watched bills (bill_id)' },
            { k: 'watched_reps', label: 'Watched reps (bioguide)' },
            { k: 'watched_committees', label: 'Watched committees' },
            { k: 'watched_donor_categories', label: 'Watched donor categories' },
          ].map(({ k, label }) => (
            <div key={k}>
              <label className="form-label">{label}</label>
              <input
                className="form-input"
                placeholder="Comma separated"
                value={(local[k] || []).join(', ')}
                onChange={(e) => setArr(k, e.target.value)}
                onBlur={() => onChange({ [k]: local[k] })}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Party Intelligence mode ───────────────────────────────────────────────
function PartyIntel({ onAnalyze, onBillOpen }) {
  const [party, setParty] = useState('R');
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [fec, setFec] = useState(null);
  const [fecLoading, setFecLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');
  // Whether server indicated it couldn't filter by sponsor party (list
  // endpoint often doesn't include sponsor records). Surfaced as a
  // non-blocking note so users understand why results may span both parties.
  const [partyFilterSkipped, setPartyFilterSkipped] = useState(false);

  // Live fetch from Congress.gov on every party switch. Never reads cache
  // first — the endpoint itself upserts into the legislation table after
  // fetching so the rest of the app still benefits.
  const load = useCallback(async () => {
    setLoading(true); setError(''); setPartyFilterSkipped(false);
    try {
      const d = await api(`/legislative/bills/search?party=${party}&congress=119&limit=20&sort=latest_action`);
      // Server-side filtering is best-effort — when Congress.gov's list
      // endpoint omits sponsor data the server returns an unfiltered set
      // with a `party_filter_skipped` flag. Render the whole list in that
      // case so the mode still has content instead of going empty.
      setBills(d.bills || []);
      setPartyFilterSkipped(!!d.party_filter_skipped);
    } catch (e) {
      setError(e.message || 'Bill search failed');
    }
    setLoading(false);
  }, [party]);

  // Auto-trigger on mount and on party change.
  useEffect(() => { load(); }, [load]);

  const runFec = async () => {
    if (!selected) return;
    setFecLoading(true);
    try { const d = await api(`/legislative/fec-map?legislation_id=${selected.bill_id}`); setFec(d); }
    catch (e) { setError(e.message); }
    setFecLoading(false);
  };

  const analyze = async () => {
    if (!selected) return;
    setAnalyzing(true);
    try {
      console.log(`[analyze-bill] bill_id=${selected.bill_id} source=party-intelligence`);
      const d = await api('/legislative/analyze', { method: 'POST', body: JSON.stringify({ legislation_id: selected.bill_id, mode: 'party', party }) });
      onAnalyze?.({ briefId: d.brief_id, bill: selected });
    } catch (e) { setError(e.message); }
    setAnalyzing(false);
  };

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
      {error && <div style={{ background: 'var(--error-bg)', border: '1px solid var(--error-border)', borderRadius: 6, padding: 10, color: 'var(--error)', fontSize: 12 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        {PARTIES.map(p => (
          <button key={p.id} className={`db-btn ${party === p.id ? 'db-btn-accent' : ''}`} onClick={() => setParty(p.id)}
            style={{ padding: '6px 14px', fontWeight: 600 }}>
            {p.label}
          </button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Panel title={`${PARTIES.find(p => p.id === party)?.label} Bills`} color="var(--amber)">
          {loading ? (
            <div style={{ color: 'var(--text-light)', fontSize: 13 }}>Loading latest bills from Congress.gov…</div>
          ) : bills.length === 0 ? (
            <div style={{ color: 'var(--text-light)', fontSize: 13 }}>
              {error
                ? `Bill fetch failed: ${error}`
                : 'Congress.gov returned no bills for this query. Try another party or try again in a moment.'}
            </div>
          ) : (
            <>
              {partyFilterSkipped && (
                <div style={{ fontSize: 11, color: 'var(--amber-dim)', marginBottom: 8, fontStyle: 'italic' }}>
                  Congress.gov's list endpoint didn't include sponsor details, so bills are shown across all parties. Open a bill to load its full detail.
                </div>
              )}
              {bills.map((b, i) => (
            <div key={i}
              onClick={() => { setSelected(b); setFec(null); }}
              onDoubleClick={() => onBillOpen?.(b.bill_id)}
              style={{
                padding: '8px 10px', borderRadius: 6, cursor: 'pointer',
                background: selected?.bill_id === b.bill_id ? 'var(--green-glow)' : 'transparent',
                borderLeft: selected?.bill_id === b.bill_id ? '3px solid var(--green)' : '3px solid transparent',
                borderBottom: '1px solid var(--border-faint)',
              }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>{b.bill_id}</div>
              <div style={{ fontSize: 11, color: 'var(--text-light)' }}>{(b.title || '').slice(0, 100)}</div>
              <button
                className="db-btn"
                style={{ fontSize: 10, padding: '2px 6px', marginTop: 4 }}
                onClick={(e) => { e.stopPropagation(); onBillOpen?.(b.bill_id); }}
              >Open detail →</button>
            </div>
          ))}
            </>
          )}
        </Panel>
        <Panel title="Bill Detail" color="var(--green)">
          {!selected ? <div style={{ color: 'var(--text-light)', fontSize: 13 }}>Select a bill.</div> : (
            <>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{selected.bill_id}</div>
              <div style={{ fontSize: 13, color: 'var(--text)', marginTop: 4 }}>{selected.title}</div>
              <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 8 }}>
                Sponsor: {selected.sponsor_name} ({selected.sponsor_party}-{selected.sponsor_state})
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button className="btn-accent" onClick={analyze} disabled={analyzing}>{analyzing ? 'Running…' : 'Analyze Bill'}</button>
                <button className="btn-ghost" onClick={runFec} disabled={fecLoading}>{fecLoading ? 'FEC…' : 'FEC Funding Map'}</button>
              </div>
              {fec && (
                <div style={{ marginTop: 12, fontSize: 12 }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>Top sectors</div>
                  {Object.entries(fec.total_by_sector || {}).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([s, amt]) => (
                    <div key={s} style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>{s}</span><span>${Number(amt).toLocaleString()}</span>
                    </div>
                  ))}
                  {Object.keys(fec.total_by_sector || {}).length === 0 && <div style={{ color: 'var(--text-light)' }}>No FEC data available.</div>}
                </div>
              )}
            </>
          )}
        </Panel>
      </div>
    </div>
  );
}

// ─── Rep Intelligence mode ────────────────────────────────────────────────
function RepIntel({ onAnalyze }) {
  const [profiles, setProfiles] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [showManager, setShowManager] = useState(false);
  const [bills, setBills] = useState([]);
  const [billsLoading, setBillsLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedBill, setSelectedBill] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');

  const loadProfiles = useCallback(async () => {
    try { const d = await api('/legislative/rep-profiles'); setProfiles(d.profiles || []); }
    catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { loadProfiles(); }, [loadProfiles]);

  const searchBills = async () => {
    setBillsLoading(true);
    try { const d = await api(`/legislative/bills/search?q=${encodeURIComponent(query)}&limit=20`); setBills(d.bills || []); }
    catch (e) { setError(e.message); }
    setBillsLoading(false);
  };

  const analyze = async () => {
    if (!selectedBill || !selectedId) return;
    setAnalyzing(true);
    try {
      console.log(`[analyze-bill] bill_id=${selectedBill.bill_id} source=rep-intelligence`);
      const d = await api('/legislative/analyze', { method: 'POST', body: JSON.stringify({ legislation_id: selectedBill.bill_id, mode: 'rep', rep_profile_id: selectedId }) });
      onAnalyze?.({ briefId: d.brief_id, bill: selectedBill });
    } catch (e) { setError(e.message); }
    setAnalyzing(false);
  };

  const rep = profiles.find(p => p.id === selectedId);

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
      {error && <div style={{ background: 'var(--error-bg)', border: '1px solid var(--error-border)', borderRadius: 6, padding: 10, color: 'var(--error)', fontSize: 12 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <select className="form-select" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}
          style={{ flex: 1, maxWidth: 420 }}>
          <option value="">— choose a rep profile —</option>
          {profiles.map(p => <option key={p.id} value={p.id}>{p.name} ({p.party || '—'}-{p.state || ''})</option>)}
        </select>
        <button className="btn-ghost" onClick={() => setShowManager(true)}>Manage Profiles</button>
      </div>

      {profiles.length === 0 && (
        <div style={{ background: 'var(--amber-light)', border: '1px solid var(--amber-border)', borderRadius: 8, padding: 14, fontSize: 13, color: 'var(--amber-dim)' }}>
          No rep profiles yet. Open Manage Profiles to create one via RSS ingest, DOCX upload, or Congress.gov bioguide lookup.
        </div>
      )}

      {rep && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          <StatCard label="Bills Sponsored" value={(rep.sponsored_legislation || []).length} />
          <StatCard label="Committees" value={(rep.committee_memberships || []).length} accent="var(--amber)" />
          <StatCard label="Tone Tags" value={(rep.tone_tags || []).length} accent="var(--info)" />
          <StatCard label="Docs Ingested" value={rep.documents_ingested || 0} accent="var(--leather)" />
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <input className="form-input" style={{ flex: 1 }} placeholder="Search bills by title…" value={query} onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && searchBills()} />
        <button className="btn-primary" onClick={searchBills} disabled={billsLoading}>{billsLoading ? '…' : 'Search'}</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Panel title="Results" color="var(--amber)">
          {bills.length === 0 ? <div style={{ color: 'var(--text-light)', fontSize: 13 }}>No bills — run a search.</div> : (
            bills.map(b => (
              <div key={b.bill_id} onClick={() => setSelectedBill(b)}
                style={{ padding: '8px 10px', borderRadius: 6, cursor: 'pointer', background: selectedBill?.bill_id === b.bill_id ? 'var(--amber-light)' : 'transparent', borderBottom: '1px solid var(--border-faint)' }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{b.bill_id}</div>
                <div style={{ fontSize: 11, color: 'var(--text-light)' }}>{(b.title || '').slice(0, 100)}</div>
              </div>
            ))
          )}
        </Panel>
        <Panel title="Selected Bill" color="var(--green)">
          {!selectedBill ? <div style={{ color: 'var(--text-light)', fontSize: 13 }}>Pick a bill above.</div> : (
            <>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{selectedBill.bill_id}</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>{selectedBill.title}</div>
              <button className="btn-accent" style={{ marginTop: 12 }} onClick={analyze} disabled={!selectedId || analyzing}>
                {analyzing ? 'Running 5-pass analysis…' : 'Analyze Bill'}
              </button>
            </>
          )}
        </Panel>
      </div>

      {showManager && <RepManager onClose={() => { setShowManager(false); loadProfiles(); }} />}
    </div>
  );
}

function RepManager({ onClose }) {
  const [profiles, setProfiles] = useState([]);
  const [mode, setMode] = useState(null); // 'create' | 'rss' | 'docx' | 'congress'
  const [formName, setFormName] = useState('');
  const [bioguide, setBioguide] = useState('');
  const [rssUrl, setRssUrl] = useState('');
  const [file, setFile] = useState(null);
  const [targetId, setTargetId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { const d = await api('/legislative/rep-profiles'); setProfiles(d.profiles || []); } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const createProfile = async () => {
    if (!formName) return;
    setBusy(true);
    try { const d = await api('/legislative/rep-profiles', { method: 'POST', body: JSON.stringify({ name: formName }) }); setTargetId(d.profile.id); setMode(null); await load(); }
    catch (e) { setError(e.message); }
    setBusy(false);
  };

  const runRss = async () => {
    if (!targetId || !rssUrl) return;
    setBusy(true);
    try { await api(`/legislative/rep-profiles/${targetId}/ingest-rss`, { method: 'POST', body: JSON.stringify({ rss_url: rssUrl }) }); setMode(null); await load(); }
    catch (e) { setError(e.message); }
    setBusy(false);
  };

  const runDocx = async () => {
    if (!targetId || !file) return;
    setBusy(true);
    try {
      const fd = new FormData(); fd.append('document', file);
      const res = await fetch(`/api/legislative/rep-profiles/${targetId}/ingest-docx`, { method: 'POST', credentials: 'include', body: fd });
      const d = await res.json(); if (!res.ok) throw new Error(d?.error || 'failed');
      setMode(null); await load();
    } catch (e) { setError(e.message); }
    setBusy(false);
  };

  const runCongress = async () => {
    if (!targetId || !bioguide) return;
    setBusy(true);
    try { await api(`/legislative/rep-profiles/${targetId}/build-from-congress`, { method: 'POST', body: JSON.stringify({ bioguide_id: bioguide }) }); setMode(null); await load(); }
    catch (e) { setError(e.message); }
    setBusy(false);
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this rep profile and all related briefs?')) return;
    try { await api(`/legislative/rep-profiles/${id}`, { method: 'DELETE' }); await load(); } catch (e) { setError(e.message); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 600, display: 'flex', justifyContent: 'center', alignItems: 'center' }} onClick={onClose}>
      <div className="card" style={{ width: 720, maxWidth: '95vw', maxHeight: '90vh', overflow: 'auto', padding: 24 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}>Rep Profile Manager</h3>
          <button className="btn-ghost" onClick={onClose}>Close</button>
        </div>
        {error && <div style={{ color: 'var(--error)', fontSize: 12, marginBottom: 10 }}>{error}</div>}

        <div style={{ marginBottom: 20 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>EXISTING PROFILES ({profiles.length})</div>
          {profiles.length === 0 && <div style={{ color: 'var(--text-light)', fontSize: 12 }}>No profiles yet.</div>}
          {profiles.map(p => (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border-faint)' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-light)' }}>{p.party || '—'}-{p.state || ''} · {p.documents_ingested || 0} docs</div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="db-btn" onClick={() => { setTargetId(p.id); setMode('rss'); }}>+ RSS</button>
                <button className="db-btn" onClick={() => { setTargetId(p.id); setMode('docx'); }}>+ DOCX</button>
                <button className="db-btn" onClick={() => { setTargetId(p.id); setMode('congress'); }}>+ Bioguide</button>
                <button className="btn-danger-sm" onClick={() => remove(p.id)}>×</button>
              </div>
            </div>
          ))}
        </div>

        {mode === null && (
          <button className="btn-primary" onClick={() => setMode('create')}>+ New rep profile</button>
        )}
        {mode === 'create' && (
          <div>
            <label className="form-label">Name</label>
            <input className="form-input" value={formName} onChange={(e) => setFormName(e.target.value)} />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="btn-primary" onClick={createProfile} disabled={busy || !formName}>{busy ? '…' : 'Create'}</button>
              <button className="btn-ghost" onClick={() => setMode(null)}>Cancel</button>
            </div>
          </div>
        )}
        {mode === 'rss' && (
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>INGEST RSS</div>
            <input className="form-input" placeholder="https://example.gov/feed.rss" value={rssUrl} onChange={(e) => setRssUrl(e.target.value)} />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="btn-primary" onClick={runRss} disabled={busy || !rssUrl}>{busy ? '…' : 'Analyze feed'}</button>
              <button className="btn-ghost" onClick={() => setMode(null)}>Cancel</button>
            </div>
          </div>
        )}
        {mode === 'docx' && (
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>INGEST DOCX</div>
            <input type="file" accept=".docx" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="btn-primary" onClick={runDocx} disabled={busy || !file}>{busy ? '…' : 'Analyze document'}</button>
              <button className="btn-ghost" onClick={() => setMode(null)}>Cancel</button>
            </div>
          </div>
        )}
        {mode === 'congress' && (
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>AUTO-BUILD FROM CONGRESS.GOV</div>
            <input className="form-input" placeholder="Bioguide ID, e.g. H000273" value={bioguide} onChange={(e) => setBioguide(e.target.value)} />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="btn-primary" onClick={runCongress} disabled={busy || !bioguide}>{busy ? '…' : 'Fetch + build'}</button>
              <button className="btn-ghost" onClick={() => setMode(null)}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Brief viewer (reused by all modes once a brief is produced) ─────────────
// Derive a display-friendly chamber label from a Congress.gov bill_id like
// "119-hr-1234" / "119-s-47". Falls back to the raw id prefix when the
// pattern isn't recognized.
function billChamber(billId) {
  const m = String(billId || '').toLowerCase().match(/^(?:\d+-)?([a-z]+)/);
  if (!m) return '';
  const prefix = m[1];
  if (prefix === 'hr' || prefix === 'hres' || prefix === 'hjres' || prefix === 'hconres') return 'House';
  if (prefix === 's' || prefix === 'sres' || prefix === 'sjres' || prefix === 'sconres') return 'Senate';
  return prefix.toUpperCase();
}

function BriefViewer({ briefId, bill, onQuestion }) {
  const [brief, setBrief] = useState(null);
  const [flags, setFlags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [popover, setPopover] = useState(null); // { x, y, text, offsetStart, offsetEnd }
  const [newsCycle, setNewsCycle] = useState(null);
  const [newsLoading, setNewsLoading] = useState(false);
  const bodyRef = useRef(null);

  const loadBrief = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const d = await api(`/legislative/briefs?id=${briefId}`);
      setBrief(d.briefs?.[0] || null);
      const f = await api(`/legislative/flags?brief_id=${briefId}`);
      setFlags(f.flags || []);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, [briefId]);
  useEffect(() => { if (briefId) loadBrief(); }, [briefId, loadBrief]);

  const onMouseUp = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) { setPopover(null); return; }
    const text = sel.toString().trim();
    if (text.length < 3) { setPopover(null); return; }
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    setPopover({
      x: rect.left + rect.width / 2 + window.scrollX,
      y: rect.bottom + window.scrollY + 8,
      text,
    });
  };

  async function flag(type, comment = '') {
    if (!popover) return;
    try {
      const d = await api('/legislative/flags', {
        method: 'POST',
        body: JSON.stringify({ brief_id: briefId, selected_text: popover.text, comment, flag_type: type }),
      });
      const newFlag = d.flag;
      setFlags(fs => [...fs, newFlag]);
      setPopover(null);
      window.getSelection()?.removeAllRanges();
      if (type === 'fact-check') {
        try {
          const r = await api('/legislative/fact-check', {
            method: 'POST',
            body: JSON.stringify({ brief_id: briefId, flag_id: newFlag.id, selected_text: popover.text, context: '' }),
          });
          setFlags(fs => fs.map(f => f.id === newFlag.id ? { ...f, fact_check_verdict: r.verdict, fact_check_result: JSON.stringify(r) } : f));
        } catch (e) { setError(e.message); }
      } else if (type === 'question') {
        onQuestion?.(popover.text, comment);
      }
    } catch (e) { setError(e.message); }
  }

  const pullNews = async () => {
    setNewsLoading(true);
    try { const d = await api('/legislative/news-cycle', { method: 'POST', body: JSON.stringify({ legislation_id: brief.legislation_id }) }); setNewsCycle(d); }
    catch (e) { setError(e.message); }
    setNewsLoading(false);
  };

  if (loading) return <div style={{ padding: 20, color: 'var(--text-light)' }}>Loading brief…</div>;
  if (!brief) return null;

  const section = (label, items, renderer) => (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 12 }}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>{label}</div>
      {(!items || items.length === 0) ? <div style={{ fontSize: 12, color: 'var(--text-light)' }}>— none —</div> :
        items.map((it, i) => <div key={i} style={{ padding: '6px 0', borderBottom: '1px solid var(--border-faint)', fontSize: 13 }}>{renderer(it)}</div>)}
    </div>
  );

  // Collapsible bill-context panel. Always present when bill metadata is
  // available, defaults to expanded so the analysis is anchored to its
  // source. Uses brand tokens only — var(--card) bg, var(--border) border.
  const billStatus = bill?.status || bill?.last_action || '';
  const billParty = bill?.sponsor_party || '';
  const billChamberLabel = billChamber(bill?.bill_id);

  return (
    <div style={{ padding: '0 24px 24px', position: 'relative' }}>
      {error && <div style={{ color: 'var(--error)', fontSize: 12, marginBottom: 10 }}>{error}</div>}

      {bill && (
        <details
          open
          style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '12px 16px',
            marginBottom: 12,
          }}
        >
          <summary style={{ cursor: 'pointer', listStyle: 'none', outline: 'none' }}>
            <div style={{
              fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600,
              letterSpacing: '0.1em', textTransform: 'uppercase',
              color: 'var(--amber)',
            }}>Bill Analysis</div>
            <h3 style={{
              fontFamily: 'Playfair Display', fontWeight: 600, fontSize: 22,
              lineHeight: 1.3, letterSpacing: 'normal',
              color: 'var(--text)', margin: '4px 0 6px',
            }}>
              {bill.title || bill.bill_id}
            </h3>
            <div style={{
              fontFamily: 'DM Sans', fontSize: 13,
              color: 'var(--text-mid)', lineHeight: 1.45,
            }}>
              {[billChamberLabel, billStatus, billParty].filter(Boolean).join(' · ') || bill.bill_id}
            </div>
          </summary>
        </details>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>Brief · {brief.mode} mode</h3>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn-ghost" onClick={pullNews} disabled={newsLoading}>{newsLoading ? '…' : '📰 News Cycle'}</button>
        </div>
      </div>

      <div ref={bodyRef} onMouseUp={onMouseUp} style={{ userSelect: 'text' }}>
        {section('Pork Analysis', brief.pork_analysis, (it) => (
          <div><strong>{it.section || it.location || 'Section'}:</strong> {it.text || it.concern || JSON.stringify(it)}</div>
        ))}
        {section('Talking Points — Pro', brief.talking_points_pro, (it) => <div>{String(it)}</div>)}
        {section('Talking Points — Opposed', brief.talking_points_opposed, (it) => <div>{String(it)}</div>)}
        {section('Verbatim Extracts', brief.verbatim_extracts, (it) => (
          <blockquote style={{ margin: 0, padding: '6px 12px', background: 'var(--amber-light)', borderLeft: '3px solid var(--amber)', fontStyle: 'italic' }}>
            <strong style={{ color: 'var(--amber-dim)', fontStyle: 'normal' }}>§{it.section || '—'}:</strong> {it.quote || JSON.stringify(it)}
          </blockquote>
        ))}
        {section('Historical Parallels', brief.historical_parallels, (it) => (
          <div><strong>{it.bill || '—'} ({it.year || '—'}):</strong> {it.outcome || JSON.stringify(it)}</div>
        ))}
        {section('Opposition Alignment', brief.opposition_alignment, (it) => (
          <div><strong>{it.section || '—'}:</strong> {it.alignment || it.note || JSON.stringify(it)}</div>
        ))}
      </div>

      {newsCycle && (
        <div style={{ background: 'var(--info-bg)', border: '1px solid var(--info-border)', borderRadius: 10, padding: 16, marginBottom: 12 }}>
          <div className="eyebrow" style={{ color: 'var(--info)', marginBottom: 8 }}>NEWS CYCLE · score {newsCycle.media_attention_score}/10</div>
          <div style={{ fontSize: 13, marginBottom: 6 }}><strong>Dominant narrative:</strong> {newsCycle.dominant_narrative}</div>
          {newsCycle.opposition_narrative && (
            <div style={{ fontSize: 13, marginBottom: 6 }}><strong>Opposition framing:</strong> {newsCycle.opposition_narrative}</div>
          )}
          {(newsCycle.articles || []).length > 0 && (
            <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0' }}>
              {newsCycle.articles.slice(0, 10).map((a, i) => (
                <li key={i} style={{ fontSize: 12, padding: '4px 0' }}>
                  <a href={a.url} target="_blank" rel="noreferrer" style={{ color: 'var(--info)' }}>{a.outlet}</a>: {a.headline} {a.political_lean && <em>({a.political_lean})</em>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {flags.length > 0 && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>FLAGS ({flags.length})</div>
          {flags.map(f => (
            <div key={f.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border-faint)', fontSize: 12 }}>
              <div>
                <span style={{ color: 'var(--amber)', fontWeight: 600 }}>{f.flag_type}</span>
                {f.fact_check_verdict && <span style={{ marginLeft: 8, color: f.fact_check_verdict === 'Verified' ? 'var(--success)' : f.fact_check_verdict === 'Inaccurate' ? 'var(--error)' : 'var(--amber)' }}>· {f.fact_check_verdict}</span>}
              </div>
              <div style={{ color: 'var(--text-mid)', marginTop: 2 }}>"{(f.selected_text || '').slice(0, 120)}"</div>
              {f.comment && <div style={{ color: 'var(--text-light)', fontSize: 11, marginTop: 2 }}>— {f.comment}</div>}
            </div>
          ))}
        </div>
      )}

      {popover && (
        <div style={{
          position: 'absolute', left: popover.x, top: popover.y,
          transform: 'translateX(-50%)',
          background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8,
          padding: 8, boxShadow: 'var(--shadow-card)', display: 'flex', gap: 6, zIndex: 20,
        }}>
          <button className="db-btn db-btn-gold" onClick={() => flag('investigate')}>🔎 Investigate</button>
          <button className="db-btn db-btn-accent" onClick={() => flag('fact-check')}>✓ Fact-check</button>
          <button className="db-btn db-btn-green" onClick={() => flag('talking-point')}>★ Save</button>
          <button className="db-btn" onClick={() => flag('question')}>? Ask</button>
        </div>
      )}
    </div>
  );
}

// ─── Narrative Craft mode ──────────────────────────────────────────────────
function NarrativeCraft({ bootstrap }) {
  const [chatId, setChatId] = useState(null);
  const [billId, setBillId] = useState(bootstrap?.billId || '');
  const [repId, setRepId] = useState('');
  const [party, setParty] = useState('');
  const [profiles, setProfiles] = useState([]);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Pre-loaded analysis from bill_analysis_cache. When populated, renders
  // the "Context Loaded" banner and seeds the first assistant message so
  // the conversation starts with shared knowledge of the bill.
  const [preloadedContext, setPreloadedContext] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    api('/legislative/rep-profiles').then(d => setProfiles(d.profiles || [])).catch(() => {});
  }, []);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [messages]);

  // Fetch cached analysis whenever the bill id changes. Cache hits are
  // surfaced via the banner + a seeded assistant message so the user sees
  // the context before typing.
  useEffect(() => {
    const trimmed = String(billId || '').trim();
    if (!trimmed) { setPreloadedContext(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const d = await api(`/legislative/analysis-cache?bill_id=${encodeURIComponent(trimmed)}`);
        if (cancelled) return;
        if (d?.cached && d.analysis) {
          setPreloadedContext(d.analysis);
          console.log(`[narrative-craft] bill_id=${trimmed} context_loaded=true source=analysis-cache`);
        } else {
          setPreloadedContext(null);
          console.log(`[narrative-craft] bill_id=${trimmed} context_loaded=false source=analysis-cache`);
        }
      } catch {
        if (!cancelled) setPreloadedContext(null);
      }
    })();
    return () => { cancelled = true; };
  }, [billId]);

  useEffect(() => {
    if (bootstrap?.initialMessage) {
      setMessages([{ role: 'user', content: bootstrap.initialMessage }]);
      send(bootstrap.initialMessage, true);
    }
    // eslint-disable-next-line
  }, [bootstrap]);

  async function send(content, skipAppend = false) {
    if (!content.trim() || busy) return;
    setBusy(true); setError('');
    const next = skipAppend ? messages : [...messages, { role: 'user', content }];
    setMessages(next);
    setInput('');
    try {
      const res = await api('/legislative/chat', {
        method: 'POST',
        body: JSON.stringify({
          chat_id: chatId,
          legislation_id: billId || null,
          rep_profile_id: repId || null,
          party: party || null,
          messages: next,
          preloaded_context: preloadedContext || null,
        }),
      });
      setChatId(res.chat_id);
      setMessages(res.messages);
    } catch (e) { setError(e.message); }
    setBusy(false);
  }

  const exportDraft = async () => {
    if (!chatId) return;
    try {
      const res = await api('/legislative/chat/export', { method: 'POST', body: JSON.stringify({ chat_id: chatId }) });
      window.open(res.url, '_blank');
    } catch (e) { setError(e.message); }
  };

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12, height: 'calc(100vh - 160px)' }}>
      {error && <div style={{ color: 'var(--error)', fontSize: 12 }}>{error}</div>}
      {preloadedContext && (
        <div style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: '10px 14px',
        }}>
          <div style={{
            fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600,
            letterSpacing: '0.1em', textTransform: 'uppercase',
            color: 'var(--amber)',
          }}>Context Loaded</div>
          <div style={{
            fontFamily: 'DM Sans', fontSize: 13, lineHeight: 1.45,
            color: 'var(--text-mid)', marginTop: 2,
          }}>
            Analysis of {preloadedContext.bill_title || preloadedContext.bill_id || 'the bill'} pre-loaded for narrative crafting.
          </div>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 }}>
        <div>
          <label className="form-label">Bill ID (optional)</label>
          <input className="form-input" value={billId} onChange={(e) => setBillId(e.target.value)} placeholder="e.g. 119-hr-1234" />
        </div>
        <div>
          <label className="form-label">Rep profile</label>
          <select className="form-select" value={repId} onChange={(e) => setRepId(e.target.value)}>
            <option value="">—</option>
            {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Or party focus</label>
          <select className="form-select" value={party} onChange={(e) => setParty(e.target.value)}>
            <option value="">—</option>
            {PARTIES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {messages.length === 0 && (
          <div style={{ color: 'var(--text-light)', fontSize: 13, fontStyle: 'italic' }}>
            Start the conversation. Responses are grounded in the supplied bill + rep/party context.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth: '80%', padding: '10px 14px',
              borderRadius: m.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
              background: m.role === 'user' ? 'var(--amber-light)' : 'var(--card-alt)',
              border: `1px solid ${m.role === 'user' ? 'var(--amber-border)' : 'var(--border)'}`,
              fontSize: 13, whiteSpace: 'pre-wrap',
            }}>{m.content}</div>
          </div>
        ))}
        {busy && <div style={{ color: 'var(--text-light)', fontStyle: 'italic', fontSize: 12 }}>Thinking…</div>}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <textarea
          className="form-textarea" rows={2} value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
          placeholder="Ask a question, draft a statement, pressure-test a talking point…"
          style={{ flex: 1 }}
        />
        <button className="btn-primary" onClick={() => send(input)} disabled={busy || !input.trim()}>Send</button>
        {chatId && <button className="btn-ghost" onClick={exportDraft}>Export</button>}
      </div>
    </div>
  );
}

// ─── Floating chat button ───────────────────────────────────────────────────
function FloatingChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [chatId, setChatId] = useState(null);
  const [error, setError] = useState('');
  const scrollRef = useRef(null);

  useEffect(() => { if (open) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [open, messages]);

  async function send() {
    if (!input.trim() || busy) return;
    setBusy(true); setError('');
    const next = [...messages, { role: 'user', content: input }];
    setMessages(next);
    const submitted = input;
    setInput('');
    try {
      const res = await api('/legislative/chat', {
        method: 'POST',
        body: JSON.stringify({ chat_id: chatId, messages: next }),
      });
      setChatId(res.chat_id);
      setMessages(res.messages);
    } catch (e) {
      setError(e.message);
      setMessages(prev => prev.concat({ role: 'assistant', content: `(error: ${e.message})` }));
    }
    setBusy(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', right: 24, bottom: 24, zIndex: 400,
          width: 56, height: 56, borderRadius: '50%',
          background: 'var(--green)', color: '#fff', border: 'none',
          boxShadow: '0 4px 14px rgba(0,0,0,0.2)', cursor: 'pointer',
          fontSize: 22,
        }}
        aria-label="Open chat"
      >💬</button>
    );
  }

  return (
    <div style={{
      position: 'fixed', right: 24, bottom: 24, zIndex: 400,
      width: 400, maxWidth: '95vw', height: 520, maxHeight: '80vh',
      background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12,
      boxShadow: '0 8px 32px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--border-light)' }}>
        <div className="eyebrow">✦ NARRATIVE DRILL-DOWN</div>
        <button className="btn-ghost" onClick={() => setOpen(false)} style={{ fontSize: 12, padding: 4 }}>×</button>
      </div>
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {messages.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-light)', fontStyle: 'italic' }}>Ask anything about the current mode's data.</div>}
        {messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{ maxWidth: '85%', padding: '8px 12px', borderRadius: m.role === 'user' ? '10px 10px 2px 10px' : '10px 10px 10px 2px',
              background: m.role === 'user' ? 'var(--amber-light)' : 'var(--card-alt)',
              border: `1px solid ${m.role === 'user' ? 'var(--amber-border)' : 'var(--border)'}`,
              fontSize: 12, whiteSpace: 'pre-wrap' }}>{m.content}</div>
          </div>
        ))}
        {busy && <div style={{ fontSize: 11, color: 'var(--text-light)', fontStyle: 'italic' }}>Thinking…</div>}
      </div>
      {error && <div style={{ fontSize: 11, color: 'var(--error)', padding: '4px 12px' }}>{error}</div>}
      <div style={{ display: 'flex', gap: 6, padding: 10, borderTop: '1px solid var(--border-light)' }}>
        <input className="form-input" value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Ask about the current data…"
          style={{ flex: 1, fontSize: 12, padding: '6px 10px' }} />
        <button className="btn-primary" onClick={send} disabled={busy || !input.trim()} style={{ padding: '6px 12px', fontSize: 12 }}>Send</button>
      </div>
    </div>
  );
}

// ─── Page root ──────────────────────────────────────────────────────────────
export default function LegislativeIntelligence({ navigate }) { // eslint-disable-line no-unused-vars
  // Allow other nav entry points (e.g. the sidebar's "Party Intelligence"
  // shortcut) to request a specific initial mode via sessionStorage. The
  // flag is consumed exactly once so a subsequent manual visit still lands
  // on the default Morning Brief tab.
  const [mode, setMode] = useState(() => {
    try {
      const requested = typeof window !== 'undefined' ? sessionStorage.getItem('legintel:initialMode') : null;
      if (requested && MODES.some((m) => m.id === requested)) {
        sessionStorage.removeItem('legintel:initialMode');
        return requested;
      }
    } catch { /* sessionStorage unavailable — fall through */ }
    return 'morning';
  });
  const [lastBrief, setLastBrief] = useState(null);
  const [openBillId, setOpenBillId] = useState(null);

  return (
    <div style={{ background: 'var(--bg)', minHeight: 'calc(100vh - 48px)', paddingBottom: 120 }}>
      <div style={{ borderBottom: '1px solid var(--border-light)', background: 'var(--card)' }}>
        <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>
            ⚖ Atomic Politics
          </h1>
          <div style={{ display: 'flex', gap: 4, marginLeft: 16, flexWrap: 'wrap' }}>
            {MODES.map(m => (
              <button key={m.id} className={`db-btn ${mode === m.id ? 'db-btn-accent' : ''}`}
                onClick={() => setMode(m.id)} style={{ fontSize: 12, padding: '6px 12px' }}>
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {mode === 'morning' && <MorningBrief onBillOpen={setOpenBillId} />}
      {mode === 'party'   && <PartyIntel onAnalyze={setLastBrief} onBillOpen={setOpenBillId} />}
      {mode === 'rep'     && <RepIntel onAnalyze={setLastBrief} />}
      {mode === 'craft'   && <NarrativeCraft bootstrap={lastBrief ? { billId: lastBrief.bill?.bill_id || '', bill: lastBrief.bill || null } : null} />}

      {(mode === 'party' || mode === 'rep') && lastBrief && (
        <div style={{ marginTop: 12 }}>
          <BriefViewer briefId={lastBrief.briefId} bill={lastBrief.bill} onQuestion={() => setMode('craft')} />
        </div>
      )}

      <FloatingChat />

      {openBillId && (
        <BillDetailPanel
          billId={openBillId}
          onClose={() => setOpenBillId(null)}
          onAnalyze={(briefId) => { setLastBrief(briefId); setMode('party'); }}
        />
      )}
    </div>
  );
}
