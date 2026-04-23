// Atomic Flash Images — super_admin-only playground for Gemini Flash via
// OpenRouter (image mode) and Ideogram (logo & brand mode). Two columns:
// left for controls, right for a live-editable prompt + a grid of
// iterations. The left-panel Generate button always expands the brief
// through Claude first; the right-panel Generate Again button skips
// expansion and uses the prompt field verbatim.

import { useEffect, useRef, useState } from 'react';

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

// Issue a POST that returns a binary image on success, JSON error on failure.
// Returns a Blob (caller turns into an object URL) on success; throws the
// server error string otherwise.
async function postForImage(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `API ${res.status}`);
  }
  return await res.blob();
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

// ─── Static copy ─────────────────────────────────────────────────────
const ASPECT_RATIOS = [
  { id: '1:1',  label: '1:1',  sub: 'Square'   },
  { id: '16:9', label: '16:9', sub: 'Wide'     },
  { id: '9:16', label: '9:16', sub: 'Portrait' },
  { id: '4:3',  label: '4:3',  sub: 'Classic'  },
  { id: '3:4',  label: '3:4',  sub: 'Tall'     },
  { id: '21:9', label: '21:9', sub: 'Cinema'   },
];

const BRAND_STYLES  = ['Emblem', 'Wordmark', 'Icon'];
const BRAND_COLORS  = ['Dark', 'Light', 'Auto'];

// ─── Page component ──────────────────────────────────────────────────
export default function AtomicFlashImages() {
  const [mode, setMode] = useState('image'); // 'image' | 'brand'
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [brandStyle, setBrandStyle] = useState('Emblem');
  const [brandColor, setBrandColor] = useState('Auto');
  const [brief, setBrief] = useState('');
  const [prompt, setPrompt] = useState('');
  const [lastExpandedPrompt, setLastExpandedPrompt] = useState('');
  const [iterations, setIterations] = useState([]); // newest first
  const [generating, setGenerating] = useState(false);
  const [expanding, setExpanding] = useState(false);
  const [toast, setToast] = useState('');
  // Prompt textarea collapses to a 2-line preview by default; user has to
  // opt into seeing the full wall of text via the toggle below the field.
  const [promptExpanded, setPromptExpanded] = useState(false);
  // Lightbox holds the iteration currently being viewed at full size. null
  // means closed.
  const [lightboxIter, setLightboxIter] = useState(null);
  // Remix panel state — holds the source iteration when the inline panel is
  // open, and a separate draft prompt so editing the panel textarea doesn't
  // touch the main prompt field until the user actually submits. Only one
  // panel can be open at a time; opening a new one replaces the prior.
  const [remixPanelIter, setRemixPanelIter] = useState(null);
  const [remixPanelPrompt, setRemixPanelPrompt] = useState('');
  // Refine panel — Google-style "change only what you want". Single-line
  // instruction combined server-side with the iteration's original prompt.
  const [refinePanelIter, setRefinePanelIter] = useState(null);
  const [refinePanelInstruction, setRefinePanelInstruction] = useState('');

  // Narrow-screen check — stacks the two columns vertically under 768px.
  const [isNarrow, setIsNarrow] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false,
  );
  useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const flashToast = (msg, ms = 3000) => {
    setToast(msg);
    window.clearTimeout(flashToast._t);
    flashToast._t = window.setTimeout(() => setToast(''), ms);
  };

  // Auto-grow the prompt textarea when expanded so long AI-generated prompts
  // don't require internal scrolling. When collapsed, pin to a 2-line height
  // and let CSS hide the overflow so the user can still edit but can't see
  // the wall of text by default.
  const promptRef = useRef(null);
  useEffect(() => {
    const el = promptRef.current;
    if (!el) return;
    if (promptExpanded) {
      el.style.height = 'auto';
      el.style.height = `${Math.max(96, el.scrollHeight)}px`;
    } else {
      el.style.height = '48px';
    }
  }, [prompt, promptExpanded]);

  // ─── Generate flow ─────────────────────────────────────────────────
  // Left-panel Generate: expand brief → set prompt → generate.
  const handleGenerateFromBrief = async () => {
    const trimmed = brief.trim();
    if (!trimmed) { flashToast('Add a brief first'); return; }
    if (generating || expanding) return;

    setExpanding(true);
    let expanded = '';
    try {
      const r = await api('/api/atomic/images/expand-prompt', {
        method: 'POST',
        body: JSON.stringify({
          brief: trimmed,
          mode,
          aspectRatio: mode === 'image' ? aspectRatio : undefined,
          brandStyle: mode === 'brand' ? brandStyle : undefined,
        }),
      });
      expanded = String(r?.prompt || '').trim();
    } catch (e) {
      setExpanding(false);
      flashToast(`Prompt expansion failed: ${e.message}`);
      return;
    }
    setExpanding(false);
    if (!expanded) { flashToast('Expansion returned empty'); return; }

    setPrompt(expanded);
    setLastExpandedPrompt(expanded);
    await runGeneration(expanded);
  };

  // Right-panel Generate Again: use current prompt field verbatim.
  const handleGenerateAgain = async () => {
    const p = prompt.trim();
    if (!p) { flashToast('Prompt is empty'); return; }
    if (generating || expanding) return;
    await runGeneration(p);
  };

  // Core generator — adds a placeholder iteration immediately, swaps the
  // real result in once the fetch resolves (or converts to an error card
  // on failure). Newest iteration is always at index 0.
  //
  // remixSource, when provided, carries the blob + visible iteration number
  // of the iteration being remixed. The source image is base64-encoded and
  // attached to the request so the backend can route to the Gemini
  // multimodal input (image mode) or the Ideogram remix endpoint (brand).
  // The remix also inherits the source's mode + aspect ratio so the new
  // card renders with the correct label and the request shape matches.
  const runGeneration = async (promptValue, remixSource = null, refinePayload = null) => {
    const iterId = `iter_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const timestamp = Date.now();
    const effectiveMode = remixSource ? remixSource.mode : (refinePayload ? refinePayload.mode : mode);
    const effectiveAspect = remixSource
      ? (remixSource.aspectRatio || '1:1')
      : refinePayload
        ? (refinePayload.aspectRatio || '1:1')
        : (mode === 'image' ? aspectRatio : '1:1');

    setIterations((prev) => [
      {
        id: iterId,
        prompt: promptValue,
        imageUrl: null,
        blob: null,
        savedKey: null,
        saving: false,
        error: null,
        timestamp,
        mode: effectiveMode,
        aspectRatio: effectiveAspect,
        remixFromN: remixSource ? remixSource.n : null,
        refineFromN: refinePayload ? refinePayload.n : null,
      },
      ...prev,
    ]);

    setGenerating(true);
    try {
      const remixImageBase64 = remixSource?.blob
        ? await blobToBase64(remixSource.blob)
        : null;
      // Refine path: the server composes the final prompt from
      // refineInstruction + originalPrompt. Non-refine path sends
      // `prompt` as-is.
      const requestBody = refinePayload
        ? {
            prompt: refinePayload.originalPrompt,
            refineInstruction: refinePayload.instruction,
            mode: effectiveMode,
            aspectRatio: effectiveMode === 'image' ? effectiveAspect : undefined,
            brandStyle: effectiveMode === 'brand' ? brandStyle : undefined,
          }
        : {
            prompt: promptValue,
            mode: effectiveMode,
            aspectRatio: effectiveMode === 'image' ? effectiveAspect : undefined,
            brandStyle: effectiveMode === 'brand' ? brandStyle : undefined,
            remixImageBase64,
          };
      const blob = await postForImage('/api/atomic/images/generate', requestBody);
      const imageUrl = URL.createObjectURL(blob);
      setIterations((prev) => prev.map((it) => it.id === iterId ? { ...it, imageUrl, blob } : it));
      // Auto-save to R2 the moment the image is available. Fire-and-forget:
      // saveIteration catches its own errors and surfaces them via toast, so
      // we don't need to await or gate generation resolution on it.
      saveIteration({ id: iterId, blob, timestamp, mode: effectiveMode });
    } catch (e) {
      setIterations((prev) => prev.map((it) => it.id === iterId ? { ...it, error: e.message || 'Generation failed' } : it));
    } finally {
      setGenerating(false);
    }
  };

  // ─── Iteration actions ─────────────────────────────────────────────
  const saveIteration = async (iter) => {
    if (!iter.blob) { flashToast('Nothing to save'); return; }
    setIterations((prev) => prev.map((it) => it.id === iter.id ? { ...it, saving: true } : it));
    try {
      const b64 = await blobToBase64(iter.blob);
      const r = await api('/api/atomic/images/save', {
        method: 'POST',
        body: JSON.stringify({ imageData: b64, timestamp: iter.timestamp, mode: iter.mode }),
      });
      setIterations((prev) => prev.map((it) => it.id === iter.id ? { ...it, saving: false, savedKey: r.key } : it));
    } catch (e) {
      setIterations((prev) => prev.map((it) => it.id === iter.id ? { ...it, saving: false } : it));
      flashToast(`Save failed: ${e.message}`);
    }
  };

  const downloadIteration = (iter) => {
    if (!iter.imageUrl) return;
    const a = document.createElement('a');
    a.href = iter.imageUrl;
    a.download = `atomic-flash-${iter.mode}-${iter.timestamp}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Clicking Remix opens an inline editor below the source cell rather than
  // firing immediately — users almost always want to nudge the prompt
  // ("…but make the sky stormier") before remixing. Only one panel is open
  // at a time; opening replaces whatever was previously open.
  const openRemixPanel = (iter) => {
    if (generating || expanding) { flashToast('Wait for current generation to finish'); return; }
    if (!iter.blob) { flashToast('No source image available to remix'); return; }
    setRefinePanelIter(null);
    setRefinePanelInstruction('');
    setRemixPanelIter(iter);
    setRemixPanelPrompt(iter.prompt || '');
  };

  const closeRemixPanel = () => {
    setRemixPanelIter(null);
    setRemixPanelPrompt('');
  };

  // Refine — only one panel open at a time, so opening refine closes any
  // active remix panel. Refine doesn't need a source image; the combined
  // prompt is constructed server-side from the instruction + original prompt.
  const openRefinePanel = (iter) => {
    if (generating || expanding) { flashToast('Wait for current generation to finish'); return; }
    setRemixPanelIter(null);
    setRemixPanelPrompt('');
    setRefinePanelIter(iter);
    setRefinePanelInstruction('');
  };

  const closeRefinePanel = () => {
    setRefinePanelIter(null);
    setRefinePanelInstruction('');
  };

  const submitRefine = () => {
    const iter = refinePanelIter;
    if (!iter) return;
    const instruction = refinePanelInstruction.trim();
    if (!instruction) { flashToast('Enter what to change'); return; }
    if (generating || expanding) { flashToast('Wait for current generation to finish'); return; }
    const originalPrompt = iter.prompt || '';
    const idxInList = iterations.findIndex((x) => x.id === iter.id);
    const sourceN = iterations.length - idxInList;
    // Mirror the server-side template so the iteration card displays the
    // same combined prompt the model actually saw.
    const combined = `Modify the following image prompt based on this instruction:\nInstruction: ${instruction}\nOriginal prompt: ${originalPrompt}`;
    setPrompt(combined);
    closeRefinePanel();
    runGeneration(combined, null, {
      instruction,
      originalPrompt,
      mode: iter.mode,
      aspectRatio: iter.aspectRatio,
      n: sourceN,
    });
  };

  // Fires the actual generation using whatever is in the panel textarea at
  // submit time. Source iteration number is recomputed here rather than at
  // panel-open so the label on the pending card reflects the current grid
  // ordering.
  const submitRemix = () => {
    const iter = remixPanelIter;
    if (!iter) return;
    const p = remixPanelPrompt.trim();
    if (!p) { flashToast('Remix instruction is empty'); return; }
    if (!iter.blob) { flashToast('No source image available to remix'); return; }
    if (generating || expanding) { flashToast('Wait for current generation to finish'); return; }
    const idxInList = iterations.findIndex((x) => x.id === iter.id);
    const sourceN = iterations.length - idxInList;
    setPrompt(p);
    closeRemixPanel();
    runGeneration(p, {
      id: iter.id,
      blob: iter.blob,
      mode: iter.mode,
      aspectRatio: iter.aspectRatio,
      n: sourceN,
    });
  };

  // ─── Render helpers ────────────────────────────────────────────────
  const modelBadge = mode === 'image'
    ? { label: 'Gemini Flash · OpenRouter' }
    : { label: 'Ideogram · Logo generation' };

  // ─── Left: Controls ────────────────────────────────────────────────
  const controls = (
    <section style={cardStyle}>
      <div style={{ ...eyebrowStyle, marginBottom: 6 }}>✦ ATOMIC FLASH</div>
      <h1 style={{
        fontFamily: 'DM Sans', fontSize: 22, fontWeight: 600,
        lineHeight: 1.15, letterSpacing: '-0.01em',
        color: 'var(--green-dark)', margin: '0 0 2px',
      }}>Atomic Flash Images</h1>
      <p style={{
        fontFamily: 'DM Sans', fontSize: 12,
        color: 'var(--text-mid)', margin: '0 0 14px', lineHeight: 1.5,
      }}>AI-generated images and brand assets.</p>

      {/* Type selector */}
      <label style={miniLabel}>Type</label>
      <div style={{ display: 'flex', gap: 6, marginTop: 5 }}>
        {[
          { key: 'image', title: 'Image',        sub: 'Gemini Flash' },
          { key: 'brand', title: 'Logo & Brand', sub: 'Ideogram'     },
        ].map((m) => {
          const sel = mode === m.key;
          return (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              style={{
                flex: 1, padding: '8px 6px',
                background: sel ? 'var(--green-dark)' : 'transparent',
                color: sel ? '#fff' : 'var(--text-mid)',
                border: sel ? '1px solid var(--green-dark)' : '1px solid var(--border)',
                borderRadius: 6,
                fontFamily: 'DM Sans', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, lineHeight: 1.1,
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 500 }}>{m.title}</span>
              <span style={{ fontSize: 9, color: sel ? 'rgba(255,255,255,0.65)' : 'var(--text-muted, #9B8F82)' }}>{m.sub}</span>
            </button>
          );
        })}
      </div>

      {/* Image-mode: aspect ratio grid */}
      {mode === 'image' && (
        <div style={{ marginTop: 12 }}>
          <label style={miniLabel}>Aspect Ratio</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5, marginTop: 5 }}>
            {ASPECT_RATIOS.map((r) => {
              const sel = aspectRatio === r.id;
              return (
                <button
                  key={r.id}
                  onClick={() => setAspectRatio(r.id)}
                  style={{
                    padding: '6px 4px',
                    background: sel ? 'var(--amber)' : 'transparent',
                    color: sel ? '#fff' : 'var(--text-mid)',
                    border: sel ? '1px solid var(--amber)' : '1px solid var(--border)',
                    borderRadius: 6,
                    fontFamily: 'DM Sans', cursor: 'pointer', lineHeight: 1.1,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
                  }}
                >
                  <span style={{ fontSize: 11, fontWeight: 500 }}>{r.label}</span>
                  <span style={{ fontSize: 9, color: sel ? 'rgba(255,255,255,0.65)' : 'var(--text-muted, #9B8F82)' }}>{r.sub}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Brand-mode: style + color */}
      {mode === 'brand' && (
        <>
          <div style={{ marginTop: 12 }}>
            <label style={miniLabel}>Style</label>
            <div style={{ display: 'flex', gap: 5, marginTop: 5 }}>
              {BRAND_STYLES.map((s) => {
                const sel = brandStyle === s;
                return (
                  <button
                    key={s}
                    onClick={() => setBrandStyle(s)}
                    style={pillStyle(sel)}
                  >{s}</button>
                );
              })}
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <label style={miniLabel}>Color Scheme</label>
            <div style={{ display: 'flex', gap: 5, marginTop: 5 }}>
              {BRAND_COLORS.map((c) => {
                const sel = brandColor === c;
                return (
                  <button
                    key={c}
                    onClick={() => setBrandColor(c)}
                    style={pillStyle(sel)}
                  >{c}</button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Brief */}
      <div style={{ marginTop: 12 }}>
        <label style={miniLabel}>Brief</label>
        <textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          rows={6}
          placeholder={mode === 'image'
            ? 'Describe the image you want. Include subject, mood, style, lighting, composition…'
            : 'Describe the brand, name, and visual direction. Include colors, era, feeling, industry…'}
          style={{
            width: '100%', padding: 10, marginTop: 5,
            fontFamily: 'DM Sans', fontSize: 12, lineHeight: 1.5,
            color: 'var(--text)',
            background: 'var(--surface-inp)',
            border: '1px solid var(--border)', borderRadius: 7,
            resize: 'vertical', outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Model badge */}
      <div style={{
        marginTop: 10,
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '5px 10px',
        background: 'var(--surface-inp)', borderRadius: 999,
        fontFamily: 'DM Sans', fontSize: 10, color: 'var(--text-mid)',
      }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green-dark)', display: 'inline-block' }} />
        {modelBadge.label}
      </div>

      {/* Generate */}
      <button
        onClick={handleGenerateFromBrief}
        disabled={!brief.trim() || expanding || generating}
        style={{
          width: '100%', marginTop: 12, padding: '11px 16px',
          background: 'var(--amber)', color: '#fff',
          border: 'none', borderRadius: 7,
          fontFamily: 'DM Sans', fontSize: 14, fontWeight: 600, lineHeight: 1,
          cursor: (!brief.trim() || expanding || generating) ? 'not-allowed' : 'pointer',
          opacity: (!brief.trim() || expanding || generating) ? 0.5 : 1,
          transition: 'opacity 0.15s',
        }}
      >
        {expanding ? 'Expanding…' : generating ? 'Generating…' : 'Generate →'}
      </button>
    </section>
  );

  // ─── Right: Prompt card ────────────────────────────────────────────
  const promptCard = (
    <section style={cardStyle}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 6, gap: 8,
      }}>
        <div style={eyebrowStyle}>✦ PROMPT</div>
        <div style={{
          fontFamily: 'DM Sans', fontSize: 10,
          color: 'var(--text-muted, #9B8F82)',
        }}>Edit directly · changes apply on next generate</div>
      </div>
      <textarea
        ref={promptRef}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={promptExpanded ? 4 : 2}
        placeholder="The AI-expanded prompt will appear here after the first generate."
        style={{
          width: '100%', padding: 10,
          fontFamily: 'DM Sans', fontSize: 12, lineHeight: 1.6,
          color: 'var(--text)',
          background: 'var(--surface-inp)',
          border: '1px solid var(--border)', borderRadius: 7,
          outline: 'none',
          resize: promptExpanded ? 'vertical' : 'none',
          boxSizing: 'border-box',
          // Collapsed: force exactly 2 lines and hide everything past that so
          // the right column stays compact. Expanded: let the auto-grow effect
          // resize to fit the full content.
          overflow: promptExpanded ? 'auto' : 'hidden',
          whiteSpace: promptExpanded ? 'pre-wrap' : 'nowrap',
          textOverflow: promptExpanded ? 'clip' : 'ellipsis',
        }}
      />
      <button
        onClick={() => setPromptExpanded((v) => !v)}
        disabled={!prompt}
        style={{
          marginTop: 6,
          padding: '2px 0',
          background: 'transparent', border: 'none',
          color: prompt ? 'var(--green-dark)' : 'var(--text-muted, #9B8F82)',
          fontFamily: 'DM Sans', fontSize: 11, fontWeight: 500,
          cursor: prompt ? 'pointer' : 'default',
          textAlign: 'left',
          display: 'inline-flex', alignItems: 'center', gap: 4,
        }}
      >
        <span style={{ fontSize: 10 }}>{promptExpanded ? '▴' : '▾'}</span>
        {promptExpanded ? 'Hide full prompt' : 'Show full prompt'}
      </button>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
        <button
          onClick={handleGenerateAgain}
          disabled={!prompt.trim() || generating || expanding}
          style={{
            flex: 1, padding: '11px 16px',
            background: 'var(--amber)', color: '#fff',
            border: 'none', borderRadius: 7,
            fontFamily: 'DM Sans', fontSize: 14, fontWeight: 600,
            cursor: (!prompt.trim() || generating || expanding) ? 'not-allowed' : 'pointer',
            opacity: (!prompt.trim() || generating || expanding) ? 0.5 : 1,
          }}
        >
          {generating ? 'Generating…' : 'Generate Again →'}
        </button>
        <button
          onClick={() => setPrompt(lastExpandedPrompt)}
          disabled={!lastExpandedPrompt || prompt === lastExpandedPrompt}
          style={{
            padding: '10px 12px',
            background: 'transparent',
            color: 'var(--text-mid)',
            border: '1px solid var(--border)',
            borderRadius: 7,
            fontFamily: 'DM Sans', fontSize: 12,
            cursor: (!lastExpandedPrompt || prompt === lastExpandedPrompt) ? 'not-allowed' : 'pointer',
            opacity: (!lastExpandedPrompt || prompt === lastExpandedPrompt) ? 0.5 : 1,
            flexShrink: 0,
          }}
        >Reset to brief</button>
      </div>
    </section>
  );

  // ─── Right: Iterations ─────────────────────────────────────────────
  const iterationsHeader = (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      marginTop: 16, marginBottom: 8, padding: '0 4px',
    }}>
      <div style={eyebrowStyle}>✦ ITERATIONS</div>
      <div style={{
        fontFamily: 'DM Sans', fontSize: 10,
        color: 'var(--text-muted, #9B8F82)',
      }}>{iterations.length} this session</div>
    </div>
  );

  const emptyState = (
    <section style={{ ...cardStyle, textAlign: 'center', padding: '32px 20px' }}>
      <div style={{ fontSize: 40, marginBottom: 8, color: 'var(--text-muted, #9B8F82)' }}>◈</div>
      <div style={{ fontFamily: 'DM Sans', fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>
        No images yet
      </div>
      <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text-mid)', marginTop: 4 }}>
        Generate your first image using the panel on the left.
      </div>
    </section>
  );

  const iterationCell = (iter, idx) => {
    const n = iterations.length - idx; // newest on top gets the highest number
    const saved = !!iter.savedKey;
    const pending = !iter.imageUrl && !iter.error;
    const isBrand = iter.mode === 'brand';

    return (
      <div key={iter.id} style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
        {pending ? (
          <div style={{
            height: 180,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 8,
            background: 'var(--surface-inp)',
            padding: 10, textAlign: 'center',
          }}>
            <div style={{
              width: 18, height: 18, borderRadius: '50%',
              border: '2px solid var(--border)', borderTopColor: 'var(--amber)',
              animation: 'flash-spin 0.9s linear infinite',
              flexShrink: 0,
            }} />
            <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--text-mid)' }}>
              {iter.refineFromN
                ? `Refining iteration ${iter.refineFromN}…`
                : iter.remixFromN
                  ? `Remixing from iteration ${iter.remixFromN}…`
                  : 'Generating…'}
            </span>
            <style>{`@keyframes flash-spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : iter.error ? (
          <div style={{
            height: 180,
            padding: 12, boxSizing: 'border-box',
            background: 'rgba(139,58,42,0.08)',
            display: 'flex', flexDirection: 'column', justifyContent: 'center',
          }}>
            <div style={{ fontFamily: 'DM Sans', fontSize: 12, fontWeight: 500, color: 'var(--error, #8B3A2A)' }}>
              Generation failed
            </div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'var(--text-mid)', marginTop: 4, lineHeight: 1.4 }}>
              {iter.error}
            </div>
          </div>
        ) : (
          <img
            src={iter.imageUrl}
            alt=""
            onClick={() => setLightboxIter(iter)}
            style={{
              display: 'block', width: '100%', height: 180,
              objectFit: 'cover', background: '#1A2E22',
              borderRadius: 8, cursor: 'pointer',
            }}
          />
        )}

        {!pending && (
          <div style={{ padding: '10px 12px' }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 8, gap: 6,
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                minWidth: 0,
              }}>
                <span style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'var(--text-muted, #9B8F82)', letterSpacing: '0.04em' }}>
                  Iteration {n} · {isBrand ? 'Logo' : iter.aspectRatio}
                </span>
                {/* Auto-save indicator. During the in-flight window we show an
                    amber dot + 'Saving…'; once the R2 put resolves, it flips to
                    a green dot + 'Saved'. Nothing renders on save failure —
                    saveIteration surfaces that via toast. */}
                {saved ? (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    fontFamily: 'DM Sans', fontSize: 10, color: 'var(--green-dark)',
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green-dark)', display: 'inline-block' }} />
                    Saved
                  </span>
                ) : iter.saving ? (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    fontFamily: 'DM Sans', fontSize: 10, color: 'var(--amber)',
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--amber)', display: 'inline-block' }} />
                    Saving…
                  </span>
                ) : null}
              </div>
              <span style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'var(--text-muted, #9B8F82)', flexShrink: 0 }}>
                {formatTime(iter.timestamp)}
              </span>
            </div>

            {!iter.error && iter.imageUrl && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                <button
                  onClick={() => downloadIteration(iter)}
                  style={{ ...smallBtn, padding: '5px 9px', fontSize: 10 }}
                >Download</button>
                <button
                  onClick={() => openRemixPanel(iter)}
                  disabled={generating || expanding || !iter.blob}
                  style={{
                    ...smallBtn, padding: '5px 9px', fontSize: 10,
                    background: remixPanelIter?.id === iter.id ? 'var(--green-dark)' : 'var(--amber)',
                    color: '#fff',
                    border: `1px solid ${remixPanelIter?.id === iter.id ? 'var(--green-dark)' : 'var(--amber)'}`,
                    opacity: (generating || expanding || !iter.blob) ? 0.5 : 1,
                    cursor: (generating || expanding || !iter.blob) ? 'not-allowed' : 'pointer',
                  }}
                >Remix</button>
                <button
                  onClick={() => openRefinePanel(iter)}
                  disabled={generating || expanding}
                  style={{
                    ...smallBtn, padding: '5px 9px', fontSize: 10,
                    background: refinePanelIter?.id === iter.id ? 'var(--green-dark)' : 'transparent',
                    color: refinePanelIter?.id === iter.id ? '#fff' : 'var(--amber)',
                    border: `1px solid var(--amber)`,
                    opacity: (generating || expanding) ? 0.5 : 1,
                    cursor: (generating || expanding) ? 'not-allowed' : 'pointer',
                  }}
                >Refine</button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <div style={{
        maxWidth: 1200, margin: '0 auto',
        padding: 16,
        display: 'flex', flexDirection: isNarrow ? 'column' : 'row',
        gap: 12, alignItems: 'flex-start',
      }}>
        <div style={{
          flex: isNarrow ? '1 1 auto' : '0 0 300px',
          width: isNarrow ? '100%' : 300,
          display: 'flex', flexDirection: 'column',
          minWidth: 0,
        }}>
          {controls}
        </div>

        <div style={{ flex: 1, minWidth: 0, width: '100%' }}>
          {promptCard}
          {iterationsHeader}
          {iterations.length === 0 ? emptyState : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: isNarrow ? '1fr' : '1fr 1fr',
              gap: 10,
            }}>
              {iterations.flatMap((it, i) => {
                const cell = iterationCell(it, i);
                const sourceN = iterations.length - i;
                const extras = [];
                if (refinePanelIter?.id === it.id) {
                  extras.push(
                    <div
                      key={`refine-${it.id}`}
                      style={{
                        gridColumn: '1 / -1',
                        ...cardStyle,
                        padding: 14,
                        border: '1px solid var(--amber)',
                        background: 'var(--card)',
                      }}
                    >
                      <div style={{
                        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                        gap: 8, marginBottom: 6,
                      }}>
                        <label style={{ ...miniLabel, color: 'var(--amber)' }}>
                          Refine · from iteration {sourceN}
                        </label>
                      </div>
                      <input
                        type="text"
                        value={refinePanelInstruction}
                        onChange={(e) => setRefinePanelInstruction(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && refinePanelInstruction.trim() && !generating && !expanding) {
                            e.preventDefault();
                            submitRefine();
                          }
                        }}
                        placeholder="What would you like to change?"
                        autoFocus
                        style={{
                          width: '100%', padding: 10,
                          fontFamily: 'DM Sans', fontSize: 15, lineHeight: 1.55,
                          color: 'var(--text)',
                          background: 'var(--surface-inp)',
                          border: '1px solid var(--border)', borderRadius: 7,
                          outline: 'none', boxSizing: 'border-box',
                        }}
                      />
                      <div style={{
                        marginTop: 8,
                        fontFamily: 'DM Sans', fontSize: 13, lineHeight: 1.45,
                        color: 'var(--text-mid)',
                        maxHeight: 120, overflowY: 'auto',
                        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                        padding: '6px 8px',
                        background: 'var(--surface-inp)',
                        border: '1px solid var(--border)', borderRadius: 6,
                      }}>
                        <span style={{ color: 'var(--text-light)', fontWeight: 500 }}>Original prompt · </span>
                        {it.prompt || '(empty)'}
                      </div>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        marginTop: 10,
                      }}>
                        <button
                          onClick={submitRefine}
                          disabled={!refinePanelInstruction.trim() || generating || expanding}
                          style={{
                            padding: '9px 18px',
                            background: 'var(--amber)', color: '#fff',
                            border: 'none', borderRadius: 7,
                            fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600,
                            cursor: (!refinePanelInstruction.trim() || generating || expanding) ? 'not-allowed' : 'pointer',
                            opacity: (!refinePanelInstruction.trim() || generating || expanding) ? 0.5 : 1,
                          }}
                        >Refine →</button>
                        <button
                          onClick={closeRefinePanel}
                          style={{
                            background: 'transparent', border: 'none', padding: 0,
                            color: 'var(--text-mid)',
                            fontFamily: 'DM Sans', fontSize: 12,
                            cursor: 'pointer',
                            textDecoration: 'underline',
                          }}
                        >Cancel</button>
                      </div>
                    </div>
                  );
                }
                if (remixPanelIter?.id !== it.id) return [cell, ...extras];
                return [cell, ...extras, (
                  <div
                    key={`remix-${it.id}`}
                    style={{
                      gridColumn: '1 / -1',
                      ...cardStyle,
                      padding: 14,
                      border: '1px solid var(--amber)',
                      background: 'var(--card)',
                    }}
                  >
                    <div style={{
                      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                      gap: 8, marginBottom: 6,
                    }}>
                      <label style={{ ...miniLabel, color: 'var(--amber)' }}>
                        Remix instruction · Remixing from iteration {sourceN}
                      </label>
                    </div>
                    <textarea
                      value={remixPanelPrompt}
                      onChange={(e) => setRemixPanelPrompt(e.target.value)}
                      rows={4}
                      autoFocus
                      style={{
                        width: '100%', padding: 10,
                        fontFamily: 'DM Sans', fontSize: 12, lineHeight: 1.5,
                        color: 'var(--text)',
                        background: 'var(--surface-inp)',
                        border: '1px solid var(--border)', borderRadius: 7,
                        resize: 'vertical', outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      marginTop: 10,
                    }}>
                      <button
                        onClick={submitRemix}
                        disabled={!remixPanelPrompt.trim() || generating || expanding}
                        style={{
                          padding: '9px 18px',
                          background: 'var(--amber)', color: '#fff',
                          border: 'none', borderRadius: 7,
                          fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600,
                          cursor: (!remixPanelPrompt.trim() || generating || expanding) ? 'not-allowed' : 'pointer',
                          opacity: (!remixPanelPrompt.trim() || generating || expanding) ? 0.5 : 1,
                        }}
                      >Remix →</button>
                      <button
                        onClick={closeRemixPanel}
                        style={{
                          background: 'transparent', border: 'none', padding: 0,
                          color: 'var(--text-mid)',
                          fontFamily: 'DM Sans', fontSize: 12,
                          cursor: 'pointer',
                          textDecoration: 'underline',
                        }}
                      >Cancel</button>
                    </div>
                  </div>
                )];
              })}
            </div>
          )}
        </div>
      </div>

      {lightboxIter && lightboxIter.imageUrl && (
        <div
          onClick={() => setLightboxIter(null)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999, cursor: 'pointer', padding: 20,
          }}
        >
          <img
            src={lightboxIter.imageUrl}
            alt=""
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '92vw', maxHeight: '92vh',
              objectFit: 'contain', borderRadius: 8,
              background: '#1A2E22', cursor: 'default',
            }}
          />
        </div>
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%',
          transform: 'translateX(-50%)',
          padding: '10px 16px',
          background: 'var(--leather-dark)',
          color: 'var(--card)',
          fontFamily: 'DM Sans', fontSize: 13, fontWeight: 500,
          borderRadius: 6,
          boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
          zIndex: 500,
          maxWidth: '90vw',
        }}>{toast}</div>
      )}
    </>
  );
}

// ─── Tokens & helpers ─────────────────────────────────────────────────
const cardStyle = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: 14,
  boxSizing: 'border-box',
};

const eyebrowStyle = {
  fontFamily: 'DM Sans', fontWeight: 600, fontSize: 10, lineHeight: 1.2,
  letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--amber)',
};

const miniLabel = {
  display: 'block',
  fontFamily: 'DM Sans', fontSize: 9, fontWeight: 600,
  letterSpacing: '0.12em', textTransform: 'uppercase',
  color: 'var(--text-mid)',
};

const smallBtn = {
  padding: '6px 11px',
  fontFamily: 'DM Sans', fontSize: 11, fontWeight: 500,
  color: 'var(--text)',
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  cursor: 'pointer',
};

function pillStyle(active) {
  return {
    flex: 1,
    padding: '7px 10px',
    background: active ? 'var(--green-dark)' : 'transparent',
    color: active ? '#fff' : 'var(--text-mid)',
    border: active ? '1px solid var(--green-dark)' : '1px solid var(--border)',
    borderRadius: 6,
    fontFamily: 'DM Sans', fontSize: 12, fontWeight: 500,
    cursor: 'pointer', lineHeight: 1,
  };
}

function formatTime(ts) {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch { return ''; }
}
