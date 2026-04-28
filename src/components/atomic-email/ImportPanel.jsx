// Pre-import landing card on the AtomicEmail page. Switches between file
// picker and paste-HTML modes.

import { useRef, useState } from 'react';

export default function ImportPanel({ onImport, busy }) {
  const fileRef = useRef(null);
  const [mode, setMode] = useState('file'); // 'file' | 'paste'
  const [paste, setPaste] = useState('');

  async function handleFile(file) {
    if (!file) return;
    const text = await file.text();
    onImport({ source_html: text, source_filename: file.name });
  }

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 6,
      padding: 32,
      textAlign: 'center',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
    }}>
      <div style={{ fontSize: 36 }}>📨</div>
      <div style={{ fontFamily: 'var(--font-sans)', fontSize: 16, fontWeight: 500, color: 'var(--ink)' }}>
        Upload an HTML newsletter to begin
      </div>
      <div style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--ink-mid)', maxWidth: 380 }}>
        Atomic Email parses headlines, images, links, and body copy into editable fields.
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button type="button" onClick={() => setMode('file')} style={mode === 'file' ? primaryBtn : secondaryBtn}>
          📁 Choose .html file
        </button>
        <button type="button" onClick={() => setMode('paste')} style={mode === 'paste' ? primaryBtn : secondaryBtn}>
          📝 Paste HTML
        </button>
      </div>

      {mode === 'file' && (
        <div
          onClick={() => !busy && fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); }}
          onDrop={(e) => {
            e.preventDefault();
            if (busy) return;
            const file = e.dataTransfer.files?.[0];
            if (file) handleFile(file);
          }}
          style={{
            marginTop: 8, width: '100%', maxWidth: 480,
            padding: 32,
            border: '1.5px dashed var(--border-strong)',
            borderRadius: 6,
            background: 'var(--surface-alt)',
            cursor: busy ? 'wait' : 'pointer',
            fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--ink-mid)',
          }}
        >
          {busy ? 'Parsing…' : 'Click or drop an .html file here'}
          <input
            ref={fileRef}
            type="file"
            accept=".html,.htm,text/html"
            onChange={(e) => handleFile(e.target.files?.[0])}
            style={{ display: 'none' }}
          />
        </div>
      )}

      {mode === 'paste' && (
        <div style={{ width: '100%', maxWidth: 600, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder="<!doctype html>..."
            rows={10}
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: 12,
              background: 'var(--surface-alt)',
              border: '1px solid var(--border-strong)',
              borderRadius: 4,
              fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink)',
              resize: 'vertical', minHeight: 200,
            }}
          />
          <button
            type="button"
            disabled={!paste.trim() || busy}
            onClick={() => onImport({ source_html: paste, source_filename: 'pasted.html' })}
            style={{ ...primaryBtn, opacity: !paste.trim() || busy ? 0.5 : 1 }}
          >
            {busy ? 'Parsing…' : 'Parse HTML →'}
          </button>
        </div>
      )}
    </div>
  );
}

const primaryBtn = {
  padding: '10px 16px',
  background: 'var(--ink)',
  color: '#fff', border: 0, borderRadius: 4,
  fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 500,
  cursor: 'pointer',
};
const secondaryBtn = {
  padding: '10px 16px',
  background: 'var(--surface)',
  color: 'var(--ink)',
  border: '1px solid var(--border-strong)', borderRadius: 4,
  fontFamily: 'var(--font-sans)', fontSize: 13,
  cursor: 'pointer',
};
