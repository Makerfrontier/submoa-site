import { json, generateId, requireWritebackAuth } from '../../_utils';

// POST /api/admin/bugs/package
// Body: { bug_ids: string[], task_title?: string }
// Returns: { prompt_text, task_id }
//
// Assembles a full Claude Code prompt by: fetching each selected bug,
// grouping by feature, pulling affected feature specs, inlining the active
// Brand Bible prefix, then asking Sonnet to write the final .md. An
// agent_tasks row is inserted so writebacks can attach.
export async function onRequest(context: any) {
  if (context.request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const auth = await requireWritebackAuth(context.request, context.env);
  if (!auth.ok) return auth.response;

  const body: any = await context.request.json();
  const bugIds: string[] = Array.isArray(body?.bug_ids) ? body.bug_ids.filter(Boolean) : [];
  if (bugIds.length === 0) return json({ error: 'bug_ids required' }, 400);
  const taskTitle: string = String(body?.task_title || `Bug fixes — ${bugIds.length} bug${bugIds.length === 1 ? '' : 's'}`);

  // Fetch bugs
  const placeholders = bugIds.map(() => '?').join(',');
  const bugsResult = await context.env.submoacontent_db
    .prepare(`SELECT id, feature_slug, title, description, severity, status, opened_at FROM bug_reports WHERE id IN (${placeholders})`)
    .bind(...bugIds)
    .all();
  const bugs: any[] = bugsResult.results || [];
  if (bugs.length === 0) return json({ error: 'No bugs found for provided ids' }, 404);

  // Fetch unique feature specs
  const slugs = [...new Set(bugs.map((b: any) => b.feature_slug))];
  const slugPlaceholders = slugs.map(() => '?').join(',');
  const featuresResult = await context.env.submoacontent_db
    .prepare(`SELECT slug, name, status, what_it_does, how_its_built, behavior, source_files, db_tables, endpoints, pending FROM features WHERE slug IN (${slugPlaceholders})`)
    .bind(...slugs)
    .all();
  const features: any[] = featuresResult.results || [];

  // Also: other open bugs on the same features — "out of scope" list
  const otherOpen = await context.env.submoacontent_db
    .prepare(`SELECT id, feature_slug, title, severity FROM bug_reports WHERE status = 'open' AND feature_slug IN (${slugPlaceholders}) AND id NOT IN (${placeholders})`)
    .bind(...slugs, ...bugIds)
    .all();

  // Active Brand Bible
  const bbRow: any = await context.env.submoacontent_db
    .prepare(`SELECT version_number, config_json, locked_at FROM brand_bible_versions WHERE status='locked' ORDER BY version_number DESC LIMIT 1`)
    .first();
  const bbConfig = bbRow ? JSON.parse(bbRow.config_json) : null;
  const bbPrefix = bbConfig
    ? buildBrandBiblePrefix(bbConfig, bbRow.version_number, bbRow.locked_at)
    : '(no Brand Bible locked — use sensible defaults)';

  // Pre-create the task so the generated prompt can reference its id
  const taskId = generateId();

  // Build the user message
  const parseList = (v: any) => { try { return JSON.parse(v || '[]'); } catch { return []; } };
  const bugsBlock = bugs.map((b: any, i: number) =>
    `### Bug ${i + 1}: ${b.title}\nid: ${b.id}\nfeature: ${b.feature_slug}\nseverity: ${b.severity}\ndescription:\n${b.description || '(none)'}`
  ).join('\n\n');
  const featuresBlock = features.map((f: any) =>
    `### ${f.name} (\`${f.slug}\`) — ${f.status}\n` +
    `what_it_does: ${f.what_it_does || '(not documented)'}\n` +
    `how_its_built: ${f.how_its_built || '(not documented)'}\n` +
    `behavior: ${f.behavior || '(not documented)'}\n` +
    `source_files:\n${parseList(f.source_files).map((x: string) => `  - ${x}`).join('\n') || '  (none)'}\n` +
    `endpoints:\n${parseList(f.endpoints).map((x: string) => `  - ${x}`).join('\n') || '  (none)'}\n` +
    `db_tables:\n${parseList(f.db_tables).map((x: string) => `  - ${x}`).join('\n') || '  (none)'}`
  ).join('\n\n');
  const otherBlock = (otherOpen.results || []).length === 0 ? '(none)'
    : (otherOpen.results || []).map((b: any) => `- ${b.id} · ${b.severity} · ${b.feature_slug} · ${b.title}`).join('\n');

  const userMessage = `Package these ${bugs.length} bug${bugs.length === 1 ? '' : 's'} into a Claude Code prompt.

Task id: ${taskId}
Task title: ${taskTitle}

## BUGS
${bugsBlock}

## AFFECTED FEATURE SPECS
${featuresBlock}

## OUT OF SCOPE (other open bugs on the same features — do NOT touch in this prompt)
${otherBlock}

## BRAND BIBLE
${bbPrefix}

Generate a complete Claude Code .md prompt following this structure:
- Brand Bible prefix at the top (use the block above verbatim)
- "What this builds" summary
- Numbered STEP per bug (or grouped if related)
- Per-step: bug id, feature, severity, problem statement, fix instructions, files to read first, acceptance criteria
- An "Out of scope" section listing the other open bugs above (do NOT fix those)
- Writeback contract at the bottom with task id ${taskId} and the exact bug ids to close`;

  const systemPrompt = `You are packaging a Claude Code terminal prompt for the SubMoa Content platform. Output a complete .md prompt ready to paste into a terminal. Be specific about file paths. Be concrete about implementation. Do not invent features that aren't in the feature specs. Include the Brand Bible prefix verbatim. End with the writeback contract showing:

1. POST /api/admin/agent/tasks/{task_id}/start
2. POST /api/admin/agent/tasks/{task_id}/progress per unit of work
3. POST /api/admin/bugs/{bug_id}/close for each closed bug (include closed_in_task_id)
4. PATCH /api/admin/features/{feature_slug} for each updated spec
5. POST /api/admin/agent/tasks/{task_id}/complete at the end

All writebacks authenticate with: Authorization: Bearer \${CLAUDE_CODE_API_KEY from .env.local}

Return only the .md prompt — no preamble, no code fences around the whole thing.`;

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${context.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://www.submoacontent.com',
        'X-Title': 'SubMoa Bug Packager',
      },
      body: JSON.stringify({
        model: 'anthropic/claude-sonnet-4-5',
        max_tokens: 8000,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
      }),
    });
    const data: any = await res.json();
    const promptText = String(data?.choices?.[0]?.message?.content || '').trim();
    if (!promptText) return json({ error: 'Empty prompt from model' }, 502);

    // Persist the task row
    await context.env.submoacontent_db
      .prepare(`INSERT INTO agent_tasks (id, title, prompt, status) VALUES (?, ?, ?, 'pending_execution')`)
      .bind(taskId, taskTitle, promptText)
      .run();

    return json({ prompt_text: promptText, task_id: taskId, bug_count: bugs.length });
  } catch (e: any) {
    return json({ error: 'Packaging failed', detail: e.message }, 502);
  }
}

function buildBrandBiblePrefix(config: any, version: number, lockedAt: number | null): string {
  const date = lockedAt ? new Date(lockedAt * 1000).toISOString().slice(0, 10) : 'unlocked';
  const colorLines = Object.entries(config.colors || {})
    .map(([k, v]: any) => `--${k}: ${v.hex}   (${v.description})`)
    .join('\n');
  const typeLines = Object.entries(config.typography || {})
    .map(([role, s]: any) => `${role}: ${s.family} · ${s.weight} · ${s.size}px · lh ${s.lh} · ls ${s.ls} · var(--${s.color})${s.transform !== 'none' ? ' · ' + s.transform : ''}${s.style !== 'normal' ? ' · ' + s.style : ''}`)
    .join('\n');
  return `# BRAND BIBLE — v${version} — Locked ${date}

## ⛔ READ BEFORE ANY UI WORK

Every file you touch must respect these tokens. Do not hardcode colors. Do not use pure #000. Do not invent fonts. Always reference CSS vars.

### Color tokens
${colorLines}

### Type scale
${typeLines}

### Hard rules
1. Never #000 or color: black — use var(--text)
2. Never hardcode hex values for tokens listed above — use var(--token-name)
3. Page titles use H1 spec · marketing heroes use Display spec
4. Section labels inside accordions use Eyebrow spec
5. New editor pages follow the two-column pattern (left accordion / right canvas)`;
}
