// Top bar for the preview pane — desktop/mobile width + light/dark theme +
// fullscreen toggle. Caller owns state.

export default function PreviewToolbar({
  width, setWidth,
  theme, setTheme,
  fullscreen, setFullscreen,
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '8px 12px',
      background: 'var(--surface)',
      border: '1px solid var(--border)', borderRadius: 6,
    }}>
      <Toggle label="Width">
        <Pill on={width === 'desktop'} onClick={() => setWidth('desktop')}>Desktop</Pill>
        <Pill on={width === 'mobile'}  onClick={() => setWidth('mobile')}>Mobile</Pill>
      </Toggle>

      <div style={{ flex: 1 }} />

      <Toggle label="Theme">
        <Pill on={theme === 'light'} onClick={() => setTheme('light')}>Light</Pill>
        <Pill on={theme === 'dark'}  onClick={() => setTheme('dark')}>Dark</Pill>
      </Toggle>

      <button type="button" onClick={() => setFullscreen(!fullscreen)} style={iconBtn} aria-label="Toggle fullscreen">
        {fullscreen ? '⛶ Exit' : '⛶ Fullscreen'}
      </button>
    </div>
  );
}

function Toggle({ label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em',
        textTransform: 'uppercase', color: 'var(--ink-light)',
      }}>{label}</span>
      <div style={{ display: 'flex', border: '1px solid var(--border-strong)', borderRadius: 4, overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  );
}

function Pill({ on, onClick, children }) {
  return (
    <button type="button" onClick={onClick} style={{
      padding: '5px 10px',
      background: on ? 'var(--amber-soft)' : 'var(--surface)',
      color: on ? 'var(--amber-dark)' : 'var(--ink-mid)',
      border: 0,
      fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: on ? 500 : 400,
      cursor: 'pointer',
    }}>{children}</button>
  );
}

const iconBtn = {
  padding: '5px 10px',
  background: 'var(--surface)',
  border: '1px solid var(--border-strong)',
  borderRadius: 4,
  fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--ink)',
  cursor: 'pointer',
};
