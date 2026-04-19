// Site Agent Panel — persistent slideout for super admins.
// Mount once in App root. Self-hides for non-admin users.

import { useState, useEffect, useRef } from 'react';

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

// Breakpoints (kept in sync with CSS side-effect on .app-main)
const BP_WIDE = 1280;
const BP_MID = 768;

function useBreakpoint() {
  const [bp, setBp] = useState(() => {
    if (typeof window === 'undefined') return 'wide';
    const w = window.innerWidth;
    return w >= BP_WIDE ? 'wide' : w >= BP_MID ? 'mid' : 'narrow';
  });
  useEffect(() => {
    const compute = () => {
      const w = window.innerWidth;
      setBp(w >= BP_WIDE ? 'wide' : w >= BP_MID ? 'mid' : 'narrow');
    };
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, []);
  return bp;
}

export default function SiteAgentPanel({ user, currentPage }) {
  const isAllowed = user && (user.role === 'admin' || user.role === 'super_admin' || user.super_admin);
  const [open, setOpen] = useState(false);
  const [conv, setConv] = useState({ id: '', messages: [] });
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef(null);
  const bp = useBreakpoint();

  // At mid width, push the main content left while the panel is open so the
  // two don't overlap. Applied via a root-level style on document.body; gets
  // removed when the panel closes or breakpoint changes.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const main = document.querySelector('.app-main');
    if (!main) return;
    if (open && bp === 'mid') {
      main.style.marginRight = '380px';
      main.style.transition = 'margin-right 200ms ease';
    } else {
      main.style.marginRight = '';
    }
    return () => { if (main) main.style.marginRight = ''; };
  }, [open, bp]);

  useEffect(() => {
    if (!isAllowed || !open) return;
    api('/api/admin/agent/conversation')
      .then(d => setConv({ id: d.id, messages: d.messages || [] }))
      .catch(e => setError(e.message));
  }, [isAllowed, open]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [conv.messages, loading]);

  if (!isAllowed) return null;

  const send = async () => {
    if (!input.trim() || loading) return;
    setLoading(true);
    setError('');
    const userMsg = input.trim();
    setInput('');
    setConv(c => ({ ...c, messages: [...c.messages, { role: 'user', content: userMsg, current_page: currentPage, ts: Math.floor(Date.now() / 1000) }] }));
    try {
      const res = await api('/api/admin/agent/message', {
        method: 'POST',
        body: JSON.stringify({ message: userMsg, current_page: currentPage, conversation_id: conv.id }),
      });
      setConv(c => ({
        id: res.conversation_id || c.id,
        messages: [...c.messages, { role: 'assistant', content: res.reply, intent: res.intent, actions: res.actions || [], ts: Math.floor(Date.now() / 1000) }],
      }));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const confirmAction = async (action, messageIndex, actionIndex) => {
    try {
      const res = await api(`/api/admin/agent/actions/${action.id}/confirm`, { method: 'POST' });
      setConv(c => {
        const msgs = [...c.messages];
        const m = { ...msgs[messageIndex] };
        m.actions = [...(m.actions || [])];
        m.actions[actionIndex] = { ...action, status: 'confirmed', result: res.details };
        msgs[messageIndex] = m;
        return { ...c, messages: msgs };
      });
      if (action.type === 'create_task' && res.details?.task_id) {
        setConv(c => ({
          ...c,
          messages: [...c.messages, { role: 'system', content: `Task queued · #${res.details.task_id.slice(0, 8)}`, task_id: res.details.task_id, prompt: action.payload?.prompt, ts: Math.floor(Date.now() / 1000) }],
        }));
      }
    } catch (e) {
      setError(e.message);
    }
  };

  const clearConv = async () => {
    if (!confirm('Clear conversation history?')) return;
    await api('/api/admin/agent/conversation', { method: 'POST', body: JSON.stringify({ clear: true }) });
    setConv(c => ({ ...c, messages: [] }));
  };

  const copyTaskPrompt = async (prompt) => {
    try {
      await navigator.clipboard.writeText(prompt || '');
      setError('');
    } catch { setError('Copy failed'); }
  };

  // Pill style varies by breakpoint. At narrow widths becomes a 56px circle.
  const pillStyle = bp === 'narrow'
    ? {
        position: 'fixed', bottom: 16, right: 16, zIndex: 50,
        width: 56, height: 56, padding: 0, background: 'var(--leather-dark)', color: 'var(--card)',
        border: '1px solid var(--amber)', borderRadius: '50%', cursor: 'pointer',
        fontFamily: 'DM Sans', fontSize: 20, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 4px 20px rgba(0,0,0,0.18)',
      }
    : {
        position: 'fixed', bottom: 20, left: 20, zIndex: 900,
        padding: '10px 16px', background: 'var(--leather-dark)', color: 'var(--card)',
        border: '1px solid var(--amber)', borderRadius: 999, cursor: 'pointer',
        fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8,
        boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
      };

  // Panel layout: overlay (wide), push (mid), bottom modal (narrow).
  const panelStyle = bp === 'narrow'
    ? {
        position: 'fixed', left: 0, right: 0, bottom: 0, height: '90vh', zIndex: 950,
        background: 'var(--card)', borderTop: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', boxShadow: '0 -4px 20px rgba(0,0,0,0.12)',
        borderRadius: '12px 12px 0 0',
      }
    : {
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 380, zIndex: 950,
        background: 'var(--card)', borderLeft: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 20px rgba(0,0,0,0.1)',
      };

  return (
    <>
      {/* Floating pill */}
      <button
        type="button"
        aria-label={open ? 'Hide Site Agent' : 'Open Site Agent'}
        onClick={() => setOpen(o => !o)}
        style={pillStyle}
      >
        {bp === 'narrow'
          ? <span aria-hidden>✦</span>
          : <>
              <span>✦ Site Agent</span>
              <span style={{ fontSize: 9, background: 'var(--amber)', color: 'var(--leather-dark)', padding: '1px 5px', borderRadius: 3, letterSpacing: '0.05em' }}>BETA</span>
            </>}
      </button>

      {/* Slideout */}
      {open && (
        <div style={panelStyle}>
          {bp === 'narrow' && (
            <div aria-hidden style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 4px' }}>
              <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border)' }} />
            </div>
          )}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontFamily: 'DM Sans', fontWeight: 600, fontSize: 15, color: 'var(--text)' }}>Site Agent</div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--text-mid)' }}>on {currentPage || '(unknown)'}</div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={clearConv} style={{ fontFamily: 'DM Sans', fontSize: 11, padding: '4px 8px', background: 'transparent', border: '1px solid var(--border-light)', color: 'var(--text-mid)', borderRadius: 3, cursor: 'pointer' }}>Clear</button>
              <button
                type="button"
                aria-label="Close Site Agent panel"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(false); }}
                style={{ fontFamily: 'DM Sans', fontSize: 18, padding: '2px 10px', background: 'transparent', border: 'none', color: 'var(--text-mid)', cursor: 'pointer', lineHeight: 1 }}
              >×</button>
            </div>
          </div>

          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {conv.messages.length === 0 && (
              <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text-mid)', fontStyle: 'italic', padding: 10 }}>
                File a bug, look up a feature, log a decision, or ask me to package a Claude Code prompt.
              </div>
            )}
            {conv.messages.map((m, i) => (
              <MessageBubble
                key={i}
                msg={m}
                index={i}
                onConfirmAction={confirmAction}
                onCopyTaskPrompt={copyTaskPrompt}
              />
            ))}
            {loading && <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text-mid)', fontStyle: 'italic' }}>Thinking…</div>}
          </div>

          {error && <div style={{ padding: 10, background: 'var(--error-bg)', color: 'var(--error)', fontFamily: 'DM Sans', fontSize: 12 }}>{error}</div>}

          <div style={{ borderTop: '1px solid var(--border)', padding: 10, display: 'flex', gap: 8 }}>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } }}
              placeholder="Message… (⌘/Ctrl+Enter to send)"
              rows={2}
              style={{ flex: 1, padding: '8px 10px', border: '1px solid var(--border)', background: 'var(--surface-inp)', fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text)', borderRadius: 4, resize: 'none' }}
            />
            <button onClick={send} disabled={loading || !input.trim()} style={{ padding: '8px 14px', background: 'var(--amber)', color: 'var(--card)', border: 'none', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13, cursor: 'pointer', borderRadius: 4, opacity: loading || !input.trim() ? 0.5 : 1 }}>Send</button>
          </div>
        </div>
      )}
    </>
  );
}

function MessageBubble({ msg, index, onConfirmAction, onCopyTaskPrompt }) {
  if (msg.role === 'user') {
    return (
      <div style={{ alignSelf: 'flex-end', maxWidth: '85%', padding: '8px 12px', background: 'var(--green-glow)', border: '1px solid var(--green-border)', fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text)', borderRadius: 8, whiteSpace: 'pre-wrap' }}>
        {msg.content}
      </div>
    );
  }
  if (msg.role === 'system') {
    return (
      <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text-mid)', padding: '6px 10px', background: 'var(--surface-inp)', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>{msg.content}</span>
        {msg.prompt && (
          <button onClick={() => onCopyTaskPrompt(msg.prompt)} style={{ fontFamily: 'DM Sans', fontSize: 11, padding: '2px 8px', border: '1px solid var(--border)', background: 'var(--card)', cursor: 'pointer', borderRadius: 3 }}>Copy prompt</button>
        )}
      </div>
    );
  }
  const isLongPackage = (msg.content || '').length > 800;
  return (
    <div style={{ alignSelf: 'flex-start', maxWidth: '95%', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ padding: '8px 12px', background: 'var(--card)', border: '1px solid var(--border-light)', fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text)', borderRadius: 8, whiteSpace: isLongPackage ? 'pre-wrap' : 'pre-wrap', maxHeight: isLongPackage ? 300 : 'none', overflowY: isLongPackage ? 'auto' : 'visible' }}>
        {msg.content}
      </div>
      {(msg.actions || []).map((a, ai) => (
        <ActionChip key={a.id || ai} action={a} onConfirm={() => onConfirmAction(a, index, ai)} onCopyPrompt={a.type === 'create_task' ? () => onCopyTaskPrompt(a.payload?.prompt) : null} />
      ))}
    </div>
  );
}

function ActionChip({ action, onConfirm, onCopyPrompt }) {
  const confirmed = action.status === 'confirmed';
  return (
    <div style={{ padding: '6px 10px', border: `1px solid ${confirmed ? 'var(--success-border)' : 'var(--amber-border)'}`, background: confirmed ? 'var(--success-bg)' : 'var(--amber-light)', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'DM Sans', fontSize: 12 }}>
      <span style={{ color: confirmed ? 'var(--success)' : 'var(--text)' }}>{confirmed ? '✓' : '•'} {action.summary || action.type}</span>
      <div style={{ flex: 1 }} />
      {!confirmed && <button onClick={onConfirm} style={{ padding: '3px 10px', background: 'var(--amber)', color: 'var(--card)', border: 'none', fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600, cursor: 'pointer', borderRadius: 3 }}>Confirm</button>}
      {onCopyPrompt && <button onClick={onCopyPrompt} style={{ padding: '3px 10px', background: 'var(--card)', color: 'var(--text)', border: '1px solid var(--border)', fontFamily: 'DM Sans', fontSize: 11, cursor: 'pointer', borderRadius: 3 }}>Copy prompt</button>}
    </div>
  );
}
