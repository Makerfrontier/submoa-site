// Atomic Comp System — builder page.
// Phase 2: full manual block-assembly editor. Left panel (block list + edit
// panel), scrollable canvas, auto-save, Share button. Creation flows other
// than Start Blank are Phase 3.

import { useCallback, useEffect, useRef, useState } from 'react';
import { EditPanel } from '../atomic/comp/panels/EditPanel';
import { BlockCanvas } from '../atomic/comp/canvas/BlockCanvas';
import { StartScreen } from '../atomic/comp/panels/StartScreen';
import { CompListScreen } from '../atomic/comp/panels/CompListScreen';
import { createBlock } from '../atomic/comp/blocks';
import { DEFAULT_BRAND, normalizeBrand } from '../atomic/comp/brand/BrandConfig';
import { downloadHtmlBlob } from '../atomic/comp/export/HtmlExporter';

function readIdFromPath() {
  if (typeof window === 'undefined') return null;
  const m = window.location.pathname.match(/^\/atomic\/comp\/([^/?#]+)/);
  return m ? m[1] : null;
}

export default function AtomicComp({ navigate }) {
  const [comp, setComp] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');
  const [viewport, setViewport] = useState('desktop'); // 'desktop' | 'mobile'
  const saveTimer = useRef(null);
  const pendingCompRef = useRef(null); // latest state for debounced save
  const compIdRef = useRef(null);      // newest known id (survives async saves)

  // Load existing comp on mount if the URL has an id.
  useEffect(() => {
    const id = readIdFromPath();
    if (!id) { setComp(null); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/atomic/comp/${id}`, { credentials: 'include' });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
        const blocks = Array.isArray(data.blocks) ? data.blocks
          : (typeof data.blocks_json === 'string' ? safeParse(data.blocks_json, []) : []);
        const brand = normalizeBrand(data.brand || (typeof data.brand_json === 'string' ? safeParse(data.brand_json, {}) : {}));
        compIdRef.current = data.id || id;
        setComp({
          id: data.id || id,
          name: data.name || 'Untitled Comp',
          source_url: data.source_url || null,
          share_token: data.share_token || null,
          share_enabled: !!data.share_enabled,
          blocks, brand,
        });
      } catch (e) {
        if (!cancelled) setToast('Load failed: ' + String(e?.message || e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const scheduleAutoSave = (next) => {
    pendingCompRef.current = next;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void saveComp(pendingCompRef.current); }, 1500);
  };

  const saveComp = useCallback(async (toSave) => {
    if (!toSave) return;
    setSaving(true);
    try {
      const body = {
        name: toSave.name,
        blocks: toSave.blocks,
        brand:  toSave.brand,
        source_url: toSave.source_url || null,
      };
      const id = compIdRef.current;
      if (!id) {
        // No id yet — this path is exercised only if the user skipped the
        // StartScreen POST (shouldn't happen). Keep it for safety.
        const res = await fetch('/api/atomic/comp', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...body, blocks_json: JSON.stringify(body.blocks), brand_json: JSON.stringify(body.brand) }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
        const newId = data?.comp?.id;
        if (newId) {
          compIdRef.current = newId;
          setComp((prev) => prev ? { ...prev, id: newId } : prev);
          window.history.replaceState({}, '', `/atomic/comp/${newId}`);
        }
      } else {
        const res = await fetch(`/api/atomic/comp/${id}`, {
          method: 'PUT', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error || `HTTP ${res.status}`);
        }
      }
    } catch (e) {
      setToast('Save failed: ' + String(e?.message || e));
    } finally {
      setSaving(false);
    }
  }, []);

  // Block operations
  const updateField = (blockId, key, value) => {
    setComp((prev) => {
      if (!prev) return prev;
      const next = {
        ...prev,
        blocks: prev.blocks.map((b) =>
          b.id === blockId ? { ...b, fields: { ...(b.fields || {}), [key]: value } } : b
        ),
      };
      scheduleAutoSave(next);
      return next;
    });
  };

  const addBlock = (type) => {
    try {
      const newBlock = createBlock(type);
      setComp((prev) => {
        if (!prev) return prev;
        const idx = prev.blocks.findIndex((b) => b.id === selectedId);
        const blocks = [...prev.blocks];
        blocks.splice(idx === -1 ? blocks.length : idx + 1, 0, newBlock);
        const next = { ...prev, blocks };
        scheduleAutoSave(next);
        return next;
      });
      setSelectedId(newBlock.id);
    } catch (e) {
      setToast('Add failed: ' + String(e?.message || e));
    }
  };

  const deleteBlock = (blockId) => {
    setComp((prev) => {
      if (!prev) return prev;
      const next = { ...prev, blocks: prev.blocks.filter((b) => b.id !== blockId) };
      scheduleAutoSave(next);
      return next;
    });
    if (selectedId === blockId) setSelectedId(null);
  };

  const toggleLock = (blockId) => {
    setComp((prev) => {
      if (!prev) return prev;
      const next = {
        ...prev,
        blocks: prev.blocks.map((b) => b.id === blockId ? { ...b, locked: !b.locked } : b),
      };
      scheduleAutoSave(next);
      return next;
    });
  };

  const updateBrand = (key, value) => {
    setComp((prev) => {
      if (!prev) return prev;
      const next = { ...prev, brand: { ...(prev.brand || {}), [key]: value } };
      scheduleAutoSave(next);
      return next;
    });
  };

  const reorderBlocks = (draggingId, targetId) => {
    setComp((prev) => {
      if (!prev) return prev;
      const blocks = [...prev.blocks];
      const fromIdx = blocks.findIndex((b) => b.id === draggingId);
      const toIdx = blocks.findIndex((b) => b.id === targetId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const [moved] = blocks.splice(fromIdx, 1);
      blocks.splice(toIdx, 0, moved);
      const next = { ...prev, blocks };
      scheduleAutoSave(next);
      return next;
    });
  };

  const handleExportHtml = () => {
    if (!comp) return;
    try {
      downloadHtmlBlob({
        name: comp.name || 'comp',
        blocks: comp.blocks || [],
        brand: comp.brand || DEFAULT_BRAND,
      });
      setToast('HTML downloaded.');
    } catch (e) {
      setToast('Export failed: ' + String(e?.message || e));
    }
  };

  const handleShare = async () => {
    const id = compIdRef.current;
    if (!id) { setToast('Save first'); return; }
    try {
      const res = await fetch(`/api/atomic/comp/${id}/share`, { method: 'POST', credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      if (data.share_url) {
        try { await navigator.clipboard.writeText(data.share_url); } catch {}
        setComp((prev) => prev ? { ...prev, share_token: data.token, share_enabled: true } : prev);
        setToast('Share link copied — ' + data.share_url);
      }
    } catch (e) {
      setToast('Share failed: ' + String(e?.message || e));
    }
  };

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3600);
    return () => clearTimeout(t);
  }, [toast]);

  // No comp loaded — show the comp list above the start screen.
  if (!comp) {
    if (loading) return <LoadingState />;
    return (
      <CompListScreen
        onCompCreated={(c) => {
          const blocks = Array.isArray(c.blocks) ? c.blocks : [];
          const brand = normalizeBrand(c.brand || DEFAULT_BRAND);
          compIdRef.current = c.id;
          setComp({
            id: c.id, name: c.name || 'Untitled Comp',
            source_url: c.source_url || null,
            share_token: c.share_token || null,
            share_enabled: !!c.share_enabled,
            blocks, brand,
          });
          window.history.pushState({}, '', `/atomic/comp/${c.id}`);
        }}
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: 'var(--bg)' }}>
      <TopBar
        comp={comp}
        saving={saving}
        viewport={viewport}
        onViewportChange={setViewport}
        onNameChange={(name) => setComp((prev) => {
          const next = { ...prev, name };
          scheduleAutoSave(next);
          return next;
        })}
        onShare={handleShare}
        onExport={handleExportHtml}
        navigate={navigate}
      />

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <EditPanel
          blocks={comp.blocks}
          selectedId={selectedId}
          brand={comp.brand}
          onSelectBlock={setSelectedId}
          onUpdateField={updateField}
          onAddBlock={addBlock}
          onDeleteBlock={deleteBlock}
          onToggleLock={toggleLock}
          onReorder={reorderBlocks}
          onBrandUpdate={updateBrand}
        />

        <div style={{
          flex: 1, overflowY: 'auto', padding: 24,
          background: '#EFECE5',
        }}>
          <div style={{
            maxWidth: viewport === 'mobile' ? 390 : 1280,
            margin: '0 auto',
            background: '#fff',
            boxShadow: '0 8px 40px rgba(0,0,0,0.12)',
            borderRadius: 10, overflow: 'hidden',
            minHeight: 600,
            transition: 'max-width 0.25s ease',
          }}>
            <BlockCanvas
              blocks={comp.blocks}
              brand={comp.brand}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onReorder={reorderBlocks}
            />
          </div>
        </div>
      </div>

      {toast && (
        <div
          onClick={() => setToast('')}
          style={{
            position: 'fixed', bottom: 24, left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--green-dark)',
            color: '#fff', padding: '12px 24px',
            borderRadius: 8, fontSize: 14,
            fontFamily: 'DM Sans, sans-serif', fontWeight: 500,
            zIndex: 999, boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
            maxWidth: 600, cursor: 'pointer',
          }}
        >{toast}</div>
      )}
    </div>
  );
}

function TopBar({ comp, saving, viewport, onViewportChange, onNameChange, onShare, onExport, navigate }) {
  return (
    <div style={{
      flexShrink: 0,
      height: 52,
      background: 'var(--card)',
      borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center',
      padding: '0 16px', gap: 14,
    }}>
      <button
        onClick={() => (navigate ? navigate('/atomic/comp') : (window.location.href = '/atomic/comp'))}
        style={{
          background: 'transparent', border: 'none', padding: '6px 10px',
          borderRadius: 6, cursor: 'pointer',
          fontSize: 11, fontWeight: 700,
          letterSpacing: '0.12em', textTransform: 'uppercase',
          color: 'var(--amber)', fontFamily: 'DM Sans, sans-serif',
        }}
      >✦ Atomic Comp</button>

      <input
        value={comp.name}
        onChange={(e) => onNameChange(e.target.value)}
        style={{
          background: 'transparent', border: 'none',
          fontSize: 15, fontWeight: 500,
          color: 'var(--text)', fontFamily: 'DM Sans, sans-serif',
          outline: 'none', flex: 1, minWidth: 0, padding: '6px 4px',
        }}
      />

      {/* Viewport toggle */}
      <div style={{
        display: 'flex', gap: 2,
        background: 'var(--bg)', borderRadius: 6, padding: 3,
      }}>
        {[{ k: 'desktop', label: '🖥' }, { k: 'mobile', label: '📱' }].map((v) => (
          <button
            key={v.k}
            onClick={() => onViewportChange(v.k)}
            title={v.k === 'desktop' ? 'Desktop preview' : 'Mobile preview'}
            style={{
              background: viewport === v.k ? 'var(--card)' : 'transparent',
              border: 'none', borderRadius: 4,
              padding: '4px 10px', fontSize: 13,
              cursor: 'pointer',
              color: viewport === v.k ? 'var(--text)' : 'var(--text-mid)',
              fontFamily: 'DM Sans, sans-serif',
              boxShadow: viewport === v.k ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
            }}
          >{v.label}</button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        {saving && (
          <span style={{ fontSize: 12, color: 'var(--text-mid)', fontFamily: 'DM Sans, sans-serif' }}>Saving…</span>
        )}
        {!saving && comp.share_enabled && (
          <span style={{ fontSize: 12, color: 'var(--green-dark)', fontFamily: 'DM Sans, sans-serif' }}>● Shared</span>
        )}
        <button
          onClick={onExport}
          style={{
            background: 'transparent', color: 'var(--text)',
            border: '1px solid var(--border)', borderRadius: 6,
            padding: '7px 14px', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
          }}
        >Export HTML</button>
        <button
          onClick={onShare}
          style={{
            background: 'var(--green-dark)', color: '#fff',
            border: 'none', borderRadius: 6,
            padding: '8px 18px', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
          }}
        >Share</button>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'grid', placeItems: 'center',
      background: 'var(--bg)',
      fontFamily: 'DM Sans, sans-serif', color: 'var(--text-mid)',
    }}>Loading comp…</div>
  );
}

function safeParse(s, fb) { try { return JSON.parse(s); } catch { return fb; } }
