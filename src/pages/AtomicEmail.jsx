// /atomic/email — upload an HTML newsletter, edit every field, export.
//
// Pipeline:
//   1. Import HTML (file/paste/drop) → POST /api/atomic-email/projects
//   2. Server parses → returns { id, fields, current_html (templated) }
//   3. Live edit: PATCH /api/atomic-email/projects/:id with new field values,
//      debounced 500ms. Server re-renders template, returns new current_html.
//   4. Export: GET /api/atomic-email/projects/:id/export — server runs
//      stripInjections() and returns the file as a download.
//
// Field cards on the left and the iframe preview on the right are correlated
// via window.postMessage — see HTMLPreview.jsx for the bridge.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PageShell from '../components/PageShell.jsx';
import ImportPanel from '../components/atomic-email/ImportPanel.jsx';
import FieldCard from '../components/atomic-email/FieldCard.jsx';
import HTMLPreview from '../components/atomic-email/HTMLPreview.jsx';
import PreviewToolbar from '../components/atomic-email/PreviewToolbar.jsx';
import RecentsGrid from '../components/atomic-email/RecentsGrid.jsx';

async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'include',
    headers: options.body && !(options.body instanceof FormData)
      ? { 'Content-Type': 'application/json', ...(options.headers || {}) }
      : (options.headers || {}),
    ...options,
  });
  let data;
  if (res.headers.get('Content-Type')?.includes('application/json')) {
    data = await res.json().catch(() => ({}));
  } else {
    data = { _raw: await res.text() };
  }
  if (!res.ok) throw new Error(data?.error || `API ${res.status}`);
  return data;
}

export default function AtomicEmail() {
  const [project, setProject] = useState(null);  // { id, name, fields, current_html }
  const [recents, setRecents] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [width, setWidth] = useState('desktop');
  const [theme, setTheme] = useState('light');
  const [fullscreen, setFullscreen] = useState(false);
  const [activeFieldId, setActiveFieldId] = useState(null);
  const [editingName, setEditingName] = useState(false);

  // Refs to per-card DOM nodes for scroll-into-view on click-from-preview.
  const cardRefs = useRef({});

  // ---- Recents ----
  const refreshRecents = useCallback(async () => {
    try {
      const d = await api('/api/atomic-email/projects?limit=12');
      setRecents(d.projects || []);
    } catch {}
  }, []);
  useEffect(() => { refreshRecents(); }, [refreshRecents]);

  // ---- Import ----
  async function importHtml({ source_html, source_filename }) {
    setBusy(true); setError('');
    try {
      const d = await api('/api/atomic-email/projects', {
        method: 'POST',
        body: JSON.stringify({ source_html, source_filename }),
      });
      setProject({
        id: d.id,
        name: d.name,
        fields: d.fields,
        current_html: d.current_html,
      });
      refreshRecents();
    } catch (e) {
      setError(e.message);
    } finally { setBusy(false); }
  }

  // ---- Open existing ----
  async function openProject(id) {
    setBusy(true); setError('');
    try {
      const d = await api(`/api/atomic-email/projects/${encodeURIComponent(id)}`);
      setProject(d);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  // ---- Field edit (debounced PATCH) ----
  const dirtyRef = useRef(null);
  const saveTimer = useRef(null);
  const updateField = useCallback((updated) => {
    setProject((prev) => {
      if (!prev) return prev;
      const fields = prev.fields.map((f) => f.id === updated.id ? updated : f);
      const next = { ...prev, fields };
      dirtyRef.current = next;
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(saveDirty, 500);
      return next;
    });
  }, []);

  async function saveDirty() {
    const snapshot = dirtyRef.current;
    if (!snapshot) return;
    try {
      const d = await api(`/api/atomic-email/projects/${encodeURIComponent(snapshot.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ fields: snapshot.fields, name: snapshot.name }),
      });
      setProject((p) => p && p.id === snapshot.id ? { ...p, current_html: d.current_html } : p);
    } catch (e) {
      setError(e.message);
    }
  }

  // ---- Rename ----
  function setName(name) {
    setProject((p) => p ? { ...p, name } : p);
    dirtyRef.current = project ? { ...project, name } : null;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(saveDirty, 500);
  }

  // ---- Alt-text regen ----
  async function regenerateAlt(field) {
    if (!/^https?:\/\//i.test(field.src)) {
      throw new Error('paste a public HTTP(S) URL first');
    }
    const d = await api('/api/atomic-email/regenerate-alt-text', {
      method: 'POST',
      body: JSON.stringify({ image_url: field.src, project_id: project?.id, field_id: field.id }),
    });
    return d.alt_text;
  }

  // ---- Click-to-focus from preview ----
  const handleFieldClick = useCallback((fieldId) => {
    setActiveFieldId(fieldId);
    const el = cardRefs.current[fieldId];
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Quick amber pulse — use a transient class via inline style swap.
      el.style.transition = 'background 200ms';
      const original = el.style.background;
      el.style.background = 'var(--amber-soft)';
      setTimeout(() => { el.style.background = original || ''; }, 700);
    }
  }, []);
  const handleFieldHover = useCallback((fieldId) => {
    setActiveFieldId(fieldId);
  }, []);

  // ---- Export ----
  function exportHtml() {
    if (!project) return;
    window.location.href = `/api/atomic-email/projects/${encodeURIComponent(project.id)}/export`;
  }

  const headerActions = useMemo(() => project ? (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <button type="button" onClick={() => { setProject(null); setActiveFieldId(null); }} style={ghostBtn}>
        ← Back to imports
      </button>
      <button type="button" onClick={exportHtml} style={primaryBtn}>
        ⬇ Export HTML
      </button>
    </div>
  ) : null, [project]);

  // ---- Empty state vs editor ----
  return (
    <PageShell
      eyebrow="// ATOMIC EMAIL"
      title="Remix any newsletter HTML"
      subtitle="Upload an HTML email, edit every field, export the new version."
      actions={headerActions}
    >
      {error && (
        <div style={errorBox}>{error}</div>
      )}
      {!project ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <ImportPanel onImport={importHtml} busy={busy} />
          <RecentsGrid projects={recents} onPick={openProject} />
        </div>
      ) : (
        <div style={fullscreen ? { position: 'fixed', inset: 0, zIndex: 100, background: 'var(--bg)', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 } : { display: 'flex', flexDirection: 'column', gap: 12 }}>
          <ProjectHeaderRow
            project={project}
            editing={editingName} setEditing={setEditingName}
            onRename={setName}
            onExport={exportHtml}
            onBack={() => { setProject(null); setActiveFieldId(null); }}
            fullscreen={fullscreen} setFullscreen={setFullscreen}
          />
          <div style={{ display: 'flex', gap: 16, alignItems: 'stretch', minHeight: 600, flex: 1 }}>
            {!fullscreen && (
              <div style={{ width: 360, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 'calc(100vh - 240px)', overflowY: 'auto', paddingRight: 4 }}>
                {project.fields.map((f) => (
                  <FieldCard
                    key={f.id}
                    field={f}
                    active={activeFieldId === f.id}
                    onChange={updateField}
                    onFocus={(id) => setActiveFieldId(id)}
                    onRegenerateAlt={regenerateAlt}
                    cardRef={(node) => { if (node) cardRefs.current[f.id] = node; }}
                  />
                ))}
                {project.fields.length === 0 && (
                  <div style={emptyFieldList}>// no editable fields detected</div>
                )}
              </div>
            )}

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
              <PreviewToolbar
                width={width} setWidth={setWidth}
                theme={theme} setTheme={setTheme}
                fullscreen={fullscreen} setFullscreen={setFullscreen}
              />
              <HTMLPreview
                html={project.current_html}
                width={width} theme={theme}
                onFieldClick={handleFieldClick}
                onFieldHover={handleFieldHover}
                highlightedFieldId={activeFieldId}
              />
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}

function ProjectHeaderRow({ project, editing, setEditing, onRename, onExport, onBack, fullscreen, setFullscreen }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 12px',
      background: 'var(--surface)',
      border: '1px solid var(--border)', borderRadius: 6,
    }}>
      <button type="button" onClick={onBack} style={ghostBtn} title="Back to imports">
        ← Imports
      </button>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em',
        textTransform: 'uppercase', color: 'var(--ink-light)',
      }}>// PROJECT</span>
      {editing ? (
        <input
          autoFocus
          value={project.name || ''}
          onChange={(e) => onRename(e.target.value)}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => { if (e.key === 'Enter') setEditing(false); }}
          style={{
            flex: 1,
            padding: '6px 10px',
            background: 'var(--surface-alt)',
            border: '1px solid var(--amber)',
            borderRadius: 4,
            fontFamily: 'var(--font-sans)', fontSize: 14, fontWeight: 500, color: 'var(--ink)',
          }}
        />
      ) : (
        <button type="button" onClick={() => setEditing(true)} style={{
          flex: 1, textAlign: 'left',
          background: 'transparent', border: 0,
          fontFamily: 'var(--font-sans)', fontSize: 14, fontWeight: 500, color: 'var(--ink)',
          cursor: 'text',
        }}>{project.name || 'Untitled'}</button>
      )}
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-light)',
      }}>{project.fields.length} fields</span>
      <button type="button" onClick={onExport} style={primaryBtn}>
        ⬇ Export HTML
      </button>
    </div>
  );
}

const primaryBtn = {
  padding: '8px 14px',
  background: 'var(--ink)', color: '#fff',
  border: 0, borderRadius: 4,
  fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 500,
  cursor: 'pointer',
};
const ghostBtn = {
  padding: '6px 10px',
  background: 'transparent',
  border: '1px solid var(--border-strong)', borderRadius: 4,
  fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--ink-mid)',
  cursor: 'pointer',
};
const errorBox = {
  marginBottom: 16, padding: 12,
  background: 'rgba(184,68,68,0.1)',
  border: '1px solid var(--danger)',
  borderRadius: 4,
  fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--danger)',
};
const emptyFieldList = {
  padding: 24, textAlign: 'center',
  background: 'var(--surface-alt)',
  border: '1px dashed var(--border-strong)', borderRadius: 4,
  fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-light)',
};
