# BRAND BIBLE v2 — Locked 2026-04-23

**Status:** Active for Sidebar, Atomic Reactor, Dashboard, Admin. All other surfaces continue on v1 until migrated.

**Scoping rule:** v2 tokens live under the `.ds-v2` class (see `src/styles/tokens-v2.css`). Applying `.ds-v2` to a page opts it into the v2 palette and type stack. Nothing at `:root` is overridden, so v1 pages render unchanged.

---

## Color tokens

```
--bg: #F4F1EA              page background — warm paper
--surface: #FFFFFF         cards, widgets, surfaces
--surface-alt: #FAF7F0     inset surfaces, hover states
--border: #E2DDD0          default borders, dividers
--border-strong: #D8D2C2   input borders, emphasis

--ink: #1A1F2E             primary text, sidebar, dark surfaces
--ink-mid: #6B6354         secondary text
--ink-light: #8A8270       tertiary text, meta
--ink-faint: #A39B85       placeholders, disabled

--amber: #E8843D           primary accent — CTAs, active states, brand mark
--amber-dark: #D67429      amber hover
--amber-soft: #FFF7E8      amber tint backgrounds

--success: #4A9B6E         positive deltas, success states
--warning: #C18B2C         warnings
--danger:  #B84444         errors, destructive

--sidebar-bg: #1A1F2E
--sidebar-text: #E8E4DA
--sidebar-text-dim: rgba(232,228,218,0.65)
--sidebar-text-faint: rgba(232,228,218,0.4)
--sidebar-border: rgba(232,228,218,0.08)
```

## Type stack

```
--font-sans: 'Space Grotesk', -apple-system, sans-serif
--font-mono: 'JetBrains Mono', 'SF Mono', Menlo, monospace
```

Loaded from Google Fonts in `index.html`.

## Type scale

```
display:    Space Grotesk · 500 · 36px · lh 1.15 · ls -0.02em · var(--ink)
h1:         Space Grotesk · 500 · 28px · lh 1.2  · ls -0.01em · var(--ink)
h2:         Space Grotesk · 500 · 22px · lh 1.25 · ls -0.005em · var(--ink)
h3:         Space Grotesk · 500 · 18px · lh 1.3  · ls normal · var(--ink)
body:       Space Grotesk · 400 · 14px · lh 1.55 · ls normal · var(--ink)
body-sm:    Space Grotesk · 400 · 13px · lh 1.5  · ls normal · var(--ink)
button:     Space Grotesk · 500 · 13px · lh 1    · ls normal · var(--ink)

eyebrow:    JetBrains Mono · 500 · 11px · lh 1.2 · ls 0.16em · var(--amber)
mono-label: JetBrains Mono · 500 · 11px · lh 1.2 · ls 0.08em · var(--ink)
mono-meta:  JetBrains Mono · 400 · 10px · lh 1.4 · ls 0.04em · var(--ink-light)
mono-tiny:  JetBrains Mono · 500 ·  9px · lh 1.2 · ls 0.08em · var(--ink-light)
```

## Hard rules

1. **One accent** — amber. Never combine with other accent colors.
2. **Status colors are semantic only** — green for positive, red for errors, yellow for warnings. Never decorative.
3. **No glows, no halftone, no gradients** on UI surfaces. Subtle gradients allowed only on Atomic Flash thumbnail placeholders.
4. **Cards have fixed dimensions per type.** Stat cards 88px. Standard widgets 280px or 340px. Quick Generate auto. Never invent sizes.
5. **All text content inside cards must use `white-space: nowrap; overflow: hidden; text-overflow: ellipsis`** for single-line, or `-webkit-line-clamp` for multi-line. Content never overflows its container.
6. **Mono labels for system/technical text** — page eyebrows, widget titles, meta, timestamps, category labels. Body copy uses Space Grotesk.
7. **Lowercase nav + crumbs. Capitalized titles in cards.**
8. **No emoji as functional icons.** Inline SVG, 14px square, 1.2px stroke, `currentColor`.

## v1 deprecation

v1 (`Playfair Display` + `DM Sans` + warm cream/green) remains the default on every page that does not apply `.ds-v2`. Migrate pages to v2 one at a time; do not `:root`-override v1 tokens.
