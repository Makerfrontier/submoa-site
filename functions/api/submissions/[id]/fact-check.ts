// POST /api/submissions/:id/fact-check
// Runs a fact-check on a single flagged claim and stores verdict on the flag row.

import { json, getSessionUser, isAdmin } from '../../_utils';

const FACT_CHECK_MODEL = 'google/gemini-2.5-flash';

function parseSubmissionId(pathname: string): string | null {
  const parts = pathname.split('/').filter(Boolean);
  const idx = parts.indexOf('submissions');
  return idx >= 0 ? parts[idx + 1] ?? null : null;
}

export async function onRequest(context: any) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);

  const url = new URL(request.url);
  const submissionId = parseSubmissionId(url.pathname);
  if (!submissionId) return json({ error: 'Missing submission id' }, 400);

  const sub: any = await env.submoacontent_db.prepare(
    'SELECT id, user_id FROM submissions WHERE id = ?'
  ).bind(submissionId).first();
  if (!sub) return json({ error: 'Submission not found' }, 404);
  if (sub.user_id !== user.id && !isAdmin(user)) return json({ error: 'Forbidden' }, 403);

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { flag_id, selected_text, article_context } = body;
  if (!flag_id || !selected_text) return json({ error: 'flag_id and selected_text required' }, 400);

  const systemPrompt =
    'You are a fact-checking assistant. You are given a claim extracted from an article. ' +
    'Research the claim and return a JSON object with three fields: ' +
    'verdict (one of Verified, Inaccurate, or Unverifiable), ' +
    'summary (one sentence explaining the finding), ' +
    'and source_url (the most relevant source URL or null if none found). ' +
    'Return only valid JSON with no preamble.';

  const userPrompt =
    `CLAIM: ${selected_text}\n\nSURROUNDING CONTEXT:\n${article_context || '(none provided)'}\n\nFact-check the claim above.`;

  let verdict = 'Unverifiable';
  let summary = 'No response from model.';
  let source_url: string | null = null;

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
        model: FACT_CHECK_MODEL,
        max_tokens: 400,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (res.ok) {
      const data: any = await res.json();
      const content = data?.choices?.[0]?.message?.content ?? '';
      const cleaned = content.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
      try {
        const parsed = JSON.parse(cleaned);
        if (['Verified', 'Inaccurate', 'Unverifiable'].includes(parsed.verdict)) verdict = parsed.verdict;
        if (typeof parsed.summary === 'string') summary = parsed.summary;
        if (typeof parsed.source_url === 'string') source_url = parsed.source_url;
      } catch {
        summary = cleaned.slice(0, 200);
      }
    } else {
      const errText = await res.text().catch(() => '');
      console.error('[fact-check] OpenRouter error:', res.status, errText.slice(0, 200));
      summary = `Fact-check failed: HTTP ${res.status}`;
    }
  } catch (e: any) {
    console.error('[fact-check] Exception:', e?.message ?? e);
    summary = `Fact-check error: ${e?.message ?? e}`;
  }

  const resultJson = JSON.stringify({ verdict, summary, source_url });
  const updatedType = verdict === 'Inaccurate' ? 'revision' : undefined;

  if (updatedType) {
    await env.submoacontent_db.prepare(
      'UPDATE article_flags SET fact_check_result = ?, fact_check_verdict = ?, flag_type = ? WHERE id = ? AND submission_id = ?'
    ).bind(resultJson, verdict, updatedType, flag_id, submissionId).run();
  } else {
    await env.submoacontent_db.prepare(
      'UPDATE article_flags SET fact_check_result = ?, fact_check_verdict = ? WHERE id = ? AND submission_id = ?'
    ).bind(resultJson, verdict, flag_id, submissionId).run();
  }

  return json({ verdict, summary, source_url });
}
