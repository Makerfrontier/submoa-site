// POST /api/planner/generate
// Calls slot-1 OpenRouter model to produce a full plan JSON + styled HTML.

import { json, getSessionUser } from '../_utils';

export async function onRequest(context: any) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const { itinerary_id, situation, answers = {}, confirmed_recap = '', additions = [] } = body;
  if (!situation) return json({ error: 'situation required' }, 400);

  const slotRow: any = await env.submoacontent_db.prepare(
    'SELECT model_string FROM llm_config WHERE slot = 1'
  ).first();
  const model = slotRow?.model_string || 'anthropic/claude-sonnet-4-5';

  const systemPrompt = [
    'You are an expert planning assistant. Create a comprehensive actionable plan with real vendor recommendations, accurate phone numbers, website URLs, cost estimates, and practical considerations a person might not think of.',
    'Every option must be a real business or service with real contact information.',
    'Return ONLY valid JSON with no preamble:',
    '{"plan_title":"Title","summary":"2-3 sentence overview","tasks":[{"task_id":"t1","task_name":"Name","task_description":"Brief description","tags":["tag1"],"options":[{"rank":1,"name":"Vendor name","tagline":"One line","cost_estimate":"Range","phone":"Number or null","website":"URL or null","pros":["Pro 1","Pro 2"],"considerations":["Note 1"],"best_for":"Who this suits"}]}],"timeline":"Overall timeline","total_cost_estimate":"Range","next_steps":["Step 1","Step 2","Step 3"]}',
    'Include 3 real options per task.',
  ].join('\n');

  const userPrompt = [
    `=== PLANNING REQUEST ===`,
    situation,
    ``,
    `=== USER ANSWERS ===`,
    ...Object.entries(answers).map(([k, v]) => `${k}: ${String(v)}`),
    ``,
    `=== CONFIRMED RECAP ===`,
    confirmed_recap,
    Array.isArray(additions) && additions.length
      ? `\n=== ADDITIONAL DETAILS ===\n${additions.join('\n')}`
      : '',
    ``,
    'Produce the plan now.',
  ].join('\n');

  let plan: any;
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
    plan = JSON.parse(content);
  } catch (e: any) {
    return json({ error: 'Plan generation failed', detail: e?.message ?? String(e) }, 500);
  }

  const plan_html = renderPlanHtml(plan);

  if (itinerary_id) {
    await env.submoacontent_db.prepare(
      `UPDATE itinerary_submissions
         SET plan_json = ?, plan_html = ?, title = ?, status = 'draft', updated_at = ?
         WHERE id = ?`
    ).bind(
      JSON.stringify(plan),
      plan_html,
      plan?.plan_title || 'Untitled plan',
      Math.floor(Date.now() / 1000),
      itinerary_id
    ).run();
  }

  return json({ plan, plan_html });
}

export function renderPlanHtml(plan: any): string {
  const esc = (s: any) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const tasks = Array.isArray(plan?.tasks) ? plan.tasks : [];
  const steps = Array.isArray(plan?.next_steps) ? plan.next_steps : [];
  const tasksHtml = tasks.map((t: any) => {
    const opts = Array.isArray(t?.options) ? t.options : [];
    const optsHtml = opts.map((o: any) => `
      <div class="opt">
        <div class="rank">${esc(o?.rank ?? '')}</div>
        <div class="vendor">${esc(o?.name ?? '')}</div>
        <div class="tagline">${esc(o?.tagline ?? '')}</div>
        ${o?.cost_estimate ? `<div class="cost">${esc(o.cost_estimate)}</div>` : ''}
        ${o?.phone ? `<div class="phone">${esc(o.phone)}</div>` : ''}
        ${o?.website ? `<div class="web"><a href="${esc(o.website)}">${esc(o.website)}</a></div>` : ''}
        ${Array.isArray(o?.pros) ? `<ul class="pros">${o.pros.map((p: any) => `<li>✓ ${esc(p)}</li>`).join('')}</ul>` : ''}
        ${Array.isArray(o?.considerations) ? `<ul class="cons">${o.considerations.map((p: any) => `<li>✦ ${esc(p)}</li>`).join('')}</ul>` : ''}
        ${o?.best_for ? `<div class="bestfor">Best for: ${esc(o.best_for)}</div>` : ''}
      </div>`).join('');
    const tags = Array.isArray(t?.tags) ? t.tags.map((x: any) => `<span class="tag">${esc(x)}</span>`).join(' ') : '';
    return `
    <section class="task">
      <div class="eyebrow">${esc(t?.task_name ?? '')}</div>
      <div class="desc">${esc(t?.task_description ?? '')}</div>
      ${tags ? `<div class="tags">${tags}</div>` : ''}
      <div class="opts">${optsHtml}</div>
    </section>`;
  }).join('');

  return `
    <section class="plan-root">
      <div class="summary">${esc(plan?.summary ?? '')}</div>
      ${tasksHtml}
      <section class="next">
        <div class="eyebrow">Next steps</div>
        <ol>${steps.map((s: any) => `<li>${esc(s)}</li>`).join('')}</ol>
      </section>
      <section class="totals">
        <div><strong>Timeline:</strong> ${esc(plan?.timeline ?? '')}</div>
        <div><strong>Total cost estimate:</strong> ${esc(plan?.total_cost_estimate ?? '')}</div>
      </section>
    </section>`;
}
