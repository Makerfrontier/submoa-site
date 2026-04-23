// PageShell — shared v2 page frame. Every feature page wraps its content
// in this so chrome, spacing, type, and max-width stay consistent.
//
// Props:
//   eyebrow   — amber JetBrains Mono 11px line above title (e.g. "// BUILD ARTICLE")
//   title     — Space Grotesk 500 28px page title
//   subtitle  — 14px --ink-mid descriptor under the title
//   actions   — right-aligned node in the header row (buttons, pills, links)
//   children  — the page body; content is ALWAYS top-aligned, no vertical centering
//
// Layout:
//   32px top padding, 40/16px side (desktop/mobile), max-width 1180px centered.
//   24px gap between header block and children.

export default function PageShell({ eyebrow, title, subtitle, actions, children }) {
  return (
    <div className="v2-page">
      {(eyebrow || title || subtitle || actions) && (
        <div className="v2-page__header">
          <div className="v2-page__header-main">
            {eyebrow && <div className="v2-page__eyebrow">{eyebrow}</div>}
            {title && <h1 className="v2-page__title">{title}</h1>}
            {subtitle && <p className="v2-page__subtitle">{subtitle}</p>}
          </div>
          {actions && <div className="v2-page__header-actions">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
