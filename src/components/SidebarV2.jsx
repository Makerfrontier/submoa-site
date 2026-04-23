// Sidebar v2 — dark navy, six categories, under the .ds-v2 class.
// All text is routed through clip-1 so overflow ellipses instead of wraps.
// Mobile: collapses to a hamburger drawer below 1024px.
//
// Receives the current `page`, the `navigate` fn, `user`, and `access` grants
// straight from App.jsx so it plays with the existing custom router. The
// only global state it owns is drawer open/closed.

import { useEffect, useState } from 'react';

const CATEGORIES = [
  { id: 'writing', label: 'WRITING', items: [
    { path: '/author',             label: 'Article',            icon: 'article' },
    { path: '/press-release',      label: 'Press Release',      icon: 'press' },
    { path: '/brief-builder',      label: 'Brief Builder',      icon: 'brief' },
    { path: '/youtube-transcript', label: 'YouTube Transcribe', icon: 'video' },
  ]},
  { id: 'creative', label: 'CREATIVE', items: [
    { path: '/atomic/images', label: 'Atomic Flash', icon: 'flash' },
    { path: '/atomic/comp',   label: 'Atomic Comp',  icon: 'grid'  },
  ]},
  { id: 'audio', label: 'AUDIO', items: [
    { path: '/listen',         label: 'Quark Cast',    icon: 'podcast' },
    { path: '/podcast-studio', label: 'Podcast Studio', icon: 'mic'    },
    { path: '/tts',            label: 'TTS Studio',    icon: 'wave'   },
  ]},
  { id: 'professional', label: 'PROFESSIONAL', items: [
    { path: '/brief/presentation', label: 'PowerPoint',    icon: 'deck' },
    { path: '/brief/email',        label: 'Email Builder', icon: 'mail' },
  ]},
  { id: 'intelligence', label: 'INTELLIGENCE', items: [
    { path: '/legislative-intelligence', label: 'Atomic Politics', icon: 'scale',   gate: 'legislative-intelligence' },
    { path: '/prompt-builder',           label: 'Prompt Builder',  icon: 'prompt' },
    { path: '/brief/infographic',        label: 'Infographic',     icon: 'chart'  },
  ]},
  { id: 'organization', label: 'ORGANIZATION', items: [
    { path: '/planner', label: 'Planner', icon: 'calendar' },
  ]},
];

export default function SidebarV2({ page, navigate, user, access }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => { setDrawerOpen(false); }, [page]);

  const isSuperAdmin = !!(user && (user.role === 'super_admin' || user.super_admin));
  const hasAccess = (pageKey, actionKey = 'view') => {
    if (!access) return false;
    if (access.super_admin || access.all_access) return true;
    return (access.grants || []).some(g => g.page_key === pageKey && g.action_key === actionKey);
  };

  const isActive = (path) => {
    if (!page) return false;
    if (page === path) return true;
    // Podcast Studio has nested routes
    if (path === '/podcast-studio' && page.startsWith('/podcast-studio/')) return true;
    if (path === '/atomic/comp' && page.startsWith('/atomic/comp/')) return true;
    if (path === '/admin' && page.startsWith('/admin')) return true;
    return false;
  };

  const go = (path) => {
    navigate(path);
    setDrawerOpen(false);
  };

  const initials = (user?.name || user?.email || '?').trim().charAt(0).toUpperCase();

  return (
    <>
      <header className="ds-v2-topbar" role="banner">
        <button
          type="button"
          className="ds-v2-topbar__ham"
          aria-label="Open menu"
          onClick={() => setDrawerOpen(true)}
        >
          <svg width="22" height="18" viewBox="0 0 22 18" fill="none" aria-hidden="true">
            <path d="M1 1h20M1 9h20M1 17h20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
        <button
          type="button"
          className="ds-v2-topbar__brand"
          onClick={() => go(user ? '/reactor' : '/')}
        >
          submoa<span className="dot">.</span>
        </button>
        <span style={{ width: 44 }} aria-hidden />
      </header>

      <div
        className={`ds-v2-drawer-overlay${drawerOpen ? ' is-open' : ''}`}
        onClick={() => setDrawerOpen(false)}
        aria-hidden
      />
      <aside className={`ds-v2-sidebar${drawerOpen ? ' is-open' : ''}`}>
        <button
          type="button"
          className="ds-v2-sidebar__brand"
          onClick={() => go(user ? '/reactor' : '/')}
          aria-label="SubMoa"
        >
          submoa<span className="dot">.</span>
        </button>

        <button
          type="button"
          className="ds-v2-sidebar__cta"
          onClick={() => go('/reactor')}
        >
          <span>Atomic Reactor</span>
          <span className="arrow">→</span>
        </button>

        <nav className="ds-v2-sidebar__nav" aria-label="Primary">
          <button
            type="button"
            className={`ds-v2-sidebar__link${isActive('/dashboard') ? ' is-active' : ''}`}
            onClick={() => go('/dashboard')}
          >
            <NavIcon name="dashboard" />
            <span>Dashboard</span>
          </button>

          {CATEGORIES.map(cat => {
            const visible = cat.items.filter(it => !it.gate || hasAccess(it.gate));
            if (visible.length === 0) return null;
            return (
              <div key={cat.id}>
                <div className="ds-v2-sidebar__category">{cat.label}</div>
                {visible.map(it => (
                  <button
                    type="button"
                    key={it.path}
                    className={`ds-v2-sidebar__link${isActive(it.path) ? ' is-active' : ''}`}
                    onClick={() => go(it.path)}
                  >
                    <NavIcon name={it.icon} />
                    <span>{it.label}</span>
                  </button>
                ))}
              </div>
            );
          })}

          {isSuperAdmin && (
            <>
              <div className="ds-v2-sidebar__divider" />
              <button
                type="button"
                className={`ds-v2-sidebar__link${isActive('/admin') ? ' is-active' : ''}`}
                onClick={() => go('/admin')}
              >
                <NavIcon name="admin" />
                <span>Admin</span>
              </button>
            </>
          )}
        </nav>

        <button
          type="button"
          className="ds-v2-sidebar__footer"
          onClick={() => go('/account')}
          aria-label="Account"
        >
          <span className="ds-v2-sidebar__avatar">{initials}</span>
          <span>Account</span>
        </button>
      </aside>
    </>
  );
}

// Monoline SVG icons — 14px square, 1.2 stroke, currentColor. Keep every
// icon shape simple so the whole sidebar reads as one family.
function NavIcon({ name }) {
  const s = { width: 14, height: 14, viewBox: '0 0 14 14', fill: 'none', strokeWidth: 1.2, stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (name) {
    case 'dashboard': return (<svg {...s}><rect x="1" y="1" width="5" height="6" /><rect x="8" y="1" width="5" height="3" /><rect x="1" y="9" width="5" height="4" /><rect x="8" y="6" width="5" height="7" /></svg>);
    case 'article':   return (<svg {...s}><path d="M3 1h6l3 3v9H3z" /><path d="M5 6h5M5 8.5h5M5 11h3" /></svg>);
    case 'press':     return (<svg {...s}><path d="M2 4h7l3 3v5H2z" /><path d="M9 4v3h3" /><path d="M4 9h6" /></svg>);
    case 'brief':     return (<svg {...s}><rect x="2" y="2" width="10" height="10" rx="1.5" /><path d="M4 5h6M4 8h6M4 11h4" /></svg>);
    case 'video':     return (<svg {...s}><rect x="1" y="3" width="9" height="8" rx="1.2" /><path d="M10 6l3-1.5v5L10 8z" /></svg>);
    case 'flash':     return (<svg {...s}><path d="M7 1l-4 7h4l-1 5 4-7H6z" /></svg>);
    case 'grid':      return (<svg {...s}><rect x="1" y="1" width="5" height="5" /><rect x="8" y="1" width="5" height="5" /><rect x="1" y="8" width="5" height="5" /><rect x="8" y="8" width="5" height="5" /></svg>);
    case 'podcast':   return (<svg {...s}><circle cx="7" cy="7" r="5.5" /><circle cx="7" cy="7" r="2.5" /></svg>);
    case 'mic':       return (<svg {...s}><rect x="5" y="1" width="4" height="8" rx="2" /><path d="M2.5 7a4.5 4.5 0 009 0M7 11.5V13" /></svg>);
    case 'wave':      return (<svg {...s}><path d="M1 7h2l1-3 2 6 2-4 1.5 3 1.5-2h2" /></svg>);
    case 'deck':      return (<svg {...s}><rect x="1" y="2" width="12" height="8" rx="1.2" /><path d="M4 12h6" /></svg>);
    case 'mail':      return (<svg {...s}><rect x="1" y="3" width="12" height="8" rx="1.2" /><path d="M1 4l6 4 6-4" /></svg>);
    case 'scale':     return (<svg {...s}><path d="M7 1v11M2 4h10M4 4l-2 4h4zM10 4l-2 4h4z" /></svg>);
    case 'prompt':    return (<svg {...s}><rect x="1" y="2" width="12" height="8" rx="1.5" /><path d="M4 5h6M4 7h4" /></svg>);
    case 'chart':     return (<svg {...s}><path d="M1 13h12M3 10v2M6 7v5M9 4v8M12 9v3" /></svg>);
    case 'calendar':  return (<svg {...s}><rect x="1" y="3" width="12" height="10" rx="1.2" /><path d="M4 1v3M10 1v3M1 6h12" /></svg>);
    case 'admin':     return (<svg {...s}><circle cx="7" cy="5" r="2" /><path d="M2 12c.5-2.5 2.5-4 5-4s4.5 1.5 5 4" /></svg>);
    default:          return (<svg {...s}><circle cx="7" cy="7" r="4" /></svg>);
  }
}
