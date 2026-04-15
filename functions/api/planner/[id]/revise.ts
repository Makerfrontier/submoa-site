// POST /api/planner/:id/revise
// Runs the revision agent over all open itinerary flags and produces a revised plan.

import { json, getSessionUser } from '../../_utils';
import { renderPlanHtml } from '../generate';

function parseId(pathname: string): string | null {
  const parts = pathname.split('/').filter(Boolean);
  const idx = parts.indexOf('planner');
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
  const id = parseId(url.pathname);
  if (!id) return json({ error: 'Missing itinerary id' }, 400);
  const account_id = user.account_id || 'makerfrontier';

  const row: any = await env.submoacontent_db.prepare(
    'SELECT id, plan_json, revised_plan_json FROM itinerary_submissions WHERE id = ? AND account_id = ?'
  ).bind(id, account_id).first();
  if (!row) return json({ error: 'Not found' }, 404);

  const basePlan = (() => {
    try { return JSON.parse(row.revised_plan_json || row.plan_json || '{}'); } catch { return null; }
  })();
  if (!basePlan) return json({ error: 'No plan to revise' }, 400);

  const flagsRes = await env.submoacontent_db.prepare(
    `SELECT id, section_id, section_title, selected_text, comment, flag_type
     FROM itinerary_flags WHERE itinerary_id = ? AND status = 'open' ORDER BY created_at ASC`
  ).bind(id).all();
  const flags: any[] = flagsRes.results ?? [];
  if (flags.length === 0) return json({ error: 'No open flags' }, 400);

  const slotRow: any = await env.submoacontent_db.prepare(
    'SELECT model_string FROM llm_config WHERE slot = 1'
  ).first();
  const model = slotRow?.model_string || 'anthropic/claude-sonnet-4-5';

  const systemPrompt = [
    'You are a plan revision assistant. You have a planning document with user feedback on specific sections.',
    'Apply every piece of feedback precisely.',
    'For sections marked "remove", remove the corresponding task from the plan.',
    'For sections marked "edit", rewrite that task according to the comment.',
    'For sections marked "question", answer the question by updating the relevant task with accurate information.',
    'For sections marked "approve" (Looks Good), keep as-is.',
    'Return the complete revised plan in the same JSON structure as the original: plan_title, summary, tasks[], timeline, total_cost_estimate, next_steps[]. No preamble, no code fences.',
  ].join('\n');

  const userPrompt = [
    '=== ORIGINAL PLAN ===',
    JSON.stringify(basePlan),
    '',
    '=== USER FEEDBACK ===',
    ...flags.map(f => `section_id=${f.section_id} section_title=${f.section_title || ''} type=${f.flag_type}\n  comment: ${f.comment}${f.selected_text ? `\n  selected: ${f.selected_text}` : ''}`),
    '',
    'Produce the complete revised plan now.',
  ].join('\n');

  let revisedPlan: any;
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://www.submoacontent.com',
        'X-Title': 'SubMoa Planner',
      },
      body: JSON.stringify({
        model,
        max_tokens: 6000,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      return json({ error: `Model HTTP ${res.status}`, detail: t.slice(0, 400) }, 502);
    }
    const data: any = await res.json();
    let content = data?.choices?.[0]?.message?.content ?? '{}';
    content = content.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
    revisedPlan = JSON.parse(content);
  } catch (e: any) {
    return json({ error: 'Revision failed', detail: e?.message ?? String(e) }, 500);
  }

  const revised_plan_html = renderPlanHtml(revisedPlan);

  await env.submoacontent_db.prepare(
    `UPDATE itinerary_submissions
       SET revised_plan_json = ?, revised_plan_html = ?, status = 'revision_ready', updated_at = ?
       WHERE id = ?`
  ).bind(JSON.stringify(revisedPlan), revised_plan_html, Math.floor(Date.now() / 1000), id).run();

  for (const f of flags) {
    await env.submoacontent_db.prepare(
      "UPDATE itinerary_flags SET status = 'resolved' WHERE id = ?"
    ).bind(f.id).run();
  }

  return json({ plan: revisedPlan, plan_html: revised_plan_html });
}
