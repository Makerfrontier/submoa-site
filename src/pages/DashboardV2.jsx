// Dashboard v2 — configurable widget grid under the .ds-v2 system.
// Widget registry covers the 6 defaults plus 7 opt-ins (1 for every content
// type the legacy dashboard exposed), so nothing drops off a user's radar
// when they upgrade; they just have to enable the widget.
//
// Editing is its own state: Customize → dashed borders, drag handles,
// remove buttons, a persistent bottom sheet, and dnd-kit for sortable
// reordering. Done editing persists the config.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `API ${res.status}`);
  return data;
}

// Registry — id → { label, defaultSize, render(snapshot, navigate) }.
// Rendering is kept inline so every widget is its own self-contained unit
// with a shared header/body pattern.
const WIDGET_REGISTRY = {
  'stat-strip': {
    label: 'Stats', defaultSize: 'col-12 h-auto', defaultEnabled: true,
    render: (snap) => <StatStrip snap={snap} />,
  },
  'quick-generate': {
    label: 'Quick Generate', defaultSize: 'col-12 h-auto', defaultEnabled: true,
    render: (snap, navigate) => <QuickGenerate navigate={navigate} />,
  },
  'recent-articles': {
    label: 'Recent Articles', defaultSize: 'col-6 h-340', defaultEnabled: true,
    render: (snap, navigate) => <ListWidget title="Recent Articles" emptyLabel="No articles yet" items={snap.recent_articles} render={(r) => <ArticleRow row={r} navigate={navigate} />} />,
  },
  'quark-cast': {
    label: 'Quark Cast', defaultSize: 'col-6 h-340', defaultEnabled: true,
    render: (snap, navigate) => <ListWidget title="Quark Cast" emptyLabel="No episodes" items={snap.quark_cast} render={(r) => <QuarkCastRow row={r} navigate={navigate} />} />,
  },
  'atomic-flash': {
    label: 'Atomic Flash', defaultSize: 'col-4 h-280', defaultEnabled: true,
    render: (snap, navigate) => <FlashGrid items={snap.atomic_flash} navigate={navigate} />,
  },
  'morning-brief': {
    label: 'Morning Brief', defaultSize: 'col-4 h-280', defaultEnabled: true,
    render: (snap, navigate) => <MorningBrief snap={snap.morning_brief} navigate={navigate} />,
  },
  'activity': {
    label: 'Activity', defaultSize: 'col-4 h-280', defaultEnabled: true,
    render: (snap) => <Activity items={snap.activity} />,
  },
  // Opt-in widgets for content types the old Dashboard surfaced.
  'comp-drafts': {
    label: 'Comp Studio Drafts', defaultSize: 'col-6 h-340', defaultEnabled: false,
    render: (snap, navigate) => <ListWidget title="Comp Studio Drafts" emptyLabel="No drafts" items={snap.comp_drafts} render={(r) => <SimpleRow title={r.title} ts={r.updated_at} onClick={() => navigate(`/comp-studio?draft=${r.id}`)} />} />,
  },
  'itineraries': {
    label: 'Itineraries', defaultSize: 'col-6 h-340', defaultEnabled: false,
    render: (snap, navigate) => <ListWidget title="Itineraries" emptyLabel="No itineraries" items={snap.itineraries} render={(r) => <SimpleRow title={r.title} ts={r.updated_at} onClick={() => navigate(`/planner/${r.id}`)} />} />,
  },
  'presentations': {
    label: 'Presentations', defaultSize: 'col-6 h-340', defaultEnabled: false,
    render: (snap, navigate) => <ListWidget title="Presentations" emptyLabel="No decks" items={snap.presentations} render={(r) => <SimpleRow title={r.title} tag={r.status} ts={r.created_at} onClick={() => navigate('/brief/presentation')} />} />,
  },
  'emails': {
    label: 'Email Templates', defaultSize: 'col-6 h-340', defaultEnabled: false,
    render: (snap, navigate) => <ListWidget title="Email Templates" emptyLabel="No emails" items={snap.emails} render={(r) => <SimpleRow title={r.title} tag={r.status} ts={r.created_at} onClick={() => navigate('/brief/email')} />} />,
  },
  'saved-prompts': {
    label: 'Saved Prompts', defaultSize: 'col-6 h-340', defaultEnabled: false,
    render: (snap, navigate) => <ListWidget title="Saved Prompts" emptyLabel="No prompts" items={snap.saved_prompts} render={(r) => <SimpleRow title={r.title} tag={r.target_model} ts={r.created_at} onClick={() => navigate('/prompt-builder')} />} />,
  },
  'press-releases': {
    label: 'Press Releases', defaultSize: 'col-6 h-340', defaultEnabled: false,
    render: (snap, navigate) => <ListWidget title="Press Releases" emptyLabel="No releases" items={snap.press_releases} render={(r) => <SimpleRow title={r.product_or_news || r.business_name} tag={r.status} ts={r.created_at} onClick={() => navigate(`/press-release?id=${r.id}`)} />} />,
  },
  'briefs': {
    label: 'Briefs', defaultSize: 'col-6 h-340', defaultEnabled: false,
    render: (snap, navigate) => <ListWidget title="Briefs" emptyLabel="No briefs" items={snap.briefs} render={(r) => <SimpleRow title={r.title} tag={r.brief_type} ts={r.created_at} onClick={() => navigate(`/brief-builder?id=${r.id}`)} />} />,
  },
};

const DEFAULT_CONFIG = {
  widgets: [
    { id: 'stat-strip',      enabled: true, order: 0, size: 'col-12 h-auto' },
    { id: 'quick-generate',  enabled: true, order: 1, size: 'col-12 h-auto' },
    { id: 'recent-articles', enabled: true, order: 2, size: 'col-6 h-340' },
    { id: 'quark-cast',      enabled: true, order: 3, size: 'col-6 h-340' },
    { id: 'atomic-flash',    enabled: true, order: 4, size: 'col-4 h-280' },
    { id: 'morning-brief',   enabled: true, order: 5, size: 'col-4 h-280' },
    { id: 'activity',        enabled: true, order: 6, size: 'col-4 h-280' },
  ],
};

export default function DashboardV2({ navigate }) {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [snapshot, setSnapshot] = useState({});
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api('/api/dashboard/widgets'),
      api('/api/dashboard/snapshot'),
    ]).then(([cfg, snap]) => {
      if (cancelled) return;
      if (cfg && Array.isArray(cfg.widgets) && cfg.widgets.length > 0) setConfig(cfg);
      setSnapshot(snap || {});
    }).catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const saveConfig = useCallback(async (next) => {
    try {
      await api('/api/dashboard/widgets', { method: 'PUT', body: JSON.stringify({ widgets: next.widgets }) });
    } catch (e) {
      setError(e.message);
    }
  }, []);

  const enabledOrdered = useMemo(() =>
    [...config.widgets].filter(w => w.enabled).sort((a, b) => a.order - b.order),
  [config]);

  const disabledIds = useMemo(() => {
    const enabled = new Set(config.widgets.filter(w => w.enabled).map(w => w.id));
    return Object.keys(WIDGET_REGISTRY).filter(id => !enabled.has(id));
  }, [config]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const onDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = enabledOrdered.map(w => w.id);
    const from = ids.indexOf(active.id);
    const to = ids.indexOf(over.id);
    if (from < 0 || to < 0) return;
    const nextIds = arrayMove(ids, from, to);
    const next = {
      widgets: config.widgets.map(w => {
        if (!w.enabled) return w;
        const newOrder = nextIds.indexOf(w.id);
        return newOrder >= 0 ? { ...w, order: newOrder } : w;
      }),
    };
    setConfig(next);
    saveConfig(next);
  };

  const removeWidget = (id) => {
    const next = {
      widgets: config.widgets.map(w => w.id === id ? { ...w, enabled: false } : w),
    };
    setConfig(next);
    saveConfig(next);
  };

  const addWidget = (id) => {
    const existing = config.widgets.find(w => w.id === id);
    const nextOrder = Math.max(0, ...config.widgets.filter(w => w.enabled).map(w => w.order)) + 1;
    const def = WIDGET_REGISTRY[id];
    const nextWidgets = existing
      ? config.widgets.map(w => w.id === id ? { ...w, enabled: true, order: nextOrder } : w)
      : [...config.widgets, { id, enabled: true, order: nextOrder, size: def?.defaultSize || 'col-6 h-340' }];
    const next = { widgets: nextWidgets };
    setConfig(next);
    saveConfig(next);
    setAddMenuOpen(false);
  };

  const resetDefault = () => {
    setConfig(DEFAULT_CONFIG);
    saveConfig(DEFAULT_CONFIG);
  };

  return (
    <div>
      <div className="ds-v2-page">
        <div className="ds-v2-page__header">
          <div>
            <div className="ds-v2-page__eyebrow">// DASHBOARD</div>
            <h1 className="t-h1">Your command center.</h1>
          </div>
          <button
            type="button"
            className={`v2-btn${editing ? ' v2-btn--primary' : ''}`}
            onClick={() => setEditing(e => !e)}
          >
            {editing ? 'Done editing' : '✎ Customize'}
          </button>
        </div>

        {error && <div className="t-body-sm" style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</div>}
        {loading && <div className="t-body-sm" style={{ color: 'var(--ink-light)' }}>Loading dashboard…</div>}

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={enabledOrdered.map(w => w.id)} strategy={rectSortingStrategy}>
            <div className="ds-v2-widgets">
              {enabledOrdered.map(widget => (
                <WidgetShell
                  key={widget.id}
                  widget={widget}
                  snapshot={snapshot}
                  editing={editing}
                  onRemove={removeWidget}
                  navigate={navigate}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>

      <div className={`ds-v2-sheet${editing ? ' is-open' : ''}`}>
        <span className="ds-v2-sheet__label">EDIT MODE — drag to rearrange, × to remove</span>
        <div style={{ position: 'relative' }}>
          <button type="button" className="v2-btn" onClick={() => setAddMenuOpen(v => !v)} disabled={disabledIds.length === 0}>
            + Add widget ▾
          </button>
          {addMenuOpen && disabledIds.length > 0 && (
            <div
              className="ds-v2-model-menu"
              style={{ bottom: 'calc(100% + 6px)', left: 0, minWidth: 220 }}
              onMouseLeave={() => setAddMenuOpen(false)}
            >
              {disabledIds.map(id => (
                <button
                  key={id}
                  type="button"
                  className="ds-v2-model-menu__item"
                  onClick={() => addWidget(id)}
                >
                  + {WIDGET_REGISTRY[id]?.label || id}
                </button>
              ))}
            </div>
          )}
        </div>
        <button type="button" className="v2-btn" onClick={resetDefault}>Reset to default</button>
        <div style={{ flex: 1 }} />
        <button type="button" className="v2-btn v2-btn--primary" onClick={() => setEditing(false)}>Done editing</button>
      </div>
    </div>
  );
}

// ─── Widget shell (sortable + edit chrome) ───────────────────────────────
function WidgetShell({ widget, snapshot, editing, onRemove, navigate }) {
  const def = WIDGET_REGISTRY[widget.id];
  if (!def) return null;
  const sortable = useSortable({ id: widget.id, disabled: !editing });
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = sortable;
  const size = (widget.size || def.defaultSize || 'col-6 h-340').split(' ');
  const colClass = size.find(s => s.startsWith('col-')) || 'col-6';
  const heightClass = size.find(s => s.startsWith('h-')) || 'h-340';
  const heightModifier = heightClass === 'h-280' ? 'v2-card--h280'
    : heightClass === 'h-340' ? 'v2-card--h340'
    : '';

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={colClass}
    >
      <div className={`v2-card ${heightModifier}${editing ? ' ds-v2-card--editing' : ''}`}>
        {editing && (
          <>
            <button
              type="button"
              className="ds-v2-card__edit-remove"
              onClick={() => onRemove(widget.id)}
              aria-label={`Remove ${def.label}`}
            >×</button>
            <span
              className="ds-v2-card__edit-handle"
              {...attributes}
              {...listeners}
              aria-label={`Drag ${def.label}`}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                <g fill="currentColor">
                  <circle cx="4" cy="3" r="1" /><circle cx="10" cy="3" r="1" />
                  <circle cx="4" cy="7" r="1" /><circle cx="10" cy="7" r="1" />
                  <circle cx="4" cy="11" r="1" /><circle cx="10" cy="11" r="1" />
                </g>
              </svg>
            </span>
          </>
        )}
        {def.render(snapshot, navigate)}
      </div>
    </div>
  );
}

// ─── Widget implementations ──────────────────────────────────────────────
function StatStrip({ snap }) {
  const stats = snap.stats || {};
  const cells = [
    { label: 'IN PROGRESS',       value: stats.in_progress ?? 0 },
    { label: 'PUBLISHED · WEEK',  value: stats.published_week ?? 0 },
    { label: 'QUARK CAST EPS',    value: stats.quark_cast_eps ?? 0 },
    { label: 'FLASH GENS',        value: stats.flash_gens ?? 0 },
  ];
  return (
    <div className="ds-v2-stat-strip">
      {cells.map(c => (
        <div key={c.label} className="v2-card v2-card--stat ds-v2-stat">
          <div className="ds-v2-stat__label clip-1">{c.label}</div>
          <div className="ds-v2-stat__value clip-1">{c.value}</div>
        </div>
      ))}
    </div>
  );
}

function QuickGenerate({ navigate }) {
  const [value, setValue] = useState('');
  const submit = (msg) => {
    const text = (typeof msg === 'string' ? msg : value).trim();
    if (!text) return;
    try { sessionStorage.setItem('reactor:prefilled', text); } catch {}
    navigate('/reactor');
  };
  return (
    <div>
      <div className="t-mono-label clip-1" style={{ marginBottom: 8 }}>QUICK GENERATE</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          className="v2-input"
          style={{ flex: 1, minWidth: 200 }}
          placeholder="Try: 5 min podcast about the moon for kids…"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
        />
        <button type="button" className="v2-btn v2-btn--primary" onClick={() => submit()} disabled={!value.trim()}>
          React →
        </button>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
        {['article on …', 'logo for …', 'podcast about …'].map(s => (
          <button
            key={s}
            type="button"
            className="ds-v2-reactor__chip"
            onClick={() => { setValue(s); }}
          >{s}</button>
        ))}
      </div>
    </div>
  );
}

function ListWidget({ title, emptyLabel, items, render }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div className="t-mono-label clip-1" style={{ marginBottom: 10 }}>{title.toUpperCase()}</div>
      <div className="v2-card__body" style={{ gap: 8 }}>
        {(!items || items.length === 0)
          ? <div className="t-body-sm" style={{ color: 'var(--ink-light)' }}>{emptyLabel}</div>
          : items.slice(0, 5).map((row, i) => <div key={row.id || i}>{render(row)}</div>)}
      </div>
    </div>
  );
}

function ArticleRow({ row, navigate }) {
  const status = String(row.status || 'draft').toUpperCase();
  return (
    <button
      type="button"
      style={rowStyle}
      onClick={() => navigate(`/content/${row.id}`)}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="t-body-sm clip-1" style={{ fontWeight: 500 }}>{row.title || '(untitled)'}</div>
        <div className="t-mono-meta clip-1">{row.article_format || '—'}</div>
      </div>
      <span className="t-mono-tiny" style={{ color: 'var(--amber)', flexShrink: 0 }}>{status}</span>
    </button>
  );
}

function QuarkCastRow({ row, navigate }) {
  const dur = row.audio_duration_seconds
    ? `${Math.round(Number(row.audio_duration_seconds) / 60)}m`
    : '—';
  return (
    <button
      type="button"
      style={rowStyle}
      onClick={() => navigate('/listen')}
    >
      <div style={{
        width: 28, height: 28, borderRadius: '50%',
        background: 'var(--amber-soft)', color: 'var(--amber)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, fontSize: 12,
      }}>▶</div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="t-body-sm clip-1" style={{ fontWeight: 500 }}>{row.title || 'Episode'}</div>
        <div className="t-mono-meta clip-1">{String(row.status || '').toUpperCase()} · {dur}</div>
      </div>
    </button>
  );
}

function SimpleRow({ title, tag, ts, onClick }) {
  return (
    <button type="button" style={rowStyle} onClick={onClick}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="t-body-sm clip-1" style={{ fontWeight: 500 }}>{title || '(untitled)'}</div>
        {(tag || ts) && <div className="t-mono-meta clip-1">{[tag, formatTs(ts)].filter(Boolean).join(' · ')}</div>}
      </div>
    </button>
  );
}

function FlashGrid({ items, navigate }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div className="t-mono-label clip-1" style={{ marginBottom: 10 }}>ATOMIC FLASH</div>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: 'repeat(2, 1fr)',
        gap: 6, flex: 1, minHeight: 0,
      }}>
        {Array.from({ length: 6 }).map((_, i) => {
          const row = (items || [])[i];
          if (!row) {
            return (
              <div key={`empty-${i}`} style={{
                background: 'linear-gradient(135deg, var(--surface-alt), #EEE8DB)',
                borderRadius: 6,
                border: '1px solid var(--border)',
              }} />
            );
          }
          return (
            <button
              key={row.id}
              type="button"
              onClick={() => navigate('/atomic/images')}
              style={{
                borderRadius: 6,
                overflow: 'hidden',
                border: '1px solid var(--border)',
                padding: 0,
                background: 'var(--surface-alt)',
                cursor: 'pointer',
                position: 'relative',
              }}
            >
              {row.image_url
                ? <img src={row.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                : <div style={{ width: '100%', height: '100%' }} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MorningBrief({ snap, navigate }) {
  const items = (snap?.hot || []).slice(0, 4);
  const anomalyIds = new Set((snap?.anomalies || []).map(a => a.bill_id || a.id));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div className="t-mono-label clip-1" style={{ marginBottom: 10 }}>MORNING BRIEF</div>
      <div className="v2-card__body" style={{ gap: 8 }}>
        {items.length === 0
          ? <div className="t-body-sm" style={{ color: 'var(--ink-light)' }}>No brief yet today</div>
          : items.map((b, i) => (
              <button
                key={b.bill_id || i}
                type="button"
                style={rowStyle}
                onClick={() => navigate('/legislative-intelligence')}
              >
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: anomalyIds.has(b.bill_id) ? 'var(--amber)' : 'var(--ink)',
                  flexShrink: 0, marginTop: 6,
                }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="t-body-sm clip-1" style={{ fontWeight: 500 }}>{b.bill_id || '—'}</div>
                  <div className="t-mono-meta clip-1">{b.title || ''}</div>
                </div>
              </button>
            ))}
      </div>
    </div>
  );
}

function Activity({ items }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div className="t-mono-label clip-1" style={{ marginBottom: 10 }}>ACTIVITY</div>
      <div className="v2-card__body" style={{ gap: 6 }}>
        {(!items || items.length === 0)
          ? <div className="t-body-sm" style={{ color: 'var(--ink-light)' }}>No recent activity</div>
          : items.map((a, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'baseline', minWidth: 0 }}>
                <span className="t-mono-tiny" style={{ width: 44, flexShrink: 0 }}>{formatTs(a.ts, 'short')}</span>
                <span className="t-mono-tiny" style={{ color: 'var(--amber)', flexShrink: 0, textTransform: 'uppercase' }}>{a.tag}</span>
                <span className="t-body-sm clip-1" style={{ flex: 1 }}>{a.text}</span>
              </div>
            ))}
      </div>
    </div>
  );
}

const rowStyle = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 10,
  padding: '8px 10px',
  border: 'none',
  background: 'transparent',
  textAlign: 'left',
  cursor: 'pointer',
  borderRadius: 6,
  transition: 'background 0.15s',
  width: '100%',
  minWidth: 0,
};

function formatTs(ts, style = 'default') {
  if (!ts) return '';
  try {
    const d = new Date(Number(ts) * 1000);
    if (style === 'short') {
      return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}
