// Atomic Reactor — new /reactor home page. Hero state on first paint, then
// docks the input to the bottom once a conversation has started. Uses the
// .ds-v2 design system exclusively. Renders inside the SidebarV2 shell
// wired up in App.jsx.
//
// conversationId flows two ways:
//   - If the route already carries one (/reactor/:id), hydrate from the
//     server and render the existing thread.
//   - Otherwise start fresh; the first /api/reactor/route call returns a
//     new conversation_id which we push into the URL without a full reload.

import { useCallback, useEffect, useRef, useState } from 'react';

const SUGGESTIONS = [
  'article on bigfoot in ohio',
  'podcast about the moon for kids',
  'logo for a coffee shop',
  '5-slide deck on Q3 sales',
];

const MODEL_GROUPS = [
  { provider: 'Anthropic', models: [
    { id: 'claude-sonnet-4-7', label: 'Claude Sonnet 4.7' },
    { id: 'claude-haiku-4-5',  label: 'Claude Haiku 4.5' },
    { id: 'claude-opus-4-6',   label: 'Claude Opus 4.6'  },
  ]},
  { provider: 'Google', models: [
    { id: 'gemini-2.5-pro',         label: 'Gemini 2.5 Pro' },
    { id: 'gemini-2.5-flash',       label: 'Gemini 2.5 Flash' },
    { id: 'gemini-2.5-flash-image', label: 'Gemini Flash Image' },
  ]},
  { provider: 'OpenAI', models: [
    { id: 'gpt-4-1',     label: 'GPT-4.1' },
    { id: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
  ]},
  { provider: 'Ideogram', models: [
    { id: 'ideogram-v2', label: 'Ideogram V2' },
  ]},
];
const MODEL_LABEL = Object.fromEntries(MODEL_GROUPS.flatMap(g => g.models.map(m => [m.id, m.label])));

const SAVE_TARGETS = {
  text:     { target: 'articles',      label: 'Save to Articles' },
  image:    { target: 'flash',         label: 'Save to Atomic Flash' },
  audio:    { target: 'quark-cast',    label: 'Save to Quark Cast' },
  document: { target: 'brief-builder', label: 'Save to Brief Builder' },
  code:     { target: null,            label: 'Download as file' },
};

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

export default function AtomicReactor({ navigate, page }) {
  // page may be /reactor or /reactor/:id — pull id from the path.
  const initialId = (() => {
    const m = String(page || '').match(/^\/reactor\/([^/?#]+)/);
    return m ? m[1] : null;
  })();

  const [conversationId, setConversationId] = useState(initialId);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [autoRoute, setAutoRoute] = useState(true);
  const [selectedModel, setSelectedModel] = useState('claude-sonnet-4-7');
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef(null);
  const textareaRef = useRef(null);

  // Hydrate history when opening an existing conversation.
  useEffect(() => {
    if (!initialId) return;
    let cancelled = false;
    api(`/api/reactor/conversation/${encodeURIComponent(initialId)}`)
      .then(d => { if (!cancelled) setMessages(d.messages || []); })
      .catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [initialId]);

  // Session bridge from Dashboard's Quick Generate widget. When that widget
  // stashes a prompt and navigates here, prefill the input so the user sees
  // their intent carried over. Cleared on read so a later manual visit
  // doesn't re-apply it.
  useEffect(() => {
    try {
      const prefilled = sessionStorage.getItem('reactor:prefilled');
      if (prefilled) {
        setInput(prefilled);
        sessionStorage.removeItem('reactor:prefilled');
      }
    } catch { /* sessionStorage unavailable — fall through silently */ }
  }, []);

  // Auto-scroll the conversation pane as new messages arrive.
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  // Auto-grow the textarea up to a cap so long prompts stay visible.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(200, Math.max(48, el.scrollHeight))}px`;
  }, [input]);

  const hasConversation = messages.length > 0;

  const send = useCallback(async (explicit) => {
    const text = (typeof explicit === 'string' ? explicit : input).trim();
    if (!text || loading) return;
    setError('');
    setLoading(true);
    setInput('');
    setMessages(m => [...m, { role: 'user', content: text, created_at: Math.floor(Date.now() / 1000), id: `pending-user-${Date.now()}` }]);
    try {
      const res = await api('/api/reactor/route', {
        method: 'POST',
        body: JSON.stringify({
          message: text,
          conversation_id: conversationId,
          auto_route: autoRoute,
          selected_model: autoRoute ? null : selectedModel,
        }),
      });
      setConversationId(res.conversation_id);
      if (!initialId && res.conversation_id) {
        // Push the conversation URL without forcing a remount.
        try { window.history.replaceState({}, '', `/reactor/${res.conversation_id}`); } catch {}
      }
      setMessages(m => [...m, {
        role: 'assistant',
        id: res.message_id,
        content: res.reply,
        model_used: res.model_used,
        task_type: res.task_type,
        artifact_url: res.artifact_url,
        created_at: Math.floor(Date.now() / 1000),
      }]);
    } catch (e) {
      setError(e.message || 'Request failed');
      setMessages(m => [...m, { role: 'assistant', content: `Error: ${e.message || 'request failed'}`, error: true, id: `err-${Date.now()}` }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, conversationId, autoRoute, selectedModel, initialId]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const saveArtifact = async (msg, target) => {
    if (!target) return;
    try {
      const res = await api('/api/reactor/save-to', {
        method: 'POST',
        body: JSON.stringify({ message_id: msg.id, target }),
      });
      setMessages(list => list.map(m => m.id === msg.id
        ? { ...m, saved_to_feature: res.feature, saved_to_id: res.id }
        : m));
    } catch (e) {
      setError(e.message || 'Save failed');
    }
  };

  const downloadCode = (msg) => {
    const blob = new Blob([msg.content || ''], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reactor-${msg.id || 'code'}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const chooseModel = (id) => {
    setSelectedModel(id);
    setAutoRoute(false);
    setModelMenuOpen(false);
  };

  const resetToAuto = () => {
    setAutoRoute(true);
    setModelMenuOpen(false);
  };

  // Console shell is shared between the hero and the docked bottom input.
  const consoleShell = (
    <div className="ds-v2-reactor__console">
      <textarea
        ref={textareaRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={hasConversation ? 'Ask for anything…' : 'Try: Make a 5 min podcast about the moon for kids…'}
        rows={2}
      />
      <div className="ds-v2-reactor__console-row">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            className={`ds-v2-reactor__auto-toggle${autoRoute ? ' is-on' : ''}`}
            onClick={() => setAutoRoute(v => !v)}
            aria-pressed={autoRoute}
          >
            {autoRoute ? '✱ AUTO' : 'AUTO · OFF'}
          </button>
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              className="ds-v2-reactor__model"
              onClick={() => setModelMenuOpen(v => !v)}
            >
              {autoRoute ? 'pick model ▾' : `${MODEL_LABEL[selectedModel] || selectedModel} ▾`}
            </button>
            {modelMenuOpen && (
              <div
                className="ds-v2-model-menu"
                style={{ bottom: 'calc(100% + 6px)', left: 0 }}
                onMouseLeave={() => setModelMenuOpen(false)}
              >
                {MODEL_GROUPS.map(group => (
                  <div key={group.provider}>
                    <div className="ds-v2-model-menu__group">{group.provider}</div>
                    {group.models.map(m => (
                      <button
                        key={m.id}
                        type="button"
                        className={`ds-v2-model-menu__item${!autoRoute && selectedModel === m.id ? ' is-selected' : ''}`}
                        onClick={() => chooseModel(m.id)}
                      >
                        <span style={{ width: 12 }}>{!autoRoute && selectedModel === m.id ? '✓' : ''}</span>
                        <span>{m.label}</span>
                      </button>
                    ))}
                  </div>
                ))}
                <div style={{ borderTop: '1px solid var(--border)', marginTop: 4 }}>
                  <button
                    type="button"
                    className="ds-v2-model-menu__item"
                    onClick={resetToAuto}
                  >
                    <span style={{ width: 12 }}>{autoRoute ? '✓' : ''}</span>
                    <span>Auto-route</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        <button
          type="button"
          className="v2-btn v2-btn--primary"
          onClick={() => send()}
          disabled={!input.trim() || loading}
          style={{ opacity: !input.trim() || loading ? 0.5 : 1 }}
        >
          {loading ? 'Reacting…' : 'React →'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="ds-v2-reactor">
      {!hasConversation ? (
        <div className="ds-v2-reactor__hero">
          <div className="ds-v2-reactor__atom" aria-hidden>
            <AtomMark />
          </div>
          <div>
            <div className="ds-v2-page__eyebrow">// ATOMIC REACTOR</div>
            <h1 className="t-display ds-v2-reactor__title" style={{ marginTop: 4 }}>What do you want to create?</h1>
            <p className="t-body" style={{ color: 'var(--ink-mid)', marginTop: 6 }}>
              Articles, images, podcasts, decks — ask for anything.
            </p>
          </div>
          {consoleShell}
          <div className="ds-v2-reactor__chips">
            {SUGGESTIONS.map(s => (
              <button
                key={s}
                type="button"
                className="ds-v2-reactor__chip"
                onClick={() => { setInput(s); send(s); }}
              >
                {s}
              </button>
            ))}
          </div>
          {error && <div className="t-body-sm" style={{ color: 'var(--danger)' }}>{error}</div>}
        </div>
      ) : (
        <>
          <div ref={scrollRef} className="ds-v2-reactor__conversation">
            {messages.map((m) => (
              <ReactorMessage
                key={m.id || `${m.role}-${m.created_at}`}
                msg={m}
                onSave={saveArtifact}
                onDownload={downloadCode}
                navigate={navigate}
              />
            ))}
            {loading && (
              <div className="ds-v2-reactor__msg ds-v2-reactor__msg--assistant">
                <div className="ds-v2-reactor__attribution">// reacting…</div>
                <div className="ds-v2-reactor__bubble t-body" style={{ color: 'var(--ink-light)' }}>Thinking.</div>
              </div>
            )}
            {error && (
              <div className="t-body-sm" style={{ color: 'var(--danger)' }}>{error}</div>
            )}
          </div>
          <div className="ds-v2-reactor__docked">{consoleShell}</div>
        </>
      )}
    </div>
  );
}

function ReactorMessage({ msg, onSave, onDownload, navigate }) {
  if (msg.role === 'user') {
    return (
      <div className="ds-v2-reactor__msg ds-v2-reactor__msg--user">
        <div className="ds-v2-reactor__bubble">{msg.content}</div>
      </div>
    );
  }
  const saveInfo = SAVE_TARGETS[msg.task_type] || null;
  const alreadySaved = !!msg.saved_to_feature;
  return (
    <div className="ds-v2-reactor__msg ds-v2-reactor__msg--assistant">
      {msg.model_used && (
        <div className="ds-v2-reactor__attribution">// via {MODEL_LABEL[msg.model_used] || msg.model_used}</div>
      )}
      <div className="ds-v2-reactor__bubble" style={msg.error ? { borderColor: 'var(--danger)', color: 'var(--danger)' } : undefined}>
        {msg.content}
      </div>
      {msg.artifact_url && (
        <div className="ds-v2-reactor__artifact">
          {msg.task_type === 'image'
            ? <img src={msg.artifact_url} alt="" />
            : <audio controls src={msg.artifact_url} style={{ width: '100%' }} />}
        </div>
      )}
      {saveInfo && !alreadySaved && !msg.error && (
        <button
          type="button"
          className="v2-btn v2-btn--sm"
          style={{ alignSelf: 'flex-start', marginTop: 4 }}
          onClick={() => saveInfo.target ? onSave(msg, saveInfo.target) : onDownload(msg)}
        >
          {saveInfo.label} →
        </button>
      )}
      {alreadySaved && (
        <button
          type="button"
          className="v2-btn v2-btn--sm"
          style={{ alignSelf: 'flex-start', marginTop: 4, color: 'var(--success)' }}
          onClick={() => {
            if (msg.saved_to_feature === 'articles') navigate?.(`/content/${msg.saved_to_id}`);
            else if (msg.saved_to_feature === 'quark-cast') navigate?.('/listen');
            else if (msg.saved_to_feature === 'flash') navigate?.('/atomic/images');
            else if (msg.saved_to_feature === 'brief-builder') navigate?.('/brief-builder');
          }}
        >
          ✓ Saved · open →
        </button>
      )}
    </div>
  );
}

function AtomMark() {
  // Three crossed rings with a bright amber nucleus. Pure SVG so it scales
  // and color-swaps cleanly via currentColor.
  return (
    <svg width="100%" height="100%" viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1.4">
        <ellipse cx="32" cy="32" rx="24" ry="9" />
        <ellipse cx="32" cy="32" rx="24" ry="9" transform="rotate(60 32 32)" />
        <ellipse cx="32" cy="32" rx="24" ry="9" transform="rotate(120 32 32)" />
      </g>
      <circle cx="32" cy="32" r="4" fill="currentColor" />
    </svg>
  );
}
