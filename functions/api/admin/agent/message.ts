import { json, generateId } from '../../_utils';
import { requireAgentAdmin, getOrCreateConversation, appendMessage } from './_shared';

// The one and only correct production base URL. Sonnet is instructed to use
// this verbatim and every output is regex-checked below to auto-correct any
// 'submoa.com' slip. Do not change without coordinating a DNS switch.
const PRODUCTION_BASE_URL = 'https://submoacontent.com';

// POST /api/admin/agent/message
// Body: { message, current_page, conversation_id? }
//
// Routes the message through an LLM, returns { reply, actions, conversation_id }.
// Intent types: file_bug | lookup_feature | log_decision | list_bugs | package_prompt | conversation
// package_prompt intent switches to Claude Sonnet; others use Gemini Flash.
export async function onRequest(context: any) {
  if (context.request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const auth = await requireAgentAdmin(context.request, context.env);
  if (!auth.ok) return auth.response;

  const body: any = await context.request.json();
  const userMessage: string = String(body?.message || '').trim();
  if (!userMessage) return json({ error: 'message required' }, 400);
  const currentPage: string = String(body?.current_page || '');
  const accountId = auth.user.account_id || 'makerfrontier';

  let conversationId: string = body?.conversation_id || '';
  if (!conversationId) {
    const conv = await getOrCreateConversation(context.env, accountId);
    conversationId = conv.id;
  }

  // Pull platform context (features + recent bugs) so the model can reason
  const featuresRows = await context.env.submoacontent_db
    .prepare(`SELECT slug, name, status FROM features ORDER BY name`)
    .all();
  const features: any[] = featuresRows.results || [];
  const openBugs = await context.env.submoacontent_db
    .prepare(`SELECT id, feature_slug, title, severity FROM bug_reports WHERE status = 'open' ORDER BY opened_at DESC LIMIT 50`)
    .all();

  await appendMessage(context.env, conversationId, {
    role: 'user', content: userMessage, current_page: currentPage, ts: Math.floor(Date.now() / 1000),
  });

  // First pass — intent classification + natural reply via Gemini Flash.
  const systemPrompt = `You are the SubMoa Site Agent — a super-admin assistant for the SubMoa Content platform.

Classify the user's message into ONE of these intents and respond.

INTENTS:
- file_bug: user describes something that is broken or works wrong
- close_bug: user asks to close/resolve a specific bug (they must reference a bug by id, title, or clear description)
- lookup_feature: user asks what a feature does or how it is built
- log_decision: user wants to remember a decision or architectural note ("remember that...", "we decided...")
- list_bugs: user wants to see current bug state
- package_prompt: user wants to package a Claude Code terminal prompt for a specific task/fix
- conversation: casual conversation, clarification, greeting

Available features (slug — name — status):
${features.map((f: any) => `  ${f.slug} — ${f.name} — ${f.status}`).join('\n')}

Current open bugs (id · severity · feature · title):
${(openBugs.results || []).map((b: any) => `  ${b.id} · ${b.severity} · ${b.feature_slug} · ${b.title}`).join('\n') || '  (none)'}

User is on page: ${currentPage || '(unknown)'}

RESPOND with strict JSON only (no prose, no code fences):
{
  "intent": "file_bug | lookup_feature | log_decision | list_bugs | package_prompt | conversation",
  "reply": "<short helpful response to show in chat>",
  "actions": [
    {
      "type": "file_bug" | "close_bug" | "update_feature_spec" | "log_decision" | "create_task",
      "payload": { /* action-specific fields */ },
      "summary": "<one-line human description for the confirm chip>"
    }
  ]
}

For file_bug, payload must include feature_slug (best guess from user context + current page), title, severity (blocker/major/minor), description.
For close_bug, payload must include bug_id (required — must match an existing open bug). Include notes if user gave a reason.
For log_decision, payload must include summary and optional feature_slug.
For update_feature_spec, payload must include slug and partial field updates.
For create_task, payload must include title and prompt.

If intent is package_prompt: set actions=[] and reply="Packaging Claude Code prompt…" — a separate path will assemble the full .md.
If intent is lookup_feature or list_bugs or conversation: actions=[] is fine.
Only propose actions that clearly match what the user asked for.`;

  let flashData: any = null;
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${context.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://www.submoacontent.com',
        'X-Title': 'SubMoa Site Agent',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        max_tokens: 1500,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
      }),
    });
    const data: any = await res.json();
    const raw = String(data?.choices?.[0]?.message?.content || '{}');
    flashData = JSON.parse(raw);
  } catch (e: any) {
    return json({ error: 'Agent unavailable', detail: e.message }, 502);
  }

  let reply: string = flashData?.reply || '';
  const intent: string = flashData?.intent || 'conversation';
  let actions: any[] = Array.isArray(flashData?.actions) ? flashData.actions : [];

  // If package_prompt — switch to Sonnet for prompt assembly
  if (intent === 'package_prompt') {
    try {
      const bbRow: any = await context.env.submoacontent_db
        .prepare(`SELECT version_number, config_json, locked_at FROM brand_bible_versions WHERE status='locked' ORDER BY version_number DESC LIMIT 1`)
        .first();
      const bb = bbRow ? JSON.parse(bbRow.config_json) : null;
      const bbPrefix = bb ? buildBrandBiblePrefix(bb, bbRow.version_number, bbRow.locked_at) : '(no locked Brand Bible)';
      const taskId = generateId();
      const sonnetSys = `You are packaging a Claude Code terminal prompt for the SubMoa Content platform.
Your output MUST start with this Brand Bible prefix verbatim:

${bbPrefix}

Then: numbered STEPs, explicit file paths, explicit bash commands, explicit test/verify steps.
End with writeback contract instructions so Claude Code auto-closes bugs and updates specs.

FEATURE CLASSIFICATION RULES:

When assigning bugs to features for writeback PATCH instructions, follow this priority:
1. If the bug already has feature_slug set, use it. Trust user assignment.
2. If unassigned, infer from the file paths the fix will touch — match against
   the feature spec whose source_files most closely overlap. NEVER infer from
   keywords in the bug title alone ("popup" does not mean notifications).
3. UI primitives under src/components/ consumed by multiple features belong to
   the "shared-components" feature, not to whichever feature uses them first.
4. If you cannot confidently assign a bug to one feature, attribute to
   "general-uncategorized". Do NOT guess.
5. NEVER PATCH a feature spec with content that doesn't accurately describe
   that feature's actual behavior. The spec is the source of truth.

WRITEBACK CONTRACT URL:

All writeback endpoints use the base URL: ${PRODUCTION_BASE_URL}
Do not abbreviate. Do not use submoa.com or any other variant. The production
domain is submoacontent.com, period.

Task id: ${taskId}
Writeback contract to append at end:

---

## WRITEBACK CONTRACT (REQUIRED — DO NOT SKIP)

This task has ID: ${taskId}
Authenticate all POSTs below with header: Authorization: Bearer \${CLAUDE_CODE_API_KEY from .env.local}

1. At the start of this work:
   POST ${PRODUCTION_BASE_URL}/api/admin/agent/tasks/${taskId}/start
2. After each logical unit of work:
   POST ${PRODUCTION_BASE_URL}/api/admin/agent/tasks/${taskId}/progress
   Body: { "message": "one-line description" }
3. When closing a bug:
   POST ${PRODUCTION_BASE_URL}/api/admin/bugs/<actual-bug-id>/close
   Body: { "closed_in_task_id": "${taskId}", "notes": "how it was fixed" }
4. When updating a feature spec:
   PATCH ${PRODUCTION_BASE_URL}/api/admin/features/<actual-feature-slug>
   Body: { partial spec fields, last_updated_by: "claude_code" }
5. When a decision is made:
   POST ${PRODUCTION_BASE_URL}/api/admin/decisions
   Body: { summary, context, feature_slug }
6. At the end of the task:
   POST ${PRODUCTION_BASE_URL}/api/admin/agent/tasks/${taskId}/complete
   Body: { files_changed, bugs_closed, features_updated, summary }

These writebacks are MANDATORY. Fill every <placeholder> with the real id/slug — unfilled placeholders will be rejected.`;
      const sonnetRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${context.env.OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'https://www.submoacontent.com',
          'X-Title': 'SubMoa Site Agent — Package Prompt',
        },
        body: JSON.stringify({
          model: 'anthropic/claude-sonnet-4-5',
          max_tokens: 8000,
          messages: [
            { role: 'system', content: sonnetSys },
            {
              role: 'user',
              content: `Package a Claude Code prompt for this request:\n\n${userMessage}\n\nAvailable features: ${features.map((f: any) => f.slug).join(', ')}\nOpen bug ids: ${(openBugs.results || []).map((b: any) => b.id).join(', ') || 'none'}`,
            },
          ],
        }),
      });
      const sd: any = await sonnetRes.json();
      let prompt = String(sd?.choices?.[0]?.message?.content || '').trim();

      // Safety net: auto-correct any 'submoa.com' slip to the real domain.
      const wrongUrlPattern = /https?:\/\/(?:www\.)?submoa\.com/gi;
      const wrongUrlHits = prompt.match(wrongUrlPattern);
      if (wrongUrlHits && wrongUrlHits.length > 0) {
        prompt = prompt.replace(wrongUrlPattern, PRODUCTION_BASE_URL);
        console.warn(`[site-agent/package_prompt] corrected ${wrongUrlHits.length} bad URL(s) to ${PRODUCTION_BASE_URL} for task ${taskId}`);
      }

      // Hard reject: unfilled template placeholders mean the generated prompt
      // would POST to literal '{bug_id}' and 404.
      const placeholderPattern = /\{(bug_id|task_id|feature_slug)\}/g;
      const leaks = prompt.match(placeholderPattern);
      if (leaks && leaks.length > 0) {
        reply = `Packager rejected: generated prompt contains unfilled placeholders (${leaks.join(', ')}). Ask me again with a more specific request so the model can fill them in.`;
        prompt = '';
      }

      if (prompt) {
        reply = prompt;
        actions = [{
          type: 'create_task',
          payload: { id: taskId, title: userMessage.slice(0, 80), prompt },
          summary: `Create task and send prompt to Claude Code (#${taskId.slice(0, 8)})`,
        }];
      }
    } catch (e: any) {
      reply = `Prompt packaging failed: ${e.message}`;
    }
  }

  // Persist proposed actions so they can be confirmed by id
  for (const a of actions) {
    a.id = a.id || generateId();
    await context.env.submoacontent_db
      .prepare(`INSERT INTO agent_actions (id, conversation_id, action_type, payload, status) VALUES (?, ?, ?, ?, 'proposed')`)
      .bind(a.id, conversationId, a.type, JSON.stringify(a.payload || {}))
      .run();
  }

  await appendMessage(context.env, conversationId, {
    role: 'assistant', content: reply, intent, actions, ts: Math.floor(Date.now() / 1000),
  });

  return json({ reply, intent, actions, conversation_id: conversationId });
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
