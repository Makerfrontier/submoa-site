// Recents grid for AtomicEmail empty state. 3-col responsive grid.

export default function RecentsGrid({ projects, onPick }) {
  if (!projects?.length) return null;
  return (
    <div style={{ marginTop: 24 }}>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.12em',
        textTransform: 'uppercase', color: 'var(--ink-light)', fontWeight: 500,
        marginBottom: 12,
      }}>// RECENT PROJECTS</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
        {projects.map((p) => (
          <button key={p.id} type="button" onClick={() => onPick(p.id)} style={{
            padding: 12,
            background: 'var(--surface)',
            border: '1px solid var(--border)', borderRadius: 6,
            cursor: 'pointer', textAlign: 'left',
            display: 'flex', flexDirection: 'column', gap: 6,
            height: 132,
          }}>
            <div style={{
              fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 500, color: 'var(--ink)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{p.name || 'Untitled'}</div>
            {p.source_filename && (
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-light)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{p.source_filename}</div>
            )}
            <div style={{ flex: 1 }} />
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-light)',
            }}>{timeAgo(p.updated_at)}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function timeAgo(ts) {
  if (!ts) return '';
  const s = Math.floor((Date.now() - Number(ts)) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  if (s < 86400) return `${Math.floor(s/3600)}h ago`;
  return `${Math.floor(s/86400)}d ago`;
}
