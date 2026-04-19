// POST /api/legislative/pull-brief  { scope?, state_code? }
// scope ∈ { "federal", "state-{XX}", "local" }
// Federal  → Congress.gov /v3/bill/119
// State    → OpenStates /v3/bills?jurisdiction={state_code}
// Local    → pulls the caller's uploaded local legislation rows
//
// Each scope gets its own latest snapshot row (legislative_intel_snapshots.scope).
// Delta computation runs against the previous snapshot of the same scope.
import { getSessionUser, json, generateId } from '../_utils';
import { requirePageAccess, writeAudit, AccessError } from '../../../src/auth-utils';

interface SnapshotRow {
  id: string;
  user_id: string;
  snapshot_type: string;
  party_focus_data: any;
  hot_bills_data: any[];
  anomaly_alerts: any[];
  crossover_votes: any[];
  delta_summary: string | null;
  has_meaningful_delta: number;
  pulled_at: number;
  previous_snapshot_id: string | null;
  scope?: string;
  scope_config?: any;
}

function safeParse<T>(v: any, d: T): T {
  if (typeof v !== 'string') return (v ?? d) as T;
  try { return JSON.parse(v); } catch { return d; }
}

// ── Federal (Congress.gov) ────────────────────────────────────────────────
async function fetchFederalBills(env: any): Promise<any[]> {
  const apiKey = env.CONGRESS_API_KEY;
  if (!apiKey) { console.log('[pull-brief/federal] CONGRESS_API_KEY not set'); return []; }
  const url = `https://api.congress.gov/v3/bill/119?api_key=${apiKey}&format=json&limit=20&sort=updateDate+desc`;
  try {
    const res = await fetch(url);
    const body = await res.text();
    console.log(`[pull-brief/federal] status=${res.status} body_prefix="${body.slice(0, 500)}"`);
    if (!res.ok) return [];
    let data: any; try { data = JSON.parse(body); } catch { return []; }
    const bills = Array.isArray(data?.bills) ? data.bills : [];
    return bills.map((b: any) => ({
      bill_id: `${b.congress}-${String(b.type || '').toLowerCase()}-${b.number}`,
      congress: b.congress,
      bill_type: b.type,
      bill_number: String(b.number),
      title: b.title || '(untitled)',
      sponsor_bioguide_id: b.sponsors?.[0]?.bioguideId || null,
      sponsor_name: b.sponsors?.[0]?.fullName || null,
      sponsor_party: b.sponsors?.[0]?.party || null,
      sponsor_state: b.sponsors?.[0]?.state || null,
      status: b.latestAction?.text || null,
      introduced_date: b.introducedDate || null,
      last_action: b.latestAction?.text || null,
      last_action_date: b.latestAction?.actionDate || null,
    }));
  } catch (e) { console.error('[pull-brief/federal] threw:', e); return []; }
}

// ── State (OpenStates) ────────────────────────────────────────────────────
async function fetchStateBills(env: any, stateCode: string): Promise<any[]> {
  const apiKey = env.OPENSTATES_API_KEY;
  if (!apiKey) { console.log('[pull-brief/state] OPENSTATES_API_KEY not set'); return []; }
  const code = stateCode.toLowerCase();
  const url = `https://v3.openstates.org/bills?jurisdiction=${encodeURIComponent(code)}&sort=updated_desc&per_page=20`;
  try {
    const res = await fetch(url, { headers: { 'X-API-KEY': apiKey } });
    const body = await res.text();
    console.log(`[pull-brief/state=${stateCode}] status=${res.status} body_prefix="${body.slice(0, 500)}"`);
    if (!res.ok) return [];
    let data: any; try { data = JSON.parse(body); } catch { return []; }
    const results = Array.isArray(data?.results) ? data.results : [];
    return results.map((b: any) => ({
      bill_id: `state-${code}-${b.identifier || b.id}`,
      congress: 0,
      bill_type: 'state',
      bill_number: String(b.identifier || b.id || ''),
      title: b.title || '(untitled)',
      sponsor_bioguide_id: null,
      sponsor_name: b.sponsorships?.[0]?.name || b.sponsors?.[0]?.name || null,
      sponsor_party: null,
      sponsor_state: stateCode.toUpperCase(),
      status: b.latest_action?.description || b.current_status || null,
      introduced_date: b.first_action_date || null,
      last_action: b.latest_action?.description || null,
      last_action_date: b.updated_at || b.latest_action_date || null,
    }));
  } catch (e) { console.error('[pull-brief/state] threw:', e); return []; }
}

// ── Local (uploaded ordinances) ────────────────────────────────────────────
async function fetchLocalBills(env: any): Promise<any[]> {
  try {
    const { results } = await env.submoacontent_db
      .prepare(`SELECT bill_id, congress, bill_type, bill_number, title, sponsor_name,
                       sponsor_party, sponsor_state, status, introduced_date,
                       last_action, last_action_date
                FROM legislation WHERE bill_type = 'local' ORDER BY updated_at DESC LIMIT 20`)
      .all();
    return results || [];
  } catch { return []; }
}

async function cacheBill(env: any, b: any) {
  try {
    await env.submoacontent_db.prepare(
      `INSERT INTO legislation (id, bill_id, congress, bill_type, bill_number, title,
        sponsor_bioguide_id, sponsor_name, sponsor_party, sponsor_state, status,
        introduced_date, last_action, last_action_date, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
       ON CONFLICT(bill_id) DO UPDATE SET
         title = excluded.title, status = excluded.status,
         last_action = excluded.last_action,
         last_action_date = excluded.last_action_date,
         sponsor_party = excluded.sponsor_party, updated_at = unixepoch()`
    ).bind(
      generateId(), b.bill_id, b.congress, b.bill_type, b.bill_number, b.title,
      b.sponsor_bioguide_id, b.sponsor_name, b.sponsor_party, b.sponsor_state,
      b.status, b.introduced_date, b.last_action, b.last_action_date,
    ).run();
  } catch (e) { console.error('[pull-brief] cache upsert failed:', b.bill_id, e); }
}

// Radar topic extraction — subjects first, then title keyword sweep.
// Falls back to scanning the fresh bill list when the cache is empty so the
// section is never blank on the first pull of the day.
async function buildFocus(env: any, freshFallback: any[] = []): Promise<{ R: any; D: any; I: any }> {
  const { results } = await env.submoacontent_db
    .prepare(`SELECT sponsor_party, subjects, title FROM legislation WHERE sponsor_party IS NOT NULL`)
    .all();
  const KEYWORDS = [
    'defense', 'border', 'tax', 'healthcare', 'climate', 'energy',
    'education', 'immigration', 'infrastructure', 'agriculture', 'trade',
    'veteran', 'social security', 'medicare', 'medicaid', 'firearm',
    'second amendment', 'voting', 'election', 'judicial', 'crime',
    'technology', 'privacy', 'budget', 'appropriation',
  ];
  const agg: Record<string, Record<string, number>> = { R: {}, D: {}, I: {} };

  const consume = (row: any) => {
    const party = String(row.sponsor_party || 'I').slice(0, 1).toUpperCase();
    if (!(party in agg)) return;
    const subj = safeParse<string[]>(row.subjects, []);
    if (subj.length > 0) {
      for (const s of subj) agg[party][s] = (agg[party][s] || 0) + 1;
    } else {
      const t = String(row.title || '').toLowerCase();
      for (const kw of KEYWORDS) {
        if (t.includes(kw)) {
          const label = kw.charAt(0).toUpperCase() + kw.slice(1);
          agg[party][label] = (agg[party][label] || 0) + 1;
        }
      }
    }
  };

  const cached = results || [];
  for (const row of cached) consume(row);

  // If the cache is empty (first-ever pull), fall back to the freshly-fetched
  // bills so the section has something to show.
  const totalCached = Object.values(agg).reduce((n, o) => n + Object.keys(o).length, 0);
  if (totalCached === 0 && freshFallback.length > 0) {
    for (const b of freshFallback) consume({ sponsor_party: b.sponsor_party, subjects: null, title: b.title });
  }

  const topN = (obj: Record<string, number>) =>
    Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([topic, count]) => ({ topic, count }));
  return { R: topN(agg.R || {}), D: topN(agg.D || {}), I: topN(agg.I || {}) };
}

function computeDelta(prev: SnapshotRow | null, nextHot: any[]) {
  if (!prev) return { has_meaningful_delta: 1, summary: 'First snapshot for this scope — establishing baseline.' };
  const prevHot = new Set((prev.hot_bills_data || []).map((b: any) => b.bill_id));
  const newBills = nextHot.filter(b => !prevHot.has(b.bill_id));
  const stageChanges = nextHot.filter(b => {
    const p = (prev.hot_bills_data || []).find((x: any) => x.bill_id === b.bill_id);
    return p && p.status !== b.status;
  });
  const meaningful = newBills.length > 0 || stageChanges.length > 0;
  const parts: string[] = [];
  if (newBills.length) parts.push(`${newBills.length} new bill${newBills.length === 1 ? '' : 's'} surfaced.`);
  if (stageChanges.length) parts.push(`${stageChanges.length} bill${stageChanges.length === 1 ? '' : 's'} advanced stage.`);
  if (!meaningful) parts.push('No significant shifts since last pull.');
  return { has_meaningful_delta: meaningful ? 1 : 0, summary: parts.join(' ') };
}

export async function onRequest(context: { request: Request; env: any }) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);
  try { await requirePageAccess(user, env, 'legislative-intelligence', 'pull-brief'); }
  catch (e: any) { return json({ error: e.message }, e instanceof AccessError ? e.status : 403); }

  let body: any = {};
  try { body = await request.json(); } catch {}
  const scopeRaw = String(body.scope || 'federal').toLowerCase();
  const stateCode = String(body.state_code || '').toUpperCase();

  let scope: string = 'federal';
  let fresh: any[] = [];
  if (scopeRaw.startsWith('state-') && /^[A-Z]{2}$/.test(scopeRaw.slice(6).toUpperCase())) {
    scope = `state-${scopeRaw.slice(6).toUpperCase()}`;
    fresh = await fetchStateBills(env, scopeRaw.slice(6));
  } else if (scopeRaw === 'state' && stateCode) {
    scope = `state-${stateCode}`;
    fresh = await fetchStateBills(env, stateCode);
  } else if (scopeRaw === 'local') {
    scope = 'local';
    fresh = await fetchLocalBills(env);
  } else {
    scope = 'federal';
    fresh = await fetchFederalBills(env);
  }

  // Cache upserts (skip for local since rows already live in the table).
  if (scope !== 'local') {
    for (const b of fresh) await cacheBill(env, b);
  }

  // Previous snapshot for THIS scope
  const prev: any = await env.submoacontent_db
    .prepare('SELECT * FROM legislative_intel_snapshots WHERE user_id = ? AND scope = ? ORDER BY pulled_at DESC LIMIT 1')
    .bind(user.id, scope).first();
  const prevSnap: SnapshotRow | null = prev ? {
    ...prev,
    party_focus_data: safeParse(prev.party_focus_data, {}),
    hot_bills_data: safeParse<any[]>(prev.hot_bills_data, []),
    anomaly_alerts: safeParse<any[]>(prev.anomaly_alerts, []),
    crossover_votes: safeParse<any[]>(prev.crossover_votes, []),
  } : null;

  const focus = await buildFocus(env, fresh);
  const hot = fresh.slice(0, 8).map(b => ({
    bill_id: b.bill_id, title: b.title, sponsor_name: b.sponsor_name,
    sponsor_party: b.sponsor_party, status: b.status, last_action_date: b.last_action_date,
  }));

  // Anomaly detection — broadened. Previously only caught withdraw/fail/defeat/
  // reject language, which rarely matched freshly-pulled bills and left the
  // section empty. Now we also look for procedural landmarks (cloture, veto,
  // unanimous consent, engrossed, enrolled), abnormally fast action cycles,
  // and status-change velocity.
  const anomalies: any[] = [];
  const STATUS_PATTERNS: Array<{ re: RegExp; type: string; note: (m: string) => string }> = [
    { re: /withdraw|fail|defeat|reject/i, type: 'status_negative', note: s => `Bill hit negative status: ${s}` },
    { re: /cloture/i,                     type: 'procedural_cloture', note: s => `Cloture procedure: ${s}` },
    { re: /veto/i,                        type: 'procedural_veto', note: s => `Veto-related action: ${s}` },
    { re: /unanimous consent/i,           type: 'procedural_unanimous', note: s => `Unanimous consent: ${s}` },
    { re: /engrossed|enrolled/i,          type: 'procedural_advanced', note: s => `Advanced procedural stage: ${s}` },
    { re: /became public law|signed by president/i, type: 'became_law', note: s => `Became law: ${s}` },
  ];
  for (const b of fresh) {
    const st = String(b.status || '');
    for (const p of STATUS_PATTERNS) {
      if (p.re.test(st)) { anomalies.push({ type: p.type, bill_id: b.bill_id, title: b.title, note: p.note(st) }); break; }
    }
  }
  // Velocity anomalies — bills with last_action_date within 48h of introduced_date
  // suggest fast-track movement.
  for (const b of fresh) {
    if (!b.introduced_date || !b.last_action_date || b.introduced_date === b.last_action_date) continue;
    const introduced = Date.parse(b.introduced_date);
    const acted = Date.parse(b.last_action_date);
    if (!Number.isFinite(introduced) || !Number.isFinite(acted)) continue;
    const hours = (acted - introduced) / (1000 * 60 * 60);
    if (hours > 0 && hours < 48) {
      anomalies.push({ type: 'velocity', bill_id: b.bill_id, title: b.title, note: `Advanced within ${Math.round(hours)}h of introduction` });
    }
  }

  const crossovers: any[] = [];
  const rKW = /(border|tax cut|second amendment|defense|energy)/i;
  const dKW = /(climate|medicare|student loan|equity|voting rights)/i;
  for (const b of fresh) {
    const title = String(b.title || '');
    if (b.sponsor_party?.startsWith?.('D') && rKW.test(title)) {
      crossovers.push({ bill_id: b.bill_id, title, sponsor_party: b.sponsor_party, note: 'D sponsor, R-coded topic' });
    } else if (b.sponsor_party?.startsWith?.('R') && dKW.test(title)) {
      crossovers.push({ bill_id: b.bill_id, title, sponsor_party: b.sponsor_party, note: 'R sponsor, D-coded topic' });
    }
  }

  // Fallback: if nothing triggered any anomaly pattern, surface the top
  // crossover pattern as a single anomaly so the UI section is never empty.
  // If crossovers are also empty, return a single informational row so the
  // UI can render "No unusual patterns detected today" verbatim.
  if (anomalies.length === 0) {
    if (crossovers.length > 0) {
      anomalies.push({ type: 'crossover_fallback', bill_id: crossovers[0].bill_id, title: crossovers[0].title, note: crossovers[0].note });
    } else {
      anomalies.push({ type: 'none', bill_id: null, title: null, note: 'No unusual patterns detected today' });
    }
  }

  // Log counts so future empty-sections are diagnosable.
  const focusCounts = { R: (focus.R || []).length, D: (focus.D || []).length };
  console.log(`[pull-brief] scope=${scope} bills=${fresh.length} focus_R=${focusCounts.R} focus_D=${focusCounts.D} anomalies=${anomalies.length} crossovers=${crossovers.length}`);

  const { has_meaningful_delta, summary } = computeDelta(prevSnap, hot);

  const id = generateId();
  await env.submoacontent_db.prepare(
    `INSERT INTO legislative_intel_snapshots
      (id, user_id, snapshot_type, scope, scope_config, party_focus_data, hot_bills_data,
       anomaly_alerts, crossover_votes, delta_summary, has_meaningful_delta, pulled_at, previous_snapshot_id)
     VALUES (?, ?, 'morning_brief', ?, ?, ?, ?, ?, ?, ?, ?, unixepoch(), ?)`
  ).bind(
    id, user.id, scope,
    JSON.stringify({ state_code: stateCode || null, scope_raw: scopeRaw }),
    JSON.stringify(focus),
    JSON.stringify(hot),
    JSON.stringify(anomalies),
    JSON.stringify(crossovers),
    summary,
    has_meaningful_delta,
    prevSnap?.id || null,
  ).run();

  await writeAudit(env, request, user.id, { action: 'snapshot-pulled', details: { id, scope, has_meaningful_delta, count: fresh.length } });

  const saved = await env.submoacontent_db
    .prepare('SELECT * FROM legislative_intel_snapshots WHERE id = ?')
    .bind(id).first();
  return json({
    ...saved,
    party_focus_data: safeParse((saved as any).party_focus_data, {}),
    hot_bills_data: safeParse((saved as any).hot_bills_data, []),
    anomaly_alerts: safeParse((saved as any).anomaly_alerts, []),
    crossover_votes: safeParse((saved as any).crossover_votes, []),
    scope_config: safeParse((saved as any).scope_config, {}),
  });
}
