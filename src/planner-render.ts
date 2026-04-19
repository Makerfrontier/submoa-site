// src/planner-render.ts
// Shared plan-HTML renderer. Used by both the Pages Function that persists
// a newly generated plan (queue consumer) and the revision endpoint.

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
