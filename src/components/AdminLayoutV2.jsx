// AdminLayoutV2 — wraps admin sub-pages with a local top-nav tab bar under
// the .ds-v2 class. Keeps the existing admin pages (AdminBrandBible,
// AdminFeatures, AdminBugs, AdminHosts, CompStudio, AtomicComp) reachable via
// the same routes they already had — this layout just renders the active one
// inside a framed shell.

const ADMIN_TABS = [
  { path: '/admin',                      label: 'Overview' },
  { path: '/admin/brand-bible',          label: 'Brand Bible' },
  { path: '/admin/features',             label: 'Features' },
  { path: '/admin/bugs',                 label: 'Bugs' },
  { path: '/admin/hosts',                label: 'Hosts' },
  { path: '/admin/comp-studio',          label: 'Comp Studio' },
  { path: '/admin/atomic-comp-original', label: 'Original Atomic Comp' },
];

export default function AdminLayoutV2({ page, navigate, children }) {
  return (
    <div className="ds-v2" style={{ background: 'var(--bg)', minHeight: '100%' }}>
      <div style={{
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        padding: '14px 24px 0',
      }}>
        <div className="ds-v2-page__eyebrow">// SUBMOA · ADMIN</div>
        <h1 className="t-h1" style={{ marginTop: 4, marginBottom: 14 }}>Admin</h1>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {ADMIN_TABS.map(tab => {
            const active = page === tab.path;
            return (
              <button
                key={tab.path}
                type="button"
                onClick={() => navigate(tab.path)}
                style={{
                  padding: '8px 14px',
                  fontFamily: 'var(--font-sans)',
                  fontSize: 13,
                  fontWeight: active ? 600 : 500,
                  color: active ? 'var(--ink)' : 'var(--ink-mid)',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: `2px solid ${active ? 'var(--amber)' : 'transparent'}`,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>
      <div style={{ padding: '0' }}>
        {children}
      </div>
    </div>
  );
}

export function AdminOverviewV2({ navigate }) {
  const cards = [
    { path: '/admin/brand-bible', label: 'Brand Bible', desc: 'Tokens, type scale, brand rules.' },
    { path: '/admin/features',    label: 'Features',    desc: 'Feature specs, behavior notes.' },
    { path: '/admin/bugs',        label: 'Bugs',        desc: 'Open bugs and triage.' },
    { path: '/admin/hosts',       label: 'Hosts',       desc: 'Podcast host profiles.' },
    { path: '/admin/comp-studio', label: 'Comp Studio', desc: 'Legacy comp studio for super-admin work.' },
    { path: '/admin/atomic-comp-original', label: 'Original Atomic Comp', desc: 'Archived editor, still reachable via URL.' },
  ];
  return (
    <div className="ds-v2-page">
      <div className="ds-v2-page__header">
        <div>
          <div className="ds-v2-page__eyebrow">// ADMIN OVERVIEW</div>
          <h2 className="t-h2">All tools, one hub.</h2>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
        {cards.map(c => (
          <button
            key={c.path}
            type="button"
            className="v2-card"
            onClick={() => navigate(c.path)}
            style={{ height: 140, textAlign: 'left', cursor: 'pointer' }}
          >
            <div className="t-mono-label">{c.label}</div>
            <div className="t-body-sm" style={{ color: 'var(--ink-mid)', marginTop: 6 }}>{c.desc}</div>
            <div style={{ flex: 1 }} />
            <div className="t-mono-tiny" style={{ color: 'var(--amber)' }}>OPEN →</div>
          </button>
        ))}
      </div>
    </div>
  );
}
