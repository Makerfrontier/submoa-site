// Markdown renderers for State.md and Bugs.md downloads.

function parseJsonField(v: any): string[] {
  if (!v) return [];
  try { const x = JSON.parse(v); return Array.isArray(x) ? x : []; } catch { return []; }
}

function bulletList(items: string[]): string {
  if (!items || items.length === 0) return '_(none)_';
  return items.map(i => `- ${i}`).join('\n');
}

function severityRank(s: string): number {
  return s === 'blocker' ? 0 : s === 'major' ? 1 : 2;
}

export async function renderStateMd(env: any): Promise<string> {
  const now = new Date().toISOString();
  const lockedBb: any = await env.submoacontent_db
    .prepare(`SELECT version_number, locked_at FROM brand_bible_versions WHERE status = 'locked' ORDER BY version_number DESC LIMIT 1`)
    .first();
  const bbLine = lockedBb
    ? `v${lockedBb.version_number} (locked ${new Date((lockedBb.locked_at || 0) * 1000).toISOString().slice(0, 10)})`
    : 'not yet locked';

  const featuresResult = await env.submoacontent_db
    .prepare(`SELECT * FROM features WHERE status = 'active' ORDER BY name`)
    .all();

  const plannedResult = await env.submoacontent_db
    .prepare(`SELECT slug, name, pending FROM features WHERE status = 'planned' ORDER BY name`)
    .all();

  const bugsOpen = await env.submoacontent_db
    .prepare(`SELECT id, feature_slug, title, severity, status, opened_at FROM bug_reports WHERE status = 'open' ORDER BY feature_slug, opened_at DESC`)
    .all();
  const bugsByFeature: Record<string, any[]> = {};
  for (const b of (bugsOpen.results || []) as any[]) {
    (bugsByFeature[b.feature_slug] ||= []).push(b);
  }

  const decisions = await env.submoacontent_db
    .prepare(`SELECT summary, context, feature_slug, created_at FROM decisions WHERE created_at > ? ORDER BY created_at DESC LIMIT 50`)
    .bind(Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 30)
    .all();

  const tables = await env.submoacontent_db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
    .all();

  const lines: string[] = [];
  lines.push(`# SubMoa Platform State`);
  lines.push(`Generated: ${now}`);
  lines.push(`Brand Bible: ${bbLine}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const f of (featuresResult.results || []) as any[]) {
    const bugs = bugsByFeature[f.slug] || [];
    const pending = parseJsonField(f.pending);
    const sourceFiles = parseJsonField(f.source_files);
    const dbTables = parseJsonField(f.db_tables);
    const r2Paths = parseJsonField(f.r2_paths);
    const endpoints = parseJsonField(f.endpoints);
    const externalApis = parseJsonField(f.external_apis);
    const lastUpdatedStr = new Date((f.last_updated || 0) * 1000).toISOString().slice(0, 10);
    lines.push(`## ${f.name}`);
    lines.push(`Status: ${f.status}`);
    lines.push(`Last updated: ${lastUpdatedStr} by ${f.last_updated_by || 'system'}`);
    lines.push('');
    lines.push('### What it does');
    lines.push(f.what_it_does || '_(not documented yet)_');
    lines.push('');
    lines.push("### How it's built");
    lines.push(f.how_its_built || '_(not documented yet)_');
    lines.push('');
    lines.push('### Behavior');
    lines.push(f.behavior || '_(not documented yet)_');
    lines.push('');
    lines.push('### Source files');
    lines.push(bulletList(sourceFiles));
    lines.push('');
    lines.push('### DB tables');
    lines.push(bulletList(dbTables));
    lines.push('');
    lines.push('### Endpoints');
    lines.push(bulletList(endpoints));
    lines.push('');
    lines.push('### R2 paths');
    lines.push(bulletList(r2Paths));
    lines.push('');
    lines.push('### External APIs');
    lines.push(bulletList(externalApis));
    lines.push('');
    lines.push(`### Known Issues (${bugs.length} open)`);
    if (bugs.length === 0) lines.push('_(none)_');
    else {
      bugs.sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
      for (const bug of bugs) {
        const opened = new Date((bug.opened_at || 0) * 1000).toISOString().slice(0, 10);
        lines.push(`- [${bug.severity}] ${bug.title} — opened ${opened} (${bug.id})`);
      }
    }
    lines.push('');
    lines.push('### Pending');
    lines.push(bulletList(pending));
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  lines.push('## Planned');
  lines.push('');
  for (const p of (plannedResult.results || []) as any[]) {
    const pending = parseJsonField(p.pending);
    lines.push(`### ${p.name} (\`${p.slug}\`)`);
    lines.push(bulletList(pending));
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('## Platform-level');
  lines.push('');
  lines.push('### Schema (tables present)');
  lines.push(bulletList(((tables.results || []) as any[]).map(r => r.name)));
  lines.push('');
  lines.push('### Active decisions (last 30 days)');
  if ((decisions.results || []).length === 0) lines.push('_(none)_');
  else {
    for (const d of (decisions.results || []) as any[]) {
      const when = new Date((d.created_at || 0) * 1000).toISOString().slice(0, 10);
      lines.push(`- **${when}** ${d.feature_slug ? `(${d.feature_slug})` : ''} — ${d.summary}`);
      if (d.context) lines.push(`  ${d.context}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

export async function renderBugsMd(env: any, includeClosed = false): Promise<string> {
  const where = includeClosed ? '' : `WHERE status = 'open'`;
  const result = await env.submoacontent_db
    .prepare(`SELECT id, feature_slug, title, description, severity, status, opened_at, closed_at FROM bug_reports ${where} ORDER BY severity, feature_slug, opened_at DESC`)
    .all();
  const bugs = (result.results || []) as any[];
  const bySeverity: Record<string, any[]> = { blocker: [], major: [], minor: [] };
  for (const b of bugs) (bySeverity[b.severity] ||= []).push(b);

  const lines: string[] = [];
  lines.push(`# SubMoa Bugs`);
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Total: ${bugs.length}${includeClosed ? '' : ' open'}`);
  lines.push('');

  for (const sev of ['blocker', 'major', 'minor']) {
    const list = bySeverity[sev] || [];
    if (list.length === 0) continue;
    lines.push(`## ${sev.toUpperCase()} (${list.length})`);
    const byFeature: Record<string, any[]> = {};
    for (const b of list) (byFeature[b.feature_slug] ||= []).push(b);
    for (const [feature, items] of Object.entries(byFeature)) {
      lines.push('');
      lines.push(`### ${feature}`);
      for (const b of items) {
        const opened = new Date((b.opened_at || 0) * 1000).toISOString().slice(0, 10);
        const closed = b.closed_at ? ` — closed ${new Date(b.closed_at * 1000).toISOString().slice(0, 10)}` : '';
        lines.push(`- **${b.title}** (${b.id}) — opened ${opened}${closed}`);
        if (b.description) lines.push(`  ${b.description}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}
