import { json, generateId, requireWritebackAuth } from '../../_utils';

// The one and only correct production base URL. Sonnet is instructed to use
// this via the system prompt and every output is regex-checked below to
// auto-correct any 'submoa.com' slip. Do not change without coordinating a DNS
// switch — this string is load-bearing in every generated writeback contract.
const PRODUCTION_BASE_URL = 'https://submoacontent.com';

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

  // Catch-all for bugs that have no feature_slug (null/empty/unknown). Without
  // this, the packager would emit a prompt with missing feature-spec context
  // for orphaned bugs — or worse, error when building the features block.
  // We ensure a 'general-uncategorized' row exists in the features table and
  // reassign any orphaned bugs to it before assembling the prompt.
  const GENERAL_SLUG = 'general-uncategorized';
  const orphanIds = bugs.filter(b => !b.feature_slug || !String(b.feature_slug).trim()).map(b => b.id);
  if (orphanIds.length > 0) {
    const existing = await context.env.submoacontent_db
      .prepare(`SELECT slug FROM features WHERE slug = ?`).bind(GENERAL_SLUG).first();
    if (!existing) {
      await context.env.submoacontent_db
        .prepare(`
          INSERT INTO features (slug, name, status, what_it_does, how_its_built, behavior, last_updated, last_updated_by, seeded)
          VALUES (?, 'General / Uncategorized', 'active', ?, 'N/A', 'N/A', unixepoch(), 'claude_code', 1)
        `)
        .bind(GENERAL_SLUG, 'Catch-all feature for bugs that do not belong to a specific feature. Created automatically by the bug packager when an unassigned bug is selected.')
        .run();
    }
    const orphanPlaceholders = orphanIds.map(() => '?').join(',');
    await context.env.submoacontent_db
      .prepare(`UPDATE bug_reports SET feature_slug = ? WHERE id IN (${orphanPlaceholders})`)
      .bind(GENERAL_SLUG, ...orphanIds)
      .run();
    for (const b of bugs) {
      if (orphanIds.includes(b.id)) b.feature_slug = GENERAL_SLUG;
    }
  }

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

  // Explicit file list for the per-file `git add` step. Draws from each
  // affected feature's source_files plus any bug-level affected_source_files
  // that happen to be on the record. If a bug record surface adds that column
  // later, the list here picks it up automatically.
  const filesThisTask = (() => {
    const set = new Set<string>();
    for (const f of features) for (const p of parseList(f.source_files)) set.add(p);
    for (const b of bugs) for (const p of parseList((b as any).affected_source_files)) set.add(p);
    const arr = [...set];
    return arr.length === 0 ? '(no source_files on features yet — use the fix instructions to populate the git add list)'
      : arr.map(p => `- ${p}`).join('\n');
  })();

  const userMessage = `Package these ${bugs.length} bug${bugs.length === 1 ? '' : 's'} into a Claude Code prompt.

Task id: ${taskId}
Task title: ${taskTitle}

## BUGS
${bugsBlock}

## AFFECTED FEATURE SPECS
${featuresBlock}

## OUT OF SCOPE (other open bugs on the same features — do NOT touch in this prompt)
${otherBlock}

## FILES THIS TASK WILL LIKELY TOUCH (use these verbatim for step 6 \`git add\` — do NOT use \`git add -A\`)
${filesThisTask}

## BRAND BIBLE
${bbPrefix}

Generate a complete Claude Code .md prompt following this structure:
- Brand Bible prefix at the top (use the block above verbatim)
- "What this builds" summary
- Numbered STEP per bug (or grouped if related)
- Per-step: bug id, feature, severity, problem statement, fix instructions, files to read first, acceptance criteria
- An "Out of scope" section listing the other open bugs above (do NOT fix those)
- Writeback contract at the bottom with task id ${taskId} and the exact bug ids to close`;

  const systemPrompt = `You are packaging a Claude Code terminal prompt for the SubMoa Content platform. Output a complete .md prompt ready to paste into a terminal. Be specific about file paths. Be concrete about implementation. Do not invent features that aren't in the feature specs. Include the Brand Bible prefix verbatim.

FEATURE CLASSIFICATION RULES:

When assigning bugs to features for writeback PATCH instructions, follow this priority:

1. If the bug already has feature_slug set, use it. Trust user assignment.

2. If the bug is unassigned, infer from:
   a. The actual file paths the fix will touch (provided in the bugs payload as
      affected_source_files when known)
   b. The feature spec whose source_files most closely match those paths
   c. NEVER infer from keywords in the bug title alone — "popup" does not mean
      notifications; "search" does not mean comp-studio.

3. UI primitives that live under src/components/ and are consumed by multiple
   features belong to the "shared-components" feature, not to the feature where
   they happen to be used first.

4. If you cannot confidently assign a bug to a single feature, attribute it to
   "general-uncategorized" and let the user re-attribute manually. Do NOT guess.

5. NEVER PATCH a feature spec with content that doesn't accurately describe the
   feature's actual behavior. The feature spec is the user's source of truth —
   misleading PATCHes degrade trust in the entire system.

WRITEBACK CONTRACT URL:

The writeback contract section of every generated prompt MUST use the exact base
URL: ${PRODUCTION_BASE_URL}

Do not abbreviate. Do not infer from "SubMoa" branding mentions. Do not use
submoa.com or any other variant. The production domain is submoacontent.com,
period.

Use this exact URL prefix for all writeback POST/PATCH endpoints:
  ${PRODUCTION_BASE_URL}/api/admin/...

End with the writeback contract showing (absolute URLs):

1. POST ${PRODUCTION_BASE_URL}/api/admin/agent/tasks/${taskId}/start
2. POST ${PRODUCTION_BASE_URL}/api/admin/agent/tasks/${taskId}/progress per unit of work
3. POST ${PRODUCTION_BASE_URL}/api/admin/bugs/<actual-bug-id>/close for each closed bug (include closed_in_task_id)
4. PATCH ${PRODUCTION_BASE_URL}/api/admin/features/<actual-feature-slug> for each updated spec
5. POST ${PRODUCTION_BASE_URL}/api/admin/agent/tasks/${taskId}/complete at the end
6. Git commit — per-file staging ONLY:
   \`\`\`bash
   # Stage only the files this task touched — skip missing paths silently.
   git add <path/to/file1> <path/to/file2> <path/to/file3>
   git diff --cached --stat
   # If unexpected files are staged: git reset HEAD <file>
   git commit -m "${taskId}: <one-line summary>"
   git push origin main
   \`\`\`
   If the working tree has uncommitted files NOT touched by this task,
   include a NOTE listing them in the /complete summary field so the user
   can triage.

All writebacks authenticate with: Authorization: Bearer \${CLAUDE_CODE_API_KEY from .env.local}

WRITEBACK CONTRACT — GIT COMMIT STEP:

The git step of every generated prompt MUST instruct Claude Code to commit
ONLY the files this specific task touched. Do NOT use \`git add -A\`,
\`git add --all\`, or \`git add .\` — these sweep up unrelated dirty files
and produce mislabeled commits. Populate the explicit file list from:
 - bug.affected_source_files for each bug being fixed (when provided — see
   FILES THIS TASK WILL LIKELY TOUCH in the user message)
 - feature.source_files for each feature spec being PATCHed in writebacks
 - Any NEW files explicitly named in your fix instructions
The list also belongs in a visible "FILES THIS TASK WILL LIKELY TOUCH"
section near the top of the generated prompt so a reader can sanity-check
scope before executing.

Return only the .md prompt — no preamble, no code fences around the whole thing. Fill every {placeholder} with real values — unfilled placeholders will be rejected.`;

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
    let promptText = String(data?.choices?.[0]?.message?.content || '').trim();
    if (!promptText) return json({ error: 'Empty prompt from model' }, 502);

    // Safety net: Sonnet has been observed to substitute 'submoa.com' for the
    // real domain. Silently auto-correct rather than reject — the underlying
    // packaging is fine, only the URL host is wrong.
    const wrongUrlPattern = /https?:\/\/(?:www\.)?submoa\.com/gi;
    const wrongUrlMatches = promptText.match(wrongUrlPattern);
    if (wrongUrlMatches && wrongUrlMatches.length > 0) {
      promptText = promptText.replace(wrongUrlPattern, PRODUCTION_BASE_URL);
      console.warn(`[packager] Corrected ${wrongUrlMatches.length} bad URL(s) to ${PRODUCTION_BASE_URL} for task ${taskId}`);
    }

    // Hard reject: unfilled template placeholders mean the generated prompt
    // is unusable (Claude Code would POST to literal '{bug_id}' and 404).
    const placeholderPattern = /\{(bug_id|task_id|feature_slug)\}/g;
    const leaks = promptText.match(placeholderPattern);
    if (leaks && leaks.length > 0) {
      return json({
        error: 'Generated prompt contains unfilled placeholders. Re-package required.',
        code: 'PACKAGER_PLACEHOLDER_LEAK',
        placeholders_found: leaks,
      }, 500);
    }

    // Belt-and-suspenders: if Sonnet regresses to `git add -A` / `git add .` /
    // `git add --all`, append a correction footer rather than blocking. The
    // system prompt already forbids these; the regex is a safety net.
    const forbiddenAddAllPattern = /git\s+add\s+(-A|--all|\.)\b/g;
    if (forbiddenAddAllPattern.test(promptText)) {
      console.warn(`[packager] forbidden 'git add -A' pattern detected for task ${taskId} — appending correction footer`);
      promptText += `

---

## ⚠️ PACKAGER WARNING — IGNORE THE 'git add -A' INSTRUCTION ABOVE

The writeback contract above contains \`git add -A\` (or \`git add --all\` / \`git add .\`) which the packager guidelines forbid. Stage explicitly per file using the FILES THIS TASK WILL LIKELY TOUCH list. Do not commit files unrelated to this task. If unsure, pause and ask the user.
`;
    }

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
