// POST /api/submissions/:id/revision-request
// Runs the editorial revision agent over all open flags for a submission and
// writes three resolution options per flag into revision_reviews.

import { json, getSessionUser, isAdmin, generateId } from '../../_utils';

function parseSubmissionId(pathname: string): string | null {
  const parts = pathname.split('/').filter(Boolean);
  const idx = parts.indexOf('submissions');
  return idx >= 0 ? parts[idx + 1] ?? null : null;
}

export async function onRequest(context: any) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);

  const url = new URL(request.url);
  const submissionId = parseSubmissionId(url.pathname);
  if (!submissionId) return json({ error: 'Missing submission id' }, 400);

  const sub: any = await env.submoacontent_db.prepare(
    'SELECT id, user_id, topic, article_content, content_rating, article_format, author FROM submissions WHERE id = ?'
  ).bind(submissionId).first();
  if (!sub) return json({ error: 'Submission not found' }, 404);
  if (sub.user_id !== user.id && !isAdmin(user)) return json({ error: 'Forbidden' }, 403);

  let body: any = {};
  try { body = await request.json(); } catch {}
  const revision_mode = body.revision_mode === 'full' ? 'full' : 'surgical';

  const flagsRes = await env.submoacontent_db.prepare(
    `SELECT id, selected_text, comment, flag_type, char_offset_start, char_offset_end,
            fact_check_result, fact_check_verdict
     FROM article_flags WHERE submission_id = ? AND status = 'open' ORDER BY char_offset_start ASC`
  ).bind(submissionId).all();
  const flags: any[] = flagsRes.results ?? [];

  if (flags.length === 0) return json({ error: 'No open flags to review' }, 400);

  // Look up model slot from content_rating
  const slot = [1, 2, 3].includes(Number(sub.content_rating)) ? Number(sub.content_rating) : 1;
  let slotRow: any = await env.submoacontent_db.prepare(
    'SELECT model_string FROM llm_config WHERE slot = ?'
  ).bind(slot).first();
  if (!slotRow) {
    slotRow = await env.submoacontent_db.prepare(
      "SELECT model_string FROM llm_config WHERE slot = 1"
    ).first();
  }
  const model = slotRow?.model_string ?? 'anthropic/claude-sonnet-4-5';

  const article = sub.article_content ?? '';

  const systemPrompt = [
    'You are an editorial revision agent.',
    'You are given an article with flagged sections. For each flag generate three resolution options:',
    '- option_remove: the section removed entirely (string: "Remove this section")',
    '- option_a: a replacement of one to two sentences',
    '- option_b: a different replacement of one to two sentences (different angle)',
    'For fact-check flags marked Inaccurate, include the verified information in the replacements.',
    revision_mode === 'full'
      ? 'REVISION MODE: full rewrite — also improve overall flow and coherence of the revised sections.'
      : 'REVISION MODE: surgical — touch only the flagged sections; do not rewrite surrounding text.',
    'Return ONLY a valid JSON array. Each item must have: flag_id, finding, option_remove, option_a, option_b.',
    'No preamble, no code fences, just the JSON array.',
  ].join('\n');

  const userPrompt = [
    `=== ARTICLE ===`,
    article.slice(0, 12000),
    ``,
    `=== FLAGS (${flags.length}) ===`,
    ...flags.map((f, i) => {
      const factLine = f.fact_check_verdict
        ? `  FACT-CHECK: ${f.fact_check_verdict} — ${(() => { try { return JSON.parse(f.fact_check_result || '{}').summary || ''; } catch { return ''; } })()}`
        : '';
      return [
        `Flag ${i + 1}:`,
        `  flag_id: ${f.id}`,
        `  flag_type: ${f.flag_type}`,
        `  selected_text: ${JSON.stringify(f.selected_text)}`,
        `  user_comment: ${JSON.stringify(f.comment || '')}`,
        factLine,
      ].filter(Boolean).join('\n');
    }),
  ].join('\n');

  let parsedResults: any[] = [];
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://www.submoacontent.com',
        'X-Title': 'SubMoa Content',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4000,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`OpenRouter HTTP ${res.status}: ${t.slice(0, 300)}`);
    }
    const data: any = await res.json();
    let content = data?.choices?.[0]?.message?.content ?? '[]';
    content = content.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
    parsedResults = JSON.parse(content);
    if (!Array.isArray(parsedResults)) throw new Error('Model did not return an array');
  } catch (e: any) {
    console.error('[revision-request] model call failed:', e?.message ?? e);
    return json({ error: 'Revision agent failed', detail: e?.message ?? String(e) }, 502);
  }

  // Insert revision_reviews rows; context_buffer = 150 chars on each side
  for (const flag of flags) {
    const match = parsedResults.find((r: any) => r.flag_id === flag.id) ?? parsedResults[flags.indexOf(flag)];
    const start = Math.max(0, Number(flag.char_offset_start) - 150);
    const end = Math.min(article.length, Number(flag.char_offset_end) + 150);
    const context_buffer = article.slice(start, end);

    await env.submoacontent_db.prepare(
      `INSERT INTO revision_reviews
         (id, submission_id, flag_id, original_text, context_buffer, finding,
          option_remove, option_a, option_b, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      generateId(),
      submissionId,
      flag.id,
      flag.selected_text,
      context_buffer,
      match?.finding ?? '',
      match?.option_remove ?? 'Remove this section',
      match?.option_a ?? '',
      match?.option_b ?? '',
      Math.floor(Date.now() / 1000)
    ).run();
  }

  await env.submoacontent_db.prepare(
    "UPDATE submissions SET status = 'review_ready', revision_mode = ?, updated_at = ? WHERE id = ?"
  ).bind(revision_mode, Date.now(), submissionId).run();

  return json({ ok: true, reviews: parsedResults.length });
}
