// src/pages/Planner.jsx
// Full planner flow: input → questions → recap → plan → feedback → revision → approved.

import { useEffect, useMemo, useState } from 'react'
import PageShell from '../components/PageShell.jsx'

const LOADING_MESSAGES = [
  'Researching vendors and options…',
  'Gathering phone numbers and costs…',
  'Building your itinerary…',
  'Almost ready…',
]

async function api(path, opts = {}) {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  })
  const text = await res.text()
  let data; try { data = JSON.parse(text) } catch { data = { error: text } }
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
  return data
}

// ─── Shared building blocks ─────────────────────────────────────────────────
function Card({ children, style }) {
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, boxShadow: 'var(--shadow-card)', ...style }}>
      {children}
    </div>
  )
}

function Eyebrow({ children, color = 'var(--amber)' }) {
  return <div style={{ fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', color, marginBottom: 8 }}>{children}</div>
}

function PrimaryButton({ children, onClick, disabled, style }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} style={{
      padding: '10px 20px', fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-ui)',
      background: disabled ? 'var(--border)' : 'var(--ink)',
      color: disabled ? 'var(--text-dim)' : '#fff',
      border: 'none', borderRadius: 7,
      cursor: disabled ? 'default' : 'pointer',
      transition: 'all 0.12s', ...style,
    }}>{children}</button>
  )
}

function GhostButton({ children, onClick, disabled, style }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} style={{
      padding: '10px 20px', fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-ui)',
      background: 'transparent', color: 'var(--text-mid)',
      border: '1px solid var(--border)', borderRadius: 7,
      cursor: disabled ? 'default' : 'pointer',
      transition: 'all 0.12s', ...style,
    }}>{children}</button>
  )
}

function LoadingBlock({ message }) {
  return (
    <Card style={{ textAlign: 'center' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, marginBottom: 6 }}>✦</div>
      <div style={{ color: 'var(--text-mid)', fontSize: 14 }}>{message}</div>
    </Card>
  )
}

// ─── Plan rendering ─────────────────────────────────────────────────────────
function TaskSection({ task, sectionId, flags, onCommentSaved, itineraryId, locked }) {
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState(null)
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  const mine = flags.filter(f => f.section_id === sectionId)
  const typeColor = { edit: 'var(--amber)', remove: 'var(--error)', approve: 'var(--success)', question: 'var(--info)' }

  const save = async () => {
    if (!kind || !comment.trim() || !itineraryId) return
    setSaving(true)
    try {
      const payload = {
        section_id: sectionId,
        section_title: task?.task_name || null,
        comment: comment.trim(),
        flag_type: kind,
      }
      const { flag } = await api(`/api/planner/${itineraryId}/flags`, { method: 'POST', body: JSON.stringify(payload) })
      onCommentSaved?.(flag)
      setComment(''); setKind(null); setOpen(false)
    } catch (e) { alert(e.message) } finally { setSaving(false) }
  }

  return (
    <Card style={{ marginBottom: 18, position: 'relative' }}>
      {mine.length > 0 && (
        <div style={{ position: 'absolute', top: 12, right: 12, width: 10, height: 10, borderRadius: '50%', background: typeColor[mine[0].flag_type] || 'var(--amber)' }} title={`${mine.length} flag(s) on this section`} />
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <Eyebrow>{task?.task_name}</Eyebrow>
          <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.55, marginBottom: 8 }}>{task?.task_description}</div>
          {Array.isArray(task?.tags) && task.tags.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              {task.tags.map((t, i) => (
                <span key={i} style={{ display: 'inline-block', fontSize: 10, padding: '2px 8px', background: 'var(--amber-light)', color: 'var(--amber-dim)', borderRadius: 100, marginRight: 6 }}>{t}</span>
              ))}
            </div>
          )}
        </div>
        {!locked && (
          <GhostButton onClick={() => setOpen(o => !o)} style={{ padding: '6px 12px', fontSize: 12 }}>
            {open ? 'Close' : 'Comment on this section'}
          </GhostButton>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
        {(task?.options || []).map((o, i) => (
          <div key={i} style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 14 }}>
            <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--amber)', color: '#fff', fontWeight: 700, textAlign: 'center', lineHeight: '22px', fontSize: 12, marginBottom: 8 }}>{o?.rank ?? i + 1}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>{o?.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-mid)', marginBottom: 8 }}>{o?.tagline}</div>
            {o?.cost_estimate && <div style={{ display: 'inline-block', background: 'var(--amber-light)', color: 'var(--amber-dim)', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 100, marginBottom: 8 }}>{o.cost_estimate}</div>}
            {o?.phone && <div style={{ fontSize: 12, color: 'var(--text-mid)', marginBottom: 2 }}>📞 {o.phone}</div>}
            {o?.website && <div style={{ fontSize: 12, marginBottom: 6 }}><a href={o.website} target="_blank" rel="noreferrer" style={{ color: 'var(--ink)' }}>{o.website}</a></div>}
            {Array.isArray(o?.pros) && o.pros.length > 0 && (
              <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0', fontSize: 12 }}>
                {o.pros.map((p, k) => <li key={k} style={{ color: 'var(--text)', marginBottom: 2 }}>✓ {p}</li>)}
              </ul>
            )}
            {Array.isArray(o?.considerations) && o.considerations.length > 0 && (
              <ul style={{ listStyle: 'none', padding: 0, margin: '4px 0', fontSize: 12 }}>
                {o.considerations.map((p, k) => <li key={k} style={{ color: 'var(--amber)', marginBottom: 2 }}>✦ {p}</li>)}
              </ul>
            )}
            {o?.best_for && <div style={{ fontSize: 11, color: 'var(--text-mid)', marginTop: 8, fontStyle: 'italic' }}>Best for: {o.best_for}</div>}
          </div>
        ))}
      </div>

      {open && (
        <div style={{ marginTop: 14, padding: 14, background: 'var(--card-alt)', border: '1px solid var(--border-light)', borderRadius: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6, marginBottom: 10 }}>
            {[
              { k: 'edit', label: 'Edit This', color: 'var(--amber)' },
              { k: 'remove', label: 'Remove This', color: 'var(--error)' },
              { k: 'approve', label: '✓ Looks Good', color: 'var(--success)' },
              { k: 'question', label: 'Question', color: 'var(--info)' },
            ].map(b => (
              <button key={b.k} type="button" onClick={() => setKind(b.k)} style={{
                padding: '8px 10px', fontSize: 12, fontWeight: 600,
                borderRadius: 6,
                border: kind === b.k ? `2px solid ${b.color}` : `1px solid var(--border)`,
                background: kind === b.k ? b.color : 'var(--card)',
                color: kind === b.k ? '#fff' : b.color,
                cursor: 'pointer',
              }}>{b.label}</button>
            ))}
          </div>
          <textarea value={comment} onChange={e => setComment(e.target.value)} placeholder={kind === 'question' ? 'Ask your question…' : 'Add a note for the revision agent…'}
            style={{ width: '100%', minHeight: 70, padding: 10, background: 'var(--surface-inp)', border: '1.5px solid var(--border)', borderRadius: 8, fontFamily: 'var(--font-ui)', fontSize: 13, boxSizing: 'border-box', color: 'var(--text)', resize: 'vertical' }} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <GhostButton onClick={() => setOpen(false)} style={{ padding: '6px 12px', fontSize: 12 }}>Cancel</GhostButton>
            <PrimaryButton onClick={save} disabled={!kind || !comment.trim() || saving} style={{ padding: '6px 14px', fontSize: 12 }}>
              {saving ? 'Saving…' : 'Save comment'}
            </PrimaryButton>
          </div>
        </div>
      )}
    </Card>
  )
}

function PlanView({ plan, flags, onCommentSaved, itineraryId, locked }) {
  if (!plan) return null
  const tasksWithIds = (plan.tasks || []).map((t, i) => ({ ...t, _sid: t.task_id || `sec-${i}` }))
  return (
    <div>
      <Card style={{ marginBottom: 18 }}>
        <Eyebrow>Overview</Eyebrow>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, marginBottom: 10, color: 'var(--text)' }}>{plan.plan_title}</div>
        <div style={{ fontSize: 15, color: 'var(--text)', lineHeight: 1.6 }}>{plan.summary}</div>
      </Card>
      {tasksWithIds.map(t => (
        <TaskSection key={t._sid} sectionId={t._sid} task={t} flags={flags} onCommentSaved={onCommentSaved} itineraryId={itineraryId} locked={locked} />
      ))}
      {Array.isArray(plan.next_steps) && plan.next_steps.length > 0 && (
        <Card style={{ marginBottom: 18 }}>
          <Eyebrow>Next steps</Eyebrow>
          <ol style={{ margin: 0, paddingLeft: 20, color: 'var(--text)', fontSize: 14, lineHeight: 1.7 }}>
            {plan.next_steps.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
        </Card>
      )}
      <Card style={{ background: 'color-mix(in srgb, var(--success) 10%, transparent)', borderColor: 'var(--success)', color: 'var(--ink)', marginBottom: 80 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <Eyebrow color="rgba(255,255,255,0.8)">Timeline</Eyebrow>
            <div style={{ fontSize: 15 }}>{plan.timeline}</div>
          </div>
          <div>
            <Eyebrow color="rgba(255,255,255,0.8)">Total cost estimate</Eyebrow>
            <div style={{ fontSize: 15 }}>{plan.total_cost_estimate}</div>
          </div>
        </div>
      </Card>
    </div>
  )
}

// ─── Planner page ──────────────────────────────────────────────────────────
export default function Planner({ navigate }) {
  const [phase, setPhase] = useState('input')
  const [situation, setSituation] = useState('')
  const [questions, setQuestions] = useState([])
  const [answers, setAnswers] = useState({})
  const [recap, setRecap] = useState('')
  const [additions, setAdditions] = useState([])
  const [addDraft, setAddDraft] = useState('')
  const [showAddBox, setShowAddBox] = useState(false)
  const [plan, setPlan] = useState(null)
  const [revisedPlan, setRevisedPlan] = useState(null)
  const [itineraryId, setItineraryId] = useState(null)
  const [flags, setFlags] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState('')
  const [error, setError] = useState('')

  const answeredCount = Object.values(answers).filter(v => v !== null && v !== undefined && String(v).trim()).length

  useEffect(() => {
    if (!loading || phase !== 'plan-loading') return
    let i = 0
    setLoadingMsg(LOADING_MESSAGES[0])
    const int = setInterval(() => {
      i = Math.min(i + 1, LOADING_MESSAGES.length - 1)
      setLoadingMsg(LOADING_MESSAGES[i])
    }, 2500)
    return () => clearInterval(int)
  }, [loading, phase])

  const startPlanning = async () => {
    setError(''); setLoading(true)
    try {
      const { questions: qs } = await api('/api/planner/questions', { method: 'POST', body: JSON.stringify({ situation }) })
      setQuestions(qs || [])
      setPhase('questions')
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }

  const fetchRecap = async (addsOverride) => {
    setError(''); setLoading(true)
    try {
      const { recap: r } = await api('/api/planner/recap', {
        method: 'POST',
        body: JSON.stringify({
          situation, answers,
          existing_recap: addsOverride ? recap : null,
          additions: addsOverride || [],
        }),
      })
      setRecap(r)
      setPhase('recap')
      setShowAddBox(false)
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }

  const confirmAndGenerate = async () => {
    setError(''); setLoading(true)
    try {
      // Save draft first
      let id = itineraryId
      if (!id) {
        const draft = await api('/api/planner/save-draft', {
          method: 'POST',
          body: JSON.stringify({
            situation,
            clarifications: JSON.stringify(answers),
            recap,
            title: situation.slice(0, 80),
          }),
        })
        id = draft.id
        setItineraryId(id)
      }
      // Fire-and-forget enqueue. The queue consumer writes the plan and the
      // /planner/building/:id page polls for readiness.
      await api('/api/planner/generate', {
        method: 'POST',
        body: JSON.stringify({ itinerary_id: id, situation, answers, confirmed_recap: recap, additions }),
      })
      navigate(`/planner/building/${id}`)
    } catch (e) { setError(e.message); setPhase('recap') } finally { setLoading(false) }
  }

  const submitForRevision = async () => {
    setError(''); setLoading(true); setPhase('revision-loading')
    try {
      const { plan: rp } = await api(`/api/planner/${itineraryId}/revise`, { method: 'POST' })
      setRevisedPlan(rp)
      setFlags([]) // reset — they're resolved on the server
      setPhase('revision')
    } catch (e) { setError(e.message); setPhase('plan') } finally { setLoading(false) }
  }

  const approve = async () => {
    setError(''); setLoading(true)
    try {
      await api(`/api/planner/${itineraryId}/approve`, { method: 'POST' })
      setPhase('approved')
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }

  const onCommentSaved = (flag) => setFlags(fs => [...fs, flag])

  // ───── Render per phase ─────
  return (
    <PageShell
      eyebrow="// PLANNER"
      title="Plan something real."
      subtitle="Itineraries and content plans. Works for travel, moves, weddings, road trips, events, and more."
    >
      <div style={{ maxWidth: 960, width: '100%' }}>
        {error && (
          <div style={{ background: 'var(--error-bg)', border: '1px solid var(--error-border)', color: 'var(--error)', padding: 12, borderRadius: 8, marginBottom: 14, fontSize: 13 }}>{error}</div>
        )}

        {phase === 'input' && (
          <Card>
            <Eyebrow>What are you planning?</Eyebrow>
            <textarea
              value={situation}
              onChange={e => setSituation(e.target.value)}
              placeholder="e.g. A move from Austin to Nashville in early June with two kids and a dog. We have about $8k. Need packers, a truck, and a kid-friendly hotel halfway."
              style={{ width: '100%', minHeight: 160, padding: 14, background: 'var(--surface-inp)', border: '1.5px solid var(--border)', borderRadius: 10, fontFamily: 'var(--font-ui)', fontSize: 15, boxSizing: 'border-box', color: 'var(--text)', resize: 'vertical', lineHeight: 1.55 }}
            />
            <div style={{ fontSize: 12, color: 'var(--text-light)', marginTop: 8, marginBottom: 16 }}>Works for travel, moves, weddings, road trips, events, and more.</div>
            <PrimaryButton onClick={startPlanning} disabled={!situation.trim() || situation.trim().length < 20 || loading}>
              {loading ? 'Starting…' : 'Start Planning →'}
            </PrimaryButton>
          </Card>
        )}

        {phase === 'questions' && (
          <div>
            <div style={{ color: 'var(--text-mid)', fontSize: 13, marginBottom: 12 }}>{answeredCount} of {questions.length} answered</div>
            {questions.map((q, idx) => (
              <Card key={q.id || idx} style={{ marginBottom: 12 }}>
                <Eyebrow>Question {idx + 1}</Eyebrow>
                <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>{q.question}</div>
                {q.type === 'choice' && Array.isArray(q.options) ? (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {q.options.map(opt => {
                      const selected = answers[q.id] === opt
                      return (
                        <button key={opt} type="button" onClick={() => setAnswers(a => ({ ...a, [q.id]: opt }))}
                          style={{
                            padding: '8px 14px', fontSize: 13, fontWeight: 600,
                            borderRadius: 100,
                            border: selected ? '2px solid var(--amber)' : '1px solid var(--border)',
                            background: selected ? 'var(--amber-tint)' : 'var(--surface)',
                            color: selected ? 'var(--amber-dark)' : 'var(--ink-mid)',
                            cursor: 'pointer',
                          }}>{opt}</button>
                      )
                    })}
                  </div>
                ) : (
                  <input type="text" value={answers[q.id] || ''} onChange={e => setAnswers(a => ({ ...a, [q.id]: e.target.value }))}
                    placeholder="Your answer…"
                    style={{ width: '100%', padding: 10, background: 'var(--surface-inp)', border: '1.5px solid var(--border)', borderRadius: 8, fontFamily: 'var(--font-ui)', fontSize: 14, boxSizing: 'border-box', color: 'var(--text)' }} />
                )}
              </Card>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14 }}>
              <GhostButton onClick={() => setPhase('input')}>← Back</GhostButton>
              <PrimaryButton onClick={() => fetchRecap([])} disabled={answeredCount < 3 || loading}>
                {loading ? 'Thinking…' : 'Continue →'}
              </PrimaryButton>
            </div>
          </div>
        )}

        {phase === 'recap' && (
          <div>
            <Card>
              <Eyebrow>Here's what I understood</Eyebrow>
              <div style={{ fontSize: 16, color: 'var(--text)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{recap}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 20 }}>
                <PrimaryButton onClick={confirmAndGenerate} disabled={loading}>Yes, build my plan →</PrimaryButton>
                <GhostButton onClick={() => setShowAddBox(true)} disabled={loading}>No, I need to add something</GhostButton>
              </div>
            </Card>
            {showAddBox && (
              <Card style={{ marginTop: 12 }}>
                <Eyebrow>What did I miss?</Eyebrow>
                <textarea value={addDraft} onChange={e => setAddDraft(e.target.value)} placeholder="Add the detail I missed…"
                  style={{ width: '100%', minHeight: 90, padding: 12, background: 'var(--surface-inp)', border: '1.5px solid var(--border)', borderRadius: 8, fontFamily: 'var(--font-ui)', fontSize: 14, boxSizing: 'border-box', color: 'var(--text)', resize: 'vertical' }} />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
                  <GhostButton onClick={() => { setShowAddBox(false); setAddDraft('') }}>Cancel</GhostButton>
                  <PrimaryButton onClick={() => {
                    if (!addDraft.trim()) return
                    const next = [...additions, addDraft.trim()]
                    setAdditions(next); setAddDraft('')
                    fetchRecap(next)
                  }} disabled={!addDraft.trim() || loading}>Add details and continue</PrimaryButton>
                </div>
              </Card>
            )}
          </div>
        )}

        {phase === 'plan-loading' && <LoadingBlock message={loadingMsg || 'Building your plan…'} />}

        {phase === 'plan' && plan && (
          <>
            <PlanView plan={plan} flags={flags} onCommentSaved={onCommentSaved} itineraryId={itineraryId} />
            <StickyBar>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{flags.length} flag{flags.length === 1 ? '' : 's'}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <PrimaryButton onClick={submitForRevision} disabled={flags.length === 0 || loading}>Submit for Revision</PrimaryButton>
                <button type="button" onClick={approve} disabled={loading} style={{
                  padding: '10px 20px', fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-ui)',
                  background: 'var(--amber)', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer',
                }}>Approve Plan →</button>
              </div>
            </StickyBar>
          </>
        )}

        {phase === 'revision-loading' && <LoadingBlock message="Revising your plan based on your feedback…" />}

        {phase === 'revision' && (
          <>
            {plan && (
              <div style={{ opacity: 0.55, pointerEvents: 'none' }}>
                <PlanView plan={plan} flags={[]} onCommentSaved={() => {}} itineraryId={itineraryId} locked />
              </div>
            )}
            <div style={{ margin: '28px 0', borderTop: '1px solid var(--border)', textAlign: 'center', position: 'relative' }}>
              <span style={{ position: 'relative', top: -12, background: 'var(--bg)', padding: '0 14px', fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--amber)' }}>Revised plan</span>
            </div>
            <PlanView plan={revisedPlan} flags={flags} onCommentSaved={onCommentSaved} itineraryId={itineraryId} />
            <StickyBar>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Revised plan ready</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <GhostButton onClick={submitForRevision} disabled={flags.length === 0 || loading}>Request another revision</GhostButton>
                <button type="button" onClick={approve} disabled={loading} style={{
                  padding: '10px 20px', fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-ui)',
                  background: 'var(--amber)', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer',
                }}>Approve Final Plan →</button>
              </div>
            </StickyBar>
          </>
        )}

        {phase === 'approved' && (
          <Card style={{ textAlign: 'center', padding: 48 }}>
            <div style={{ fontSize: 48, color: 'var(--amber)' }}>✦</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, margin: '12px 0 8px' }}>Plan approved.</div>
            <div style={{ color: 'var(--text-mid)', fontSize: 15, marginBottom: 20 }}>Your PDF itinerary is being prepared. It will appear on your dashboard when ready.</div>
            <PrimaryButton onClick={() => navigate?.('/dashboard') ?? (window.location.href = '/dashboard')}>Back to dashboard</PrimaryButton>
          </Card>
        )}
      </div>
    </PageShell>
  )
}

function StickyBar({ children }) {
  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      background: 'var(--card)', borderTop: '1px solid var(--border)',
      padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      boxShadow: '0 -2px 14px rgba(34,26,16,0.08)', zIndex: 400, fontFamily: 'var(--font-ui)',
    }}>{children}</div>
  )
}

// ─── PlannerDetail ──────────────────────────────────────────────────────────
export function PlannerDetail({ navigate }) {
  const id = window.location.pathname.split('/planner/')[1]?.split('/')[0]
  const [row, setRow] = useState(null)
  const [flags, setFlags] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id) { setError('No id'); setLoading(false); return }
    (async () => {
      try {
        const { itinerary } = await api(`/api/planner/${id}`)
        setRow(itinerary)
        const { flags: fs } = await api(`/api/planner/${id}/flags`).catch(() => ({ flags: [] }))
        setFlags(fs || [])
      } catch (e) { setError(e.message) } finally { setLoading(false) }
    })()
  }, [id])

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-light)' }}>Loading…</div>
  if (error) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--error)' }}>{error}</div>
  if (!row) return null

  const activePlan = row.revised_plan_json || row.plan_json
  const status = row.status

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', padding: '40px 20px 120px' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <button onClick={() => navigate?.('/dashboard') ?? (window.location.href = '/dashboard')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-light)', fontSize: 13, marginBottom: 12 }}>← Back to dashboard</button>
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: 600, letterSpacing: '0.3em', color: 'var(--amber)', textTransform: 'uppercase', marginBottom: 8 }}>◎ Itinerary</div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(22px, 4vw, 36px)', marginBottom: 16 }}>{row.title}</h1>

        {status === 'pdf_ready' && (
          <Card style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ color: 'var(--text)' }}>Your PDF is ready.</div>
              <a href={`/api/planner/${id}/pdf`} download="itinerary.pdf" style={{
                padding: '10px 18px', background: 'var(--ink)', color: '#fff', fontWeight: 600, fontSize: 14,
                borderRadius: 7, textDecoration: 'none',
              }}>Download PDF</a>
            </div>
          </Card>
        )}
        {status === 'approved' && (
          <Card style={{ marginBottom: 16, color: 'var(--text-mid)' }}>Preparing PDF… check back shortly.</Card>
        )}
        {status === 'pdf_failed' && (
          <Card style={{ marginBottom: 16, color: 'var(--error)', border: '1px solid var(--error-border)', background: 'var(--error-bg)' }}>PDF generation failed. Contact support.</Card>
        )}

        <PlanView plan={activePlan} flags={flags} onCommentSaved={() => {}} itineraryId={id} locked />
      </div>
    </div>
  )
}
