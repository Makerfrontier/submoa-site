// Unified dashboard card action config.
// Each content type has a shared shape: label, icon, accentColor, status badges,
// and a list of actions. Each action has an id, label, type (link | action |
// panel | danger), an href or endpoint, and a condition string. The condition
// decides whether the button renders. "always" renders unconditionally. Other
// conditions are field lookups against the record.

export type ActionType = 'link' | 'action' | 'panel' | 'danger';

export interface CardAction {
  id: string;
  label: string;
  type: ActionType;
  href?: string;             // templated string; {id} replaced at render time
  endpoint?: string;         // for type='action' or 'danger' — DELETE/POST target
  method?: string;           // HTTP method for endpoint
  confirmMessage?: string;   // shown before firing endpoint
  panel?: string;            // panel key for type='panel'
  condition: string;         // see evalCondition below
  variant?: 'primary' | 'gold' | 'green' | 'accent' | 'ghost' | 'disabled';
}

export interface StatusBadge {
  label: string;
  color: string;
  bg: string;
  pulse?: boolean;
}

export interface CardConfigEntry {
  label: string;
  icon: string;
  accentColor: string;
  statusBadges: Record<string, StatusBadge>;
  actions: CardAction[];
}

export const CARD_CONFIG: Record<string, CardConfigEntry> = {
  article: {
    label: 'Article',
    icon: '✦',
    accentColor: 'var(--green)',
    statusBadges: {
      draft:             { label: 'Draft',       color: 'var(--text-mid)', bg: 'var(--border)' },
      queued:            { label: 'Queued',      color: 'var(--amber)',    bg: 'var(--amber-light)' },
      generating:        { label: 'Generating',  color: 'var(--amber)',    bg: 'var(--amber-light)', pulse: true },
      grading:           { label: 'Grading',     color: 'var(--amber)',    bg: 'var(--amber-light)', pulse: true },
      article_done:      { label: 'Ready',       color: 'var(--success)',  bg: 'var(--success-bg)' },
      review_ready:      { label: 'Review Ready', color: 'var(--amber)',   bg: 'var(--amber-light)', pulse: true },
      revision_applied:  { label: 'Revised',     color: 'var(--success)',  bg: 'var(--success-bg)' },
      published:         { label: 'Published',   color: 'var(--success)',  bg: 'var(--success-bg)' },
    },
    actions: [
      { id: 'view',         label: 'View rendered article', type: 'link',   href: '/content/{id}',                                    condition: 'article_done OR published',  variant: 'gold'   },
      { id: 'download-zip', label: 'Download zip package',  type: 'link',   href: '/api/submissions/{id}/download',                   condition: 'package_status == ready',    variant: 'gold'   },
      { id: 'download-docx',label: 'DOCX',                  type: 'link',   href: '/api/submissions/{id}/download/docx',              condition: 'has_docx',                   variant: 'gold'   },
      { id: 'download-mp3', label: 'MP3',                   type: 'link',   href: '/api/submissions/{id}/download/audio',             condition: 'generate_audio AND (article_done OR published OR revision_applied)', variant: 'gold' },
      { id: 'download-img', label: 'Image',                 type: 'link',   href: '/api/submissions/{id}/download/featured-image',    condition: 'generated_image_key OR custom_featured_image_key', variant: 'gold' },
      { id: 'image-seo',    label: 'Image SEO doc',         type: 'link',   href: '/api/submissions/{id}/image-companion',            condition: 'featured_image_filename',    variant: 'gold'   },
      { id: 'publish',      label: 'Mark as published',     type: 'panel',  panel: 'publish',                                         condition: '(grade_status == graded OR grade_status == passed) AND status != published', variant: 'green' },
      { id: 'revision',     label: 'Request revision',      type: 'panel',  panel: 'revision',                                        condition: 'grade_status == graded AND status != published', variant: 'gold'  },
      { id: 'share',        label: 'Share',                 type: 'panel',  panel: 'share',                                           condition: '(article_done OR published OR revision_applied) AND article_format != email AND article_format != infographic', variant: 'ghost' },
      { id: 'infographic',  label: '→ Infographic',         type: 'action', endpoint: 'infographic-handoff',                          condition: 'grade_status == graded OR grade_status == passed OR published', variant: 'accent' },
      { id: 'delete',       label: 'Delete',                type: 'danger', endpoint: '/api/submissions/{id}',                        method: 'DELETE', confirmMessage: 'Delete this submission? This cannot be undone.', condition: 'always' },
    ],
  },

  itinerary: {
    label: 'Itinerary',
    icon: '◎',
    accentColor: '#6A4A8A',
    statusBadges: {
      draft:             { label: 'Submitted',        color: 'var(--text-mid)', bg: 'var(--border)' },
      generating:        { label: 'Building Plan',    color: 'var(--amber)',    bg: 'var(--amber-light)', pulse: true },
      plan_ready:        { label: 'Plan Ready',       color: 'var(--success)',  bg: 'var(--success-bg)' },
      generation_failed: { label: 'Generation Failed',color: 'var(--error)',    bg: 'var(--error-bg)' },
      revision_ready:    { label: 'Review Ready',     color: 'var(--amber)',    bg: 'var(--amber-light)', pulse: true },
      approved:          { label: 'Preparing PDF',    color: 'var(--amber)',    bg: 'var(--amber-light)', pulse: true },
      pdf_ready:         { label: 'PDF Ready',        color: 'var(--success)',  bg: 'var(--success-bg)' },
      pdf_failed:        { label: 'PDF Failed',       color: 'var(--error)',    bg: 'var(--error-bg)' },
    },
    actions: [
      { id: 'view-progress', label: 'View Progress →', type: 'link', href: '/planner/building/{id}',                condition: 'status == generating',                                               variant: 'gold'  },
      { id: 'view-plan',     label: 'View Plan →',     type: 'link', href: '/planner/{id}',                         condition: 'status != generating',                                              variant: 'gold'  },
      { id: 'download-pdf',  label: 'Download PDF',    type: 'link', href: '/api/planner/{id}/download/pdf',        condition: 'pdf_r2_key OR status == pdf_ready',                                  variant: 'green' },
      { id: 'request-edits', label: 'Request Edits',   type: 'link', href: '/planner/{id}#feedback',                condition: 'status == plan_ready OR status == approved OR status == revision_ready OR has_plan', variant: 'gold' },
      { id: 'delete',        label: 'Delete',          type: 'danger', endpoint: '/api/planner/{id}', method: 'DELETE', confirmMessage: 'Delete this itinerary? This cannot be undone.', condition: 'always' },
    ],
  },

  comp_draft: {
    label: 'Comp Draft',
    icon: '⊞',
    accentColor: '#2A5A8A',
    statusBadges: {
      draft: { label: 'Draft', color: '#2A5A8A', bg: 'rgba(42,90,138,0.12)' },
    },
    actions: [
      { id: 'continue',  label: 'Continue Editing →', type: 'link',   href: '/comp-studio?draft={id}',             condition: 'always', variant: 'gold' },
      { id: 'export-jpg',label: 'Export JPG',         type: 'link',   href: '/comp-studio?draft={id}&export=jpg',  condition: 'always', variant: 'ghost' },
      { id: 'delete',    label: 'Delete',             type: 'danger', endpoint: '/api/comp-studio/drafts/{id}', method: 'DELETE', confirmMessage: 'Delete this comp draft? This cannot be undone.', condition: 'always' },
    ],
  },

  email: {
    label: 'Email',
    icon: '✉',
    accentColor: 'var(--accent-email)',
    statusBadges: {
      queued:    { label: 'Queued',      color: 'var(--amber)',   bg: 'var(--amber-light)' },
      rendering: { label: 'Rendering',   color: 'var(--amber)',   bg: 'var(--amber-light)', pulse: true },
      ready:     { label: 'Ready',       color: 'var(--success)', bg: 'var(--success-bg)' },
      failed:    { label: 'Failed',      color: 'var(--error)',   bg: 'var(--error-bg)' },
    },
    actions: [
      { id: 'view',         label: 'View Rendered Email', type: 'link',   href: '/email-preview/{id}',                    condition: 'email_status == ready', variant: 'gold'  },
      { id: 'download-html',label: 'Download HTML',       type: 'link',   href: '/api/submissions/{id}/email',            condition: 'email_status == ready', variant: 'gold'  },
      { id: 'download-txt', label: 'Download .txt',       type: 'link',   href: '/api/submissions/{id}/email-txt',        condition: 'email_status == ready', variant: 'ghost' },
      { id: 'delete',       label: 'Delete',              type: 'danger', endpoint: '/api/submissions/{id}', method: 'DELETE', confirmMessage: 'Delete this email? This cannot be undone.', condition: 'always' },
    ],
  },

  infographic: {
    label: 'Infographic',
    icon: '▥',
    accentColor: 'var(--accent-infographic)',
    statusBadges: {
      queued:     { label: 'Queued',    color: 'var(--amber)',   bg: 'var(--amber-light)' },
      generating: { label: 'Building',  color: 'var(--amber)',   bg: 'var(--amber-light)', pulse: true },
      ready:      { label: 'Ready',     color: 'var(--success)', bg: 'var(--success-bg)' },
      failed:     { label: 'Failed',    color: 'var(--error)',   bg: 'var(--error-bg)' },
    },
    actions: [
      { id: 'download',     label: 'Download Infographic', type: 'link',   href: '/api/submissions/{id}/download/infographic', condition: 'infographic_r2_key', variant: 'gold' },
      { id: 'view-sources', label: 'View Citations',       type: 'panel',  panel: 'citations',                                 condition: 'infographic_sources',  variant: 'ghost' },
      { id: 'delete',       label: 'Delete',               type: 'danger', endpoint: '/api/submissions/{id}', method: 'DELETE', confirmMessage: 'Delete this infographic? This cannot be undone.', condition: 'always' },
    ],
  },

  saved_prompt: {
    label: 'Prompt',
    icon: '✍',
    accentColor: '#7A4A2A',
    statusBadges: {
      ready: { label: 'Ready', color: '#7A4A2A', bg: 'rgba(122,74,42,0.12)' },
    },
    actions: [
      { id: 'copy',   label: 'Copy Prompt',      type: 'action', endpoint: 'prompt-copy',                            condition: 'always', variant: 'gold'  },
      { id: 'view',   label: 'View Conversation', type: 'panel', panel: 'prompt-conversation',                       condition: 'always', variant: 'ghost' },
      { id: 'delete', label: 'Delete',           type: 'danger', endpoint: '/api/prompt-builder/{id}', method: 'DELETE', confirmMessage: 'Delete this saved prompt?', condition: 'always' },
    ],
  },

  press_release: {
    label: 'Press Release',
    icon: '✦',
    accentColor: '#2A6B8A',
    statusBadges: {
      draft:     { label: 'Draft',     color: 'var(--text-mid)', bg: 'var(--border)' },
      generating:{ label: 'Generating',color: 'var(--amber)',    bg: 'var(--amber-light)', pulse: true },
      ready:     { label: 'Ready',     color: 'var(--success)',  bg: 'var(--success-bg)' },
      published: { label: 'Published', color: 'var(--success)',  bg: 'var(--success-bg)' },
      failed:    { label: 'Failed',    color: 'var(--error)',    bg: 'var(--error-bg)' },
    },
    actions: [
      { id: 'view',         label: 'View',         type: 'link',   href: '/press-release?id={id}',                 condition: 'status == ready OR status == published', variant: 'gold'  },
      { id: 'edit',         label: 'Edit',         type: 'link',   href: '/press-release?id={id}',                 condition: 'always',                                 variant: 'ghost' },
      { id: 'export-pdf',   label: 'Export PDF',   type: 'action', endpoint: 'press-release-export-pdf',          condition: 'status == ready OR status == published', variant: 'gold'  },
      { id: 'export-docx',  label: 'Export DOCX',  type: 'action', endpoint: 'press-release-export-docx',         condition: 'status == ready OR status == published', variant: 'gold'  },
      { id: 'delete',       label: 'Delete',       type: 'danger', endpoint: '/api/press-release/{id}', method: 'DELETE', confirmMessage: 'Delete this press release?', condition: 'always' },
    ],
  },

  brief: {
    label: 'Brief',
    icon: '◈',
    accentColor: '#6B4A8A',
    statusBadges: {
      draft:      { label: 'Draft',      color: 'var(--text-mid)', bg: 'var(--border)' },
      generating: { label: 'Generating', color: 'var(--amber)',    bg: 'var(--amber-light)', pulse: true },
      ready:      { label: 'Ready',      color: 'var(--success)',  bg: 'var(--success-bg)' },
      failed:     { label: 'Failed',     color: 'var(--error)',    bg: 'var(--error-bg)' },
    },
    actions: [
      { id: 'view',        label: 'View',        type: 'link',   href: '/brief-builder?id={id}',          condition: 'status == ready',                            variant: 'gold'  },
      { id: 'edit',        label: 'Edit',        type: 'link',   href: '/brief-builder?id={id}',          condition: 'always',                                     variant: 'ghost' },
      { id: 'export-pdf',  label: 'Export PDF',  type: 'action', endpoint: 'brief-export-pdf',            condition: 'status == ready',                            variant: 'gold'  },
      { id: 'export-docx', label: 'Export DOCX', type: 'action', endpoint: 'brief-export-docx',           condition: 'status == ready',                            variant: 'gold'  },
      { id: 'delete',      label: 'Delete',      type: 'danger', endpoint: '/api/brief-builder/{id}', method: 'DELETE', confirmMessage: 'Delete this brief?', condition: 'always' },
    ],
  },

  presentation: {
    label: 'Presentation',
    icon: '▦',
    accentColor: 'var(--accent-presentation)',
    statusBadges: {
      queued:    { label: 'Queued',    color: 'var(--amber)',   bg: 'var(--amber-light)' },
      rendering: { label: 'Building',  color: 'var(--amber)',   bg: 'var(--amber-light)', pulse: true },
      ready:     { label: 'Ready',     color: 'var(--success)', bg: 'var(--success-bg)' },
      failed:    { label: 'Failed',    color: 'var(--error)',   bg: 'var(--error-bg)' },
    },
    actions: [
      { id: 'download-pptx', label: 'Download PPTX', type: 'link',   href: '/api/submissions/{id}/presentation',     condition: 'presentation_status == ready', variant: 'gold'  },
      { id: 'delete',        label: 'Delete',        type: 'danger', endpoint: '/api/submissions/{id}', method: 'DELETE', confirmMessage: 'Delete this presentation? This cannot be undone.', condition: 'always' },
    ],
  },
};

// ─── evalCondition ─────────────────────────────────────────────────────────
// Supports: always | field | field == value | field != value | A AND B |
//           A OR B | NOT A | parentheses.
// Truthy field = value is present and not 0/empty/false.

type Record = { [key: string]: any };

function lookup(record: Record, key: string): any {
  const parts = key.split('.');
  let cur: any = record;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

function truthy(v: any): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') return v.length > 0 && v !== '0' && v !== 'false';
  return !!v;
}

function cmpEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  return String(a) === String(b);
}

// Tokenize the expression: words, parens, operators. `==`, `!=` treated as
// atomic tokens.
function tokenize(expr: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < expr.length) {
    const c = expr[i];
    if (c === ' ' || c === '\t') { i++; continue; }
    if (c === '(' || c === ')') { out.push(c); i++; continue; }
    if (expr.startsWith('==', i)) { out.push('=='); i += 2; continue; }
    if (expr.startsWith('!=', i)) { out.push('!='); i += 2; continue; }
    // read word
    let j = i;
    while (j < expr.length && !' \t()'.includes(expr[j])) {
      if (expr.startsWith('==', j) || expr.startsWith('!=', j)) break;
      j++;
    }
    out.push(expr.slice(i, j));
    i = j;
  }
  return out;
}

// Recursive descent: expr = or_expr; or_expr = and_expr (OR and_expr)*;
// and_expr = not_expr (AND not_expr)*; not_expr = [NOT] atom;
// atom = '(' expr ')' | comparison | literal
function parse(tokens: string[], record: Record): boolean {
  let pos = 0;
  function peek() { return tokens[pos]; }
  function eat() { return tokens[pos++]; }

  function parseAtom(): boolean {
    const t = peek();
    if (t === '(') {
      eat();
      const v = parseOr();
      if (peek() === ')') eat();
      return v;
    }
    // comparison: field == value or field != value
    const left = eat();
    if (peek() === '==') { eat(); const right = eat(); return cmpEqual(lookup(record, left), right); }
    if (peek() === '!=') { eat(); const right = eat(); return !cmpEqual(lookup(record, left), right); }
    if (left === 'always') return true;
    if (left === 'true')   return true;
    if (left === 'false')  return false;
    return truthy(lookup(record, left));
  }
  function parseNot(): boolean {
    if (peek() === 'NOT') { eat(); return !parseAtom(); }
    return parseAtom();
  }
  function parseAnd(): boolean {
    let v = parseNot();
    while (peek() === 'AND') { eat(); v = parseNot() && v; }
    return v;
  }
  function parseOr(): boolean {
    let v = parseAnd();
    while (peek() === 'OR') { eat(); const r = parseAnd(); v = v || r; }
    return v;
  }
  return parseOr();
}

export function evalCondition(condition: string, record: Record): boolean {
  if (!condition || condition === 'always') return true;
  try {
    return parse(tokenize(condition), record);
  } catch {
    return false;
  }
}

// Expand {id} style placeholders in hrefs and endpoints.
export function renderTemplate(template: string, record: Record): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => {
    const v = record[k];
    return v == null ? '' : String(v);
  });
}
