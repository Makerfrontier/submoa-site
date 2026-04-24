// Podcast Studio — series list / series detail / episode creation / episode detail.
// Route bases: /podcast-studio, /podcast-studio/:id, /podcast-studio/:id/new-episode,
//              /podcast-studio/:id/episode/:episode_id
// All four mount this one component and route internally.

import { useState, useEffect, useMemo } from 'react';
import { XAI_VOICES } from '../xai-tts';
import ConfirmModal from '../components/ConfirmModal.jsx';

// Narrow-viewport detector. At <768px the two-column editor layout swaps to
// a stacked-column flow so the canvas (right pane) is never obstructed by
// the sidebar accordion — fixes the mobile navigation-obstruction bug.
function useIsMobile() {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  useEffect(() => {
    const onResize = () => setM(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return m;
}

// Shared responsive shell style builders. Each sub-view threads the width of
// its left pane so desktop layout is unchanged.
function outerShellStyle(isMobile) {
  return {
    display: 'flex',
    flexDirection: isMobile ? 'column' : 'row',
    minHeight: 'calc(100vh - 60px)',
    background: 'var(--bg)',
  };
}
function sidebarShellStyle(isMobile, desktopWidth) {
  return isMobile
    ? {
        width: '100%', flexShrink: 0,
        borderBottom: '1px solid var(--border)',
        background: 'var(--card)', padding: '16px 16px 8px',
        maxHeight: '55vh', overflowY: 'auto',
      }
    : {
        width: desktopWidth, flexShrink: 0,
        borderRight: '1px solid var(--border)',
        background: 'var(--card)', padding: '24px 20px',
        overflowY: 'auto', maxHeight: 'calc(100vh - 60px)',
      };
}
function canvasShellStyle(isMobile) {
  return isMobile
    ? { flex: 1, padding: 16, overflowY: 'auto' }
    : { flex: 1, padding: 40, overflowY: 'auto', maxHeight: 'calc(100vh - 60px)' };
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `API ${res.status}`);
  return data;
}

const eyebrowStyle = {
  fontFamily: 'DM Sans', fontWeight: 600, fontSize: 11, lineHeight: 1.2,
  letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--amber)',
};
const h1Style = {
  fontFamily: 'var(--font-sans)', fontSize: 28, fontWeight: 500, lineHeight: 1.2,
  letterSpacing: '-0.01em', color: 'var(--ink)', margin: 0,
};

const VOICE_COLORS = { eve: '#C8582A', ara: '#B8872E', rex: '#2B4030', sal: '#2A5A6A', leo: '#3A2410' };

// Segment speaker tints (deep teal range) — 5 slots
const SPEAKER_TINTS = [
  'rgba(42, 90, 106, 0.14)',
  'rgba(61, 90, 62, 0.14)',
  'rgba(184, 135, 46, 0.14)',
  'rgba(58, 36, 16, 0.14)',
  'rgba(107, 87, 68, 0.14)',
];

const POSITION_PRESETS = [
  { id: 'agrees', label: 'Agrees' },
  { id: 'disagrees', label: 'Disagrees' },
  { id: 'skeptical', label: 'Skeptical' },
  { id: 'devils_advocate', label: "Devil's Advocate" },
  { id: 'curious_moderator', label: 'Curious Moderator' },
  { id: 'expert', label: 'Expert' },
  { id: 'outsider', label: 'Outsider' },
  { id: 'storyteller', label: 'Storyteller' },
  { id: 'comic_relief', label: 'Comic Relief' },
  { id: 'interviewer', label: 'Interviewer' },
  { id: 'pragmatist', label: 'Pragmatist' },
  { id: 'idealist', label: 'Idealist' },
  { id: 'historian', label: 'Historian' },
  { id: 'futurist', label: 'Futurist' },
  { id: 'provocateur', label: 'Provocateur' },
  { id: 'mediator', label: 'Mediator' },
  { id: 'personal_stake', label: 'Personal Stakeholder' },
  { id: 'academic', label: 'Academic' },
  { id: 'industry_insider', label: 'Industry Insider' },
  { id: 'critic', label: 'Critic' },
];

// Parse the App.jsx `page` string into a view + params.
function parseRoute(path) {
  // /podcast-studio
  // /podcast-studio/new-one-off                          ← NEW single-screen one-off flow
  // /podcast-studio/one-off/{episode_id}                 ← NEW one-off detail (direct deep link)
  // /podcast-studio/{id}                                 ← series wrapper (ongoing series only; one-offs auto-redirect)
  // /podcast-studio/{id}/new-episode
  // /podcast-studio/{id}/episode/{ep_id}
  const segs = path.split('/').filter(Boolean);
  if (segs.length === 1) return { view: 'series_list' };
  if (segs[1] === 'new-one-off') return { view: 'one_off_create' };
  if (segs[1] === 'one-off' && segs[2]) return { view: 'one_off_detail', episodeId: segs[2] };
  const seriesId = segs[1];
  if (segs.length === 2) return { view: 'series_detail', seriesId };
  if (segs[2] === 'new-episode') return { view: 'episode_new', seriesId };
  if (segs[2] === 'episode' && segs[3]) return { view: 'episode_detail', seriesId, episodeId: segs[3] };
  return { view: 'series_detail', seriesId };
}

export default function PodcastStudio({ page, navigate }) {
  const route = useMemo(() => parseRoute(page || '/podcast-studio'), [page]);

  if (route.view === 'series_list') return <SeriesList navigate={navigate} />;
  if (route.view === 'one_off_create') return <OneOff episodeId={null} navigate={navigate} />;
  if (route.view === 'one_off_detail') return <OneOff episodeId={route.episodeId} navigate={navigate} />;
  if (route.view === 'series_detail') return <SeriesDetail seriesId={route.seriesId} navigate={navigate} />;
  if (route.view === 'episode_new') return <EpisodeEditor seriesId={route.seriesId} episodeId={null} navigate={navigate} />;
  if (route.view === 'episode_detail') return <EpisodeEditor seriesId={route.seriesId} episodeId={route.episodeId} navigate={navigate} />;
  return null;
}

// ─── SERIES LIST ───────────────────────────────────────────────────────────
function SeriesList({ navigate }) {
  const [podcasts, setPodcasts] = useState([]);
  const [open, setOpen] = useState({ filters: true, series: true, create: true });
  const [filter, setFilter] = useState({ series_type: '', status: 'active', sort: 'updated' });
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const isMobile = useIsMobile();

  useEffect(() => { api('/api/podcasts').then(d => setPodcasts(d.podcasts || [])).catch(e => setToast(e.message)); }, []);

  const filtered = useMemo(() => {
    let list = podcasts;
    if (filter.status) list = list.filter(p => p.status === filter.status);
    return [...list].sort((a, b) => filter.sort === 'name' ? a.name.localeCompare(b.name) : (b.updated_at || 0) - (a.updated_at || 0));
  }, [podcasts, filter]);
  const seriesItems = useMemo(() => filtered.filter(p => p.series_type === 'ongoing'), [filtered]);
  const oneOffItems = useMemo(() => filtered.filter(p => p.series_type === 'one_off'), [filtered]);

  const createSeries = async () => {
    const name = prompt('Series name:', '');
    if (!name?.trim()) return;
    setBusy(true);
    try {
      const r = await api('/api/podcasts', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), series_type: 'ongoing' }),
      });
      navigate(`/podcast-studio/${r.id}`);
    } catch (e) { setToast(e.message); }
    setBusy(false);
  };

  return (
    <div style={outerShellStyle(isMobile)}>
      <div style={sidebarShellStyle(isMobile, 340)}>
        <div style={eyebrowStyle}>✦ PODCAST STUDIO</div>
        <h1 style={{ ...h1Style, marginTop: 6 }}>All Series</h1>

        <AccordionSection label="FILTERS" open={open.filters} onToggle={() => setOpen(o => ({ ...o, filters: !o.filters }))}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <LabeledSelect label="series type" value={filter.series_type} onChange={v => setFilter(f => ({ ...f, series_type: v }))}
              options={[['', 'all'], ['ongoing', 'ongoing'], ['one_off', 'one-off']]} />
            <LabeledSelect label="status" value={filter.status} onChange={v => setFilter(f => ({ ...f, status: v }))}
              options={[['', 'all'], ['active', 'active'], ['archived', 'archived']]} />
            <LabeledSelect label="sort" value={filter.sort} onChange={v => setFilter(f => ({ ...f, sort: v }))}
              options={[['updated', 'recent'], ['name', 'name']]} />
          </div>
        </AccordionSection>

        <AccordionSection label="CREATE" open={open.create} onToggle={() => setOpen(o => ({ ...o, create: !o.create }))}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button onClick={createSeries} disabled={busy} style={{ ...primaryBtnStyle }}>+ New Series</button>
            <button onClick={() => navigate('/podcast-studio/new-one-off')} style={{ ...secondaryBtnStyle }}>+ New One-Off Episode</button>
          </div>
        </AccordionSection>

        <AccordionSection label="LIBRARY" open={true} onToggle={() => {}}>
          <button onClick={() => navigate('/admin/hosts')} style={secondaryBtnStyle}>→ Hosts admin</button>
        </AccordionSection>

        {toast && <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--amber)', color: 'var(--card)', fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, borderRadius: 4 }}>{toast}</div>}
      </div>

      <div style={canvasShellStyle(isMobile)}>
        <div style={{ maxWidth: 1100, display: 'flex', flexDirection: 'column', gap: 32 }}>
          <div>
            <div style={eyebrowStyle}>SERIES · {seriesItems.length}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginTop: 12 }}>
              {seriesItems.map(p => (
                <SeriesTile key={p.id} series={p} onOpen={() => navigate(`/podcast-studio/${p.id}`)} />
              ))}
              {seriesItems.length === 0 && (
                <div style={{ color: 'var(--text-mid)', fontFamily: 'DM Sans' }}>No series yet. Use + New Series on the left for a show with multiple episodes.</div>
              )}
            </div>
          </div>

          <div>
            <div style={eyebrowStyle}>ONE-OFFS · {oneOffItems.length}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginTop: 12 }}>
              {oneOffItems.map(p => (
                <OneOffTile key={p.id} podcast={p} navigate={navigate} />
              ))}
              {oneOffItems.length === 0 && (
                <div style={{ color: 'var(--text-mid)', fontFamily: 'DM Sans' }}>No one-offs yet. Use + New One-Off Episode on the left — single-page flow.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// One-off tile — resolves episode_id lazily (click handler fetches if missing),
// so the tile itself doesn't need to embed the episode. Most of the time the
// parent podcast row already has episode_count=1 so the single child is
// discoverable via /api/podcasts/:id.
function OneOffTile({ podcast, navigate }) {
  const [busy, setBusy] = useState(false);
  const voices = (podcast.voice_ids || '').split(',').filter(Boolean);
  const hostNames = (podcast.host_names || '').split('|').filter(Boolean);
  const open = async () => {
    setBusy(true);
    try {
      const d = await api(`/api/podcasts/${podcast.id}`);
      const ep = (d.episodes || [])[0];
      if (ep) navigate(`/podcast-studio/one-off/${ep.id}`);
      else navigate('/podcast-studio/new-one-off'); // orphan one-off — send to fresh form
    } catch { navigate(`/podcast-studio/${podcast.id}`); /* graceful fallback */ }
    setBusy(false);
  };
  return (
    <button onClick={open} disabled={busy} style={{ textAlign: 'left', background: 'var(--card)', border: '2px solid var(--podcast-teal)', borderRadius: 8, padding: 16, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6, opacity: busy ? 0.7 : 1 }}>
      <div style={{ ...eyebrowStyle, color: 'var(--podcast-teal)' }}>PODCAST</div>
      <h4 style={{ fontFamily: 'DM Sans', fontSize: 18, fontWeight: 600, color: 'var(--text)', margin: 0 }}>{podcast.name}</h4>
      {podcast.description && <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text-mid)' }}>{podcast.description.slice(0, 140)}{podcast.description.length > 140 ? '…' : ''}</div>}
      <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
        {voices.slice(0, 5).map((v, i) => (
          <div key={i} style={{ width: 20, height: 20, borderRadius: '50%', background: VOICE_COLORS[v] || 'var(--text-light)', border: '1px solid var(--card)', marginLeft: i === 0 ? 0 : -6 }} title={hostNames[i] || v} />
        ))}
        <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text-mid)', marginLeft: 8, alignSelf: 'center' }}>
          {voices.length} host{voices.length !== 1 ? 's' : ''}
        </span>
      </div>
    </button>
  );
}

function SeriesTile({ series, onOpen }) {
  const voices = (series.voice_ids || '').split(',').filter(Boolean);
  const hostNames = (series.host_names || '').split('|').filter(Boolean);
  return (
    <button onClick={onOpen} style={{ textAlign: 'left', background: 'var(--card)', border: '2px solid var(--podcast-teal)', borderRadius: 8, padding: 16, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ ...eyebrowStyle, color: 'var(--podcast-teal)' }}>{series.series_type === 'ongoing' ? 'PODCAST SERIES' : 'PODCAST'}</div>
      <h4 style={{ fontFamily: 'DM Sans', fontSize: 18, fontWeight: 600, color: 'var(--text)', margin: 0 }}>{series.name}</h4>
      {series.description && <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text-mid)' }}>{series.description}</div>}
      <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
        {voices.slice(0, 5).map((v, i) => (
          <div key={i} style={{ width: 20, height: 20, borderRadius: '50%', background: VOICE_COLORS[v] || 'var(--text-light)', border: '1px solid var(--card)', marginLeft: i === 0 ? 0 : -6 }} title={hostNames[i] || v} />
        ))}
        <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text-mid)', marginLeft: 8, alignSelf: 'center' }}>
          {voices.length} host{voices.length !== 1 ? 's' : ''} · {series.episode_count || 0} ep{(series.episode_count || 0) !== 1 ? 's' : ''}
        </span>
      </div>
      {series.latest_episode_topic && (
        <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text-mid)', fontStyle: 'italic' }}>
          Latest: Ep {series.latest_episode_number} — {series.latest_episode_topic}
        </div>
      )}
    </button>
  );
}

// ─── SERIES DETAIL ─────────────────────────────────────────────────────────
function SeriesDetail({ seriesId, navigate }) {
  const [data, setData] = useState(null);
  const [allHosts, setAllHosts] = useState([]);
  const [open, setOpen] = useState({ meta: true, hosts: true, episodes: true, create: true });
  const [toast, setToast] = useState('');
  const [dirtyMeta, setDirtyMeta] = useState(false);
  const [meta, setMeta] = useState({ name: '', description: '', format_template: '', intro_text: '', outro_text: '' });
  const [confirmModal, setConfirmModal] = useState(null);
  const isMobile = useIsMobile();

  const load = async () => {
    const d = await api(`/api/podcasts/${seriesId}`);
    setData(d);
    setMeta({
      name: d.podcast.name || '', description: d.podcast.description || '',
      format_template: d.podcast.format_template || '',
      intro_text: d.podcast.intro_text || '', outro_text: d.podcast.outro_text || '',
    });
    setDirtyMeta(false);
  };
  useEffect(() => { load().catch(e => setToast(e.message)); api('/api/admin/hosts').then(d => setAllHosts(d.hosts || [])).catch(() => {}); }, [seriesId]);

  // Deprecated path: visiting /podcast-studio/{id} for a one-off podcast
  // redirects to the single-page one-off detail so the series wrapper is
  // never shown for one-offs.
  useEffect(() => {
    if (!data?.podcast) return;
    if (data.podcast.series_type !== 'one_off') return;
    const firstEp = (data.episodes || [])[0];
    if (firstEp?.id) navigate(`/podcast-studio/one-off/${firstEp.id}`);
    else navigate('/podcast-studio/new-one-off');
  }, [data, navigate]);

  const saveMeta = async () => {
    try { await api(`/api/podcasts/${seriesId}`, { method: 'PATCH', body: JSON.stringify(meta) }); await load(); } catch (e) { setToast(e.message); }
  };
  const addHost = async (hostId) => {
    try { await api(`/api/podcasts/${seriesId}/hosts`, { method: 'POST', body: JSON.stringify({ host_id: hostId }) }); await load(); } catch (e) { setToast(e.message); }
  };
  const removeHost = (hostId) => {
    const host = (data?.hosts || []).find(h => h.host_id === hostId);
    setConfirmModal({
      title: 'Remove host from series?',
      message: host ? `"${host.name}" will no longer appear in new episodes of this series. Existing episodes keep them in their segments.` : 'This host will no longer appear in new episodes of this series.',
      confirmLabel: 'Remove',
      variant: 'destructive',
      onConfirm: async () => {
        try { await api(`/api/podcasts/${seriesId}/hosts/${hostId}`, { method: 'DELETE' }); await load(); } catch (e) { setToast(e.message); }
      },
    });
  };
  const createEpisode = async () => {
    const topic = prompt('Episode topic:');
    if (!topic?.trim()) return;
    try {
      const r = await api(`/api/podcasts/${seriesId}/episodes`, { method: 'POST', body: JSON.stringify({ topic: topic.trim() }) });
      navigate(`/podcast-studio/${seriesId}/episode/${r.id}`);
    } catch (e) { setToast(e.message); }
  };

  if (!data) return <div style={{ padding: 40, fontFamily: 'DM Sans', color: 'var(--text-mid)' }}>Loading…</div>;
  const availableHosts = allHosts.filter(h => !(data.hosts || []).some(ph => ph.host_id === h.id));

  return (
    <div style={outerShellStyle(isMobile)}>
      <div style={sidebarShellStyle(isMobile, 380)}>
        <button onClick={() => navigate('/podcast-studio')} style={{ ...secondaryBtnStyle, marginBottom: 10 }}>← All series</button>
        <div style={eyebrowStyle}>✦ {data.podcast.series_type === 'ongoing' ? 'SERIES' : 'ONE-OFF'}</div>

        <AccordionSection label="SERIES META" open={open.meta} onToggle={() => setOpen(o => ({ ...o, meta: !o.meta }))}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input value={meta.name} onChange={e => { setMeta(m => ({ ...m, name: e.target.value })); setDirtyMeta(true); }} placeholder="Name" style={textareaStyle} />
            <textarea value={meta.description} onChange={e => { setMeta(m => ({ ...m, description: e.target.value })); setDirtyMeta(true); }} rows={3} placeholder="Description / tagline" style={textareaStyle} />
            <textarea value={meta.format_template} onChange={e => { setMeta(m => ({ ...m, format_template: e.target.value })); setDirtyMeta(true); }} rows={4} placeholder="Format template (e.g. 'X opens with a story, Y asks the dumb question...')" style={textareaStyle} />
            <textarea value={meta.intro_text} onChange={e => { setMeta(m => ({ ...m, intro_text: e.target.value })); setDirtyMeta(true); }} rows={2} placeholder="Fixed intro text (optional)" style={textareaStyle} />
            <textarea value={meta.outro_text} onChange={e => { setMeta(m => ({ ...m, outro_text: e.target.value })); setDirtyMeta(true); }} rows={2} placeholder="Fixed outro text (optional)" style={textareaStyle} />
            <button onClick={saveMeta} disabled={!dirtyMeta} style={{ ...primaryBtnStyle, opacity: dirtyMeta ? 1 : 0.5 }}>{dirtyMeta ? 'Save meta' : 'Saved'}</button>
          </div>
        </AccordionSection>

        <AccordionSection label={`HOSTS (${(data.hosts || []).length})`} open={open.hosts} onToggle={() => setOpen(o => ({ ...o, hosts: !o.hosts }))}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(data.hosts || []).map(h => (
              <div key={h.host_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 6, border: '1px solid var(--border-light)', borderRadius: 4 }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: VOICE_COLORS[h.voice_id] || 'var(--amber)', color: 'var(--card)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 600 }}>{h.name.charAt(0)}</div>
                <div style={{ flex: 1, fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text)' }}>{h.name} <span style={{ color: 'var(--text-mid)', fontSize: 11 }}>· {h.voice_id}</span></div>
                <button onClick={() => removeHost(h.host_id)} style={{ ...resetBtnStyle }}>remove</button>
              </div>
            ))}
            {availableHosts.length > 0 && (
              <select onChange={e => { if (e.target.value) { addHost(e.target.value); e.target.value = ''; } }} defaultValue="" style={{ ...textareaStyle, height: 'auto' }}>
                <option value="">+ Add host…</option>
                {availableHosts.map(h => <option key={h.id} value={h.id}>{h.name} ({h.voice_id})</option>)}
              </select>
            )}
          </div>
        </AccordionSection>

        <AccordionSection label={`EPISODES (${(data.episodes || []).length})`} open={open.episodes} onToggle={() => setOpen(o => ({ ...o, episodes: !o.episodes }))}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(data.episodes || []).map(ep => (
              <button key={ep.id} onClick={() => navigate(`/podcast-studio/${seriesId}/episode/${ep.id}`)}
                style={{ textAlign: 'left', padding: 8, border: '1px solid var(--border-light)', background: 'var(--card)', cursor: 'pointer', borderRadius: 4 }}>
                <div style={{ fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Ep {ep.episode_number} — {ep.topic}</div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--text-mid)' }}>{ep.status}{ep.audio_duration_seconds ? ` · ${formatDuration(ep.audio_duration_seconds)}` : ''}</div>
              </button>
            ))}
            <button onClick={createEpisode} style={{ ...primaryBtnStyle, marginTop: 4 }}>+ New Episode</button>
          </div>
        </AccordionSection>

        {toast && <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--amber)', color: 'var(--card)', fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, borderRadius: 4 }}>{toast}</div>}
      </div>

      <div style={canvasShellStyle(isMobile)}>
        <div style={{ maxWidth: 820 }}>
          <h1 style={h1Style}>{data.podcast.name}</h1>
          <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text-mid)', marginTop: 4 }}>
            {data.podcast.series_type} · {(data.hosts || []).length} hosts · {(data.episodes || []).length} episodes
          </div>
          {data.podcast.description && <p style={{ fontFamily: 'DM Sans', fontSize: 18, lineHeight: 1.55, color: 'var(--text-mid)', marginTop: 14 }}>{data.podcast.description}</p>}
        </div>
      </div>

      <ConfirmModal
        isOpen={!!confirmModal}
        title={confirmModal?.title}
        message={confirmModal?.message}
        confirmLabel={confirmModal?.confirmLabel}
        variant={confirmModal?.variant}
        onConfirm={() => { const m = confirmModal; setConfirmModal(null); m?.onConfirm?.(); }}
        onCancel={() => setConfirmModal(null)}
      />
    </div>
  );
}

// ─── EPISODE EDITOR (create + detail) ──────────────────────────────────────
function EpisodeEditor({ seriesId, episodeId, navigate }) {
  const [series, setSeries] = useState(null);
  const [ep, setEp] = useState(null);
  const [hosts, setHosts] = useState([]);
  const [allHosts, setAllHosts] = useState([]);
  const [topic, setTopic] = useState('');
  const [brief, setBrief] = useState('');
  const [hostRows, setHostRows] = useState([]);
  const [script, setScript] = useState([]);
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState('');
  const [open, setOpen] = useState({ topic: true, brief: false, hosts: true, generate: true });
  const [confirmModal, setConfirmModal] = useState(null);
  const isMobile = useIsMobile();

  const load = async () => {
    const s = await api(`/api/podcasts/${seriesId}`);
    setSeries(s);
    if (episodeId) {
      const e = await api(`/api/podcasts/${seriesId}/episodes/${episodeId}`);
      setEp(e.episode);
      setTopic(e.episode.topic || ''); setBrief(e.episode.brief || '');
      setScript(e.episode.script || []);
      setHostRows((e.hosts || []).map(h => ({
        host_id: h.host_id, name: h.name, voice_id: h.voice_id,
        position_preset: h.position_preset, position_direction: h.position_direction || '',
        speaker_order: h.speaker_order || 0,
      })));
    } else {
      // Creation mode — seed hostRows from series hosts
      setHostRows((s.hosts || []).map((h, i) => ({
        host_id: h.host_id, name: h.name, voice_id: h.voice_id,
        position_preset: 'curious_moderator', position_direction: '', speaker_order: i,
      })));
    }
    setHosts(s.hosts || []);
  };
  useEffect(() => { load().catch(e => setToast(e.message)); }, [seriesId, episodeId]);

  // Fetch the account's global hosts library so the episode editor can
  // populate its host picker even when this podcast has no podcast_hosts yet
  // (common for one-off podcasts created from /podcast-studio).
  useEffect(() => {
    api('/api/admin/hosts').then(d => setAllHosts(d.hosts || [])).catch(() => {});
  }, []);

  const addHostFromLibrary = (hostId) => {
    const host = allHosts.find(h => h.id === hostId);
    if (!host) return;
    if (hostRows.some(r => r.host_id === hostId)) { setToast('Host already in episode'); return; }
    setHostRows(rs => [...rs, {
      host_id: host.id, name: host.name, voice_id: host.voice_id,
      position_preset: 'curious_moderator', position_direction: '',
      speaker_order: rs.length,
    }]);
  };

  const saveDraft = async () => {
    const body = { topic, brief, episode_hosts: hostRows };
    try {
      if (!episodeId) {
        if (!topic.trim()) { setToast('Topic required'); return; }
        const r = await api(`/api/podcasts/${seriesId}/episodes`, { method: 'POST', body: JSON.stringify({ topic: topic.trim(), brief }) });
        await api(`/api/podcasts/${seriesId}/episodes/${r.id}`, { method: 'PATCH', body: JSON.stringify({ episode_hosts: hostRows }) });
        navigate(`/podcast-studio/${seriesId}/episode/${r.id}`);
      } else {
        await api(`/api/podcasts/${seriesId}/episodes/${episodeId}`, { method: 'PATCH', body: JSON.stringify(body) });
        setToast('Saved');
        setTimeout(() => setToast(''), 1500);
      }
    } catch (e) { setToast(e.message); }
  };

  const generateScript = async () => {
    if (!episodeId) { setToast('Save the draft first'); return; }
    setBusy('script');
    try {
      await api(`/api/podcasts/${seriesId}/episodes/${episodeId}`, { method: 'PATCH', body: JSON.stringify({ topic, brief, episode_hosts: hostRows }) });
      const r = await api(`/api/podcasts/${seriesId}/episodes/${episodeId}/generate-script`, { method: 'POST' });
      setScript(r.segments || []);
      setToast('Script generated');
      setTimeout(() => setToast(''), 2000);
    } catch (e) { setToast(e.message); }
    setBusy('');
  };

  const regenerateHost = (hostId) => {
    const host = hostRows.find(h => h.host_id === hostId);
    setConfirmModal({
      title: `Regenerate ${host?.name || 'this host'}'s lines?`,
      message: 'All other hosts\' segments stay byte-identical. Only this speaker\'s lines will be rewritten.',
      confirmLabel: 'Regenerate',
      onConfirm: async () => {
        setBusy('regen');
        try {
          const r = await api(`/api/podcasts/${seriesId}/episodes/${episodeId}/regenerate-host`, { method: 'POST', body: JSON.stringify({ host_id: hostId }) });
          setScript(r.segments || []);
          setToast('Lines regenerated');
          setTimeout(() => setToast(''), 2000);
        } catch (e) { setToast(e.message); }
        setBusy('');
      },
    });
  };

  const generateAudio = async () => {
    if (!episodeId) return;
    setBusy('audio');
    try {
      await api(`/api/podcasts/${seriesId}/episodes/${episodeId}/generate-audio`, { method: 'POST' });
      setToast('Audio job queued — check back in a minute');
      setTimeout(() => setToast(''), 3000);
      // Poll status occasionally
      setTimeout(async () => { try { const e = await api(`/api/podcasts/${seriesId}/episodes/${episodeId}`); setEp(e.episode); } catch {} }, 5000);
    } catch (e) { setToast(e.message); }
    setBusy('');
  };

  const speakerColor = (speakerId) => {
    const idx = hostRows.findIndex(h => h.host_id === speakerId);
    return SPEAKER_TINTS[idx % SPEAKER_TINTS.length];
  };

  if (!series) return <div style={{ padding: 40, fontFamily: 'DM Sans', color: 'var(--text-mid)' }}>Loading…</div>;

  const audioReady = ep?.status === 'audio_ready';

  return (
    <div style={outerShellStyle(isMobile)}>
      <div style={sidebarShellStyle(isMobile, 400)}>
        <button onClick={() => navigate(`/podcast-studio/${seriesId}`)} style={{ ...secondaryBtnStyle, marginBottom: 10 }}>← {series.podcast.name}</button>
        <div style={eyebrowStyle}>✦ {episodeId ? `EPISODE ${ep?.episode_number || ''}` : 'NEW EPISODE'}</div>

        <AccordionSection label="TOPIC" open={open.topic} onToggle={() => setOpen(o => ({ ...o, topic: !o.topic }))}>
          <input value={topic} onChange={e => setTopic(e.target.value)} placeholder="Short topic line" style={textareaStyle} />
        </AccordionSection>

        <AccordionSection label="BRIEF" open={open.brief} onToggle={() => setOpen(o => ({ ...o, brief: !o.brief }))}>
          <textarea value={brief} onChange={e => setBrief(e.target.value)} rows={5} placeholder="Optional longer direction" style={textareaStyle} />
        </AccordionSection>

        <AccordionSection label={`HOSTS (${hostRows.length})`} open={open.hosts} onToggle={() => setOpen(o => ({ ...o, hosts: !o.hosts }))}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {hostRows.length === 0 && (
              <div style={{ padding: 10, background: 'var(--surface-inp)', border: '1px dashed var(--border)', borderRadius: 4, fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text-mid)' }}>
                No hosts assigned yet. Pick from your library below.
                {' '}
                <button onClick={() => navigate('/admin/hosts')} style={{ padding: 0, background: 'transparent', border: 'none', color: 'var(--ink)', cursor: 'pointer', fontFamily: 'DM Sans', fontSize: 12, textDecoration: 'underline' }}>
                  Open Hosts admin
                </button>
              </div>
            )}
            {hostRows.map((h, idx) => (
              <div key={h.host_id} style={{ padding: 8, border: '1px solid var(--border-light)', borderRadius: 4, background: 'var(--surface-inp)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', background: VOICE_COLORS[h.voice_id] || 'var(--amber)', color: 'var(--card)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 600 }}>{h.name?.charAt(0)}</div>
                  <div style={{ flex: 1, fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600 }}>{h.name} <span style={{ color: 'var(--text-mid)', fontSize: 11, fontWeight: 400 }}>· {h.voice_id}</span></div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => setHostRows(rs => moveItem(rs, idx, -1))} disabled={idx === 0} style={{ ...resetBtnStyle, opacity: idx === 0 ? 0.4 : 1 }}>↑</button>
                    <button onClick={() => setHostRows(rs => moveItem(rs, idx, +1))} disabled={idx === hostRows.length - 1} style={{ ...resetBtnStyle, opacity: idx === hostRows.length - 1 ? 0.4 : 1 }}>↓</button>
                  </div>
                </div>
                <select value={h.position_preset} onChange={e => setHostRows(rs => rs.map((r, i) => i === idx ? { ...r, position_preset: e.target.value } : r))}
                  style={{ ...textareaStyle, height: 'auto', marginBottom: 6 }}>
                  {POSITION_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
                <textarea value={h.position_direction} onChange={e => setHostRows(rs => rs.map((r, i) => i === idx ? { ...r, position_direction: e.target.value } : r))}
                  rows={2} placeholder="Optional: extra position direction" style={textareaStyle} />
              </div>
            ))}

            {/* Host picker — always show if there are library hosts not yet in
                the episode. Critical for one-off podcasts where the series
                has no podcast_hosts to pre-populate from. */}
            {(() => {
              const available = allHosts.filter(h => !hostRows.some(r => r.host_id === h.id));
              if (available.length === 0) return null;
              return (
                <select
                  onChange={e => { if (e.target.value) { addHostFromLibrary(e.target.value); e.target.value = ''; } }}
                  defaultValue=""
                  style={{ ...textareaStyle, height: 'auto' }}
                >
                  <option value="">+ Add host from library…</option>
                  {available.map(h => <option key={h.id} value={h.id}>{h.name} ({h.voice_id})</option>)}
                </select>
              );
            })()}
          </div>
        </AccordionSection>

        <AccordionSection label="GENERATE" open={open.generate} onToggle={() => setOpen(o => ({ ...o, generate: !o.generate }))}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button onClick={saveDraft} style={secondaryBtnStyle}>{episodeId ? 'Save' : 'Save draft'}</button>
            <button onClick={generateScript} disabled={busy === 'script' || !episodeId} style={{ ...primaryBtnStyle, opacity: busy === 'script' || !episodeId ? 0.5 : 1 }}>
              {busy === 'script' ? 'Generating…' : 'Generate Script'}
            </button>
            {script.length > 0 && (
              <button onClick={generateAudio} disabled={busy === 'audio' || ep?.status === 'generating_audio'} style={{ ...primaryBtnStyle, opacity: busy === 'audio' ? 0.5 : 1 }}>
                {ep?.status === 'generating_audio' ? 'Rendering…' : (audioReady ? 'Re-render audio' : 'Generate audio')}
              </button>
            )}
          </div>
        </AccordionSection>

        {toast && <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--amber)', color: 'var(--card)', fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, borderRadius: 4 }}>{toast}</div>}
      </div>

      <div style={canvasShellStyle(isMobile)}>
        <div style={{ maxWidth: 820 }}>
          <h1 style={h1Style}>{topic || '(New episode)'}</h1>
          <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text-mid)', marginTop: 4 }}>
            {series.podcast.name} · {ep?.status || 'unsaved'}
          </div>

          {audioReady && (
            <div style={{ marginTop: 16, padding: 12, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6 }}>
              <div style={eyebrowStyle}>AUDIO · {formatDuration(ep.audio_duration_seconds)}</div>
              <audio src={`/api/podcasts/${seriesId}/episodes/${episodeId}/audio`} controls style={{ width: '100%', marginTop: 8 }} />
            </div>
          )}

          {script.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={eyebrowStyle}>SCRIPT · {script.length} segments</div>
                <div style={{ flex: 1 }} />
                {episodeId && (
                  <select onChange={e => { if (e.target.value) { regenerateHost(e.target.value); e.target.value = ''; } }} defaultValue="" disabled={busy === 'regen'}
                    style={{ padding: '6px 8px', border: '1px solid var(--border)', fontFamily: 'DM Sans', fontSize: 12 }}>
                    <option value="">Regenerate host lines…</option>
                    {hostRows.map(h => <option key={h.host_id} value={h.host_id}>{h.name}</option>)}
                  </select>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {script.map((seg, i) => (
                  <div key={seg.id || i} style={{ background: speakerColor(seg.speaker_id), border: '1px solid var(--border-light)', borderRadius: 4, padding: 12 }}>
                    <div style={{ fontFamily: 'DM Sans', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-mid)', marginBottom: 4 }}>{seg.speaker_name}</div>
                    <div style={{ fontFamily: 'DM Sans', fontSize: 15, lineHeight: 1.55, color: 'var(--text)' }}>{seg.text}</div>
                  </div>
                ))}
              </div>

              {/* Canvas-level audio action — primary, visible, always under the script. */}
              {episodeId && (
                <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(() => {
                    const status = ep?.status;
                    const inFlight = busy === 'audio' || status === 'generating_audio';
                    const alreadyReady = status === 'audio_ready';
                    const label = inFlight ? 'Rendering audio…' : alreadyReady ? 'Re-render audio' : 'Generate Audio';
                    return (
                      <button
                        onClick={generateAudio}
                        disabled={inFlight}
                        style={{
                          padding: '12px 24px',
                          background: 'var(--amber)',
                          color: 'var(--card)',
                          border: 'none',
                          borderRadius: 4,
                          fontFamily: 'DM Sans, sans-serif',
                          fontWeight: 500, fontSize: 14, lineHeight: 1,
                          cursor: inFlight ? 'not-allowed' : 'pointer',
                          opacity: inFlight ? 0.7 : 1,
                          alignSelf: 'flex-start',
                        }}
                      >{label}</button>
                    );
                  })()}
                  <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text-mid)' }}>
                    {ep?.status === 'generating_audio' && 'Rendering in the background. This page will pick up the new audio once ready.'}
                    {ep?.status === 'audio_ready' && 'Audio ready. Re-render to regenerate using the current script.'}
                    {(!ep?.status || ep?.status === 'script_draft') && 'xAI TTS per host · speech tags auto-applied per segment · silence buffers inserted between speakers.'}
                  </div>
                </div>
              )}
            </div>
          )}

          {script.length === 0 && episodeId && ep?.status === 'script_draft' && (
            <div style={{ marginTop: 32, padding: 20, border: '1px dashed var(--border)', borderRadius: 6, color: 'var(--text-mid)', fontFamily: 'DM Sans', fontSize: 14 }}>
              Set topic, assign host positions, click Generate Script.
            </div>
          )}
        </div>
      </div>

      <ConfirmModal
        isOpen={!!confirmModal}
        title={confirmModal?.title}
        message={confirmModal?.message}
        confirmLabel={confirmModal?.confirmLabel}
        variant={confirmModal?.variant}
        onConfirm={() => { const m = confirmModal; setConfirmModal(null); m?.onConfirm?.(); }}
        onCancel={() => setConfirmModal(null)}
      />
    </div>
  );
}

// ─── ONE-OFF ───────────────────────────────────────────────────────────────
// Single-screen flow for one-off podcasts. Handles both the create mode
// (episodeId=null — blank state, Generate Script POSTs to /api/podcasts/one-off
// on first click then navigates to the detail URL) and the detail mode
// (episodeId set — hydrates via /api/podcasts/episodes/:ep_id).
function OneOff({ episodeId, navigate }) {
  const [podcastId, setPodcastId] = useState(null);
  const [ep, setEp] = useState(null);
  const [topic, setTopic] = useState('');
  const [brief, setBrief] = useState('');
  const [formatTemplate, setFormatTemplate] = useState('');
  const [introText, setIntroText] = useState('');
  const [outroText, setOutroText] = useState('');
  const [hostRows, setHostRows] = useState([]);
  const [script, setScript] = useState([]);
  const [allHosts, setAllHosts] = useState([]);
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const [confirmModal, setConfirmModal] = useState(null);
  const [open, setOpen] = useState({ topic: true, brief: true, hosts: true, format: false, intro: false, outro: false });
  const isMobile = useIsMobile();

  // Global hosts library for the picker
  useEffect(() => { api('/api/admin/hosts').then(d => setAllHosts(d.hosts || [])).catch(() => {}); }, []);

  // Hydrate on detail mode
  useEffect(() => {
    if (!episodeId) return;
    (async () => {
      try {
        const d = await api(`/api/podcasts/episodes/${episodeId}`);
        setPodcastId(d.podcast.id);
        setEp(d.episode);
        setTopic(d.episode.topic || '');
        setBrief(d.episode.brief || '');
        setFormatTemplate(d.podcast.format_template || '');
        setIntroText(d.podcast.intro_text || '');
        setOutroText(d.podcast.outro_text || '');
        setScript(d.episode.script || []);
        setHostRows((d.hosts || []).map(h => ({
          host_id: h.host_id, name: h.name, voice_id: h.voice_id,
          position_preset: h.position_preset, position_direction: h.position_direction || '',
          speaker_order: h.speaker_order || 0,
        })));
      } catch (e) { setToast(e.message); }
    })();
  }, [episodeId]);

  const duplicateVoices = useMemo(() => {
    const seen = new Map();
    for (const h of hostRows) seen.set(h.voice_id, (seen.get(h.voice_id) || 0) + 1);
    return [...seen.entries()].filter(([, c]) => c > 1).map(([v]) => v);
  }, [hostRows]);

  const addHostFromLibrary = (hostId) => {
    const host = allHosts.find(h => h.id === hostId);
    if (!host) return;
    if (hostRows.some(r => r.host_id === hostId)) { setToast('Host already in episode'); return; }
    setHostRows(rs => [...rs, {
      host_id: host.id, name: host.name, voice_id: host.voice_id,
      position_preset: 'curious_moderator', position_direction: '',
      speaker_order: rs.length,
    }]);
  };

  // Persist — either create-one-off on first save, or PATCH existing podcast + episode.
  const persist = async () => {
    if (!topic.trim()) throw new Error('Topic required');
    if (!podcastId || !ep?.id) {
      const r = await api('/api/podcasts/one-off', {
        method: 'POST',
        body: JSON.stringify({
          topic: topic.trim(), brief, format_template: formatTemplate,
          intro_text: introText, outro_text: outroText,
          hosts: hostRows.map((h, i) => ({
            host_id: h.host_id, position_preset: h.position_preset,
            position_direction: h.position_direction, speaker_order: i,
          })),
        }),
      });
      setPodcastId(r.podcast_id);
      setEp({ id: r.episode_id, topic, brief, status: 'script_draft' });
      navigate(r.redirect_url);
      return { podcast_id: r.podcast_id, episode_id: r.episode_id };
    }
    // PATCH existing — podcast meta + episode topic/brief + episode_hosts array
    await api(`/api/podcasts/${podcastId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: topic.trim(), description: brief, format_template: formatTemplate, intro_text: introText, outro_text: outroText }),
    });
    await api(`/api/podcasts/${podcastId}/episodes/${ep.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        topic: topic.trim(), brief,
        episode_hosts: hostRows.map((h, i) => ({
          host_id: h.host_id, position_preset: h.position_preset,
          position_direction: h.position_direction, speaker_order: i,
        })),
      }),
    });
    return { podcast_id: podcastId, episode_id: ep.id };
  };

  // Silent auto-save every 3 minutes when there's a dirty state.
  const lastSavedRef = useRef('');
  useEffect(() => {
    if (!topic.trim()) return;
    const id = setInterval(async () => {
      const signature = JSON.stringify({ topic, brief, formatTemplate, introText, outroText, hostRows });
      if (signature === lastSavedRef.current) return;
      if (!podcastId || !ep?.id) return; // don't auto-create on idle
      try {
        setSaveStatus('saving');
        await persist();
        lastSavedRef.current = signature;
        setSaveStatus('saved');
      } catch { setSaveStatus('unsaved'); }
    }, 3 * 60 * 1000);
    return () => clearInterval(id);
  }, [topic, brief, formatTemplate, introText, outroText, hostRows, podcastId, ep?.id]);

  const generateScript = async () => {
    if (!topic.trim()) { setToast('Topic required'); return; }
    if (hostRows.length === 0) { setToast('Add at least one host'); return; }
    setBusy('script');
    try {
      const { podcast_id, episode_id } = await persist();
      const r = await api(`/api/podcasts/${podcast_id}/episodes/${episode_id}/generate-script`, { method: 'POST' });
      setScript(r.segments || []);
      setEp(e => ({ ...(e || { id: episode_id }), status: 'script_draft' }));
      setToast('Script generated');
      setTimeout(() => setToast(''), 2000);
    } catch (e) { setToast(e.message); }
    setBusy('');
  };

  const regenerateHost = (hostId) => {
    const host = hostRows.find(h => h.host_id === hostId);
    setConfirmModal({
      title: `Regenerate ${host?.name || 'this host'}'s lines?`,
      message: 'All other hosts\' segments stay byte-identical. Only this speaker\'s lines will be rewritten.',
      confirmLabel: 'Regenerate',
      onConfirm: async () => {
        if (!podcastId || !ep?.id) return;
        setBusy('regen');
        try {
          const r = await api(`/api/podcasts/${podcastId}/episodes/${ep.id}/regenerate-host`, { method: 'POST', body: JSON.stringify({ host_id: hostId }) });
          setScript(r.segments || []);
          setToast('Lines regenerated');
          setTimeout(() => setToast(''), 2000);
        } catch (e) { setToast(e.message); }
        setBusy('');
      },
    });
  };

  const generateAudio = async () => {
    if (!podcastId || !ep?.id) { setToast('Save the draft first'); return; }
    setBusy('audio');
    try {
      await api(`/api/podcasts/${podcastId}/episodes/${ep.id}/generate-audio`, { method: 'POST' });
      setEp(e => ({ ...e, status: 'generating_audio' }));
      setToast('Audio job queued — refresh in a minute');
      setTimeout(() => setToast(''), 3000);
      setTimeout(async () => {
        try { const d = await api(`/api/podcasts/episodes/${ep.id}`); setEp(d.episode); } catch {}
      }, 10000);
    } catch (e) { setToast(e.message); }
    setBusy('');
  };

  const speakerColor = (speakerId) => {
    const idx = hostRows.findIndex(h => h.host_id === speakerId);
    return SPEAKER_TINTS[idx % SPEAKER_TINTS.length];
  };

  const audioReady = ep?.status === 'audio_ready';
  const generating = ep?.status === 'generating_audio' || busy === 'audio';

  return (
    <div style={outerShellStyle(isMobile)}>
      {/* LEFT */}
      <div style={sidebarShellStyle(isMobile, 420)}>
        <button onClick={() => navigate('/podcast-studio')} style={{ ...secondaryBtnStyle, marginBottom: 10 }}>← All series</button>
        <div style={eyebrowStyle}>✦ ONE-OFF</div>
        <h1 style={{ ...h1Style, marginTop: 6 }}>{topic || 'New one-off podcast'}</h1>

        <AccordionSection label="TOPIC" open={open.topic} onToggle={() => setOpen(o => ({ ...o, topic: !o.topic }))}>
          <textarea value={topic} onChange={e => setTopic(e.target.value)} rows={3}
            placeholder="What should this podcast be about?" style={textareaStyle} />
        </AccordionSection>

        <AccordionSection label="BRIEF (OPTIONAL)" open={open.brief} onToggle={() => setOpen(o => ({ ...o, brief: !o.brief }))}>
          <textarea value={brief} onChange={e => setBrief(e.target.value)} rows={4}
            placeholder="Optional longer direction — what angle, what to include, what to avoid." style={textareaStyle} />
        </AccordionSection>

        <AccordionSection label={`HOSTS (${hostRows.length})`} open={open.hosts} onToggle={() => setOpen(o => ({ ...o, hosts: !o.hosts }))}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {hostRows.length === 0 && (
              <div style={{ padding: 10, background: 'var(--surface-inp)', border: '1px dashed var(--border)', borderRadius: 4, fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text-mid)' }}>
                No hosts assigned yet. Pick from your library below.
                {' '}
                <button onClick={() => navigate('/admin/hosts')} style={{ padding: 0, background: 'transparent', border: 'none', color: 'var(--ink)', cursor: 'pointer', fontFamily: 'DM Sans', fontSize: 12, textDecoration: 'underline' }}>
                  Open Hosts admin
                </button>
              </div>
            )}
            {hostRows.map((h, idx) => (
              <div key={h.host_id} style={{ padding: 8, border: '1px solid var(--border-light)', borderRadius: 4, background: 'var(--surface-inp)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', background: VOICE_COLORS[h.voice_id] || 'var(--amber)', color: 'var(--card)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 600 }}>{h.name?.charAt(0)}</div>
                  <div style={{ flex: 1, fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600 }}>{h.name} <span style={{ color: 'var(--text-mid)', fontSize: 11, fontWeight: 400 }}>· {h.voice_id}</span></div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => setHostRows(rs => moveItem(rs, idx, -1))} disabled={idx === 0} style={{ ...resetBtnStyle, opacity: idx === 0 ? 0.4 : 1 }}>↑</button>
                    <button onClick={() => setHostRows(rs => moveItem(rs, idx, +1))} disabled={idx === hostRows.length - 1} style={{ ...resetBtnStyle, opacity: idx === hostRows.length - 1 ? 0.4 : 1 }}>↓</button>
                    <button onClick={() => setHostRows(rs => rs.filter((_, i) => i !== idx))} style={resetBtnStyle}>×</button>
                  </div>
                </div>
                <select value={h.position_preset} onChange={e => setHostRows(rs => rs.map((r, i) => i === idx ? { ...r, position_preset: e.target.value } : r))}
                  style={{ ...textareaStyle, height: 'auto', marginBottom: 6 }}>
                  {POSITION_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
                <textarea value={h.position_direction} onChange={e => setHostRows(rs => rs.map((r, i) => i === idx ? { ...r, position_direction: e.target.value } : r))}
                  rows={2} placeholder="Optional: extra position direction" style={textareaStyle} />
              </div>
            ))}

            {(() => {
              const available = allHosts.filter(h => !hostRows.some(r => r.host_id === h.id));
              if (available.length === 0) return null;
              return (
                <select
                  onChange={e => { if (e.target.value) { addHostFromLibrary(e.target.value); e.target.value = ''; } }}
                  defaultValue=""
                  style={{ ...textareaStyle, height: 'auto' }}
                >
                  <option value="">+ Add host from library…</option>
                  {available.map(h => <option key={h.id} value={h.id}>{h.name} ({h.voice_id})</option>)}
                </select>
              );
            })()}

            {duplicateVoices.length > 0 && (
              <div style={{ padding: '6px 10px', background: 'var(--amber-light)', border: '1px solid var(--amber-border)', borderRadius: 4, fontFamily: 'DM Sans', fontSize: 11, color: 'var(--text)' }}>
                Soft warning: two or more hosts share the voice "{duplicateVoices.join(', ')}". Listeners may have trouble telling them apart.
              </div>
            )}
          </div>
        </AccordionSection>

        <AccordionSection label="FORMAT NOTES (OPTIONAL)" open={open.format} onToggle={() => setOpen(o => ({ ...o, format: !o.format }))}>
          <textarea value={formatTemplate} onChange={e => setFormatTemplate(e.target.value)} rows={4}
            placeholder="E.g. 'Open with a story, riff for the middle, close with a takeaway.'" style={textareaStyle} />
        </AccordionSection>

        <AccordionSection label="INTRO TEXT (OPTIONAL)" open={open.intro} onToggle={() => setOpen(o => ({ ...o, intro: !o.intro }))}>
          <textarea value={introText} onChange={e => setIntroText(e.target.value)} rows={3}
            placeholder="Fixed opening text (read by the first speaker)" style={textareaStyle} />
        </AccordionSection>

        <AccordionSection label="OUTRO TEXT (OPTIONAL)" open={open.outro} onToggle={() => setOpen(o => ({ ...o, outro: !o.outro }))}>
          <textarea value={outroText} onChange={e => setOutroText(e.target.value)} rows={3}
            placeholder="Fixed closing text (read by the last speaker)" style={textareaStyle} />
        </AccordionSection>

        <div style={{ marginTop: 16, padding: '8px 12px', background: 'var(--surface-inp)', borderRadius: 4, fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text-mid)' }}>
          {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Draft saved' : saveStatus === 'unsaved' ? 'Unsaved changes' : podcastId ? 'Auto-saves every 3 minutes' : 'Click Generate Script to save'}
        </div>
        {toast && <div style={{ marginTop: 10, padding: '8px 12px', background: 'var(--amber)', color: 'var(--card)', fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, borderRadius: 4 }}>{toast}</div>}
      </div>

      {/* RIGHT */}
      <div style={canvasShellStyle(isMobile)}>
        <div style={{ maxWidth: 820 }}>
          {script.length === 0 && !generating && (
            <div style={{ marginTop: 120, textAlign: 'center', color: 'var(--text-mid)', fontFamily: 'DM Sans' }}>
              <div style={{ fontSize: 15, marginBottom: 20 }}>Fill in topic + hosts on the left to begin.</div>
              <button
                onClick={generateScript}
                disabled={busy === 'script' || !topic.trim() || hostRows.length === 0}
                style={{
                  padding: '14px 28px', background: 'var(--amber)', color: 'var(--card)', border: 'none',
                  borderRadius: 4, fontFamily: 'DM Sans, sans-serif', fontWeight: 500, fontSize: 15, lineHeight: 1,
                  cursor: (busy === 'script' || !topic.trim() || hostRows.length === 0) ? 'not-allowed' : 'pointer',
                  opacity: (busy === 'script' || !topic.trim() || hostRows.length === 0) ? 0.5 : 1,
                }}
              >
                {busy === 'script' ? 'Writing script…' : 'Generate Script →'}
              </button>
            </div>
          )}

          {busy === 'script' && script.length === 0 && (
            <div style={{ marginTop: 120, textAlign: 'center', color: 'var(--text-mid)', fontFamily: 'DM Sans', fontStyle: 'italic' }}>Writing script…</div>
          )}

          {audioReady && (
            <div style={{ marginBottom: 20, padding: 12, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6 }}>
              <div style={eyebrowStyle}>AUDIO · {formatDuration(ep.audio_duration_seconds)}</div>
              <audio src={`/api/podcasts/${podcastId}/episodes/${ep.id}/audio`} controls style={{ width: '100%', marginTop: 8 }} />
            </div>
          )}

          {script.length > 0 && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={eyebrowStyle}>SCRIPT · {script.length} segments</div>
                <div style={{ flex: 1 }} />
                {ep?.id && (
                  <select onChange={e => { if (e.target.value) { regenerateHost(e.target.value); e.target.value = ''; } }} defaultValue="" disabled={busy === 'regen'}
                    style={{ padding: '6px 8px', border: '1px solid var(--border)', fontFamily: 'DM Sans', fontSize: 12 }}>
                    <option value="">Regenerate host lines…</option>
                    {hostRows.map(h => <option key={h.host_id} value={h.host_id}>{h.name}</option>)}
                  </select>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {script.map((seg, i) => (
                  <div key={seg.id || i} style={{ background: speakerColor(seg.speaker_id), border: '1px solid var(--border-light)', borderRadius: 4, padding: 12 }}>
                    <div style={{ fontFamily: 'DM Sans', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-mid)', marginBottom: 4 }}>{seg.speaker_name}</div>
                    <div style={{ fontFamily: 'DM Sans', fontSize: 15, lineHeight: 1.55, color: 'var(--text)' }}>{seg.text}</div>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <button
                  onClick={generateAudio}
                  disabled={generating}
                  style={{
                    padding: '12px 24px', background: 'var(--amber)', color: 'var(--card)', border: 'none',
                    borderRadius: 4, fontFamily: 'DM Sans, sans-serif', fontWeight: 500, fontSize: 14, lineHeight: 1,
                    cursor: generating ? 'not-allowed' : 'pointer',
                    opacity: generating ? 0.7 : 1, alignSelf: 'flex-start',
                  }}
                >
                  {generating ? 'Rendering audio…' : audioReady ? 'Re-render audio' : 'Generate Audio'}
                </button>
                <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text-mid)' }}>
                  {ep?.status === 'generating_audio' && 'Rendering in the background. This page will pick up the new audio once ready.'}
                  {audioReady && 'Audio ready. Re-render to regenerate using the current script.'}
                  {(!ep?.status || ep?.status === 'script_draft') && 'xAI TTS per host · speech tags auto-applied per segment · silence buffers between speakers.'}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <ConfirmModal
        isOpen={!!confirmModal}
        title={confirmModal?.title}
        message={confirmModal?.message}
        confirmLabel={confirmModal?.confirmLabel}
        variant={confirmModal?.variant}
        onConfirm={() => { const m = confirmModal; setConfirmModal(null); m?.onConfirm?.(); }}
        onCancel={() => setConfirmModal(null)}
      />
    </div>
  );
}

function moveItem(arr, idx, delta) {
  const next = idx + delta;
  if (next < 0 || next >= arr.length) return arr;
  const copy = [...arr];
  [copy[idx], copy[next]] = [copy[next], copy[idx]];
  return copy.map((item, i) => ({ ...item, speaker_order: i }));
}

function formatDuration(s) {
  if (!s) return '0:00';
  const m = Math.floor(s / 60); const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

function AccordionSection({ label, open, onToggle, children }) {
  return (
    <div style={{ marginBottom: 12, border: '1px solid var(--border-light)', borderRadius: 6, overflow: 'hidden', background: 'var(--card)' }}>
      <button onClick={onToggle} style={{ width: '100%', padding: '10px 14px', border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', ...eyebrowStyle }}>
        <span>{label}</span><span style={{ color: 'var(--text-mid)', fontSize: 14 }}>{open ? '−' : '+'}</span>
      </button>
      {open && <div style={{ padding: 12, borderTop: '1px solid var(--border-light)' }}>{children}</div>}
    </div>
  );
}

function LabeledSelect({ label, value, onChange, options }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-mid)', fontFamily: 'DM Sans', fontWeight: 600 }}>{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)} style={{ padding: '4px 6px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontFamily: 'DM Sans', fontSize: 12 }}>
        {options.map(o => <option key={o[0]} value={o[0]}>{o[1]}</option>)}
      </select>
    </label>
  );
}

const textareaStyle = {
  width: '100%', padding: '8px 10px', border: '1px solid var(--border)', background: 'var(--card)',
  color: 'var(--text)', fontFamily: 'DM Sans', fontSize: 14, lineHeight: 1.5, borderRadius: 4, resize: 'vertical',
};
const primaryBtnStyle = {
  padding: '10px 14px', background: 'var(--amber)', color: 'var(--card)', border: 'none',
  fontFamily: 'DM Sans', fontWeight: 600, fontSize: 14, cursor: 'pointer', borderRadius: 4,
};
const secondaryBtnStyle = {
  padding: '8px 12px', background: 'var(--card)', color: 'var(--text)', border: '1px solid var(--border)',
  fontFamily: 'DM Sans', fontWeight: 500, fontSize: 13, cursor: 'pointer', borderRadius: 4,
};
const resetBtnStyle = {
  padding: '2px 6px', background: 'transparent', color: 'var(--text-mid)', border: '1px solid var(--border-light)',
  fontFamily: 'DM Sans', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', cursor: 'pointer', borderRadius: 3,
};
