// /prompt-builder — three-screen conversational prompt engineering assistant.
// Screen 1: pick target AI. Screen 2: state initial intent. Screen 3: chat
// until the server replies with "I HAVE EVERYTHING I NEED" on its own line —
// at that point the response is split and the final prompt is rendered in an
// amber-accented code block with Copy / Save / Start over actions.

import { useEffect, useRef, useState } from 'react';

interface Message { role: 'user' | 'assistant'; content: string; }
interface SavedPrompt {
  id: string;
  target_model: string;
  title: string | null;
  prompt_text: string;
  conversation_history: Message[];
  created_at: number;
}

const MODELS = [
  { id: 'claude',  label: 'Claude (Anthropic)', desc: 'Long-form reasoning, nuanced style, XML-friendly structure.' },
  { id: 'gpt4o',   label: 'GPT-4o (OpenAI)',    desc: 'Versatile generalist, strong at numbered directives.' },
  { id: 'gemini',  label: 'Gemini (Google)',    desc: 'Massive context window, structured multi-section prompts.' },
  { id: 'llama',   label: 'Llama 3 (Meta)',     desc: 'Open-source, prefers simple flat instructions.' },
  { id: 'mistral', label: 'Mistral',            desc: 'Fast and concise — directive-focused prompts shine.' },
  { id: 'other',   label: 'Other',              desc: 'Generic best-practice structure.' },
];

const FINAL_MARKER = 'I HAVE EVERYTHING I NEED';

function timeAgo(ts: number) {
  const delta = Math.max(0, Math.floor(Date.now() / 1000 - ts));
  if (delta < 60) return 'just now';
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
  return `${Math.floor(delta / 86400)}d ago`;
}

export default function PromptBuilder() {
  const [screen, setScreen] = useState<'model' | 'intent' | 'dialogue'>('model');
  const [modelId, setModelId] = useState<string>('claude');
  const model = MODELS.find(m => m.id === modelId) || MODELS[0];
  const [intent, setIntent] = useState('');

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [finalPrompt, setFinalPrompt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [savedOnce, setSavedOnce] = useState(false);

  const [savedOpen, setSavedOpen] = useState(false);
  const [savedList, setSavedList] = useState<SavedPrompt[]>([]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  async function loadSaved() {
    try {
      const res = await fetch('/api/prompt-builder', { credentials: 'include' });
      const d = await res.json();
      setSavedList(d.prompts || []);
    } catch {}
  }
  useEffect(() => { loadSaved(); }, []);

  // Parse an assistant reply for the FINAL_MARKER. When present, split off
  // everything after the marker line as the final prompt and keep the
  // preamble as normal chat text.
  function parseReply(raw: string): { text: string; prompt: string | null } {
    const lines = raw.split('\n');
    const idx = lines.findIndex(l => l.trim() === FINAL_MARKER);
    if (idx === -1) return { text: raw, prompt: null };
    const text = lines.slice(0, idx).join('\n').trim();
    const prompt = lines.slice(idx + 1).join('\n').trim();
    return { text: text || "Here's your prompt.", prompt: prompt || null };
  }

  async function startDialogue() {
    if (!intent.trim()) return;
    setScreen('dialogue');
    setLoading(true); setError(null); setFinalPrompt(null); setSavedOnce(false);
    const first: Message = { role: 'user', content: intent.trim() };
    setMessages([first]);
    try {
      const res = await fetch('/api/prompt-builder/chat', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [first], target_model: model.label, initial_intent: intent.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Chat failed');
      const { text, prompt } = parseReply(String(data.content || ''));
      setMessages(prev => [...prev, { role: 'assistant', content: text }]);
      if (prompt) {
        setFinalPrompt(prompt);
        void autoSave(prompt, [first, { role: 'assistant', content: text }]);
      }
    } catch (e: any) {
      setError(e.message || 'Failed');
    }
    setLoading(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  async function send() {
    if (!input.trim() || loading) return;
    setLoading(true); setError(null);
    const next: Message[] = [...messages, { role: 'user', content: input.trim() }];
    setMessages(next);
    setInput('');
    try {
      const res = await fetch('/api/prompt-builder/chat', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next, target_model: model.label, initial_intent: intent }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Chat failed');
      const { text, prompt } = parseReply(String(data.content || ''));
      const finalMessages: Message[] = [...next, { role: 'assistant', content: text }];
      setMessages(finalMessages);
      if (prompt) {
        setFinalPrompt(prompt);
        void autoSave(prompt, finalMessages);
      }
    } catch (e: any) {
      setError(e.message || 'Failed');
    }
    setLoading(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  async function autoSave(promptText: string, conversation: Message[]) {
    if (savedOnce) return;
    const title = intent.trim().slice(0, 60);
    try {
      await fetch('/api/prompt-builder/save', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_model: model.label, title, prompt_text: promptText, conversation_history: conversation }),
      });
      setSavedOnce(true);
      loadSaved();
    } catch {}
  }

  async function manualSave() {
    if (!finalPrompt) return;
    const title = intent.trim().slice(0, 60);
    try {
      await fetch('/api/prompt-builder/save', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_model: model.label, title, prompt_text: finalPrompt, conversation_history: messages }),
      });
      loadSaved();
    } catch (e: any) {
      setError(e?.message || 'Save failed');
    }
  }

  async function copyPrompt() {
    if (!finalPrompt) return;
    try { await navigator.clipboard.writeText(finalPrompt); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
  }

  function startOver() {
    setScreen('model'); setIntent(''); setMessages([]); setFinalPrompt(null); setInput(''); setError(null); setSavedOnce(false);
  }

  async function deleteSaved(id: string) {
    try {
      await fetch(`/api/prompt-builder/${id}`, { method: 'DELETE', credentials: 'include' });
      setSavedList(prev => prev.filter(p => p.id !== id));
    } catch {}
  }

  // Screen 1 — model selection
  if (screen === 'model') {
    return (
      <div style={{ maxWidth: 820, margin: '0 auto', padding: '40px 24px' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--text)', marginBottom: 20 }}>
          Which AI are you building this prompt for?
        </h1>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          {MODELS.map(m => (
            <button key={m.id} type="button" onClick={() => { setModelId(m.id); setScreen('intent'); }}
              style={{
                textAlign: 'left', padding: 16, borderRadius: 10,
                background: 'var(--card)', border: '1px solid var(--border)',
                cursor: 'pointer', boxShadow: 'var(--shadow-card)',
              }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{m.label}</div>
              <div style={{ fontSize: 12, color: 'var(--text-mid)', marginTop: 4 }}>{m.desc}</div>
            </button>
          ))}
        </div>
        <div style={{ marginTop: 24 }}>
          <button className="btn-ghost" onClick={() => setSavedOpen(true)}>View saved prompts →</button>
        </div>
        {savedOpen && (
          <SavedPanel list={savedList} onClose={() => setSavedOpen(false)} onDelete={deleteSaved} />
        )}
      </div>
    );
  }

  // Screen 2 — initial intent
  if (screen === 'intent') {
    return (
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '60px 24px' }}>
        <button className="btn-ghost" onClick={() => setScreen('model')} style={{ fontSize: 12, marginBottom: 14 }}>
          ← Change model ({model.label})
        </button>
        <textarea
          className="form-textarea"
          rows={6}
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          placeholder="Describe what you want to accomplish. Don't worry about getting it perfect — we'll work through it together."
          style={{ fontSize: 14, padding: 14 }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <button className="btn-primary" onClick={startDialogue} disabled={!intent.trim()}>Start</button>
        </div>
      </div>
    );
  }

  // Screen 3 — dialogue
  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 80px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 10, background: 'var(--amber-light)', color: 'var(--amber-dim)', padding: '3px 10px', borderRadius: 100, letterSpacing: '.06em', textTransform: 'uppercase', fontWeight: 700 }}>
            {model.label}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button className="btn-ghost" onClick={() => setSavedOpen(true)} style={{ fontSize: 12 }}>Saved prompts</button>
          <button className="btn-ghost" onClick={startOver} style={{ fontSize: 12 }}>Start over</button>
        </div>
      </div>

      {error && <div style={{ color: 'var(--error)', fontSize: 12, padding: '6px 10px', background: 'var(--error-bg)', border: '1px solid var(--error-border)', borderRadius: 6, marginBottom: 10 }}>{error}</div>}

      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth: m.role === 'user' ? '75%' : '85%',
              padding: '10px 14px',
              borderRadius: m.role === 'user' ? '10px 10px 2px 10px' : '10px 10px 10px 2px',
              background: m.role === 'user' ? 'var(--green)' : 'var(--card)',
              color: m.role === 'user' ? '#fff' : 'var(--text)',
              border: m.role === 'user' ? 'none' : '1px solid var(--border)',
              fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap',
            }}>{m.content}</div>
          </div>
        ))}
        {loading && <div style={{ fontSize: 12, color: 'var(--text-light)', fontStyle: 'italic' }}>Thinking…</div>}
      </div>

      {finalPrompt && (
        <div style={{
          marginTop: 16, padding: 16,
          background: 'var(--surface-inp)',
          borderLeft: '3px solid var(--amber)',
          borderRadius: '0 8px 8px 0',
          fontFamily: 'var(--font-mono)', fontSize: 12,
          whiteSpace: 'pre-wrap', color: 'var(--text)',
        }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--amber-dim)', fontWeight: 700, marginBottom: 8, fontFamily: 'var(--font-ui)' }}>
            Your {model.label} prompt
          </div>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{finalPrompt}</pre>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn-accent" onClick={copyPrompt}>{copied ? 'Copied ✓' : 'Copy to Clipboard'}</button>
            <button className="btn-ghost" onClick={manualSave}>Save Prompt</button>
            <button className="btn-ghost" onClick={startOver}>Start Over</button>
          </div>
        </div>
      )}

      {!finalPrompt && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <textarea
            ref={inputRef}
            className="form-textarea"
            rows={2}
            placeholder="Reply…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            style={{ flex: 1, fontSize: 13, padding: 10 }}
          />
          <button className="btn-primary" onClick={send} disabled={loading || !input.trim()}>Send</button>
        </div>
      )}

      {savedOpen && (
        <SavedPanel list={savedList} onClose={() => setSavedOpen(false)} onDelete={deleteSaved} />
      )}
    </div>
  );
}

function SavedPanel({ list, onClose, onDelete }: { list: SavedPrompt[]; onClose: () => void; onDelete: (id: string) => void }) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  async function copy(text: string, id: string) {
    try { await navigator.clipboard.writeText(text); setCopiedId(id); setTimeout(() => setCopiedId(null), 1500); } catch {}
  }
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.4)', display: 'flex', justifyContent: 'flex-end' }} onClick={onClose}>
      <div style={{ width: 460, maxWidth: '95vw', height: '100%', background: 'var(--card)', padding: 20, overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>Saved Prompts</h3>
          <button className="btn-ghost" onClick={onClose}>Close</button>
        </div>
        {list.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-light)', textAlign: 'center', padding: 40 }}>No saved prompts yet.</div>}
        {list.map(p => (
          <div key={p.id} style={{ marginBottom: 12, padding: 12, background: 'var(--card-alt)', border: '1px solid var(--border)', borderRadius: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{p.title || '(untitled)'}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 10, background: '#7A4A2A', color: '#fff', padding: '2px 8px', borderRadius: 100 }}>
                    {p.target_model}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--text-light)' }}>{timeAgo(p.created_at)}</span>
                </div>
              </div>
            </div>
            <pre style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-mid)', marginTop: 8, maxHeight: 120, overflow: 'auto', whiteSpace: 'pre-wrap', background: 'var(--surface-inp)', padding: 8, borderRadius: 4 }}>
              {p.prompt_text.slice(0, 400)}{p.prompt_text.length > 400 ? '…' : ''}
            </pre>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button className="db-btn db-btn-gold" onClick={() => copy(p.prompt_text, p.id)}>{copiedId === p.id ? 'Copied' : 'Copy'}</button>
              <button className="btn-danger-sm" onClick={() => onDelete(p.id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
