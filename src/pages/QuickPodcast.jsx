// Quick Podcast — /listen redesign.
// Two columns: a 300px fixed left rail with the generate form, an optional
// single-generation status block, and a Show Settings card; a fluid right
// column with the player and library. Mobile (<768px) stacks.
//
// This page is intentionally state-heavy because the settings drawers fold
// over the working feed-cover / theme-music / RSS handlers that used to live
// in standalone accordions. Handlers preserved verbatim from the prior
// revision; layout and form are new.

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import ConfirmModal from '../components/ConfirmModal.jsx';

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

// ─── Design tokens used in this page only ─────────────────────────────
const eyebrowStyle = {
  fontFamily: 'DM Sans', fontWeight: 600, fontSize: 10, lineHeight: 1.2,
  letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--amber)',
};
const miniLabelStyle = {
  display: 'block',
  fontFamily: 'DM Sans', fontSize: 9, fontWeight: 600,
  letterSpacing: '0.12em', textTransform: 'uppercase',
  color: 'var(--text-mid)',
};

// ─── Copy: length, category, host, topic seed lists ───────────────────
const LENGTHS = [1, 5, 10, 15, 20];
const TIME_ESTIMATE = { 1: '~30s', 5: '~1 min', 10: '~2 min', 15: '~3 min', 20: '~4 min' };

const ADULT_CATEGORIES = [
  'History', 'True Crime', 'Science & Nature', 'Sports', 'Comedy',
  'Business & Money', 'News', 'Fiction & Stories', 'How-To', 'Politics & Society',
];
const KIDS_CATEGORIES = [
  'Animal Facts', 'History & Heroes', 'Science & How Things Work',
  'Funny Stories', 'Myths & Legends', 'Nature & Outdoors',
  'Sports Stars', 'Space & Planets',
];

// Canonical hosts — seeded in the hosts table as is_starter rows for this
// account. Display names are the user-facing labels; voice is the underlying
// xAI TTS voice_id shown as a hint. Show Settings will eventually let users
// rename these in place; for now they're read-only labels.
const HOSTS = [
  { name: 'Blair',   voice: 'Ara' },
  { name: 'Curtis',  voice: 'Rex' },
  { name: 'Jackson', voice: 'Sal' },
];

// Random-mode topic catalog. Frontend picks a real string and POSTs it as
// `topic` — the backend never sees a "random" sentinel, so generate.ts
// stays unchanged. Keys must match the category strings exactly so lookup
// is a direct indexer.
const RANDOM_TOPICS_ADULTS = {
  'History': [
    'The Great Molasses Flood of 1919',
    'How Roman concrete outlasted modern concrete',
    'The Dancing Plague of 1518',
  ],
  'True Crime': [
    'The Tylenol poisonings of 1982',
    'The D.B. Cooper case, fifty years on',
    'How forensic accountants catch fraud',
  ],
  'Science & Nature': [
    'Why octopuses might think with their arms',
    'The surprising life of slime molds',
    'How migratory birds navigate without a map',
  ],
  'Sports': [
    'The story behind the Miracle on Ice',
    'Why curveballs actually curve',
    'How Formula 1 pit crews shave seconds',
  ],
  'Comedy': [
    'Why puns still work',
    'A short history of stand-up comedy',
    'The origin of the rubber chicken',
  ],
  'Business & Money': [
    "How IKEA's flat-pack conquered the world",
    'The economics of vending machines',
    'Why airlines bundle fees the way they do',
  ],
  'News': [
    'Why local newspapers are disappearing',
    'How a headline gets written',
    'The history of the wire service',
  ],
  'Fiction & Stories': [
    'The short history of detective fiction',
    'Why Shakespeare still lands on modern stages',
    'How movies decide who dies on screen',
  ],
  'How-To': [
    'How to read a wine label without guessing',
    'Why sourdough works the way it does',
    'How to sharpen a kitchen knife properly',
  ],
  'Politics & Society': [
    'The origin of the 40-hour work week',
    'Why some voting lines got so long',
    'How ZIP codes quietly shaped America',
  ],
};
const RANDOM_TOPICS_KIDS = {
  'Animal Facts': [
    'Why do cats purr?',
    'How do octopuses change color?',
    'How far can a kangaroo jump?',
  ],
  'History & Heroes': [
    'Who was Harriet Tubman?',
    'What was it like to be a kid in Ancient Egypt?',
    'The true story of Pocahontas',
  ],
  'Science & How Things Work': [
    'How do airplanes fly?',
    'Why is the sky blue?',
    'How does electricity get to your house?',
  ],
  'Funny Stories': [
    'The time a chicken laid a square egg',
    'Why bananas make people laugh',
    'A very silly day at the zoo',
  ],
  'Myths & Legends': [
    'Why dragons show up in every culture',
    'Where does the Tooth Fairy come from?',
    'The legend of King Arthur for kids',
  ],
  'Nature & Outdoors': [
    'Why do leaves change color?',
    'How do rainbows happen?',
    'Where do rivers come from?',
  ],
  'Sports Stars': [
    'Who is Simone Biles?',
    'The fastest runner on Earth',
    'How astronauts train for space',
  ],
  'Space & Planets': [
    'How big is the Sun?',
    'Could you live on Mars?',
    "What's a black hole?",
  ],
};

// Pipeline phase order for the generating-block thermometer. The queue
// consumer only emits four real statuses (researching → casting → scripting
// → generating_audio → audio_ready). 'music' and 'art' are post-audio
// display stages — they flip to "done" when status === 'audio_ready' and
// sit at "waiting" otherwise, keeping the six-dot visual coherent without
// requiring any backend changes.
const PHASES = [
  { key: 'research',   label: 'Research', statusMatch: 'researching',      fill: 8  },
  { key: 'hosts',      label: 'Hosts',    statusMatch: 'casting',          fill: 20 },
  { key: 'script',     label: 'Script',   statusMatch: 'scripting',        fill: 38 },
  { key: 'audio',      label: 'Audio',    statusMatch: 'generating_audio', fill: 60 },
  { key: 'music',      label: 'Music',    statusMatch: null,               fill: 82 },
  { key: 'art',        label: 'Art',      statusMatch: null,               fill: 100 },
];

const DEFAULT_COVER_PROMPT = 'Abstract editorial illustration representing curiosity, knowledge, and conversation. Minimalist composition, warm earthy palette (cream background, deep forest green, leather brown, golden amber accents). Clean modern design suitable for a personal podcast cover. Square 1:1 aspect, no text or words in the image. Calm, sophisticated, inviting.';

// ─── Visual primitives ────────────────────────────────────────────────
function EpisodeThumb({ id, ready, size = 40 }) {
  const [failed, setFailed] = useState(false);
  if (!ready || failed) {
    return (
      <div style={{
        width: size, height: size, borderRadius: 5,
        background: ready ? 'var(--ink)' : 'var(--border)',
        color: '#fff',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, flexShrink: 0,
      }}>▶</div>
    );
  }
  return (
    <img
      src={`/api/quick-podcast/${id}/cover`}
      alt=""
      onError={() => setFailed(true)}
      style={{
        width: size, height: size, borderRadius: 5,
        objectFit: 'cover', flexShrink: 0,
        background: 'var(--ink)', display: 'block',
      }}
    />
  );
}

// Cover image is square-source (1:1) at roughly 1024×1024. We let it render
// at its natural aspect ratio (width:100%, height:auto) so nothing is ever
// cropped. objectFit:'contain' is belt-and-suspenders for the rare cases
// where a non-square cover sneaks in — the background color fills any
// letterbox. Skeletons still need an explicit pixel height because they
// have no intrinsic content to measure from.
const COVER_BANNER_STYLE = {
  display: 'block',
  width: '100%',
  height: 'auto',
  objectFit: 'contain',
  borderRadius: '8px 8px 0 0',
  backgroundColor: 'var(--surface-inp)',
};
function EpisodeCover({ id }) {
  const [failed, setFailed] = useState(false);
  if (!id || failed) return <CoverSkeleton animated={false} />;
  return (
    <img
      src={`/api/quick-podcast/${id}/cover`}
      alt=""
      onError={() => setFailed(true)}
      style={COVER_BANNER_STYLE}
    />
  );
}
function CoverSkeleton({ animated = true }) {
  return (
    <>
      <div style={{
        ...COVER_BANNER_STYLE,
        height: 240,
        background: animated
          ? 'linear-gradient(90deg, var(--surface-inp) 0%, var(--border) 50%, var(--surface-inp) 100%)'
          : 'var(--surface-inp)',
        backgroundSize: animated ? '200% 100%' : undefined,
        animation: animated ? 'quickpod-cover-shimmer 1.6s linear infinite' : undefined,
      }} />
      {animated && (
        <style>{`@keyframes quickpod-cover-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
      )}
    </>
  );
}

function ToggleSwitch({ enabled, onChange, disabled }) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      aria-pressed={!!enabled}
      style={{
        width: 40, height: 22, borderRadius: 11,
        border: 'none',
        background: enabled ? 'var(--ink)' : 'var(--border)',
        cursor: disabled ? 'default' : 'pointer',
        position: 'relative', flexShrink: 0,
        transition: 'background 0.2s', padding: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: 2,
        left: enabled ? 20 : 2,
        width: 18, height: 18, borderRadius: '50%',
        background: '#fff',
        transition: 'left 0.2s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        display: 'block',
      }} />
    </button>
  );
}

// Custom audio player — preserved verbatim from the prior revision. Reads
// total duration from the prop (DB-authoritative) so the broken Xing/Info
// frame in older stitched files can't clamp the scrubber to 5 s.
function CustomAudioPlayer({ src, totalDurationSeconds }) {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onTime = () => setCurrentTime(el.currentTime);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => setIsPlaying(false);
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('ended', onEnded);
    return () => {
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('ended', onEnded);
    };
  }, []);

  useEffect(() => {
    setCurrentTime(0);
    setIsPlaying(false);
  }, [src]);

  const togglePlay = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) el.play();
    else el.pause();
  };
  const toggleMute = () => {
    const el = audioRef.current;
    if (!el) return;
    el.muted = !el.muted;
    setMuted(el.muted);
  };
  const seek = (e) => {
    const el = audioRef.current;
    if (!el || !totalDurationSeconds) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const t = pct * totalDurationSeconds;
    el.currentTime = t;
    setCurrentTime(t);
  };

  const progressPct = totalDurationSeconds > 0
    ? Math.min(100, (currentTime / totalDurationSeconds) * 100)
    : 0;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '8px 10px',
      background: 'var(--surface-inp)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      marginTop: 10,
    }}>
      <audio ref={audioRef} src={src} preload="metadata" />
      <button
        onClick={togglePlay}
        aria-label={isPlaying ? 'Pause' : 'Play'}
        style={{
          width: 32, height: 32, borderRadius: '50%',
          background: 'var(--ink)', color: '#fff',
          border: 'none', cursor: 'pointer', padding: 0,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, flexShrink: 0, lineHeight: 1,
        }}
      >{isPlaying ? '❚❚' : '▶'}</button>
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 10, color: 'var(--text-mid)',
        fontVariantNumeric: 'tabular-nums',
        flexShrink: 0, minWidth: 30, textAlign: 'right',
      }}>{formatDuration(currentTime)}</span>
      <div
        onClick={seek}
        role="slider"
        aria-valuemin={0}
        aria-valuemax={totalDurationSeconds || 0}
        aria-valuenow={Math.floor(currentTime)}
        style={{
          flex: 1, height: 3, borderRadius: 2,
          background: 'var(--border-light)',
          cursor: 'pointer', position: 'relative', overflow: 'hidden',
        }}
      >
        <div style={{
          position: 'absolute', top: 0, left: 0, bottom: 0,
          width: `${progressPct}%`,
          background: 'var(--amber)',
          borderRadius: 2,
          transition: 'width 0.1s linear',
        }} />
      </div>
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 10, color: 'var(--text-mid)',
        fontVariantNumeric: 'tabular-nums',
        flexShrink: 0, minWidth: 30,
      }}>{formatDuration(totalDurationSeconds)}</span>
      <button
        onClick={toggleMute}
        aria-label={muted ? 'Unmute' : 'Mute'}
        style={{
          width: 28, height: 28, borderRadius: 6,
          background: 'transparent', color: 'var(--text-mid)',
          border: 'none', cursor: 'pointer', padding: 0,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          {muted ? (
            <path d="M16.5 12A4.5 4.5 0 0 0 14 7.97v2.21l2.45 2.45a4.5 4.5 0 0 0 .05-.63zM19 12a6.98 6.98 0 0 1-.82 3.3l1.47 1.47A8.97 8.97 0 0 0 21 12a9 9 0 0 0-7-8.77v2.06A6.99 6.99 0 0 1 19 12zM3 3.27l2 2V9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.43.93-2.25 1.18v2.06a8.99 8.99 0 0 0 3.69-1.81l2.04 2.05 1.27-1.27L4.27 2zM12 4L9.91 6.09 12 8.18V4z" />
          ) : (
            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05A4.5 4.5 0 0 0 16.5 12zM14 3.23v2.06A6.99 6.99 0 0 1 19 12a6.99 6.99 0 0 1-5 6.71v2.06A9 9 0 0 0 21 12 9 9 0 0 0 14 3.23z" />
          )}
        </svg>
      </button>
    </div>
  );
}

// ─── Main page component ──────────────────────────────────────────────
export default function QuickPodcast({ navigate }) {
  // Generate form
  const [mode, setMode] = useState('idea'); // 'idea' | 'random'
  const [topic, setTopic] = useState('');
  const [audience, setAudience] = useState('adults');
  const [category, setCategory] = useState('History');
  const [lengthMinutes, setLengthMinutes] = useState(5);
  const [selectedHosts, setSelectedHosts] = useState(['Blair']);

  // Active episode / generation
  const [activeEpisodeId, setActiveEpisodeId] = useState(null);
  const [status, setStatus] = useState(null);
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState('');
  const [showSources, setShowSources] = useState(false);
  const [showScript, setShowScript] = useState(false);
  const [generatingExpanded, setGeneratingExpanded] = useState(false);

  // Library
  const [library, setLibrary] = useState([]);

  // Show Settings
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [openRow, setOpenRow] = useState(null); // 'hosts' | 'cover' | 'theme' | 'apple' | null

  // Show Settings → Feed Cover state
  const [feed, setFeed] = useState(null);
  const [coverLightboxOpen, setCoverLightboxOpen] = useState(false);
  const [coverCacheBust, setCoverCacheBust] = useState(() => Date.now());
  const [coverBusy, setCoverBusy] = useState('');
  const [coverPrompt, setCoverPrompt] = useState(DEFAULT_COVER_PROMPT);

  // Show Settings → Theme Music state
  const [themeMusic, setThemeMusic] = useState(null);
  const [themePrompt, setThemePrompt] = useState('');
  const [themeBusy, setThemeBusy] = useState('');
  const [themeEnabled, setThemeEnabled] = useState(false);
  const [themeToggleBusy, setThemeToggleBusy] = useState(false);

  // Show Settings → Apple / RSS state
  const [rssCopied, setRssCopied] = useState(false);

  const [confirmModal, setConfirmModal] = useState(null);
  const pollTimerRef = useRef(null);

  // Reset category to first option when audience changes so we never render
  // an "adult" category under the kids list (or vice-versa).
  useEffect(() => {
    const list = audience === 'kids' ? KIDS_CATEGORIES : ADULT_CATEGORIES;
    if (!list.includes(category)) setCategory(list[0]);
  }, [audience, category]);

  // Deep-link ?topic= pre-fills the topic box.
  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      const pre = p.get('topic');
      if (pre) { setTopic(pre); setMode('idea'); }
    } catch {}
  }, []);

  const loadLibrary = useCallback(async () => {
    try { const d = await api('/api/quick-podcast/library'); setLibrary(d.episodes || []); } catch {}
  }, []);
  useEffect(() => { loadLibrary(); }, [loadLibrary]);

  // Mount-time load: theme-music opt-in + RSS feed URL so Show Settings
  // rows can render instantly when the user expands them.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const t = await api('/api/quick-podcast/theme-music/toggle');
        if (!cancelled && t && typeof t.enabled === 'boolean') setThemeEnabled(t.enabled);
      } catch {}
      try {
        const f = await api('/api/quick-podcast/my-feed');
        if (!cancelled && f) {
          setFeed(f);
          if (typeof f.cover_image_prompt === 'string' && f.cover_image_prompt) {
            setCoverPrompt(f.cover_image_prompt);
          }
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  // Active-episode status poll until audio_ready | failed.
  useEffect(() => {
    if (!activeEpisodeId) return;
    const tick = async () => {
      try {
        const s = await api(`/api/quick-podcast/${activeEpisodeId}/status`);
        setStatus(s);
        if (s.status === 'audio_ready') {
          clearInterval(pollTimerRef.current);
          const d = await api(`/api/quick-podcast/${activeEpisodeId}`);
          setDetail(d);
          setGeneratingExpanded(false); // auto-collapse the block on completion
          loadLibrary();
        } else if (s.status === 'failed') {
          clearInterval(pollTimerRef.current);
          setToast('Generation failed — try again');
          setTimeout(() => setToast(''), 3500);
        }
      } catch { /* next tick retries */ }
    };
    tick();
    pollTimerRef.current = setInterval(tick, 2000);
    return () => clearInterval(pollTimerRef.current);
  }, [activeEpisodeId, loadLibrary]);

  // ─── Derived values ────────────────────────────────────────────────
  const categories = audience === 'kids' ? KIDS_CATEGORIES : ADULT_CATEGORIES;
  const generating = Boolean(activeEpisodeId) && status?.status !== 'audio_ready' && status?.status !== 'failed';
  const audioReady = status?.status === 'audio_ready';
  const costEstimate = useMemo(() => {
    const audio = (lengthMinutes * 750 * 4.2) / 1_000_000;
    return 0.05 + audio;
  }, [lengthMinutes]);
  const seconds = useMemo(() => lengthMinutes * 60, [lengthMinutes]);
  const timeEst = TIME_ESTIMATE[lengthMinutes] || '~1 min';

  // ─── Handlers ──────────────────────────────────────────────────────
  const toggleHost = (name) => {
    setSelectedHosts((prev) => {
      if (prev.includes(name)) {
        if (prev.length === 1) return prev; // at least one host must stay selected
        return prev.filter((n) => n !== name);
      }
      if (prev.length >= 3) return prev;
      return [...prev, name];
    });
  };

  const pickRandomTopic = () => {
    const bank = audience === 'kids' ? RANDOM_TOPICS_KIDS : RANDOM_TOPICS_ADULTS;
    const list = bank[category] || Object.values(bank)[0];
    return list[Math.floor(Math.random() * list.length)];
  };

  const generate = async () => {
    let outgoingTopic = '';
    if (mode === 'random') {
      outgoingTopic = pickRandomTopic();
    } else {
      const t = topic.trim();
      if (!t) { setToast('Type a topic first'); setTimeout(() => setToast(''), 2000); return; }
      outgoingTopic = t;
    }
    setBusy('generate');
    setDetail(null);
    setStatus(null);
    try {
      const hostCount = selectedHosts.length;
      const requestMode = hostCount === 1 ? 'solo' : 'conversation';
      const r = await api('/api/quick-podcast/generate', {
        method: 'POST',
        body: JSON.stringify({
          topic: outgoingTopic,
          length_minutes: lengthMinutes,
          duration_minutes: lengthMinutes,
          mode: requestMode,
          host_count: hostCount,
          audience,
          category,
          host_names: selectedHosts,
          theme_music_enabled: themeEnabled,
        }),
      });
      setActiveEpisodeId(r.episode_id);
      setGeneratingExpanded(false); // fresh generation opens collapsed per spec
      if (mode === 'random') setTopic(outgoingTopic); // surface the picked topic so they see what shipped
    } catch (e) { setToast(e.message); setTimeout(() => setToast(''), 3000); }
    setBusy('');
  };

  const reset = () => {
    setActiveEpisodeId(null);
    setStatus(null);
    setDetail(null);
    setTopic('');
    // Scroll back to the top of the left rail so the form is in view.
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch {}
  };

  const cancelGeneration = () => {
    // "Cancel" here means stop watching — episode generation continues in the
    // queue consumer (we don't have a kill API). Clears the active id so the
    // poll effect tears down; the library will still pick up the completed
    // episode on its next refresh.
    clearInterval(pollTimerRef.current);
    setActiveEpisodeId(null);
    setStatus(null);
    setGeneratingExpanded(false);
    setToast('Stopped watching — generation continues in the background');
    setTimeout(() => setToast(''), 2500);
  };

  const deleteEpisode = (ep) => {
    setConfirmModal({
      title: 'Delete this podcast?',
      message: `"${ep.topic}" will be removed from your library and the audio file deleted. Cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'destructive',
      onConfirm: async () => {
        const snapshot = library;
        setLibrary((prev) => prev.filter((x) => x.id !== ep.id));
        if (activeEpisodeId === ep.id) { setActiveEpisodeId(null); setDetail(null); setStatus(null); }
        try { await api(`/api/quick-podcast/${ep.id}`, { method: 'DELETE' }); }
        catch (e) { setLibrary(snapshot); setToast(e.message); setTimeout(() => setToast(''), 3000); }
      },
    });
  };

  const openEpisode = async (ep) => {
    if (ep.status !== 'audio_ready') return;
    setActiveEpisodeId(ep.id);
    try {
      const d = await api(`/api/quick-podcast/${ep.id}`);
      setDetail(d);
      setStatus({ status: 'audio_ready', audio_url: d.audio_url, audio_duration_seconds: d.audio_duration_seconds });
    } catch {}
  };

  // ─── Show Settings / feed / theme / apple handlers (preserved) ─────
  const reloadFeed = async () => {
    try { const d = await api('/api/quick-podcast/my-feed'); setFeed(d); } catch {}
  };

  const regenerateCover = async () => {
    setCoverBusy('regen');
    try {
      const trimmed = coverPrompt.trim();
      const r = await api('/api/quick-podcast/regenerate-cover', {
        method: 'POST',
        body: JSON.stringify(trimmed ? { prompt: trimmed } : {}),
      });
      setCoverCacheBust(Date.now());
      if (r?.cover_image_updated_at) setFeed((f) => (f ? { ...f, cover_image_updated_at: r.cover_image_updated_at } : f));
      await reloadFeed();
      setToast('New cover generated'); setTimeout(() => setToast(''), 2000);
    } catch (e) { setToast(e.message); }
    finally { setCoverBusy(''); }
  };
  const uploadCover = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverBusy('upload');
    try {
      const fd = new FormData(); fd.append('cover', file);
      const res = await fetch('/api/quick-podcast/upload-cover', { method: 'POST', body: fd, credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Upload failed ${res.status}`);
      setCoverCacheBust(Date.now());
      if (data?.cover_image_updated_at) setFeed((f) => (f ? { ...f, cover_image_updated_at: data.cover_image_updated_at } : f));
      await reloadFeed();
      setToast('Cover uploaded'); setTimeout(() => setToast(''), 2000);
    } catch (err) { setToast(err.message); }
    finally { setCoverBusy(''); e.target.value = ''; }
  };

  const loadThemeMusic = async () => {
    try {
      const d = await api('/api/quick-podcast/theme-music');
      setThemeMusic(d);
      if (d?.prompt && !themePrompt) setThemePrompt(d.prompt);
    } catch (e) { setToast(e.message); }
  };
  const regenerateTheme = async () => {
    setThemeBusy('regen');
    try {
      const res = await fetch('/api/quick-podcast/theme-music', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(themePrompt.trim() ? { prompt: themePrompt.trim() } : {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Regen failed ${res.status}`);
      await loadThemeMusic();
      setToast('Theme music generated'); setTimeout(() => setToast(''), 2500);
    } catch (err) { setToast(err.message); }
    finally { setThemeBusy(''); }
  };
  const uploadTheme = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setThemeBusy('upload');
    try {
      const fd = new FormData(); fd.append('audio', file);
      const res = await fetch('/api/quick-podcast/theme-music', { method: 'PUT', body: fd, credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Upload failed ${res.status}`);
      await loadThemeMusic();
      setToast('Theme music uploaded'); setTimeout(() => setToast(''), 2000);
    } catch (err) { setToast(err.message); }
    finally { setThemeBusy(''); e.target.value = ''; }
  };
  const toggleTheme = async () => {
    if (themeToggleBusy) return;
    const next = !themeEnabled;
    setThemeEnabled(next);
    setThemeToggleBusy(true);
    try {
      await api('/api/quick-podcast/theme-music/toggle', { method: 'POST', body: JSON.stringify({ enabled: next }) });
    } catch (e) {
      setThemeEnabled(!next);
      setToast(e?.message || 'Toggle failed');
      setTimeout(() => setToast(''), 2500);
    } finally { setThemeToggleBusy(false); }
  };

  const copyRssUrl = async () => {
    if (!feed?.feed_url) return;
    try { await navigator.clipboard.writeText(feed.feed_url); setRssCopied(true); setTimeout(() => setRssCopied(false), 1500); }
    catch { setToast('Copy failed'); setTimeout(() => setToast(''), 1500); }
  };
  const rotateFeed = () => {
    setConfirmModal({
      title: 'Reset your RSS URL?',
      message: 'This will invalidate your current URL. Anyone subscribed — including you in Apple Podcasts — will need to re-add the new URL. Continue?',
      confirmLabel: 'Reset URL',
      variant: 'destructive',
      onConfirm: async () => {
        try { const d = await api('/api/quick-podcast/rotate-feed', { method: 'POST' }); setFeed(d); setToast('New URL ready — re-add it in Apple Podcasts'); setTimeout(() => setToast(''), 4000); }
        catch (e) { setToast(e.message); }
      },
    });
  };
  const rssToken = useMemo(() => {
    if (!feed?.feed_url) return '';
    const m = String(feed.feed_url).match(/\/feed\/([a-f0-9]{16,})\.xml/i);
    return m ? m[1] : '';
  }, [feed?.feed_url]);

  // ─── Responsive layout check ────────────────────────────────────────
  const [isNarrow, setIsNarrow] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false,
  );
  useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // ─── Left: Generate Form ───────────────────────────────────────────
  const generateCard = (
    <section style={cardStyle}>
      <div style={{ ...eyebrowStyle, marginBottom: 6 }}>✦ QUICK PODCAST</div>
      <h1 style={{
        fontFamily: 'DM Sans', fontSize: 24, fontWeight: 600,
        lineHeight: 1.15, letterSpacing: '-0.01em',
        color: 'var(--ink)', margin: '0 0 2px',
      }}>Quark Cast</h1>
      <p style={{
        fontFamily: 'DM Sans', fontSize: 12,
        color: 'var(--text-mid)', margin: '0 0 14px', lineHeight: 1.5,
      }}>Any topic. Ready in minutes.</p>

      {/* Mode toggle */}
      <div style={{
        display: 'flex', gap: 3, padding: 3,
        background: 'var(--surface-inp)', borderRadius: 7,
        marginBottom: 12,
      }}>
        {[
          { key: 'idea', label: 'I have an idea' },
          { key: 'random', label: 'Random' },
        ].map((m) => (
          <button
            key={m.key}
            onClick={() => setMode(m.key)}
            style={{
              flex: 1, padding: '7px 10px',
              background: mode === m.key ? 'var(--ink)' : 'transparent',
              color: mode === m.key ? '#fff' : 'var(--ink-mid)',
              border: mode === m.key ? '1px solid var(--ink)' : 'none',
              borderRadius: 5,
              fontFamily: 'DM Sans', fontSize: 12, fontWeight: 500,
              cursor: 'pointer', lineHeight: 1.2,
              transition: 'background 0.12s, color 0.12s',
            }}
          >{m.label}</button>
        ))}
      </div>

      {/* Topic input (idea mode) or hint (random mode) */}
      {mode === 'idea' ? (
        <textarea
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Type a topic, ask a question, or paste a URL…"
          style={{
            width: '100%', height: 62,
            padding: 10,
            fontFamily: 'DM Sans', fontSize: 13, lineHeight: 1.4,
            color: 'var(--text)',
            background: 'var(--surface-inp)',
            border: '1px solid var(--border)', borderRadius: 7,
            resize: 'none', outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      ) : (
        <div style={{
          padding: '10px 4px',
          fontFamily: 'DM Sans', fontSize: 12,
          fontStyle: 'italic',
          color: 'var(--text-muted, #9B8F82)',
        }}>
          We'll pick a topic — you pick the shape.
        </div>
      )}

      {/* Audience */}
      <div style={{ marginTop: 12 }}>
        <label style={miniLabelStyle}>Audience</label>
        <div style={{ display: 'flex', gap: 6, marginTop: 5 }}>
          {['adults', 'kids'].map((a) => (
            <button
              key={a}
              onClick={() => setAudience(a)}
              style={{
                flex: 1, padding: '7px 10px',
                background: audience === a ? 'var(--ink)' : 'transparent',
                color: audience === a ? '#fff' : 'var(--ink-mid)',
                border: audience === a ? '1px solid var(--ink)' : '1px solid var(--border)',
                borderRadius: 6,
                fontFamily: 'DM Sans', fontSize: 12, fontWeight: 500,
                cursor: 'pointer', textTransform: 'capitalize',
              }}
            >{a}</button>
          ))}
        </div>
      </div>

      {/* Category */}
      <div style={{ marginTop: 10 }}>
        <label style={miniLabelStyle}>Category</label>
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr',
          gap: 5, marginTop: 5,
        }}>
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              style={{
                padding: '6px 8px',
                background: category === c ? 'var(--amber)' : 'transparent',
                color: category === c ? '#fff' : 'var(--text-mid)',
                border: category === c ? '1px solid var(--amber)' : '1px solid var(--border)',
                borderRadius: 6,
                fontFamily: 'DM Sans', fontSize: 10, fontWeight: 500,
                cursor: 'pointer', lineHeight: 1.2,
                textAlign: 'center',
              }}
            >{c}</button>
          ))}
        </div>
      </div>

      {/* Length — segmented */}
      <div style={{ marginTop: 10 }}>
        <label style={miniLabelStyle}>Length</label>
        <div style={{
          display: 'flex', marginTop: 5,
          border: '1px solid var(--border)',
          borderRadius: 6, overflow: 'hidden',
        }}>
          {LENGTHS.map((m, i) => (
            <button
              key={m}
              onClick={() => setLengthMinutes(m)}
              style={{
                flex: 1, padding: '7px 0',
                background: lengthMinutes === m ? 'var(--ink)' : 'transparent',
                color: lengthMinutes === m ? '#fff' : 'var(--ink-mid)',
                border: 'none',
                borderLeft: i > 0 ? '1px solid var(--border)' : 'none',
                fontFamily: 'DM Sans', fontSize: 12, fontWeight: 500,
                cursor: 'pointer', lineHeight: 1,
              }}
            >{m}m</button>
          ))}
        </div>
      </div>

      {/* Hosts tiles */}
      <div style={{ marginTop: 10 }}>
        <label style={miniLabelStyle}>Hosts</label>
        <div style={{ display: 'flex', gap: 5, marginTop: 5 }}>
          {HOSTS.map((h) => {
            const sel = selectedHosts.includes(h.name);
            return (
              <button
                key={h.name}
                onClick={() => toggleHost(h.name)}
                style={{
                  flex: 1, padding: '7px 4px',
                  background: sel ? 'var(--ink)' : 'transparent',
                  color: sel ? '#fff' : 'var(--ink-mid)',
                  border: sel ? '1px solid var(--ink)' : '1px solid var(--border)',
                  borderRadius: 6,
                  fontFamily: 'DM Sans',
                  cursor: 'pointer', lineHeight: 1.1,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 500 }}>{h.name}</span>
                <span style={{ fontSize: 9, color: sel ? 'rgba(255,255,255,0.6)' : 'var(--text-muted, #9B8F82)' }}>
                  ({h.voice})
                </span>
              </button>
            );
          })}
        </div>
        <div style={{
          marginTop: 4,
          fontFamily: 'DM Sans', fontSize: 9,
          color: 'var(--text-muted, #9B8F82)',
        }}>Tap to add · Customize names in Show Settings</div>
      </div>

      {/* Estimate band */}
      <div style={{
        marginTop: 12, padding: '6px 10px',
        background: 'var(--surface-inp)', borderRadius: 6,
        fontFamily: 'DM Sans', fontSize: 11, color: 'var(--text-mid)',
      }}>
        ≈ {seconds}s of audio · ~${costEstimate.toFixed(2)} · Ready in {timeEst}
      </div>

      {/* Generate button */}
      <button
        onClick={generate}
        disabled={busy === 'generate' || generating || (mode === 'idea' && !topic.trim())}
        style={{
          width: '100%', marginTop: 10, padding: '12px 16px',
          background: 'var(--amber)', color: '#fff',
          border: 'none', borderRadius: 7,
          fontFamily: 'DM Sans', fontSize: 14, fontWeight: 600, lineHeight: 1,
          cursor: (busy === 'generate' || generating || (mode === 'idea' && !topic.trim())) ? 'not-allowed' : 'pointer',
          opacity: (busy === 'generate' || generating || (mode === 'idea' && !topic.trim())) ? 0.5 : 1,
          transition: 'opacity 0.15s',
        }}
      >
        {busy === 'generate'
          ? 'Starting…'
          : mode === 'random' ? 'Surprise Me →' : 'Generate Podcast →'}
      </button>
    </section>
  );

  // ─── Left: Generating block ────────────────────────────────────────
  const currentStatus = status?.status;
  const activePhaseIdx = PHASES.findIndex((p) => p.statusMatch === currentStatus);
  const fillWidth = currentStatus === 'audio_ready'
    ? 100
    : activePhaseIdx >= 0 ? PHASES[activePhaseIdx].fill : 4;

  const PHASE_LABELS = {
    queued: 'Queued',
    researching: 'Researching',
    casting: 'Casting',
    scripting: 'Scripting',
    generating_audio: 'Rendering',
    audio_ready: 'Ready',
  };
  const phaseBadge = PHASE_LABELS[currentStatus] || 'Working…';

  const generatingBlock = generating && (
    <section style={{ ...cardStyle, marginTop: 12, padding: 0 }}>
      <button
        onClick={() => setGeneratingExpanded((v) => !v)}
        style={{
          width: '100%',
          padding: '10px 12px',
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'transparent', border: 'none', cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <div style={{
          width: 12, height: 12, borderRadius: '50%',
          border: '2px solid var(--surface-inp)', borderTopColor: 'var(--amber)',
          animation: 'quickpod-spin 0.9s linear infinite',
          flexShrink: 0,
        }} />
        <div style={{
          flex: 1, minWidth: 0,
          fontFamily: 'DM Sans', fontSize: 12, fontWeight: 500, color: 'var(--text)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          maxWidth: 160,
        }}>{topic || detail?.topic || 'Your episode'}</div>
        <span style={{
          padding: '2px 8px', borderRadius: 10,
          background: 'rgba(184,135,46,0.12)',
          color: 'var(--amber)',
          fontFamily: 'DM Sans', fontSize: 10, fontWeight: 500,
          flexShrink: 0,
        }}>{phaseBadge}</span>
        <span style={{ color: 'var(--text-muted, #9B8F82)', fontSize: 11, flexShrink: 0 }}>
          {generatingExpanded ? '▴' : '▾'}
        </span>
      </button>

      <style>{`@keyframes quickpod-spin { to { transform: rotate(360deg); } }`}</style>

      {generatingExpanded && (
        <div style={{ borderTop: '1px solid var(--border-light, var(--border))', padding: 12 }}>
          {/* Thermometer */}
          <div style={{
            position: 'relative',
            height: 7, borderRadius: 4,
            background: 'var(--surface-inp)',
            overflow: 'visible',
          }}>
            <div style={{
              position: 'absolute', left: 0, top: 0, bottom: 0,
              width: `${fillWidth}%`,
              background: 'var(--amber)',
              borderRadius: 4,
              transition: 'width 0.4s ease',
            }} />
            <div style={{
              position: 'absolute',
              left: `calc(${fillWidth}% - 6px)`,
              top: -3,
              width: 13, height: 13, borderRadius: '50%',
              background: 'var(--amber)',
              border: '2px solid #fff',
              boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
              transition: 'left 0.4s ease',
            }} />
          </div>

          {/* Phase dots */}
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            marginTop: 12,
          }}>
            {PHASES.map((p, i) => {
              const isActive = i === activePhaseIdx && currentStatus !== 'audio_ready';
              const isDone = currentStatus === 'audio_ready' || (activePhaseIdx >= 0 && i < activePhaseIdx);
              // Pipeline dot semantics: done = success (semantic),
              // active = amber (accent), queued = ink-faint (inert).
              const dotColor = isDone ? 'var(--success)' : isActive ? 'var(--amber)' : 'var(--ink-faint)';
              const labelColor = isDone ? 'var(--success)' : isActive ? 'var(--amber)' : 'var(--ink-light)';
              return (
                <div key={p.key} style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                  flex: 1,
                }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: dotColor, display: 'block' }} />
                  <span style={{
                    fontFamily: 'DM Sans', fontSize: 8,
                    color: labelColor,
                    fontWeight: isActive ? 500 : 400,
                    letterSpacing: '0.04em',
                  }}>{p.label}</span>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginTop: 12,
          }}>
            <span style={{ fontFamily: 'DM Sans', fontSize: 9, color: 'var(--text-muted, #9B8F82)' }}>
              Continues if you leave this page
            </span>
            <button
              onClick={cancelGeneration}
              style={{
                padding: '3px 10px',
                background: 'transparent',
                border: '1px solid var(--border)',
                color: 'var(--text-mid)',
                fontFamily: 'DM Sans', fontSize: 10,
                borderRadius: 5,
                cursor: 'pointer',
              }}
            >Cancel</button>
          </div>
        </div>
      )}
    </section>
  );

  // ─── Left: Show Settings (feed cover, theme music, apple/RSS) ───────
  const settingsRow = (key, label, open) => (
    <button
      onClick={() => {
        // Lazy-load the data each drawer needs when it first opens.
        const nextOpen = openRow === key ? null : key;
        if (nextOpen === 'cover' && !feed) reloadFeed();
        if (nextOpen === 'theme' && !themeMusic) loadThemeMusic();
        if (nextOpen === 'apple' && !feed) reloadFeed();
        setOpenRow(nextOpen);
      }}
      style={{
        width: '100%',
        padding: '7px 10px', marginTop: 6,
        background: 'var(--surface-inp)',
        border: 'none', borderRadius: 6,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        cursor: 'pointer',
        fontFamily: 'DM Sans', fontSize: 11, fontWeight: 500,
        color: 'var(--text)',
      }}
    >
      <span>{label}</span>
      <span style={{
        color: 'var(--text-mid)', fontSize: 12,
        transform: open ? 'rotate(90deg)' : 'none',
        transition: 'transform 0.15s',
      }}>›</span>
    </button>
  );

  const showSettingsCard = (
    <section style={{ ...cardStyle, marginTop: 12, padding: 0 }}>
      <button
        onClick={() => setSettingsOpen((v) => !v)}
        style={{
          width: '100%', padding: '12px 14px',
          background: 'transparent', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          ...eyebrowStyle,
        }}
      >
        <span>✦ SHOW SETTINGS</span>
        <span style={{ color: 'var(--text-mid)', fontSize: 12 }}>{settingsOpen ? '▴' : '▾'}</span>
      </button>

      {settingsOpen && (
        <div style={{ padding: '0 12px 12px' }}>
          {/* Row 1 — Your Hosts (stub) */}
          {settingsRow('hosts', 'Your Hosts', openRow === 'hosts')}
          {openRow === 'hosts' && (
            <div style={{ padding: '10px 2px', fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text-mid)', lineHeight: 1.5 }}>
              Your three hosts are <strong style={{ color: 'var(--text)' }}>Blair</strong>, <strong style={{ color: 'var(--text)' }}>Curtis</strong>, and <strong style={{ color: 'var(--text)' }}>Jackson</strong>.
              Renaming is coming soon — voices stay tied to each slot (Ara / Rex / Sal).
            </div>
          )}

          {/* Row 2 — Feed Cover */}
          {settingsRow('cover', 'Feed Cover', openRow === 'cover')}
          {openRow === 'cover' && (
            <div style={{ padding: '10px 2px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                {rssToken && feed?.cover_image_updated_at ? (
                  <img
                    src={`/api/quick-podcast/feed-cover/${rssToken}.png?t=${coverCacheBust}`}
                    alt=""
                    onClick={() => setCoverLightboxOpen(true)}
                    style={{
                      width: 80, height: 80, borderRadius: 6,
                      objectFit: 'cover', border: '1px solid var(--border)',
                      background: 'var(--surface-inp)', flexShrink: 0, cursor: 'pointer',
                    }}
                  />
                ) : (
                  <div style={{
                    width: 80, height: 80, borderRadius: 6,
                    background: 'var(--surface-inp)', border: '1px dashed var(--border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--text-mid)', fontSize: 10, textAlign: 'center', flexShrink: 0,
                  }}>No cover yet</div>
                )}
                <div style={{ flex: 1, minWidth: 0, fontFamily: 'DM Sans', fontSize: 11, color: 'var(--text-mid)', lineHeight: 1.5 }}>
                  What Apple Podcasts, Spotify, and every podcast app shows for your feed.
                </div>
              </div>
              <div style={miniLabelStyle}>Prompt</div>
              <textarea
                value={coverPrompt}
                onChange={(e) => setCoverPrompt(e.target.value)}
                rows={4}
                style={{
                  width: '100%', padding: 8, marginTop: 4,
                  fontFamily: 'DM Sans', fontSize: 11, lineHeight: 1.5,
                  color: 'var(--text)', background: 'var(--surface-inp)',
                  border: '1px solid var(--border)', borderRadius: 6,
                  resize: 'vertical', outline: 'none', boxSizing: 'border-box',
                }}
              />
              <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button
                  onClick={regenerateCover}
                  disabled={coverBusy !== ''}
                  style={{
                    ...smallBtnStyle,
                    background: 'var(--amber)', color: '#fff', border: '1px solid var(--amber)',
                    opacity: coverBusy ? 0.6 : 1, cursor: coverBusy ? 'wait' : 'pointer',
                  }}
                >{coverBusy === 'regen' ? 'Generating…' : 'Generate cover'}</button>
                <label style={{
                  ...smallBtnStyle,
                  opacity: coverBusy ? 0.6 : 1, cursor: coverBusy ? 'wait' : 'pointer',
                  display: 'inline-block',
                }}>
                  {coverBusy === 'upload' ? 'Uploading…' : 'Upload custom'}
                  <input type="file" accept="image/png,image/jpeg" onChange={uploadCover} disabled={coverBusy !== ''} style={{ display: 'none' }} />
                </label>
                <button
                  onClick={() => setCoverPrompt(DEFAULT_COVER_PROMPT)}
                  disabled={coverPrompt === DEFAULT_COVER_PROMPT}
                  style={{
                    ...smallBtnStyle,
                    opacity: coverPrompt === DEFAULT_COVER_PROMPT ? 0.5 : 1,
                    cursor: coverPrompt === DEFAULT_COVER_PROMPT ? 'default' : 'pointer',
                  }}
                >Reset prompt</button>
              </div>
            </div>
          )}

          {/* Row 3 — Theme Music */}
          {settingsRow('theme', 'Theme Music', openRow === 'theme')}
          {openRow === 'theme' && (
            <div style={{ padding: '10px 2px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>
                    Theme Music
                  </div>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--text-mid)', lineHeight: 1.4, marginTop: 1 }}>
                    Custom intro &amp; outro baked into every episode.
                  </div>
                </div>
                <ToggleSwitch enabled={themeEnabled} onChange={toggleTheme} disabled={themeToggleBusy} />
              </div>
              {themeMusic?.has_music ? (
                <>
                  <div style={{ marginTop: 8 }}>
                    <div style={miniLabelStyle}>Intro</div>
                    <audio controls preload="none" src={`${themeMusic.intro_url}?v=${themeMusic.generated_at || 0}`} style={{ width: '100%', marginTop: 4 }} />
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <div style={miniLabelStyle}>Outro</div>
                    <audio controls preload="none" src={`${themeMusic.outro_url}?v=${themeMusic.generated_at || 0}`} style={{ width: '100%', marginTop: 4 }} />
                  </div>
                </>
              ) : (
                <div style={{ marginTop: 8, padding: 8, background: 'var(--surface-inp)', borderRadius: 6, fontFamily: 'DM Sans', fontSize: 11, color: 'var(--text-mid)' }}>
                  No theme music yet. Regenerate to create one.
                </div>
              )}
              <div style={{ marginTop: 10 }}>
                <div style={miniLabelStyle}>Prompt (optional)</div>
                <textarea
                  value={themePrompt}
                  onChange={(e) => setThemePrompt(e.target.value)}
                  placeholder="Describe your ideal theme music, or leave blank for the default."
                  rows={3}
                  style={{
                    width: '100%', padding: 8, marginTop: 4,
                    fontFamily: 'DM Sans', fontSize: 11, lineHeight: 1.5,
                    color: 'var(--text)', background: 'var(--surface-inp)',
                    border: '1px solid var(--border)', borderRadius: 6,
                    resize: 'vertical', outline: 'none', boxSizing: 'border-box',
                  }}
                />
              </div>
              <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button onClick={regenerateTheme} disabled={themeBusy !== ''} style={{ ...smallBtnStyle, background: 'var(--amber)', color: '#fff', border: '1px solid var(--amber)', opacity: themeBusy ? 0.6 : 1, cursor: themeBusy ? 'wait' : 'pointer' }}>
                  {themeBusy === 'regen' ? 'Generating…' : 'Regenerate (~$0.04)'}
                </button>
                <label style={{ ...smallBtnStyle, opacity: themeBusy ? 0.6 : 1, cursor: themeBusy ? 'wait' : 'pointer', display: 'inline-block' }}>
                  {themeBusy === 'upload' ? 'Uploading…' : 'Upload custom'}
                  <input type="file" accept="audio/mpeg,audio/wav" onChange={uploadTheme} disabled={themeBusy !== ''} style={{ display: 'none' }} />
                </label>
              </div>
              {themeMusic?.generated_at && (
                <div style={{ marginTop: 8, fontFamily: 'DM Sans', fontSize: 10, color: 'var(--text-mid)' }}>
                  Last updated: {formatRelative(themeMusic.generated_at)} · {themeMusic.is_custom ? 'Custom upload' : 'AI generated'}
                </div>
              )}
            </div>
          )}

          {/* Row 4 — Apple Podcasts & RSS */}
          {settingsRow('apple', 'Apple Podcasts & RSS', openRow === 'apple')}
          {openRow === 'apple' && (
            <div style={{ padding: '10px 2px' }}>
              <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text-mid)', lineHeight: 1.5, marginBottom: 8 }}>
                Subscribe in Apple Podcasts, Spotify, or any podcast app by pasting this URL.
              </div>
              <div style={{ display: 'flex', gap: 5 }}>
                <input
                  readOnly
                  value={feed?.feed_url || 'Loading…'}
                  onFocus={(e) => e.target.select()}
                  style={{
                    flex: 1, minWidth: 0, padding: '7px 9px',
                    fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-mid)',
                    background: 'var(--surface-inp)', border: '1px solid var(--border)',
                    borderRadius: 6, outline: 'none',
                  }}
                />
                <button
                  onClick={copyRssUrl}
                  disabled={!feed?.feed_url}
                  style={{
                    background: rssCopied ? 'var(--success)' : 'var(--amber)',
                    color: '#fff', border: 'none', borderRadius: 6,
                    padding: '7px 12px', fontSize: 11, fontWeight: 600,
                    cursor: feed?.feed_url ? 'pointer' : 'not-allowed',
                    opacity: feed?.feed_url ? 1 : 0.5,
                    fontFamily: 'DM Sans', flexShrink: 0,
                    transition: 'background 0.15s',
                  }}
                >{rssCopied ? '✓ Copied' : 'Copy'}</button>
              </div>
              <div style={{
                marginTop: 10,
                fontFamily: 'DM Sans', fontSize: 11, color: 'var(--text)',
              }}>
                <strong>How to subscribe (3 steps):</strong>
                <ol style={{ marginTop: 4, paddingLeft: 18, color: 'var(--text-mid)', lineHeight: 1.6 }}>
                  <li>Open Apple Podcasts on your iPhone</li>
                  <li>Library → &ldquo;&hellip;&rdquo; → Follow a Show by URL</li>
                  <li>Paste your feed URL and tap Follow</li>
                </ol>
              </div>
              <div style={{
                marginTop: 10, paddingTop: 10,
                borderTop: '1px solid var(--border-light, var(--border))',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                fontFamily: 'DM Sans', fontSize: 11, color: 'var(--text-mid)',
              }}>
                <span>{feed?.rotated_at ? `Last rotated: ${formatRelative(feed.rotated_at)}` : 'Never rotated.'}</span>
                <button onClick={rotateFeed} style={{ ...smallBtnStyle, color: 'var(--error, #8B3A2A)' }}>Reset URL</button>
              </div>
              <div style={{
                marginTop: 8, fontFamily: 'DM Sans', fontSize: 10, fontStyle: 'italic',
                color: 'var(--warning, #9A6B1A)', lineHeight: 1.5,
              }}>
                Warning: resetting will break all existing subscriptions — you'll need to re-subscribe with the new URL.
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );

  // ─── Right: Player ─────────────────────────────────────────────────
  const hostsLine = detail?.host_names && detail.host_names.length
    ? (Array.isArray(detail.host_names) ? detail.host_names.join(', ') : String(detail.host_names))
    : (detail?.hosts || []).map((h) => h.name).join(', ');

  const playerCard = audioReady && detail && (
    <section style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
      <EpisodeCover id={activeEpisodeId} />
      <div style={{ padding: '12px 14px' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          fontFamily: 'DM Sans', fontSize: 10, fontWeight: 500,
          color: 'var(--success)', letterSpacing: '0.08em', textTransform: 'uppercase',
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)', display: 'inline-block' }} />
          Ready
        </div>
        <h2 style={{
          fontFamily: 'DM Sans', fontSize: 15, fontWeight: 600,
          color: 'var(--text)', margin: '4px 0 3px',
          lineHeight: 1.3,
        }}>{detail.topic}</h2>
        <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--text-muted, #9B8F82)' }}>
          {hostsLine || `${detail.hosts?.length || 0} host${(detail.hosts?.length || 0) !== 1 ? 's' : ''}`}
          {' · '}{formatDuration(detail.audio_duration_seconds)}
          {' · '}{(detail.sources?.length || 0)} source{(detail.sources?.length || 0) !== 1 ? 's' : ''}
        </div>

        <CustomAudioPlayer
          src={detail.audio_url}
          totalDurationSeconds={detail.audio_duration_seconds}
        />

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 10 }}>
          <button onClick={() => setShowSources((v) => !v)} style={smallBtnStyle}>{showSources ? 'Hide' : 'View'} Sources</button>
          <button onClick={() => setShowScript((v) => !v)} style={smallBtnStyle}>{showScript ? 'Hide' : 'View'} Script</button>
        </div>

        {showSources && detail.sources && detail.sources.length > 0 && (
          <div style={{ marginTop: 10, padding: 10, background: 'var(--surface-inp)', borderRadius: 6 }}>
            {detail.sources.map((s, i) => (
              <div key={i} style={{ marginBottom: 6, fontFamily: 'DM Sans', fontSize: 12 }}>
                <a href={s.url} target="_blank" rel="noreferrer" style={{ color: 'var(--ink)', textDecoration: 'underline' }}>{s.title}</a>
                {s.snippet && <div style={{ color: 'var(--text-mid)', fontSize: 11, marginTop: 2 }}>{s.snippet}</div>}
              </div>
            ))}
          </div>
        )}
        {showScript && (detail.script || []).length > 0 && (
          <div style={{ marginTop: 10, padding: 10, background: 'var(--surface-inp)', borderRadius: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {detail.script.map((seg, i) => (
              <div key={seg.id || i}>
                <div style={{ fontFamily: 'DM Sans', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-mid)' }}>{seg.speaker_name}</div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text)' }}>{seg.text}</div>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={reset}
          style={{
            width: '100%', marginTop: 12, padding: '12px 16px',
            background: 'var(--amber)', color: '#fff',
            border: 'none', borderRadius: 7,
            fontFamily: 'DM Sans', fontSize: 14, fontWeight: 600,
            cursor: 'pointer',
          }}
        >✦ Generate Another →</button>
      </div>
    </section>
  );

  // ─── Right: Library ────────────────────────────────────────────────
  const libraryCard = (
    <section style={{ ...cardStyle, marginTop: audioReady ? 12 : 0 }}>
      <div style={{ ...eyebrowStyle, marginBottom: 10 }}>✦ LIBRARY</div>
      {library.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-muted, #9B8F82)' }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>🎧</div>
          <div style={{ fontFamily: 'DM Sans', fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>
            No episodes yet
          </div>
          <div style={{ fontFamily: 'DM Sans', fontSize: 12, marginTop: 6 }}>
            Generate your first episode using the panel on the left.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {library.map((ep) => (
            <div
              key={ep.id}
              onClick={() => openEpisode(ep)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: 8,
                background: 'var(--bg)',
                border: '1px solid var(--border)', borderRadius: 7,
                cursor: ep.status === 'audio_ready' ? 'pointer' : 'default',
              }}
            >
              <EpisodeThumb id={ep.id} ready={ep.status === 'audio_ready'} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: 'DM Sans', fontSize: 12, fontWeight: 500, color: 'var(--text)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{ep.topic}</div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'var(--text-muted, #9B8F82)' }}>
                  {ep.status === 'audio_ready' ? (
                    <>
                      {formatDuration(ep.audio_duration_seconds)}
                      {ep.host_names
                        ? ` · ${ep.host_names}`
                        : ` · ${ep.host_count || '?'} host${ep.host_count !== 1 ? 's' : ''}`}
                      {' · '}{formatRelative(ep.created_at)}
                    </>
                  ) : ep.status === 'failed' ? 'failed'
                    : `generating… (${ep.status})`}
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); deleteEpisode(ep); }}
                style={{
                  background: 'none', border: 'none',
                  color: 'var(--text-muted, #9B8F82)',
                  cursor: 'pointer', fontSize: 12, padding: '4px 6px',
                }}
              >✕</button>
            </div>
          ))}
        </div>
      )}
    </section>
  );

  // ─── Final render ──────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--card)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <button
          onClick={() => navigate('/dashboard')}
          style={{
            padding: '6px 10px', background: 'transparent', border: 'none',
            color: 'var(--text-mid)', fontFamily: 'DM Sans', fontSize: 13,
            cursor: 'pointer',
          }}
        >◂ back to dashboard</button>
        <div style={{ fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Quick Podcast</div>
        <div style={{ width: 120 }} />
      </div>

      <div style={{
        maxWidth: 1200, margin: '0 auto',
        padding: isNarrow ? '16px 12px 80px' : '20px 20px 96px',
        display: 'flex', flexDirection: isNarrow ? 'column' : 'row',
        gap: isNarrow ? 12 : 18,
        alignItems: 'flex-start',
      }}>
        {/* LEFT — 300px fixed */}
        <div style={{
          flex: isNarrow ? '1 1 auto' : '0 0 300px',
          width: isNarrow ? '100%' : 300,
          display: 'flex', flexDirection: 'column',
          minWidth: 0,
        }}>
          {generateCard}
          {generatingBlock}
          {showSettingsCard}
        </div>

        {/* RIGHT — fluid */}
        <div style={{ flex: 1, minWidth: 0, width: '100%' }}>
          {playerCard}
          {libraryCard}
        </div>
      </div>

      {coverLightboxOpen && rssToken && (
        <div
          onClick={() => setCoverLightboxOpen(false)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999, cursor: 'pointer',
          }}
        >
          <img
            src={`/api/quick-podcast/feed-cover/${rssToken}.png?t=${coverCacheBust}`}
            alt=""
            style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 8 }}
          />
        </div>
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%',
          transform: 'translateX(-50%)',
          padding: '10px 16px',
          background: 'var(--leather-dark)',
          color: 'var(--card)',
          fontFamily: 'DM Sans', fontSize: 13, fontWeight: 500,
          borderRadius: 6,
          boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
          zIndex: 500,
        }}>{toast}</div>
      )}

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

// ─── Style tokens ─────────────────────────────────────────────────────
const cardStyle = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: 14,
  boxSizing: 'border-box',
};

const smallBtnStyle = {
  padding: '6px 11px',
  fontFamily: 'DM Sans', fontSize: 11, fontWeight: 500,
  color: 'var(--text)',
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  cursor: 'pointer',
};

function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatRelative(ts) {
  if (!ts) return 'recently';
  const sec = Math.max(0, Math.floor(Date.now() / 1000 - Number(ts)));
  if (sec < 60) return 'just now';
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  return `${w}w ago`;
}
