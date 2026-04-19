// Admin HTML Templates editor — list + editor views.
// Mounted as the 'templates' section of AdminDashboard.

import { useState, useEffect, useRef, useCallback } from 'react';
import { stripAndCleanWithStats, PROMPT_WRAPPERS } from '../comp-utils';
import { ExportModal } from './CompStudio';

const CATEGORIES = [
  { v: 'general',    l: 'General' },
  { v: 'pages',      l: 'Pages' },
  { v: 'components', l: 'Components' },
  { v: 'email',      l: 'Email' },
  { v: 'landing',    l: 'Landing' },
];

async function api(path, options = {}) {
  const res = await fetch(`/api/admin${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `API ${res.status}`);
  return data;
}

const INJECTED_SCRIPT = `
(function() {
  document.addEventListener('click', function(e) {
    var t = e.target;
    while (t && t !== document.body && t !== document.documentElement) {
      if (t.hasAttribute && t.hasAttribute('data-comp-id')) {
        parent.postMessage({
          source: 'admin-templates',
          type: 'blockClick',
          id: t.getAttribute('data-comp-id'),
        }, '*');
        break;
      }
      t = t.parentElement;
    }
    // Always broadcast an element-picked event for the chat panel, even if the
    // element has no data-comp-id. The picker captures the rendered target.
    var el = e.target;
    if (el && el.nodeType === 1) {
      var cs = null;
      try {
        var cssObj = window.getComputedStyle(el);
        cs = {
          display: cssObj.display,
          position: cssObj.position,
          width: cssObj.width,
          height: cssObj.height,
          color: cssObj.color,
          backgroundColor: cssObj.backgroundColor,
          fontFamily: cssObj.fontFamily,
          fontSize: cssObj.fontSize,
          fontWeight: cssObj.fontWeight,
          padding: cssObj.padding,
          margin: cssObj.margin,
          border: cssObj.border,
        };
      } catch {}
      var sel = el.tagName.toLowerCase();
      if (el.id) sel += '#' + el.id;
      if (typeof el.className === 'string' && el.className.trim()) {
        sel += '.' + el.className.trim().split(/\\s+/).join('.');
      }
      parent.postMessage({
        source: 'admin-templates',
        type: 'elementPicked',
        selector: sel,
        tagName: el.tagName.toLowerCase(),
        computedStyles: cs,
      }, '*');
    }
    var a = e.target && e.target.closest ? e.target.closest('a') : null;
    if (a) { e.preventDefault(); e.stopPropagation(); }
  }, true);
  function labelOf(el) {
    const id = el.getAttribute('id');
    if (id) return '#' + id;
    const cls = el.getAttribute('class');
    if (cls) return el.tagName.toLowerCase() + '.' + cls.trim().split(/\\s+/)[0];
    return el.tagName.toLowerCase();
  }
  function buildId(el, i) {
    const existing = el.getAttribute('data-comp-id');
    if (existing) return existing;
    const id = 'cs-' + i + '-' + Math.random().toString(36).slice(2, 7);
    el.setAttribute('data-comp-id', id);
    return id;
  }
  var IAB = [[728,90,'Leaderboard'],[300,250,'Medium Rectangle'],[160,600,'Wide Skyscraper'],[300,600,'Half Page'],[320,50,'Mobile Banner'],[970,90,'Billboard'],[300,50,'Mobile Banner Sm'],[320,100,'Large Mobile Banner'],[970,250,'Billboard Tall'],[300,1050,'Portrait']];
  function matchIab(w, h) {
    for (var i = 0; i < IAB.length; i++) {
      if (Math.abs(w - IAB[i][0]) <= 30 && Math.abs(h - IAB[i][1]) <= 30) {
        return { size: IAB[i][0] + 'x' + IAB[i][1], label: IAB[i][2] };
      }
    }
    return null;
  }
  var EXCLUDE = /mobile-menu|mobile-nav|footer-nav|sidebar-nav/i;
  function classStr(el) {
    var c = el.className;
    if (!c) return '';
    if (typeof c === 'string') return c;
    if (typeof c.baseVal === 'string') return c.baseVal;
    return '';
  }
  function isExcludedChrome(el) {
    var cur = el;
    while (cur && cur !== document.body && cur !== document.documentElement) {
      var id = cur.id || '';
      var cls = classStr(cur);
      if (EXCLUDE.test(id) || EXCLUDE.test(cls)) return true;
      cur = cur.parentElement;
    }
    return false;
  }
  function hasAdHint(el) {
    var id = (el.id || '').toLowerCase();
    var cls = classStr(el).toLowerCase();
    return /\b(ads?|adunit|ad-unit|advertisement|banner)\b/.test(id) ||
           /\b(ads?|adunit|ad-unit|advertisement|banner)\b/.test(cls);
  }
  function collect() {
    var candidates = new Map();
    var attrs = new Map();

    var firstNav = document.querySelector('nav');
    if (firstNav && !firstNav.closest('[data-comp-skip]') && !isExcludedChrome(firstNav)) {
      candidates.set(firstNav, 'structural');
    }
    ['HEADER','FOOTER','SECTION','ARTICLE'].forEach(function(tag) {
      document.querySelectorAll(tag.toLowerCase()).forEach(function(el) {
        if (el.closest('[data-comp-skip]')) return;
        if (isExcludedChrome(el)) return;
        if (!candidates.has(el)) candidates.set(el, 'structural');
      });
    });

    document.querySelectorAll('.ad-placeholder').forEach(function(el) {
      if (el.closest('[data-comp-skip]')) return;
      if (isExcludedChrome(el)) return;
      var m = matchIab(el.offsetWidth, el.offsetHeight);
      if (m) { attrs.set(el, { adSize: m.size, adLabel: m.label }); candidates.set(el, 'ad'); }
      else { candidates.set(el, 'block'); }
    });

    document.querySelectorAll('div,ins,section').forEach(function(el) {
      if (el.closest('[data-comp-skip]')) return;
      if (isExcludedChrome(el)) return;
      if (candidates.has(el)) return;
      if (!hasAdHint(el)) return;
      var m = matchIab(el.offsetWidth, el.offsetHeight);
      if (m) { attrs.set(el, { adSize: m.size, adLabel: m.label }); candidates.set(el, 'ad'); }
      else { candidates.set(el, 'block'); }
    });

    document.querySelectorAll('img').forEach(function(el) {
      if (el.closest('[data-comp-skip]')) return;
      if (isExcludedChrome(el)) return;
      var w = el.naturalWidth || el.width || el.offsetWidth || 0;
      var h = el.naturalHeight || el.height || el.offsetHeight || 0;
      if (w > 80 && h > 80 && !candidates.has(el)) candidates.set(el, 'image');
    });

    document.querySelectorAll('h1,h2,h3,h4,h5,h6,p,blockquote').forEach(function(el) {
      if (el.closest('[data-comp-skip]')) return;
      if (isExcludedChrome(el)) return;
      var text = (el.innerText || el.textContent || '').trim();
      if (text.length <= 40) return;
      if (el.offsetHeight < 40) return;
      if (!candidates.has(el)) candidates.set(el, 'text');
    });

    document.querySelectorAll('a').forEach(function(el) {
      if (el.closest('[data-comp-skip]')) return;
      if (isExcludedChrome(el)) return;
      if (el.closest('nav,ul,ol,header,footer')) return;
      var text = (el.innerText || el.textContent || '').trim();
      if (text.length < 3) return;
      if (el.offsetHeight < 40) return;
      if (!candidates.has(el)) candidates.set(el, 'cta');
    });

    var final = [];
    candidates.forEach(function(type, el) {
      var p = el.parentElement, skip = false;
      while (p && p !== document.body && p !== document.documentElement) {
        if (candidates.has(p)) { skip = true; break; }
        p = p.parentElement;
      }
      if (!skip) final.push({ el: el, type: type });
    });

    final.sort(function(a, b) {
      if (a.el === b.el) return 0;
      var pos = a.el.compareDocumentPosition(b.el);
      return (pos & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1;
    });
    final = final.slice(0, 40);

    var blocks = [];
    var i = 0;
    final.forEach(function(c) {
      var el = c.el;
      var id = buildId(el, i++);
      if (c.type === 'ad') {
        var a = attrs.get(el) || {};
        var adSize = a.adSize || el.getAttribute('data-ad-size') || '';
        var adLabel = a.adLabel || el.getAttribute('data-ad-label') || 'Custom';
        blocks.push({
          id: id, type: 'ad',
          label: labelOf(el),
          preview: 'Ad — ' + adLabel + ' ' + adSize,
          adSize: adSize,
          adLabel: adLabel,
        });
      } else if (c.type === 'block') {
        var btext = (el.innerText || el.textContent || '').trim();
        blocks.push({
          id: id, type: 'block',
          label: labelOf(el) + ' (' + el.offsetWidth + '×' + el.offsetHeight + ')',
          preview: btext.slice(0, 100) || '(container block)',
        });
      } else if (c.type === 'image') {
        blocks.push({
          id: id, type: 'image',
          label: labelOf(el),
          preview: (el.getAttribute('alt') || el.getAttribute('src') || '').slice(0, 80),
          imgW: el.naturalWidth || el.width || 0,
          imgH: el.naturalHeight || el.height || 0,
        });
      } else if (c.type === 'structural') {
        var stext = (el.innerText || el.textContent || '').trim();
        blocks.push({
          id: id, type: 'structural',
          label: labelOf(el) + ' <' + el.tagName.toLowerCase() + '>',
          preview: stext.slice(0, 120) || '(structural region — no text)',
        });
      } else if (c.type === 'cta') {
        var ctaText = (el.innerText || el.textContent || '').trim();
        blocks.push({
          id: id, type: 'cta',
          label: 'CTA ' + labelOf(el),
          preview: ctaText.slice(0, 80),
        });
      } else {
        var ttext = (el.innerText || el.textContent || '').trim();
        blocks.push({
          id: id, type: 'text',
          label: labelOf(el) + ' (' + el.tagName.toLowerCase() + ')',
          preview: ttext.slice(0, 120),
        });
      }
    });
    parent.postMessage({ source: 'admin-templates', type: 'blocks', blocks: blocks }, '*');
  }
  function findById(id) { return document.querySelector('[data-comp-id="' + id + '"]'); }
  window.addEventListener('message', function(ev) {
    const m = ev.data || {};
    if (!m || m.source !== 'admin-templates-parent') return;
    if (m.type === 'recollect') { collect(); return; }
    if (m.type === 'deleteBlock') { const el = findById(m.id); if (el) el.remove(); collect(); return; }
    if (m.type === 'replaceText') { const el = findById(m.id); if (el) el.textContent = m.text; collect(); return; }
    if (m.type === 'highlight') {
      document.querySelectorAll('[data-comp-hl]').forEach(el => { el.style.outline = ''; el.removeAttribute('data-comp-hl'); });
      const el = findById(m.id); if (!el) return;
      el.setAttribute('data-comp-hl', '1'); el.style.outline = '2px solid #B8872E';
      el.style.outlineOffset = '2px';
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    if (m.type === 'serialize') {
      parent.postMessage({ source: 'admin-templates', type: 'serialized', html: '<!DOCTYPE html>\\n' + document.documentElement.outerHTML }, '*');
    }
  });
  if (document.readyState === 'complete' || document.readyState === 'interactive') collect();
  else window.addEventListener('DOMContentLoaded', collect);
  window.addEventListener('load', collect);
})();
`;

function injectScript(html) {
  const tag = `<script data-comp-skip="1">${INJECTED_SCRIPT}</script>`;
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, tag + '</body>');
  return html + tag;
}

// ─── Top-level section ─────────────────────────────────────────────────────
export default function AdminTemplates() {
  const [view, setView] = useState('list');    // 'list' | 'edit' | 'new'
  const [editingId, setEditingId] = useState(null);

  if (view === 'list') {
    return <TemplatesList
      onEdit={(id) => { setEditingId(id); setView('edit'); }}
      onNew={() => { setEditingId(null); setView('new'); }}
    />;
  }
  return <TemplateEditor
    id={editingId}
    onBack={() => { setEditingId(null); setView('list'); }}
    onSaved={(id) => { setEditingId(id); setView('edit'); }}
  />;
}

// ─── List view ─────────────────────────────────────────────────────────────
function TemplatesList({ onEdit, onNew }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const d = await api('/templates');
      setRows(d.templates || []);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const remove = async (id, name) => {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
      await api(`/templates/${id}`, { method: 'DELETE' });
      load();
    } catch (e) { setError(e.message); }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div className="adm-page-title">HTML Templates</div>
          <div className="adm-page-sub">Editable HTML comps. All edits pass through stripAndClean.</div>
        </div>
        <button className="btn-primary" onClick={onNew}>+ New Template</button>
      </div>
      {error && <div style={{ color: 'var(--error)', marginBottom: 10 }}>{error}</div>}
      {loading ? <div className="adm-empty">Loading…</div> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {rows.length === 0 && <div className="adm-empty">No templates yet.</div>}
          {rows.map(r => (
            <div key={r.id} className="card" style={{ padding: 16 }}>
              <div className="eyebrow">{r.category || 'general'}</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 600, marginTop: 6 }}>{r.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-light)', marginTop: 4, minHeight: 32 }}>{r.description || '—'}</div>
              <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 8 }}>
                Updated {r.updated_at ? new Date(r.updated_at * 1000).toLocaleDateString() : '—'}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
                <button className="db-btn db-btn-accent" onClick={() => onEdit(r.id)}>Edit</button>
                <button className="btn-danger-sm" onClick={() => remove(r.id, r.name)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Editor view ──────────────────────────────────────────────────────────
function TemplateEditor({ id, onBack, onSaved }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('general');
  const [htmlContent, setHtmlContent] = useState('');
  const [iframeHtml, setIframeHtml] = useState('');
  const [blocks, setBlocks] = useState([]);
  // Dropdown selector — lists all active templates for quick switch.
  const [allTemplates, setAllTemplates] = useState([]);
  const [selectorId, setSelectorId] = useState(id || '');
  useEffect(() => {
    api('/templates').then(d => setAllTemplates(d.templates || [])).catch(() => {});
  }, []);
  useEffect(() => { setSelectorId(id || ''); }, [id]);

  async function handleSelectTemplate(tid) {
    if (!tid || tid === selectorId) return;
    setSelectorId(tid);
    try {
      const d = await api(`/templates/${tid}`);
      const html = d.html_content || '';
      console.log(`[admin-templates] loaded ${tid}: html_content length = ${html.length}`);
      setName(d.name || '');
      setDescription(d.description || '');
      setCategory(d.category || 'general');
      setHtmlContent(html);
      setR2Key(d.r2_key || '');
      onSaved?.(tid);
    } catch (e) {
      console.error('[admin-templates] load failed:', e);
      setToast('Load failed: ' + (e?.message || e));
    }
  }
  const blocksRef = useRef([]);
  useEffect(() => { blocksRef.current = blocks; }, [blocks]);
  const [selectedBlock, setSelectedBlock] = useState(null);
  const [tab, setTab] = useState('blocks');
  const [loading, setLoading] = useState(!!id);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalContent, setModalContent] = useState('');
  const [r2Key, setR2Key] = useState('');
  const [sessionChanges, setSessionChanges] = useState([]);
  const iframeRef = useRef(null);
  const sourceDebounce = useRef(null);

  // Capture Live Page state
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureUrl, setCaptureUrl] = useState('');
  const [capturing, setCapturing] = useState(false);
  useEffect(() => {
    // Prefill the capture URL based on category.
    if (category === 'pages') setCaptureUrl('https://submoacontent.com');
    else setCaptureUrl('');
  }, [category]);
  const runCapture = async () => {
    if (!id || !captureUrl.trim()) { setToast('Save the template first, then capture.'); return; }
    setCapturing(true);
    try {
      const res = await fetch(`/api/admin/templates/${id}/capture`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: captureUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Capture failed');
      setHtmlContent(data.html_content || '');
      setToast(`Captured ${data.length} chars from ${captureUrl.trim()}`);
      setCaptureOpen(false);
    } catch (e) { setToast('Capture failed: ' + e.message); }
    setCapturing(false);
  };

  // Chat panel state
  const [chatHistory, setChatHistory] = useState([]); // [{role, content}]
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState('');
  const [pickedElement, setPickedElement] = useState(null); // {selector, tagName, computedStyles}
  const [pickerMode, setPickerMode] = useState(false); // toggle picker mode
  const chatScrollRef = useRef(null);
  useEffect(() => {
    if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [chatHistory, chatLoading]);

  // Load
  useEffect(() => {
    if (!id) { setLoading(false); return; }
    (async () => {
      try {
        const d = await api(`/templates/${id}`);
        setName(d.name || ''); setDescription(d.description || '');
        setCategory(d.category || 'general'); setHtmlContent(d.html_content || '');
        setR2Key(d.r2_key || '');
      } catch (e) { setToast('Load failed: ' + e.message); }
      setLoading(false);
    })();
  }, [id]);

  // Keep iframe in sync with html source. Empty content → empty iframe so the
  // canvas renders the "no HTML uploaded yet" fallback instead of a blank frame.
  useEffect(() => {
    const html = (htmlContent || '').trim();
    setIframeHtml(html ? injectScript(html) : '');
  }, [htmlContent]);

  // Iframe messages
  useEffect(() => {
    const onMessage = (ev) => {
      const m = ev.data || {};
      if (!m || m.source !== 'admin-templates') return;
      if (m.type === 'blocks') setBlocks(m.blocks || []);
      if (m.type === 'blockClick') {
        const match = (m.blocks_ref_cur || []).find(x => x.id === m.id);
        // blocks_ref_cur isn't set; look up via latest state:
        const found = blocksRef.current.find(x => x.id === m.id);
        if (found) {
          setSelectedBlock(found);
          iframeRef.current?.contentWindow?.postMessage({ source: 'admin-templates-parent', type: 'highlight', id: m.id }, '*');
          setTimeout(() => {
            const row = document.querySelector(`[data-block-row-id="${CSS.escape(m.id)}"]`);
            if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 30);
        }
      }
      if (m.type === 'elementPicked') {
        setPickedElement({
          selector: m.selector || '',
          tagName: m.tagName || '',
          computedStyles: m.computedStyles || {},
        });
      }
      if (m.type === 'serialized') {
        if (serializeResolverRef.current) {
          serializeResolverRef.current(m.html);
          serializeResolverRef.current = null;
        }
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const serializeResolverRef = useRef(null);
  const serializeIframe = () => new Promise((resolve) => {
    serializeResolverRef.current = resolve;
    iframeRef.current?.contentWindow?.postMessage({ source: 'admin-templates-parent', type: 'serialize' }, '*');
    setTimeout(() => {
      if (serializeResolverRef.current) { serializeResolverRef.current(htmlContent); serializeResolverRef.current = null; }
    }, 2000);
  });

  const postToIframe = (msg) => {
    iframeRef.current?.contentWindow?.postMessage({ source: 'admin-templates-parent', ...msg }, '*');
  };

  const onHtmlUpload = async (file) => {
    if (!file) return;
    const text = await file.text();
    const { html, scriptsRemoved, adsPreserved } = stripAndCleanWithStats(text);
    setHtmlContent(html);
    setToast(`HTML cleaned — ${scriptsRemoved} ad scripts removed, ${adsPreserved} ad placements preserved.`);
  };

  const onSourceChange = (value) => {
    if (sourceDebounce.current) clearTimeout(sourceDebounce.current);
    sourceDebounce.current = setTimeout(() => {
      const { html } = stripAndCleanWithStats(value);
      setHtmlContent(html);
    }, 500);
  };

  const onBlockClick = (b) => { setSelectedBlock(b); postToIframe({ type: 'highlight', id: b.id }); };
  const onDelete = (b) => {
    postToIframe({ type: 'deleteBlock', id: b.id });
    setSessionChanges(sc => [...sc, { action: 'delete', label: b.label, preview: b.preview }]);
    if (selectedBlock?.id === b.id) setSelectedBlock(null);
  };

  const save = async () => {
    setSaving(true);
    try {
      const serialized = await serializeIframe();
      const { html } = stripAndCleanWithStats(serialized);
      if (id) {
        const d = await api(`/templates/${id}`, {
          method: 'PUT',
          body: JSON.stringify({ name, description, category, html_content: html }),
        });
        setHtmlContent(html);
        setToast('Template saved.');
        if (d.template) setR2Key(d.template.r2_key || r2Key);
      } else {
        const d = await api('/templates', {
          method: 'POST',
          body: JSON.stringify({ name: name || 'Untitled', description, category, html_content: html }),
        });
        setHtmlContent(html);
        setToast('Template created.');
        if (d.template) { setR2Key(d.template.r2_key || ''); onSaved(d.template.id); }
      }
    } catch (e) {
      setToast('Save failed: ' + e.message);
    }
    setSaving(false);
  };

  const sendChat = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg = { role: 'user', content: chatInput.trim() };
    const historyForApi = [...chatHistory];
    const attachedEl = pickerMode ? pickedElement : null;
    setChatHistory(prev => [...prev, userMsg]);
    setChatInput('');
    setChatLoading(true);
    setChatError('');
    try {
      const res = await fetch('/api/admin/templates/chat', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_id: id || '',
          message: userMsg.content,
          conversation_history: historyForApi,
          selected_element: attachedEl,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Chat failed');
      setChatHistory(prev => [...prev, { role: 'assistant', content: data.content }]);
    } catch (e) {
      setChatError(e.message);
    } finally {
      setChatLoading(false);
      if (pickerMode) { setPickerMode(false); setPickedElement(null); }
    }
  };

  const genClaudePrompt = async () => {
    try {
      const serialized = await serializeIframe();
      const { html } = stripAndCleanWithStats(serialized);
      const prompt = PROMPT_WRAPPERS.claudeCodeWrapper({
        templateName: name, category, description,
        r2Key: r2Key || 'new template (not yet saved)',
        sessionChanges, serializedHtml: html,
      });
      setModalContent(prompt); setModalOpen(true);
    } catch (e) { setToast('Prompt generation failed: ' + e.message); }
  };

  if (loading) return <div className="adm-empty">Loading template…</div>;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <button className="btn-ghost" onClick={onBack}>← Back to list</button>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn-outlined" onClick={genClaudePrompt} disabled={!htmlContent}>Generate Claude Prompt</button>
          <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr 320px', gap: 12, height: 'calc(100vh - 200px)', minHeight: 560 }}>
        {/* Left panel */}
        <div className="card" style={{ padding: 14, overflowY: 'auto' }}>
          <label className="form-label">Load Template</label>
          <select
            className="form-select"
            value={selectorId || ''}
            onChange={e => handleSelectTemplate(e.target.value)}
          >
            <option value="">— pick a template —</option>
            {allTemplates.map(t => (
              <option key={t.id} value={t.id}>{t.name} · {t.category || 'general'}</option>
            ))}
          </select>

          <label className="form-label" style={{ marginTop: 12 }}>Name</label>
          <input className="form-input" value={name} onChange={e => setName(e.target.value)} />

          <label className="form-label" style={{ marginTop: 12 }}>Description</label>
          <textarea className="form-textarea" rows={3} value={description} onChange={e => setDescription(e.target.value)} />

          <label className="form-label" style={{ marginTop: 12 }}>Category</label>
          <select className="form-select" value={category} onChange={e => setCategory(e.target.value)}>
            {CATEGORIES.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}
          </select>

          <label className="btn-secondary" style={{ width: '100%', justifyContent: 'center', cursor: 'pointer', marginTop: 16 }}>
            Upload HTML (new template)
            <input type="file" accept=".html,text/html" style={{ display: 'none' }}
              onChange={e => onHtmlUpload(e.target.files?.[0])} />
          </label>

          <button
            type="button"
            className="btn-outlined"
            style={{ width: '100%', marginTop: 8 }}
            onClick={() => setCaptureOpen(v => !v)}
            disabled={!id}
            title={id ? 'Capture a URL via headless browser' : 'Save template first'}
          >
            {captureOpen ? 'Cancel capture' : 'Capture Live Page'}
          </button>
          {captureOpen && (
            <div style={{ marginTop: 8, padding: 10, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6 }}>
              <label className="form-label" style={{ fontSize: 11 }}>Target URL</label>
              <input
                className="form-input"
                value={captureUrl}
                onChange={e => setCaptureUrl(e.target.value)}
                placeholder="https://example.com"
                style={{ fontSize: 12 }}
              />
              <button
                className="btn-primary"
                style={{ width: '100%', marginTop: 6, fontSize: 12, padding: '6px 10px' }}
                onClick={runCapture}
                disabled={capturing || !captureUrl.trim()}
              >
                {capturing ? 'Rendering…' : 'Capture'}
              </button>
            </div>
          )}

          {r2Key && (
            <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 10, wordBreak: 'break-all' }}>R2 key: {r2Key}</div>
          )}
          <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 6 }}>
            Session changes: {sessionChanges.length}
          </div>
        </div>

        {/* Center canvas */}
        <AdminCenterCanvas iframeHtml={iframeHtml} iframeRef={iframeRef} />

        {/* Right panel */}
        <div className="card" style={{ padding: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border-light)' }}>
            {['blocks', 'source'].map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                flex: 1, padding: '10px 8px', fontSize: 12, fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: '0.08em',
                background: tab === t ? 'var(--card-alt)' : 'transparent',
                color: tab === t ? 'var(--green)' : 'var(--text-light)',
                border: 'none', borderBottom: tab === t ? '2px solid var(--green)' : '2px solid transparent',
                cursor: 'pointer',
              }}>{t}</button>
            ))}
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
            {tab === 'blocks' && (
              <AdminBlocksTab
                blocks={blocks}
                selectedBlock={selectedBlock}
                onBlockClick={onBlockClick}
                onDelete={onDelete}
                postToIframe={postToIframe}
                category={category}
                setSessionChanges={setSessionChanges}
                rawHtml={htmlContent}
                setToast={setToast}
              />
            )}
            {tab === 'source' && (
              <textarea
                defaultValue={htmlContent}
                onChange={e => onSourceChange(e.target.value)}
                style={{
                  width: '100%', height: '100%', minHeight: 400,
                  fontFamily: 'var(--font-mono)', fontSize: 12,
                  background: 'var(--surface-inp)', border: '1px solid var(--border)',
                  borderRadius: 6, padding: 10,
                }}
              />
            )}
          </div>
        </div>
      </div>

      {/* Chat panel — spans full width below the three-column grid */}
      <div className="card" style={{ marginTop: 16, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div className="eyebrow" style={{ margin: 0 }}>✦ TEMPLATE CHAT</div>
          <button
            type="button"
            onClick={() => setPickerMode(m => !m)}
            className={pickerMode ? 'db-btn db-btn-accent' : 'db-btn'}
            style={{ fontSize: 11, padding: '4px 10px' }}
          >
            {pickerMode ? 'Picker: click an element…' : 'Pick element'}
          </button>
          {pickerMode && pickedElement && (
            <span style={{ fontSize: 11, color: 'var(--amber)', fontFamily: 'var(--font-mono)' }}>
              Attached: {pickedElement.selector}
            </span>
          )}
          <div style={{ flex: 1 }} />
          {chatHistory.length > 0 && (
            <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => setChatHistory([])}>
              Clear
            </button>
          )}
        </div>
        <div
          ref={chatScrollRef}
          style={{
            maxHeight: 320, overflowY: 'auto',
            background: 'var(--surface-inp)',
            border: '1px solid var(--border-light)',
            borderRadius: 8, padding: 10,
            display: 'flex', flexDirection: 'column', gap: 8,
          }}
        >
          {chatHistory.length === 0 && !chatLoading && (
            <div style={{ fontSize: 12, color: 'var(--text-light)', fontStyle: 'italic' }}>
              Ask Claude about the template. Use "Pick element" to attach a specific CSS selector + computed styles to your next message.
            </div>
          )}
          {chatHistory.map((m, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div style={{
                maxWidth: '85%',
                padding: '8px 12px',
                borderRadius: m.role === 'user' ? '10px 10px 2px 10px' : '10px 10px 10px 2px',
                background: m.role === 'user' ? 'var(--amber-light)' : 'var(--card)',
                border: `1px solid ${m.role === 'user' ? 'var(--amber-border)' : 'var(--border)'}`,
                fontSize: 13, color: 'var(--text)', lineHeight: 1.6, whiteSpace: 'pre-wrap', fontFamily: m.role === 'assistant' ? 'var(--font-mono)' : undefined,
              }}>{m.content}</div>
            </div>
          ))}
          {chatLoading && (
            <div style={{ fontSize: 12, color: 'var(--text-light)', fontStyle: 'italic' }}>Thinking…</div>
          )}
          {chatError && (
            <div style={{ fontSize: 12, color: 'var(--error)' }}>{chatError}</div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <textarea
            className="form-textarea"
            rows={2}
            placeholder={pickerMode ? 'Type a message, then click an element in the preview to attach it…' : 'Ask about the template…'}
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
            style={{ flex: 1, minHeight: 44 }}
          />
          <button className="btn-primary" onClick={sendChat} disabled={chatLoading || !chatInput.trim()}>
            Send
          </button>
        </div>
      </div>

      {toast && <ToastBanner message={toast} onDone={() => setToast('')} />}

      {modalOpen && (
        <ExportModal content={modalContent} onClose={() => setModalOpen(false)} setToast={setToast} />
      )}
    </div>
  );
}

const ADMIN_VIEWPORTS = [
  { id: 'desktop', label: 'Desktop', w: 1280 },
  { id: 'tablet',  label: 'Tablet',  w: 768 },
  { id: 'mobile',  label: 'Mobile',  w: 390 },
];

function AdminCenterCanvas({ iframeHtml, iframeRef }) {
  const [viewport, setViewport] = useState('desktop');
  const [zoom, setZoom] = useState(1);
  const wrapperRef = useRef(null);
  const vp = ADMIN_VIEWPORTS.find(v => v.id === viewport) || ADMIN_VIEWPORTS[0];
  const [available, setAvailable] = useState({ w: vp.w, h: 700 });

  useEffect(() => {
    if (!wrapperRef.current) return;
    const el = wrapperRef.current;
    const measure = () => {
      setAvailable({
        w: Math.max(200, el.clientWidth - 12),
        h: Math.max(300, el.clientHeight - 44),  // space for the toolbar
      });
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (ro) ro.observe(el);
    window.addEventListener('resize', measure);
    return () => { if (ro) ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [viewport]);

  const autoFit = Math.min(1, available.w / vp.w);
  const scale = autoFit * zoom;
  const logicalH = Math.max(600, Math.round(available.h / scale));

  return (
    <div className="card" ref={wrapperRef} style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 10px', borderBottom: '1px solid var(--border-light)',
        background: 'var(--card-alt)', fontSize: 11, color: 'var(--text-light)',
      }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {ADMIN_VIEWPORTS.map(v => (
            <button key={v.id}
              onClick={() => setViewport(v.id)}
              className={`db-btn ${viewport === v.id ? 'db-btn-accent' : ''}`}
              style={{ fontSize: 11, padding: '3px 10px' }}
            >{v.label}</button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <span>Zoom</span>
        <input type="range" min={50} max={100} step={5}
          value={Math.round(zoom * 100)}
          onChange={e => setZoom(parseInt(e.target.value, 10) / 100)}
          style={{ width: 100 }} />
        <span style={{ width: 34, color: 'var(--text-mid)', textAlign: 'right' }}>{Math.round(scale * 100)}%</span>
      </div>
      <div style={{ flex: 1, padding: 6, overflow: 'hidden' }}>
        {iframeHtml ? (
          <div style={{
            width: Math.round(vp.w * scale),
            height: Math.round(logicalH * scale),
            margin: '0 auto',
            overflow: 'hidden',
            background: 'var(--card)',
            borderRadius: 4,
          }}>
            <iframe
              ref={iframeRef}
              title="Template preview"
              srcDoc={iframeHtml}
              sandbox="allow-same-origin allow-scripts"
              style={{
                width: vp.w,
                height: logicalH,
                border: 'none',
                display: 'block',
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
              }}
            />
          </div>
        ) : (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
            <div style={{ textAlign: 'center', maxWidth: 420 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
                No HTML uploaded yet
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-light)', lineHeight: 1.6 }}>
                Use the Upload HTML button to add content to this template, or paste into the Source tab.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ToastBanner({ message, onDone }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDone, 3200);
    return () => clearTimeout(t);
  }, [message, onDone]);
  return (
    <div style={{
      position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
      background: 'var(--success)', color: 'var(--card)', padding: '10px 18px',
      borderRadius: 8, fontSize: 13, zIndex: 1000, boxShadow: 'var(--shadow-card)',
    }}>{message}</div>
  );
}

function AdminBlocksTab({ blocks, selectedBlock, onBlockClick, onDelete, postToIframe, category, setSessionChanges, rawHtml, setToast }) {
  if (blocks.length === 0) return <div style={{ color: 'var(--text-light)', fontSize: 13 }}>No blocks yet.</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {blocks.map(b => {
        const active = selectedBlock?.id === b.id;
        return (
        <div key={b.id}
          data-block-row-id={b.id}
          onClick={() => onBlockClick(b)}
          style={{
            padding: 10,
            background: active ? 'var(--amber-light)' : 'var(--bg)',
            border: `1px solid ${active ? 'var(--amber-border)' : 'var(--border)'}`,
            borderLeft: active ? '2px solid var(--amber)' : '1px solid var(--border)',
            borderRadius: 6, fontSize: 12, cursor: 'pointer',
            animation: active ? 'comp-amber-pulse 1.6s ease-in-out infinite' : undefined,
          }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
            {b.label}
            {b.type === 'ad' && <span style={{ background: 'var(--error)', color: 'var(--card)', padding: '1px 5px', borderRadius: 3, fontSize: 9, fontWeight: 700, marginLeft: 6 }}>AD {b.adSize}</span>}
          </div>
          <div style={{ color: 'var(--text-light)', fontSize: 11, marginBottom: 8 }}>{b.preview}</div>
          {selectedBlock?.id === b.id && b.type === 'text' && (
            <AdminTextEdit block={b} postToIframe={postToIframe} category={category} setSessionChanges={setSessionChanges} rawHtml={rawHtml} setToast={setToast} />
          )}
          <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
            <button className="db-btn" onClick={(e) => { e.stopPropagation(); onBlockClick(b); }}>Edit</button>
            <button className="btn-danger-sm" onClick={(e) => { e.stopPropagation(); onDelete(b); }}>Delete</button>
          </div>
        </div>
        );
      })}
    </div>
  );
}

function AdminTextEdit({ block, postToIframe, category, setSessionChanges, rawHtml, setToast }) {
  const [draft, setDraft] = useState(block.preview || '');
  const [instruction, setInstruction] = useState('');
  const [generated, setGenerated] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { setDraft(block.preview || ''); setGenerated(''); setInstruction(''); }, [block.id]);

  const apply = () => {
    postToIframe({ type: 'replaceText', id: block.id, text: draft });
    setSessionChanges(sc => [...sc, { action: 'text', label: block.label, original: block.preview, updated: draft }]);
  };
  const generate = async () => {
    if (!instruction.trim()) return;
    setLoading(true); setGenerated('');
    try {
      const res = await fetch('/api/comp-studio/generate-copy', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          blockType: block.label.split(' (')[1]?.replace(')', '') || 'p',
          blockLabel: block.label,
          surroundingContext: (rawHtml || '').slice(0, 2000),
          userInstruction: instruction,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Generation failed');
      setGenerated(data.generated_text || '');
    } catch (err) { setToast('Generate failed: ' + err.message); }
    setLoading(false);
  };
  const applyGenerated = () => {
    postToIframe({ type: 'replaceText', id: block.id, text: generated });
    setSessionChanges(sc => [...sc, { action: 'text', label: block.label, original: block.preview, updated: generated }]);
  };

  return (
    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border-faint)' }} onClick={e => e.stopPropagation()}>
      <textarea className="form-textarea" rows={3} value={draft} onChange={e => setDraft(e.target.value)} />
      <button className="btn-accent" onClick={apply} style={{ marginTop: 4 }}>Apply text</button>
      <div style={{ marginTop: 8 }}>
        <textarea className="form-textarea" rows={2} placeholder="AI copy instruction…" value={instruction} onChange={e => setInstruction(e.target.value)} />
        <button className="btn-primary" onClick={generate} disabled={loading || !instruction.trim()} style={{ marginTop: 4, width: '100%' }}>
          {loading ? 'Generating…' : 'Generate'}
        </button>
        {generated && (
          <div style={{ marginTop: 6, padding: 8, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }}>
            <div style={{ marginBottom: 6 }}>{generated}</div>
            <button className="btn-accent" onClick={applyGenerated}>Apply</button>
          </div>
        )}
      </div>
    </div>
  );
}
