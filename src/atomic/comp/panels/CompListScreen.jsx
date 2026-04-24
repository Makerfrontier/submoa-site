// Landing view at /atomic/comp — shows the user's existing comps above
// the StartScreen entry options so they can jump back in quickly.

import { useEffect, useState } from 'react';
import { StartScreen } from './StartScreen';

export function CompListScreen({ onCompCreated }) {
  const [comps, setComps] = useState(null); // null = loading, [] = empty
  const [err, setErr] = useState('');

  const load = async () => {
    try {
      const res = await fetch('/api/atomic/comp', { credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setComps(Array.isArray(data.comps) ? data.comps : []);
    } catch (e) {
      setErr(String(e?.message || e));
      setComps([]);
    }
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (compId) => {
    if (!window.confirm('Delete this comp? This cannot be undone.')) return;
    try {
      const res = await fetch(`/api/atomic/comp/${compId}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      setComps((prev) => (prev || []).filter((c) => c.id !== compId));
    } catch (e) {
      alert('Delete failed: ' + String(e?.message || e));
    }
  };

  const handleCopyShare = async (token) => {
    const url = `${window.location.origin}/c/${token}`;
    try { await navigator.clipboard.writeText(url); } catch {}
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: 'DM Sans, sans-serif' }}>
      {comps && comps.length > 0 && (
        <div style={{ padding: '40px 40px 16px', maxWidth: 1040, margin: '0 auto' }}>
          <div style={{
            fontSize: 11, fontWeight: 700, letterSpacing: '0.15em',
            color: 'var(--amber)', textTransform: 'uppercase', marginBottom: 20,
          }}>✦ Your Comps</div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: 14,
          }}>
            {comps.map((c) => (
              <CompCard key={c.id} comp={c} onDelete={handleDelete} onCopyShare={handleCopyShare} />
            ))}
          </div>

          <div style={{
            height: 1, background: 'var(--border)',
            margin: '40px 0 0', maxWidth: 520, marginLeft: 'auto', marginRight: 'auto',
          }} />
        </div>
      )}

      {err && (
        <div style={{
          maxWidth: 640, margin: '0 auto',
          padding: '10px 14px', borderRadius: 6,
          fontSize: 13, color: 'var(--danger)',
          background: 'color-mix(in srgb, var(--danger) 10%, transparent)',
          border: '1px solid var(--danger)',
          textAlign: 'center',
        }}>{err}</div>
      )}

      <StartScreen onCompCreated={onCompCreated} />
    </div>
  );
}

function CompCard({ comp, onDelete, onCopyShare }) {
  // block_count is precomputed by the list endpoint via json_array_length;
  // fall back to parsing if the server ever ships the full blocks_json.
  let blockCount = typeof comp.block_count === 'number'
    ? comp.block_count
    : (() => { try { return JSON.parse(comp.blocks_json || '[]').length; } catch { return 0; } })();
  let brand = {};
  try { brand = JSON.parse(comp.brand_json || '{}'); } catch {}
  const primary = brand?.primary || 'var(--ink)';
  const logoUrl = brand?.logoUrl || '';
  const initials = (comp.name || 'Untitled').slice(0, 2).toUpperCase();

  return (
    <div
      onClick={() => { window.location.href = `/atomic/comp/${comp.id}`; }}
      style={{
        borderRadius: 12,
        border: '1px solid var(--border)',
        background: 'var(--card)',
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'box-shadow 0.15s, transform 0.1s',
        fontFamily: 'DM Sans, sans-serif',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 4px 18px rgba(0,0,0,0.08)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none'; }}
    >
      <div style={{
        height: 120,
        background: primary,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative',
      }}>
        {logoUrl ? (
          <img
            src={logoUrl}
            alt=""
            style={{
              maxHeight: 48, maxWidth: 160, objectFit: 'contain',
              filter: 'brightness(0) invert(1)',
            }}
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        ) : (
          <div style={{
            fontSize: 30, fontWeight: 700,
            color: 'rgba(255,255,255,0.92)',
            fontFamily: 'DM Sans, sans-serif',
            letterSpacing: '0.02em',
          }}>{initials}</div>
        )}
        {comp.share_enabled ? (
          <div style={{
            position: 'absolute', top: 8, right: 8,
            background: 'rgba(0,0,0,0.35)',
            color: '#fff', fontSize: 9, fontWeight: 700,
            padding: '3px 8px', borderRadius: 4,
            letterSpacing: '0.12em', textTransform: 'uppercase',
          }}>Shared</div>
        ) : null}
      </div>

      <div style={{ padding: '12px 14px 14px' }}>
        <div style={{
          fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{comp.name || 'Untitled Comp'}</div>
        <div style={{ fontSize: 12, color: 'var(--text-mid)' }}>
          {blockCount} block{blockCount === 1 ? '' : 's'} · {formatTimeAgo(comp.updated_at)}
        </div>

        <div
          onClick={(e) => e.stopPropagation()}
          style={{ display: 'flex', gap: 6, marginTop: 12 }}
        >
          <button
            onClick={() => { window.location.href = `/atomic/comp/${comp.id}`; }}
            style={{
              flex: 1,
              background: 'var(--ink)', color: '#fff',
              border: 'none', borderRadius: 6,
              padding: '6px 0', fontSize: 12, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
            }}
          >Edit</button>
          {comp.share_enabled && comp.share_token ? (
            <button
              onClick={() => onCopyShare(comp.share_token)}
              title="Copy share link"
              style={{
                background: 'var(--surface-inp)', border: '1px solid var(--border)',
                borderRadius: 6, padding: '6px 10px', fontSize: 13,
                cursor: 'pointer',
              }}
            >↗</button>
          ) : null}
          <button
            onClick={() => onDelete(comp.id)}
            title="Delete"
            style={{
              background: 'transparent', border: '1px solid var(--border)',
              borderRadius: 6, padding: '6px 10px', fontSize: 13,
              cursor: 'pointer', color: 'var(--text-mid)',
            }}
          >🗑</button>
        </div>
      </div>
    </div>
  );
}

function formatTimeAgo(unixSeconds) {
  if (!unixSeconds) return 'just now';
  const secs = Math.max(0, Math.floor(Date.now() / 1000 - Number(unixSeconds)));
  if (secs < 60) return 'just now';
  const m = Math.floor(secs / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  return `${w}w ago`;
}
