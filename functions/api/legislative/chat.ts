// POST /api/legislative/chat
// Narrative Craft chat. Accepts: chat_id (optional, continues), legislation_id,
// rep_profile_id OR party, messages array. Builds a context-rich system prompt,
// calls Claude Sonnet via OpenRouter, appends to legislative_chats.messages.
import { getSessionUser, json, generateId } from '../_utils';
import { requirePageAccess, writeAudit, AccessError } from '../../../src/auth-utils';
import { sanitizeContent } from '../../../src/content-utils';

function safeParse<T>(v: any, d: T): T {
  if (typeof v !== 'string') return (v ?? d) as T;
  try { return JSON.parse(v); } catch { return d; }
}

export async function onRequest(context: { request: Request; env: any }) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);
  try { await requirePageAccess(user, env, 'legislative-intelligence', 'narrative-craft'); }
  catch (e: any) { return json({ error: e.message }, e instanceof AccessError ? e.status : 403); }

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const chat_id = body.chat_id ? String(body.chat_id) : null;
  const legislation_id = body.legislation_id ? String(body.legislation_id) : null;
  const rep_profile_id = body.rep_profile_id ? String(body.rep_profile_id) : null;
  const party = body.party ? String(body.party) : null;
  const brief_id = body.brief_id ? String(body.brief_id) : null;
  const incoming = Array.isArray(body.messages) ? body.messages : [];
  if (incoming.length === 0) return json({ error: 'messages required' }, 400);

  // Load or bootstrap chat row
  let chatRow: any = null;
  if (chat_id) {
    chatRow = await env.submoacontent_db.prepare('SELECT * FROM legislative_chats WHERE id = ? AND user_id = ?').bind(chat_id, user.id).first();
    if (!chatRow) return json({ error: 'Chat not found' }, 404);
  }

  // Hydrate context
  let bill: any = null;
  if (legislation_id || chatRow?.legislation_id) {
    const id = legislation_id || chatRow.legislation_id;
    bill = await env.submoacontent_db.prepare('SELECT * FROM legislation WHERE id = ? OR bill_id = ?').bind(id, id).first();
  }
  let rep: any = null;
  const repId = rep_profile_id || chatRow?.rep_profile_id;
  if (repId) {
    rep = await env.submoacontent_db.prepare('SELECT * FROM rep_profiles WHERE id = ?').bind(repId).first();
  }
  const effectiveParty = party || chatRow?.party;

  // Prefer the explicit brief_id if the caller supplied one; otherwise grab
  // the latest brief tied to this legislation.
  let brief: any = null;
  if (brief_id) {
    brief = await env.submoacontent_db.prepare('SELECT * FROM legislative_briefs WHERE id = ?').bind(brief_id).first();
  } else if (bill) {
    brief = await env.submoacontent_db
      .prepare('SELECT * FROM legislative_briefs WHERE legislation_id = ? ORDER BY created_at DESC LIMIT 1')
      .bind(bill.id).first();
  }

  // Build an exhaustive system prompt from whatever the DB actually has. If a
  // section is missing we say so explicitly — the model must never claim it
  // lacks data; it always has whatever the DB provides.
  const emptyNote = (label: string) => `[${label}: data has not been generated yet — do not fabricate, ask the user to generate or acknowledge absence.]`;

  let billBlock = emptyNote('BILL');
  if (bill) {
    const subjects = safeParse<string[]>(bill.subjects, []);
    const committees = safeParse<string[]>(bill.committees, []);
    billBlock =
      `BILL CONTEXT:\n` +
      `  bill_id: ${bill.bill_id}\n` +
      `  title: ${bill.title}\n` +
      `  status: ${bill.status || 'unknown'}\n` +
      `  sponsor: ${bill.sponsor_name || 'unknown'} (${bill.sponsor_party || '?'}-${bill.sponsor_state || '?'})\n` +
      `  introduced: ${bill.introduced_date || 'unknown'} · last action: ${bill.last_action_date || 'unknown'}\n` +
      `  subjects: ${subjects.length ? subjects.join(', ') : '(none listed)'}\n` +
      `  committees: ${committees.length ? committees.join(', ') : '(none listed)'}\n` +
      `  summary: ${bill.summary ? bill.summary.slice(0, 1200) : '(no summary cached — analyze from bill_text or note absence)'}\n` +
      `  bill_text: ${bill.full_text ? bill.full_text.slice(0, 8000) : '(full text not yet cached)'}\n`;
  }

  let repBlock = emptyNote('REP PROFILE');
  if (rep) {
    const tone = safeParse<string[]>(rep.tone_tags, []);
    const positions = safeParse<any>(rep.policy_positions, {});
    const votingRecord = safeParse<any>(rep.voting_record_json, {});
    repBlock =
      `REP PROFILE:\n` +
      `  name: ${rep.name}\n` +
      `  party/state/district: ${rep.party || '?'}/${rep.state || '?'}-${rep.district || '?'}\n` +
      `  bioguide_id: ${rep.bioguide_id || '(unknown)'}\n` +
      `  voice_guide: ${rep.voice_guide ? rep.voice_guide.slice(0, 2000) : '(voice guide not yet generated)'}\n` +
      `  tone_tags: ${tone.length ? tone.join(', ') : '(none)'}\n` +
      `  policy_positions: ${Object.keys(positions).length ? JSON.stringify(positions).slice(0, 1200) : '(none extracted yet)'}\n` +
      `  voting_record: ${Object.keys(votingRecord).length ? JSON.stringify(votingRecord).slice(0, 1500) : '(voting record not yet pulled)'}\n`;
  } else if (effectiveParty) {
    repBlock = `PARTY FOCUS: ${effectiveParty}. ${emptyNote('REP PROFILE')}`;
  }

  let briefBlock = emptyNote('ANALYSIS BRIEF');
  if (brief) {
    const pork = safeParse<any[]>(brief.pork_analysis, []);
    const pro = safeParse<any[]>(brief.talking_points_pro, []);
    const opp = safeParse<any[]>(brief.talking_points_opposed, []);
    const verbatim = safeParse<any[]>(brief.verbatim_extracts, []);
    const parallels = safeParse<any[]>(brief.historical_parallels, []);
    const alignment = safeParse<any[]>(brief.opposition_alignment, []);
    briefBlock =
      `ANALYSIS BRIEF (mode=${brief.mode}):\n` +
      `  pork_analysis: ${pork.length ? JSON.stringify(pork).slice(0, 2500) : '(none flagged)'}\n` +
      `  talking_points_pro: ${pro.length ? JSON.stringify(pro).slice(0, 1500) : '(not generated)'}\n` +
      `  talking_points_opposed: ${opp.length ? JSON.stringify(opp).slice(0, 1500) : '(not generated)'}\n` +
      `  verbatim_extracts: ${verbatim.length ? JSON.stringify(verbatim).slice(0, 2500) : '(not extracted)'}\n` +
      `  historical_parallels: ${parallels.length ? JSON.stringify(parallels).slice(0, 1500) : '(none identified)'}\n` +
      `  opposition_alignment: ${alignment.length ? JSON.stringify(alignment).slice(0, 1500) : '(not computed)'}\n`;
  }

  const systemPrompt =
    `You are a senior political communications strategist and policy expert working inside SubMoa Legislative Intelligence. You have access to the bill context, the representative's profile, and the most recent analysis brief — all included below. Every response MUST be grounded in this data. When citing bill language quote verbatim with section reference. When referencing voting history cite the specific vote. When referencing donor relationships cite the FEC amount and cycle. Never claim you lack access — if a section is missing, say so explicitly and ask the user to generate it. Apply the rep's voice guide to any drafted content.\n\n` +
    `GUARDRAILS: No fabricated statistics. No defamatory content about named individuals. No impersonation — draft in the representative's style, but never claim the representative said something they didn't. No deceptive or manipulative framing. Never use em-dashes (—) in any output. Use a comma, a period, or restructure the sentence instead.\n\n` +
    billBlock + '\n' +
    repBlock + '\n' +
    briefBlock;

  const messagesForModel = [
    { role: 'system', content: systemPrompt },
    ...incoming.map((m: any) => ({ role: m.role, content: String(m.content || '').slice(0, 10000) })),
  ];

  let assistantContent = '';
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://www.submoacontent.com',
        'X-Title': 'SubMoa Narrative Craft',
      },
      body: JSON.stringify({
        model: 'anthropic/claude-sonnet-4-5',
        max_tokens: 3000,
        messages: messagesForModel,
      }),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      return json({ error: `OpenRouter HTTP ${res.status}`, detail: err.slice(0, 300) }, 502);
    }
    const data: any = await res.json();
    assistantContent = sanitizeContent(String(data?.choices?.[0]?.message?.content || '').trim());
    if (!assistantContent) return json({ error: 'Empty model output' }, 502);
  } catch (e: any) {
    return json({ error: e?.message || 'OpenRouter call failed' }, 500);
  }

  // Persist
  const newMessages = [...incoming, { role: 'assistant', content: assistantContent }];
  let savedId = chat_id;
  if (!savedId) {
    savedId = generateId();
    await env.submoacontent_db.prepare(
      `INSERT INTO legislative_chats
        (id, user_id, context_type, legislation_id, rep_profile_id, party, messages, title, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, unixepoch(), unixepoch())`
    ).bind(
      savedId, user.id,
      rep ? 'rep' : (effectiveParty ? 'party' : 'rep'),
      bill?.id || null, rep?.id || null, effectiveParty || null,
      JSON.stringify(newMessages),
      (incoming[0]?.content || '').slice(0, 120),
    ).run();
  } else {
    await env.submoacontent_db.prepare(
      `UPDATE legislative_chats SET messages = ?, updated_at = unixepoch() WHERE id = ?`
    ).bind(JSON.stringify(newMessages), savedId).run();
  }

  await writeAudit(env, request, user.id, { action: 'chat-message-sent', legislation_id: bill?.id || null, rep_profile_id: rep?.id || null, details: { chat_id: savedId } });
  return json({ chat_id: savedId, assistant: assistantContent, messages: newMessages });
}
