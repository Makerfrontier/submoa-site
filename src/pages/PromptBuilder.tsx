// src/pages/PromptBuilder.tsx
// Prompt Builder — chat-driven prompt engineering assistant
// Powered by Claude Sonnet 4.6 via OpenRouter
// Accessible at /prompt-builder — all users

import { useState, useRef, useEffect } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ConversationState {
  messages: Message[];
  desiredOutcome: string;
  llm: string;
  finalPrompt: string | null;
  submissionId: string | null;
}

// ── LLM options ───────────────────────────────────────────────────────────────

const LLM_OPTIONS = [
  { value: "claude-sonnet-4-5", label: "Claude Sonnet 4.6" },
  { value: "claude-opus-4-5", label: "Claude Opus 4.6" },
  { value: "gpt-4o", label: "GPT-4o" },
  { value: "gpt-4o-mini", label: "GPT-4o Mini" },
  { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
  { value: "meta-llama/llama-3-70b-instruct", label: "Llama 3 70B" },
  { value: "mistralai/mixtral-8x7b-instruct", label: "Mistral Mixtral 8x7B" },
  { value: "other", label: "Other (I'll specify in chat)" },
];

// ── System prompt for the prompt engineer agent ───────────────────────────────

function buildSystemPrompt(desiredOutcome: string, llm: string): string {
  return `You are an expert prompt engineer. Your job is to help the user build a high-quality, hyper-detailed prompt for ${llm}.

The user's desired outcome is:
"${desiredOutcome}"

Your process:
1. Ask 2-3 targeted clarifying questions to understand exactly what the user needs. Ask only what is genuinely necessary — do not over-question.
2. Once you have enough information, tell the user you are ready to build their prompt.
3. Generate the final prompt. It must be:
   - Hyper-technical and detailed, written so a non-technical user can copy and paste it directly
   - Structured with clear sections where appropriate (role, context, instructions, format, examples)
   - Optimized specifically for ${llm}'s strengths and quirks
   - Include explicit output format instructions
   - Include a clear success criteria section
   - Written in second person addressing the LLM directly

When you are ready to deliver the final prompt, wrap it in this exact marker:
[FINAL_PROMPT_START]
(prompt content here)
[FINAL_PROMPT_END]

Everything outside those markers is conversational. Everything inside is the deliverable.

Keep conversational messages short and direct. The user is here to get a great prompt, not have a long discussion.`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PromptBuilder() {
  const [step, setStep] = useState<"form" | "chat">("form");
  const [desiredOutcome, setDesiredOutcome] = useState("");
  const [llm, setLlm] = useState("claude-sonnet-4-5");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [finalPrompt, setFinalPrompt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Start chat ──────────────────────────────────────────────────────────────

  async function handleStart() {
    if (!desiredOutcome.trim()) return;
    setStep("chat");
    setLoading(true);
    setError(null);

    const systemPrompt = buildSystemPrompt(desiredOutcome, llm);

    // Initial message from agent
    const initialMessages: Message[] = [
      {
        role: "user",
        content: `I want to build a prompt for ${llm}. My desired outcome: ${desiredOutcome}`,
      },
    ];

    const reply = await callOpenRouter(systemPrompt, initialMessages);
    if (reply) {
      const { text, extractedPrompt } = parseReply(reply);
      setMessages([
        ...initialMessages,
        { role: "assistant", content: text },
      ]);
      if (extractedPrompt) setFinalPrompt(extractedPrompt);
    } else {
      setError("Failed to connect. Please try again.");
      setStep("form");
    }
    setLoading(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  // ── Send message ────────────────────────────────────────────────────────────

  async function handleSend() {
    if (!input.trim() || loading) return;

    const userMessage: Message = { role: "user", content: input.trim() };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    setLoading(true);
    setError(null);

    const systemPrompt = buildSystemPrompt(desiredOutcome, llm);
    const reply = await callOpenRouter(systemPrompt, updatedMessages);

    if (reply) {
      const { text, extractedPrompt } = parseReply(reply);
      setMessages([...updatedMessages, { role: "assistant", content: text }]);
      if (extractedPrompt) setFinalPrompt(extractedPrompt);
    } else {
      setError("Something went wrong. Please try again.");
    }
    setLoading(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  // ── Save prompt to dashboard ────────────────────────────────────────────────

  async function handleSave() {
    if (!finalPrompt) return;
    setSaving(true);
    try {
      const res = await fetch("/api/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          desired_outcome: desiredOutcome,
          llm,
          prompt_content: finalPrompt,
          conversation: messages,
        }),
      });

      if (!res.ok) throw new Error("Save failed");
      setSaved(true);
    } catch {
      setError("Failed to save prompt. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  // ── Reset ───────────────────────────────────────────────────────────────────

  function handleReset() {
    setStep("form");
    setMessages([]);
    setFinalPrompt(null);
    setSaved(false);
    setDesiredOutcome("");
    setInput("");
    setError(null);
  }

  // ── Render: form step ───────────────────────────────────────────────────────

  if (step === "form") {
    return (
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "40px 24px" }}>
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: "#fff", fontFamily: "Georgia, serif", marginBottom: 4 }}>
            Prompt Builder
          </h1>
          <p style={{ fontSize: 13, color: "#6a8a6a" }}>
            Describe what you want. We'll ask the right questions and build you a production-ready prompt.
          </p>
        </div>

        {error && (
          <div style={{ background: "#1f0a0a", border: "0.5px solid #5a1a1a", borderRadius: 5, padding: "10px 14px", fontSize: 13, color: "#d45a5a", marginBottom: 20 }}>
            {error}
          </div>
        )}

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: "block", fontSize: 12, color: "#6a8a6a", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 6 }}>
            Desired Outcome <span style={{ color: "#d45a5a" }}>*</span>
          </label>
          <textarea
            className="brief-input"
            rows={4}
            value={desiredOutcome}
            onChange={(e) => setDesiredOutcome(e.target.value)}
            placeholder="What do you want the AI to do? Be as specific or as vague as you like — we'll ask follow-up questions to sharpen it."
          />
        </div>

        <div style={{ marginBottom: 32 }}>
          <label style={{ display: "block", fontSize: 12, color: "#6a8a6a", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 6 }}>
            LLM <span style={{ color: "#d45a5a" }}>*</span>
          </label>
          <select
            className="brief-input"
            value={llm}
            onChange={(e) => setLlm(e.target.value)}
          >
            {LLM_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <button
          onClick={handleStart}
          disabled={!desiredOutcome.trim()}
          style={{
            padding: "10px 28px",
            borderRadius: 5,
            fontSize: 13,
            fontWeight: 500,
            cursor: !desiredOutcome.trim() ? "not-allowed" : "pointer",
            border: "0.5px solid #c8973a",
            color: "#000",
            background: "#c8973a",
            opacity: !desiredOutcome.trim() ? 0.5 : 1,
          }}
        >
          Start Building →
        </button>
      </div>
    );
  }

  // ── Render: chat step ───────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 24px", display: "flex", flexDirection: "column", minHeight: "calc(100vh - 80px)" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#fff", fontFamily: "Georgia, serif", marginBottom: 2 }}>
            Prompt Builder
          </h1>
          <p style={{ fontSize: 12, color: "#5a7a5a" }}>
            Building for {LLM_OPTIONS.find(o => o.value === llm)?.label ?? llm}
          </p>
        </div>
        <button
          onClick={handleReset}
          style={{ background: "none", border: "none", color: "#5a7a5a", fontSize: 12, cursor: "pointer", padding: 0 }}
        >
          ← Start over
        </button>
      </div>

      {error && (
        <div style={{ background: "#1f0a0a", border: "0.5px solid #5a1a1a", borderRadius: 5, padding: "10px 14px", fontSize: 13, color: "#d45a5a", marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Chat messages */}
      <div style={{ flex: 1, overflowY: "auto", marginBottom: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
            }}
          >
            <div
              style={{
                maxWidth: "80%",
                padding: "10px 14px",
                borderRadius: msg.role === "user" ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                background: msg.role === "user" ? "rgba(200,151,58,0.15)" : "#0f200f",
                border: `0.5px solid ${msg.role === "user" ? "#c8973a40" : "#1e3a1e"}`,
                fontSize: 13,
                color: "#c8c8b8",
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
              }}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <div style={{ padding: "10px 14px", borderRadius: "12px 12px 12px 2px", background: "#0f200f", border: "0.5px solid #1e3a1e" }}>
              <span style={{ fontSize: 13, color: "#5a7a5a" }}>Thinking...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Final prompt block */}
      {finalPrompt && (
        <div style={{
          background: "#081508",
          border: "0.5px solid #c8973a40",
          borderRadius: 8,
          padding: "16px 20px",
          marginBottom: 16,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontSize: 11, color: "#c8973a", textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 500 }}>
              Your Prompt
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => navigator.clipboard.writeText(finalPrompt)}
                style={{ padding: "4px 12px", borderRadius: 4, fontSize: 11, cursor: "pointer", border: "0.5px solid #1e3a1e", color: "#8aaa8a", background: "transparent" }}
              >
                Copy
              </button>
              {!saved ? (
                <button
                  onClick={handleSave}
                  disabled={saving}
                  style={{ padding: "4px 12px", borderRadius: 4, fontSize: 11, cursor: saving ? "not-allowed" : "pointer", border: "0.5px solid #c8973a", color: "#c8973a", background: "transparent", opacity: saving ? 0.6 : 1 }}
                >
                  {saving ? "Saving..." : "Save to Dashboard"}
                </button>
              ) : (
                <span style={{ fontSize: 11, color: "#5ab85a", padding: "4px 12px" }}>✓ Saved to Dashboard</span>
              )}
            </div>
          </div>
          <pre style={{ fontSize: 12, color: "#c8c8b8", lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0, fontFamily: "monospace" }}>
            {finalPrompt}
          </pre>
        </div>
      )}

      {/* Input */}
      {!finalPrompt && (
        <div style={{ display: "flex", gap: 8 }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="chat dammit!"
            rows={2}
            style={{
              flex: 1,
              minWidth: 0,
              padding: "9px 12px",
              background: "#0f200f",
              border: "0.5px solid #1e3a1e",
              borderRadius: 5,
              color: "#c8c8b8",
              fontSize: 13,
              fontFamily: "sans-serif",
              outline: "none",
              resize: "none",
              lineHeight: 1.5,
              boxSizing: "border-box",
            }}
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            style={{
              padding: "0 20px",
              borderRadius: 5,
              fontSize: 13,
              fontWeight: 500,
              cursor: loading || !input.trim() ? "not-allowed" : "pointer",
              border: "0.5px solid #c8973a",
              color: "#000",
              background: "#c8973a",
              opacity: loading || !input.trim() ? 0.5 : 1,
              flexShrink: 0,
            }}
          >
            Send
          </button>
        </div>
      )}

      {finalPrompt && (
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button
            onClick={handleReset}
            style={{ padding: "8px 20px", borderRadius: 5, fontSize: 13, cursor: "pointer", border: "0.5px solid #1e3a1e", color: "#6a8a6a", background: "transparent" }}
          >
            Build another prompt
          </button>
        </div>
      )}
    </div>
  );
}

// ── OpenRouter API call ───────────────────────────────────────────────────────

async function callOpenRouter(
  systemPrompt: string,
  messages: Message[]
): Promise<string | null> {
  try {
    const res = await fetch("/api/prompt-builder/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ system: systemPrompt, messages }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    return data.content ?? null;
  } catch {
    return null;
  }
}

// ── Parse reply — extract final prompt if present ─────────────────────────────

function parseReply(text: string): { text: string; extractedPrompt: string | null } {
  const start = text.indexOf("[FINAL_PROMPT_START]");
  const end = text.indexOf("[FINAL_PROMPT_END]");

  if (start !== -1 && end !== -1) {
    const extractedPrompt = text.slice(start + "[FINAL_PROMPT_START]".length, end).trim();
    const textWithout = (text.slice(0, start) + text.slice(end + "[FINAL_PROMPT_END]".length)).trim();
    return { text: textWithout || "Here's your prompt — copy it or save it to your dashboard.", extractedPrompt };
  }

  return { text, extractedPrompt: null };
}
