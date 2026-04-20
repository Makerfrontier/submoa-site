import { useState, useEffect, createContext, useContext, useRef } from 'react'
import { marked } from 'marked'
import Dashboard from './pages/Dashboard'
import AdminDashboard from './pages/AdminDashboard'
import About from './pages/About'
import Platform from './pages/Platform'
import Documentation from './pages/Documentation'
import AuthorFrameworks from './pages/AuthorFrameworks'
import SeoMethodology from './pages/SeoMethodology'
import InfographicBrief from './pages/InfographicBrief'
import PromptBuilder from './pages/PromptBuilder'
import EmailBrief from './pages/EmailBrief'
import EmailPreview from './pages/EmailPreview'
import PresentationBrief from './pages/PresentationBrief'
import Planner, { PlannerDetail } from './pages/Planner'
import PlannerBuilding from './pages/PlannerBuilding'
import CompStudio from './pages/CompStudio'
import AtomicComp from './pages/AtomicComp'
import AtomicCompShare from './pages/AtomicCompShare'
import YouTubeTranscript from './pages/YouTubeTranscript'
import LegislativeIntelligence from './pages/LegislativeIntelligence'
import PressRelease from './pages/PressRelease'
import BriefBuilder from './pages/BriefBuilder'
import AdminBrandBible from './pages/AdminBrandBible'
import AdminFeatures from './pages/AdminFeatures'
import AdminBugs from './pages/AdminBugs'
import BrandBiblePreviewFrame from './pages/BrandBiblePreviewFrame'
import AdminHosts from './pages/AdminHosts'
import TTSStudio from './pages/TTSStudio'
import PodcastStudio from './pages/PodcastStudio'
import QuickPodcast from './pages/QuickPodcast'
import SiteAgentPanel from './components/SiteAgentPanel.jsx'

function ImpersonationBanner({ user, syncUser, navigate }) {
  const stop = async () => {
    try {
      await fetch('/api/admin/impersonate', { method: 'DELETE', credentials: 'include' })
      if (syncUser) await syncUser()
      if (navigate) navigate('/admin'); else window.location.href = '/admin'
    } catch {
      window.location.reload()
    }
  }
  const from = user?.impersonating_from
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, height: 38, zIndex: 1000,
      background: '#8B3A2A', color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16,
      fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600,
      boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
    }}>
      <span>Viewing as <strong>{user?.name || user?.email}</strong>{from ? ` (admin: ${from.name || from.email})` : ''}</span>
      <button onClick={stop} style={{
        padding: '4px 12px', fontSize: 12, fontWeight: 700,
        background: '#fff', color: '#8B3A2A', border: 'none', borderRadius: 6, cursor: 'pointer',
      }}>Return to your account</button>
    </div>
  )
}

function ShareRedirect() {
  useEffect(() => {
    const token = window.location.pathname.split('/share/')[1]
    if (token) window.location.replace(`/api/share/${token}`)
  }, [])
  return <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-light)' }}>Opening…</div>
}

// Strip the first H1/H2 from article markdown (page title already shows it above the divider)
function stripFirstHeading(text) {
  return text.replace(/^#{1,2}\s+[^\n]+\n?/, '')
}

// Extract YouTube video ID from various URL formats
function extractYouTubeVideoId(url) {
  if (!url) return null
  if (/^[a-zA-Z0-9_-]{11}$/.test(url)) return url
  try {
    const parsed = new URL(url)
    if (parsed.hostname.includes('youtube.com')) return parsed.searchParams.get('v')
    if (parsed.hostname === 'youtu.be') return parsed.pathname.slice(1)
    if (parsed.pathname.startsWith('/embed/')) return parsed.pathname.split('/embed/')[1]?.split('?')[0]
    if (parsed.pathname.startsWith('/v/')) return parsed.pathname.split('/v/')[1]?.split('?')[0]
  } catch {}
  return null
}

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

// Render headings with article-h* classes. The first H1 in the markdown IS the
// canonical article title — render it as-is. (Page chrome no longer renders its
// own duplicate title.)
const renderer = new marked.Renderer()
renderer.heading = function(token) {
  const level = token.depth
  const text = token.text
  return `<h${level} class="article-h${level}">${text}</h${level}>`
}
// Rewrite image src: articles/* paths and relative paths → /api/images/serve?path=...
renderer.image = function(token) {
  const src = token.href
  const alt = token.text || ''
  const title = token.title || ''
  let finalSrc = src
  if (src && !src.startsWith('http://') && !src.startsWith('https://') && !src.startsWith('//') && !src.startsWith('/')) {
    finalSrc = `/api/images/serve?path=${src}`
  } else if (src && src.startsWith('articles/')) {
    finalSrc = `/api/images/serve?path=${src}`
  }
  const titleAttr = title ? ` title="${title}"` : ''
  return `<img src="${finalSrc}" alt="${alt}"${titleAttr} loading="lazy" />`
}
marked.setOptions({ renderer })
import './index.css'
import './App.css'

const AuthContext = createContext(null)
function useAuth() { return useContext(AuthContext) }

function usePage() {
  const [page, setPage] = useState(window.location.pathname || '/')
  const navigate = (path) => {
    window.history.pushState({}, '', path)
    setPage(path)
    window.scrollTo(0, 0)
    // Notify global listeners (e.g. NotificationBell popover) so they can react to in-app navigation.
    window.dispatchEvent(new CustomEvent('submoa:navigate', { detail: { path } }))
  }
  return { page, navigate }
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'API error')
  return data
}

// ─── Tag Input ──────────────────────────────────────────────────────────────────
function TagInput({ value, onChange, placeholder }) {
  const [input, setInput] = useState('')
  const tags = (value ? JSON.parse(value) : [])

  const addTag = (tag) => {
    const trimmed = tag.trim().replace(/,$/, '').trim()
    if (!trimmed || tags.includes(trimmed)) return
    const next = [...tags, trimmed]
    onChange(JSON.stringify(next))
  }

  const removeTag = (idx) => {
    const next = tags.filter((_, i) => i !== idx)
    onChange(next.length ? JSON.stringify(next) : '')
  }


  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag(input)
      setInput('')
    } else if (e.key === 'Backspace' && !input && tags.length) {
      removeTag(tags.length - 1)
    }
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: 8, border: '1.5px solid var(--border)', borderRadius: 8, background: 'var(--surface-inp)', minHeight: 44, alignItems: 'center', cursor: 'text' }}
      onClick={() => document.getElementById('tag-input-field')?.focus()}>
      {tags.map((tag, i) => (
        <span key={i} className="tag">
          {i === 0 && <span className="tag-star">★</span>}
          {tag}
          <button type="button" className="tag-remove" onClick={() => removeTag(i)}>×</button>
        </span>
      ))}
      <input
        id="tag-input-field"
        type="text"
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => { if (input.trim()) { addTag(input); setInput('') } }}
        placeholder={tags.length ? '' : placeholder}
        style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 14, color: 'var(--text)', flex: 1, minWidth: 120, padding: '2px 4px', fontFamily: 'inherit' }}
      />
    </div>
  )
}

// ─── Keyword Pills ─────────────────────────────────────────────────────────
function KeywordPills({ keywordsJson }) {
  let tags = []
  if (keywordsJson) {
    try { tags = JSON.parse(keywordsJson) } catch { tags = [] }
  }
  if (!tags.length) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: '0.375rem' }}>
      {tags.map((tag, i) => (
        <span key={i} style={{ fontSize: 11, background: 'var(--green-glow)', color: 'var(--green)', border: '1px solid var(--green-border)', padding: '2px 8px', borderRadius: 100, textTransform: 'lowercase' }}>{tag}</span>
      ))}
    </div>
  )
}

// ─── Logout Button ─────────────────────────────────────────────────────
function LogoutButton() {
  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/';
  }

  return (
    <button onClick={handleLogout} style={{
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      fontSize: '14px',
      color: 'inherit',
      padding: '0',
      textDecoration: 'underline',
      opacity: '0.7'
    }}>
      Sign out
    </button>
  );
}

// ─── Nav ────────────────────────────────────────────────────────────────
// Replace the existing Nav function in App.jsx with this entire block.
// Changes:
//   - Logo larger (48px height)
//   - Link order: Submit Brief · Dashboard · Account · Bell
//   - Bell far right
//   - Sentence case links
//   - Sign out removed from nav (moved to Account page)
//   - LogoutButton removed from nav
//   - Mobile menu updated to match

// Sidebar — used on all authenticated app routes. Marketing pages keep MarketingNav.
function Sidebar({ navigate, page, syncUser }) {
  const { user } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const closeMenu = () => setMenuOpen(false)

  // Access grants for this user — fetched once, used to decide which items
  // (like Legislative Intelligence) should render in the nav.
  const [access, setAccess] = useState({ super_admin: false, all_access: false, grants: [] })
  useEffect(() => {
    if (!user) return
    fetch('/api/access/my', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setAccess(d) })
      .catch(() => {})
  }, [user])

  const navTo = (path) => { navigate(path); closeMenu() }
  const isActive = (path) => page === path

  const initials = (user?.name || user?.email || '?').trim().charAt(0).toUpperCase()
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin' || user?.super_admin || user?.impersonating

  const hasAccess = (pageKey, actionKey = 'view') => {
    if (access.super_admin || access.all_access) return true
    return (access.grants || []).some(g => g.page_key === pageKey && g.action_key === actionKey)
  }

  // `divider: true` entries emit a <div className="sidebar-divider" /> so the
  // nav can have multiple grouped sections in one flat array.
  const items = [
    { path: '/dashboard',          label: 'Dashboard',      icon: <SbIconDashboard /> },
    { path: '/author',             label: 'Build Article',  icon: <SbIconArticle /> },
    { path: '/prompt-builder',     label: 'Prompt Builder', icon: <SbIconPrompt /> },
    { path: '/brief/presentation', label: 'PowerPoint',     icon: <SbIconDeck /> },
    { path: '/brief/email',        label: 'Email Builder',  icon: <SbIconEmail /> },
    { path: '/comp-studio',        label: 'Comp Studio',    icon: <span style={{ fontSize: 14 }}>⊞</span> },
    { path: '/youtube-transcript', label: 'YouTube',        icon: <span style={{ fontSize: 14 }}>▶</span> },
    { path: '/tts',                label: 'TTS Studio',     icon: <span style={{ fontSize: 14 }}>♪</span> },
    { path: '/listen',             label: 'Listen',         icon: <span style={{ fontSize: 14 }}>▷</span> },
    { path: '/podcast-studio',     label: 'Podcast Studio', icon: <span style={{ fontSize: 14 }}>◉</span> },
    { divider: true },
    { path: '/planner',            label: 'Planner',        icon: <span style={{ fontSize: 14 }}>◎</span> },
    { path: '/brief/infographic',  label: 'Infographic',    icon: <SbIconInfographic /> },
    { path: '/press-release',      label: 'Press Release',  icon: <span style={{ fontSize: 14 }}>✦</span> },
    { path: '/brief-builder',      label: 'Brief Builder',  icon: <span style={{ fontSize: 14 }}>◈</span> },
  ]

  const sidebarBody = (
    <>
      <div className="sidebar-eyebrow">✦ SUBMOA ✦</div>
      <div className="sidebar-logo">Sub Moa Content</div>

      <nav className="sidebar-nav" aria-label="Primary">
        {items.map((it, idx) => it.divider ? (
          <div key={`div-${idx}`} className="sidebar-divider" />
        ) : (
          <a
            key={it.path}
            href="#"
            className={`sidebar-link${isActive(it.path) ? ' active' : ''}`}
            onClick={e => { e.preventDefault(); navTo(it.path) }}
          >
            {it.icon}<span>{it.label}</span>
          </a>
        ))}
        <div className="sidebar-divider" />
        {isAdmin && (
          <a
            href="#"
            className={`sidebar-link${isActive('/admin') ? ' active' : ''}`}
            onClick={e => { e.preventDefault(); navTo('/admin') }}
          >
            <SbIconAdmin /><span>Admin</span>
          </a>
        )}
        {isAdmin && (
          <a
            href="#"
            className={`sidebar-link${isActive('/admin/brand-bible') ? ' active' : ''}`}
            onClick={e => { e.preventDefault(); navTo('/admin/brand-bible') }}
          >
            <span style={{ fontSize: 14 }}>✦</span><span>Brand Bible</span>
          </a>
        )}
        {isAdmin && (
          <a
            href="#"
            className={`sidebar-link${isActive('/admin/features') ? ' active' : ''}`}
            onClick={e => { e.preventDefault(); navTo('/admin/features') }}
          >
            <span style={{ fontSize: 14 }}>◈</span><span>Features</span>
          </a>
        )}
        {isAdmin && (
          <a
            href="#"
            className={`sidebar-link${isActive('/admin/bugs') ? ' active' : ''}`}
            onClick={e => { e.preventDefault(); navTo('/admin/bugs') }}
          >
            <span style={{ fontSize: 14 }}>◎</span><span>Bugs</span>
          </a>
        )}
        {isAdmin && (
          <a
            href="#"
            className={`sidebar-link${isActive('/admin/hosts') ? ' active' : ''}`}
            onClick={e => { e.preventDefault(); navTo('/admin/hosts') }}
          >
            <span style={{ fontSize: 14 }}>☺</span><span>Hosts</span>
          </a>
        )}
        {hasAccess('legislative-intelligence') && (
          <a
            href="#"
            className={`sidebar-link${isActive('/legislative-intelligence') ? ' active' : ''}`}
            onClick={e => { e.preventDefault(); navTo('/legislative-intelligence') }}
          >
            <span style={{ fontSize: 14 }}>⚖</span><span>Legislative Intelligence</span>
          </a>
        )}
      </nav>

      <a
        href="#"
        className="sidebar-account"
        onClick={e => { e.preventDefault(); navTo('/account') }}
        aria-label="Account"
      >
        <span className="sidebar-avatar">{initials}</span>
        <span>Account</span>
      </a>
    </>
  )

  return (
    <>
      {/* Fixed mobile/tablet top bar — one element holding the hamburger and
          the notification bell. Flush to viewport top via CSS (safe-area-inset
          honoured). Hidden on desktop; on desktop the hamburger is also hidden
          and the sidebar is always visible on the left. */}
      <header className="app-mobile-topbar" role="banner">
        <button
          type="button"
          className="app-mobile-topbar-hamburger"
          onClick={() => setMenuOpen(true)}
          aria-label="Open menu"
        >
          <svg width="22" height="18" viewBox="0 0 22 18" fill="none" aria-hidden="true">
            <path d="M1 1h20M1 9h20M1 17h20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
        <NotificationBell syncUser={syncUser} />
      </header>

      {/* Legacy floating hamburger — hidden via CSS at mobile/tablet widths
          now that the fixed top bar provides the toggle. Kept for any state
          where the mobile top bar is unavailable. */}
      {!menuOpen && (
        <button
          className="sidebar-hamburger"
          onClick={() => setMenuOpen(true)}
          aria-label="Open menu"
        >
          <svg width="18" height="14" viewBox="0 0 18 14" fill="none">
            <path d="M1 1h16M1 7h16M1 13h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      )}
      <div
        className={`sidebar-overlay${menuOpen ? ' sidebar-overlay--open' : ''}`}
        onClick={closeMenu}
      />
      <aside className={`sidebar${menuOpen ? ' sidebar--open' : ''}`}>
        {sidebarBody}
      </aside>
    </>
  )
}

// Sidebar icons (kept inline, single source of truth)
function SbIconDashboard() { return (<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="1" width="5" height="6" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none"/><rect x="8" y="1" width="5" height="3" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none"/><rect x="1" y="9" width="5" height="4" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none"/><rect x="8" y="6" width="5" height="7" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none"/></svg>) }
function SbIconArticle() { return (<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 1h6l3 3v9H3V1z" stroke="currentColor" strokeWidth="1.2" fill="none"/><path d="M5 6h5M5 8.5h5M5 11h3" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/></svg>) }
function SbIconInfographic() { return (<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="7" width="3" height="6" fill="currentColor" opacity="0.55"/><rect x="5.5" y="4" width="3" height="9" fill="currentColor" opacity="0.78"/><rect x="10" y="1" width="3" height="12" fill="currentColor"/></svg>) }
function SbIconPrompt() { return (<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="1" width="12" height="9" rx="2" stroke="currentColor" strokeWidth="1.2" fill="none"/><path d="M4 5h6M4 7h4" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/><path d="M5 10l-2 3h8l-2-3" stroke="currentColor" strokeWidth="1.2" fill="none"/></svg>) }
function SbIconDeck() { return (<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="1" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="1.2" fill="none"/><rect x="3" y="3" width="5" height="4" rx="1" fill="currentColor" opacity="0.5"/><path d="M9 4h2M9 6h2M3 9h8" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/></svg>) }
function SbIconEmail() { return (<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="3" width="12" height="9" rx="2" stroke="currentColor" strokeWidth="1.2" fill="none"/><path d="M1 5l6 4 6-4" stroke="currentColor" strokeWidth="1.2"/></svg>) }
function SbIconAdmin() { return (<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="4.5" r="2.2" stroke="currentColor" strokeWidth="1.2" fill="none"/><path d="M2 12.5c0-2.5 2.2-4 5-4s5 1.5 5 4" stroke="currentColor" strokeWidth="1.2" fill="none"/></svg>) }

// Determine whether a path uses the sidebar app shell (vs marketing/auth top nav).
function isAppRoute(path) {
  if (!path) return false
  if (path === '/' ||
      path === '/dashboard' || path === '/author' || path === '/account' ||
      path === '/admin'     || path === '/writer' ||
      path === '/admin/brand-bible' || path === '/admin/features' || path === '/admin/bugs' ||
      path === '/admin/hosts' || path === '/tts' ||
      path === '/podcast-studio' || path.startsWith('/podcast-studio/') ||
      path === '/prompt-builder' ||
      path === '/comp-studio' ||
      path === '/youtube-transcript' ||
      path === '/legislative-intelligence' ||
      path === '/press-release' ||
      path === '/brief-builder') return true
  if (path.match(/^\/briefs\/[^/]+\/edit$/)) return true
  if (path.startsWith('/brief/'))         return true
  if (path.startsWith('/content/'))       return true
  if (path.startsWith('/email-preview/')) return true
  if (path === '/planner' || path.startsWith('/planner/')) return true
  return false
}

// Marketing top nav (legacy) — used on /, /about, /login, /register, /reset, /request, etc.
function Nav({ navigate, syncUser }) {
  const { user, loading } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const toggleMenu = () => setMenuOpen(o => !o)
  const closeMenu = () => setMenuOpen(false)
  const [activePath, setActivePath] = useState('')

  useEffect(() => {
    setActivePath(window.location.pathname)
    const handleNav = () => setActivePath(window.location.pathname)
    window.addEventListener('popstate', handleNav)
    return () => window.removeEventListener('popstate', handleNav)
  }, [])

  // navTo updates both page state and active path atomically
  const navTo = (path) => {
    navigate(path)
    setActivePath(path)
  }

  const isActive = (path) => activePath === path ? ' active' : ''

  return (
    <>
      {/* Mobile hamburger — hidden when the drawer is open (the drawer has its own × button) */}
      {!menuOpen && (
        <button className="nav-hamburger" onClick={toggleMenu} aria-label="Toggle menu">
          <span className="hamburger-line" />
          <span className="hamburger-line" />
          <span className="hamburger-line" />
        </button>
      )}

      {/* Mobile menu overlay */}
      <div className={`nav-mobile-overlay${menuOpen ? ' nav-mobile-overlay--open' : ''}`} onClick={closeMenu}>
        <div className="nav-mobile-menu" onClick={e => e.stopPropagation()}>
          <button className="nav-mobile-close" onClick={closeMenu}>×</button>
          <div className="nav-mobile-links">
            {!loading && !user && (
              <>
                <a href="#" onClick={e => { e.preventDefault(); closeMenu(); navTo('/login') }}>Login</a>
              </>
            )}
            {!loading && user && (
              <>
                <a href="#" className={isActive('/') ? 'active' : ''} onClick={e => { e.preventDefault(); closeMenu(); navTo('/') }}>Home</a>
                <a href="#" className={isActive('/author') ? 'active' : ''} onClick={e => { e.preventDefault(); closeMenu(); navTo('/author') }}>Submit brief</a>
                <a href="#" className={isActive('/brief/infographic') ? 'active' : ''} onClick={e => { e.preventDefault(); closeMenu(); navTo('/brief/infographic') }}>Infographic Brief</a>
                <a href="#" className={isActive('/prompt-builder') ? 'active' : ''} onClick={e => { e.preventDefault(); closeMenu(); navTo('/prompt-builder') }}>Prompt Builder</a>
                <a href="#" className={isActive('/brief/email') ? 'active' : ''} onClick={e => { e.preventDefault(); closeMenu(); navTo('/brief/email') }}>Email Builder</a>
                <a href="#" className={isActive('/brief/presentation') ? 'active' : ''} onClick={e => { e.preventDefault(); closeMenu(); navTo('/brief/presentation') }}>Presentation Builder</a>
                <a href="#" className={isActive('/dashboard') ? 'active' : ''} onClick={e => { e.preventDefault(); closeMenu(); navTo('/dashboard') }}>Dashboard</a>
                <a href="#" className={isActive('/account') ? 'active' : ''} onClick={e => { e.preventDefault(); closeMenu(); navTo('/account') }}>Account</a>
                {(user.role === 'admin' || user.role === 'super_admin') && (
                  <a href="#" className={isActive('/admin') ? 'active' : ''} onClick={e => { e.preventDefault(); closeMenu(); navTo('/admin') }}>Admin</a>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Desktop nav */}
      <nav className="nav">
        <div className="container">
          <div className="nav-inner">
            <div className="nav-links">
              {!loading && !user && (
                <>
                  <a href="#" className="nav-link" onClick={e => { e.preventDefault(); navTo('/login') }}>Login</a>
                  <a href="#" className="nav-cta" onClick={e => { e.preventDefault(); navTo('/request') }}>Request access</a>
                </>
              )}
              {!loading && user && (
                <>
                  <a href="#" className={`nav-link${isActive('/')}`} onClick={e => { e.preventDefault(); navTo('/') }}>Home</a>
                  <a href="#" className={`nav-link${isActive('/author')}`} onClick={e => { e.preventDefault(); navTo('/author') }}>Submit brief</a>
                  <a href="#" className={`nav-link${isActive('/brief/infographic')}`} onClick={e => { e.preventDefault(); navTo('/brief/infographic') }}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ marginRight: 4, verticalAlign: 'middle' }}>
                      <rect x="1" y="7" width="3" height="6" fill="currentColor" opacity="0.5"/>
                      <rect x="5.5" y="4" width="3" height="9" fill="currentColor" opacity="0.75"/>
                      <rect x="10" y="1" width="3" height="12" fill="currentColor"/>
                    </svg>
                    Infographic Brief
                  </a>
                  <a href="#" className={`nav-link${isActive('/prompt-builder')}`} onClick={e => { e.preventDefault(); navTo('/prompt-builder') }}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ marginRight: 4, verticalAlign: 'middle' }}>
                      <rect x="1" y="1" width="12" height="9" rx="2" stroke="currentColor" strokeWidth="1" fill="none"/>
                      <path d="M4 5h6M4 7h4" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                      <path d="M5 10l-2 3h8l-2-3" stroke="currentColor" strokeWidth="1" fill="none"/>
                    </svg>
                    Prompt Builder
                  </a>
                  <a href="#" className={`nav-link${isActive('/brief/email')}`} onClick={e => { e.preventDefault(); navTo('/brief/email') }}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ marginRight: 4, verticalAlign: 'middle' }}>
                      <rect x="1" y="3" width="12" height="9" rx="2" stroke="currentColor" strokeWidth="1" fill="none"/>
                      <path d="M1 5l6 4 6-4" stroke="currentColor" strokeWidth="1"/>
                    </svg>
                    Email Builder
                  </a>
                  <a href="#" className={`nav-link${isActive('/brief/presentation')}`} onClick={e => { e.preventDefault(); navTo('/brief/presentation') }}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ marginRight: 4, verticalAlign: 'middle' }}>
                      <rect x="1" y="1" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="1" fill="none"/>
                      <rect x="3" y="3" width="5" height="4" rx="1" fill="currentColor" opacity="0.5"/>
                      <path d="M9 4h2M9 6h2M3 9h8" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                    </svg>
                    Presentation Builder
                  </a>
                  <a href="#" className={`nav-link${isActive('/dashboard')}`} onClick={e => { e.preventDefault(); navTo('/dashboard') }}>Dashboard</a>
                  <a href="#" className={`nav-link${isActive('/account')}`} onClick={e => { e.preventDefault(); navTo('/account') }}>Account</a>
                  {(user.role === 'admin' || user.role === 'super_admin') && (
                    <a href="#" className={`nav-link${isActive('/admin')}`} onClick={e => { e.preventDefault(); navTo('/admin') }}>Admin</a>
                  )}
                  <NotificationBell syncUser={syncUser} />
                </>
              )}
            </div>
          </div>
        </div>
      </nav>
    </>
  )
}

// ─── Footer ────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-inner">
          <div className="footer-brand">
            <img src="/logo.jpg" alt="SubMoa Content" style={{ height: '28px' }} />
            <p>Precision content. Consistency over novelty. A system built to perform, not impress.</p>
          </div>
          <div className="footer-links">
            <div className="footer-col">
              <div className="footer-col-title">Platform</div>
              <ul>
                <li><a href="#">About</a></li>
                <li><a href="#">Documentation</a></li>
                <li><a href="#">Author Frameworks</a></li>
                <li><a href="#">SEO Methodology</a></li>
              </ul>
            </div>
            <div className="footer-col">
              <div className="footer-col-title">Company</div>
              <ul>
                <li><a href="#">Contact</a></li>
                <li><a href="#">Terms</a></li>
                <li><a href="#">Privacy</a></li>
              </ul>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 SubMoa Content. All rights reserved.</span>
          <span>In shooting, Sub MOA means precision. The same applies here.</span>
        </div>
      </div>
    </footer>
  )
}

// ─── Landing ───────────────────────────────────────────────────────────
function Landing({ navigate }) {
  return (
    <div className="page marketing">
      <div style={{
        backgroundImage: 'url(/hero-bg.jpg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        position: 'relative',
        height: 'calc(100vh - 45px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}>
        {/* Dark overlay so text is readable */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(10, 26, 10, 0.55)',
        }} />

        {/* Hero content sits above overlay */}
        <div style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 'clamp(1.5rem, 3vw, 3rem)',
          flexWrap: 'wrap',
          padding: '0 24px',
        }}>
          <img
            src="/logo.png"
            alt="SubMoa Content"
            style={{
              width: 'min(300px, 80vw)',
              height: 'auto',
              objectFit: 'contain',
              imageRendering: '-webkit-optimize-contrast',
              flexShrink: 0,
            }}
          />
          <div>
            <div style={{
              fontFamily: 'Georgia, serif',
              fontSize: 'clamp(2.5rem, 6vw, 5rem)',
              lineHeight: 1.1,
              color: '#ffffff',
              whiteSpace: 'nowrap',
            }}>
              Precision Content at
            </div>
            <div style={{
              fontFamily: 'Georgia, serif',
              fontSize: 'clamp(2.5rem, 6vw, 5rem)',
              lineHeight: 1.1,
              color: '#c8973a',
              whiteSpace: 'nowrap',
            }}>
              Sub-MOA Accuracy
            </div>
          </div>
        </div>
      </div>
      <section className="trust-strip">
        <div className="container">
          <p className="trust-copy">Not another AI writing tool. This is a content production system modeled after real editorial workflows from high-volume media networks.</p>
          <div className="trust-bullets">
            <span>Author-profile driven content generation</span>
            <span className="sep">·</span>
            <span>SEO-first structure baked into every output</span>
            <span className="sep">·</span>
            <span>Scalable across multi-site publishing networks</span>
            <span className="sep">·</span>
            <span>Built from real-world media production systems</span>
          </div>
        </div>
      </section>
      <section className="core-value">
        <div className="container">
          <h2 className="section-title">Built Like a Media Company.<br />Scaled Like Software.</h2>
          <p className="section-body">Sub MOA Content replicates how high-performing editorial teams actually work. Instead of generic prompts, our system uses structured inputs, author voices, and ranking frameworks to produce content that performs in search and reads like it belongs.</p>
          <div className="value-grid">
            <div className="value-card"><div className="value-num">01 — Author</div><h3>Author-Driven Content</h3><p>Your AI doesn't guess tone. It writes through defined author profiles with consistent voice, expertise, and positioning.</p></div>
            <div className="value-card"><div className="value-num">02 — SEO</div><h3>SEO Engineered Output</h3><p>Every piece is structured for discoverability. Headers, entities, topical depth, and internal linking are not optional. They are built in.</p></div>
            <div className="value-card"><div className="value-num">03 — Scale</div><h3>Production at Scale</h3><p>From 1 article to 500 per week, the system holds quality while increasing output.</p></div>
          </div>
        </div>
      </section>
      <section className="how-section" id="how-it-works">
        <div className="container">
          <h2 className="section-title">From Idea to Indexed Content in Minutes</h2>
          <div className="steps-grid">
            <div className="step" data-step="01"><div className="step-num">Step 01</div><h3>Define the Author</h3><p>Create or select an author profile with voice, expertise, and positioning.</p></div>
            <div className="step" data-step="02"><div className="step-num">Step 02</div><h3>Input the Topic</h3><p>Drop in your target keyword, angle, or article concept.</p></div>
            <div className="step" data-step="03"><div className="step-num">Step 03</div><h3>Apply the Framework</h3><p>Our system builds the structure using proven editorial + SEO templates.</p></div>
            <div className="step" data-step="04"><div className="step-num">Step 04</div><h3>Generate &amp; Publish</h3><p>Export ready-to-publish content optimized for ranking and engagement.</p></div>
          </div>
          <div className="cta-center"><button className="btn-primary" onClick={() => navigate('/request')}>Request Access</button></div>
        </div>
      </section>
      <section className="features-section" id="features">
        <div className="container">
          <h2 className="section-title centered">Everything You Need to Scale Content That Ranks</h2>
          <div className="features-grid">
            <div className="feature-card"><h3>Author Profiles</h3><p>Persistent voices that create consistency across hundreds of articles.</p></div>
            <div className="feature-card"><h3>SEO Structuring Engine</h3><p>Automatic heading hierarchy, keyword placement, and topical coverage.</p></div>
            <div className="feature-card"><h3>Editorial Frameworks</h3><p>Pre-built structures for reviews, comparisons, news, and long-form guides.</p></div>
            <div className="feature-card"><h3>Multi-Site Scaling</h3><p>Built for operators managing multiple publications or content verticals.</p></div>
            <div className="feature-card"><h3>Export-Ready Output</h3><p>Clean, formatted content ready for CMS upload.</p></div>
          </div>
        </div>
      </section>
      <section className="diff-section">
        <div className="container">
          <div className="diff-inner">
            <h2 className="section-title">Why Most AI Content Fails</h2>
            <p className="section-body">Most AI content is obvious, thin, and disposable. It lacks structure, authority, and intent.</p>
            <p className="section-body">Sub MOA Content fixes that by combining:</p>
            <ul className="diff-list">
              <li>Real editorial workflows</li>
              <li>Defined author identity</li>
              <li>SEO-first construction</li>
              <li>Consistent production standards</li>
            </ul>
            <p className="diff-closing">This is not AI guessing. This is AI executing.</p>
          </div>
        </div>
      </section>
      <section className="use-section">
        <div className="container">
          <h2 className="section-title centered">Built for Operators Who Need Results</h2>
          <div className="use-grid">
            <div className="use-card"><h3>Media Companies</h3><p>Scale editorial output across multiple sites without increasing headcount.</p></div>
            <div className="use-card"><h3>Affiliate Publishers</h3><p>Generate high-converting product content with consistent structure.</p></div>
            <div className="use-card"><h3>Niche Site Builders</h3><p>Dominate verticals with volume + topical authority.</p></div>
            <div className="use-card"><h3>Agencies</h3><p>Deliver SEO content at scale without sacrificing quality.</p></div>
          </div>
        </div>
      </section>
      <section className="proof-section">
        <div className="container">
          <h2 className="section-title centered">What the Output Looks Like</h2>
          <p className="section-body centered">Structured. Readable. Rankable.</p>
          <div className="cta-center"><button className="btn-secondary">View Sample Articles</button></div>
        </div>
      </section>
      <section className="philosophy-section">
        <div className="container">
          <p className="philosophy-quote">"In shooting, Sub MOA means precision. Consistency. Repeatability. That's exactly what this platform delivers. Not one good article. Not ten. But a system that produces high-quality content over and over again, without drift. We don't chase viral hits. <span>We build content that performs.</span>"</p>
        </div>
      </section>
      <Footer />
    </div>
  )
}

// ─── Login ────────────────────────────────────────────────────────────────
function Login({ navigate, syncUser }) {
  const { fetchUser } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
      await fetchUser()
      await syncUser()
      navigate('/dashboard')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page">
      <div className="container"><div className="form-card">
        <h1 className="form-title">login.</h1>
        <p className="form-sub">Sign in to your dashboard.</p>

        {/* Google SSO button */}
        <a href="/api/auth/google" className="btn-google" style={{ display: 'block', textAlign: 'center', width: '100%', marginBottom: '2rem', color: 'inherit', textDecoration: 'none' }}>
          <svg width="18" height="18" viewBox="0 0 18 18" style={{ marginRight: '0.625rem', flexShrink: 0 }}>
            <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
            <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.123 15.983 5.114 18 9 18z"/>
            <path fill="#FBBC05" d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.347 2.827.957 4.042l3.007-2.332z"/>
            <path fill="#EA4335" d="M9 3.54c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.114 0 2.123 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.54 9 3.54z"/>
          </svg>
          Continue with Google
        </a>

        <form onSubmit={handleSubmit}>
          {error && <p style={{ color: 'var(--error)', fontSize: 13, marginBottom: 16 }}>{error}</p>}
          <div className="form-group"><label className="form-label">Email</label><input type="email" className="form-input" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required /></div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <div style={{ position: 'relative' }}>
              <input type={showPw ? 'text' : 'password'} className="form-input" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required style={{ paddingRight: '2.5rem' }} />
              <button type="button" onClick={() => setShowPw(v => !v)} style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-mid)', fontSize: '1rem', lineHeight: 1, padding: '0.25rem' }}>{showPw ? '👁' : '👁‍🗨'}</button>
            </div>
          </div>
          <button type="submit" className="btn-primary" style={{ width: '100%' }} disabled={loading}>{loading ? 'Signing in...' : 'login'}</button>
          <p className="form-link" style={{ textAlign: 'center', marginTop: '0.75rem' }}><a href="#" onClick={e => { e.preventDefault(); navigate('/reset') }}>Forgot password?</a></p>
          <p className="form-link">Don't have access? <a href="#" onClick={e => { e.preventDefault(); navigate('/request') }}>Request access</a></p>
        </form>
      </div></div></div>
  )
}

// ─── Register (via invite only) ────────────────────────────────────────
function Register({ navigate }) {
  const { fetchUser, syncUser } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [inviteCode, setInviteCode] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await api('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ name, email, password, invite_code: inviteCode }),
      })
      await fetchUser()
      await syncUser()
      navigate('/dashboard')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page">
      <div className="container"><div className="form-card">
        <h1 className="form-title">Create account.</h1>
        <p className="form-sub">An invite code is required to register.</p>

        {/* Google SSO button */}
        <button
          type="button"
          className="btn-google"
          onClick={() => window.location.href = inviteCode ? `/api/auth/google?invite_code=${inviteCode}` : '/api/auth/google'}
          style={{ width: '100%', marginBottom: '1.5rem' }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" style={{ marginRight: '0.625rem', flexShrink: 0 }}>
            <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
            <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.123 15.983 5.114 18 9 18z"/>
            <path fill="#FBBC05" d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.347 2.827.957 4.042l3.007-2.332z"/>
            <path fill="#EA4335" d="M9 3.54c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.114 0 2.123 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.54 9 3.54z"/>
          </svg>
          Continue with Google
        </button>

        <form onSubmit={handleSubmit}>
          {error && <p style={{ color: 'var(--error)', fontSize: 13, marginBottom: 16 }}>{error}</p>}
          <div className="form-group"><label className="form-label">Name</label><input type="text" className="form-input" placeholder="Your name" value={name} onChange={e => setName(e.target.value)} required /></div>
          <div className="form-group"><label className="form-label">Email</label><input type="email" className="form-input" placeholder="you@company.com" value={email} onChange={e => setEmail(e.target.value)} required /></div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <div style={{ position: 'relative' }}>
              <input type={showPw ? 'text' : 'password'} className="form-input" placeholder="Min. 8 characters" value={password} onChange={e => setPassword(e.target.value)} required style={{ paddingRight: '2.5rem' }} />
              <button type="button" onClick={() => setShowPw(v => !v)} style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-mid)', fontSize: '1rem', lineHeight: 1, padding: '0.25rem' }}>{showPw ? '👁' : '👁‍🗨'}</button>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Invite Code</label>
            <input
              type="text"
              className="form-input"
              placeholder="Enter your invite code"
              value={inviteCode}
              onChange={e => setInviteCode(e.target.value.toUpperCase())}
              required
              style={{ fontFamily: 'monospace', letterSpacing: '0.1em', textTransform: 'uppercase' }}
            />
          </div>
          <button type="submit" className="btn-primary" style={{ width: '100%' }} disabled={loading}>{loading ? 'Creating account...' : 'Create account'}</button>
          <p className="form-link">Already have an account? <a href="#" onClick={e => { e.preventDefault(); navigate('/login') }}>login</a></p>
        </form>
      </div></div></div>
  )
}

// ─── Request Access (Name + Email only) ───────────────────────────────
function RequestAccess({ navigate }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api('/api/request-access', { method: 'POST', body: JSON.stringify({ name, email }) })
      setDone(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (done) return (
    <div className="page">
      <div className="container"><div className="form-card">
        <div className="confirm-icon">✓</div>
        <h1 className="confirm-title">Request received.</h1>
        <p className="confirm-sub">We'll review your request and be in touch shortly with next steps.</p>
        <button className="btn-secondary" style={{ width: '100%' }} onClick={() => navigate('/')}>Back to Home</button>
      </div></div></div>
  )

  return (
    <div className="page">
      <div className="container"><div className="form-card">
        <h1 className="form-title">Request access.</h1>
        <p className="form-sub">Tell us who you are and we'll be in touch with next steps.</p>
        <form onSubmit={handleSubmit}>
          {error && <p style={{ color: 'var(--error)', fontSize: 13, marginBottom: 16 }}>{error}</p>}
          <div className="form-group"><label className="form-label">Name</label><input type="text" className="form-input" placeholder="Your name" value={name} onChange={e => setName(e.target.value)} required /></div>
          <div className="form-group"><label className="form-label">Email Address</label><input type="email" className="form-input" placeholder="you@company.com" value={email} onChange={e => setEmail(e.target.value)} required /></div>
          <button type="submit" className="btn-primary" style={{ width: '100%' }} disabled={loading}>{loading ? 'Submitting...' : 'Request Access'}</button>
          <p className="form-link">Already have an account? <a href="#" onClick={e => { e.preventDefault(); navigate('/login') }}>login</a></p>
        </form>
      </div></div></div>
  )
}

// ─── Author (Intake Form) ───────────────────────────────────────────────
// Authors loaded dynamically from /api/authors
const FORMAT_LABELS = {
  'seo-blog': 'SEO Blog Article',
  'llm-blog': 'LLM-Optimized Blog',
  'discover-news': 'Google Discover News',
  'sponsored-review': 'Sponsored Review',
  'unsponsored-review': 'Unsponsored Review',
  'top-10': 'Top 10 List',
  'commerce': 'Commerce Article',
  'affiliate-amazon': 'Affiliate / Amazon',
  'affiliate-general': 'Affiliate / General',
  'howto-technical': 'How-To Guide (Technical)',
  'howto-hillbilly': 'How-To Guide (Hillbilly Engineering)',
  'cornerstone': 'Cornerstone / Evergreen',
  'cornerstone-support': 'Cornerstone Support',
  'blog-general': 'Blog Post',
  'news-discover': 'News / Google Discover',
  'news-syndication': 'News / Syndication',
  'scientific': 'Scientific Research Paper',
  'story': 'Story',
  'quandry': 'Quandry',
  'comparison': 'Comparison Article',
  'buyers-guide': 'Buyers Guide',
  'opinion': 'Opinion / Editorial',
  'faq': 'FAQ Article',
  'roundup': 'Roundup',
  'case-study': 'Case Study',
  'press-release': 'Press Release',
  'seo-search': 'SEO Blog Article',
};

const FORMATS = [
  { id: 'sponsored-review', name: 'Sponsored Review', desc: '' },
  { id: 'unsponsored-review', name: 'Unsponsored Review', desc: '' },
  { id: 'top-10', name: 'Top 10 List', desc: '' },
  { id: 'commerce', name: 'Commerce Article', desc: '' },
  { id: 'affiliate-amazon', name: 'Affiliate / Amazon', desc: '' },
  { id: 'affiliate-general', name: 'Affiliate / General', desc: '' },
  { id: 'howto-technical', name: 'How-To Guide (Technical)', desc: '' },
  { id: 'howto-hillbilly', name: 'How-To Guide (Hillbilly Engineering)', desc: '' },
  { id: 'cornerstone', name: 'Cornerstone / Evergreen', desc: '' },
  { id: 'cornerstone-support', name: 'Cornerstone Support', desc: '' },
  { id: 'blog-general', name: 'Blog Post', desc: '' },
  { id: 'news-discover', name: 'News / Google Discover', desc: '' },
  { id: 'news-syndication', name: 'News / Syndication', desc: '' },
  { id: 'scientific', name: 'Scientific Research Paper', desc: '' },
  { id: 'story', name: 'Story', desc: '' },
  { id: 'quandry', name: 'Quandry', desc: '' },
  { id: 'comparison', name: 'Comparison Article', desc: '' },
  { id: 'buyers-guide', name: "Buyers Guide", desc: '' },
  { id: 'opinion', name: 'Opinion / Editorial', desc: '' },
  { id: 'faq', name: 'FAQ Article', desc: '' },
  { id: 'roundup', name: 'Roundup', desc: '' },
  { id: 'press-release', name: 'Press Release', desc: '' },
  { id: 'case-study', name: 'Case Study', desc: '' },
]
const VOCAL_TONES = [
  { id: 'expert', label: 'Expert: Authoritative, confident, precise' },
  { id: 'professional', label: 'Professional: Neutral, polished, corporate' },
  { id: 'analytical', label: 'Analytical: Logical, data-driven, structured' },
  { id: 'educational', label: 'Educational: Clear, explanatory, teaching-focused' },
  { id: 'technical', label: 'Technical: Detailed, system-focused, precise' },
  { id: 'scientific', label: 'Scientific: Formal, evidence-oriented, cautious' },
  { id: 'journalistic', label: 'Journalistic: Objective, fact-based, neutral' },
  { id: 'advisory', label: 'Advisory: Guidance-driven, helpful, supportive' },
  { id: 'conversational', label: 'Conversational: Casual, direct, approachable' },
  { id: 'humorous', label: 'Humorous: Playful, witty, engaging' },
  { id: 'storytelling', label: 'Storytelling: Narrative, immersive, descriptive' },
  { id: 'opinionated', label: 'Opinionated: Assertive, strong voice, clear stance' },
  { id: 'relatable', label: 'Relatable: Familiar, everyday, human' },
  { id: 'entertaining', label: 'Entertaining: Engaging, light, enjoyable' },
  { id: 'provocative', label: 'Provocative: Bold, challenging, attention-grabbing' },
  { id: 'satirical', label: 'Satirical: Ironic, exaggerated, indirect' },
  { id: 'instructional', label: 'Instructional: Step-by-step, actionable' },
  { id: 'listicle', label: 'Listicle: Structured, scannable' },
  { id: 'review-focused', label: 'Review-Focused: Evaluative, experience-driven' },
  { id: 'comparison', label: 'Comparison: Side-by-side, decision-oriented' }
]
const OPTIMIZATION_TARGETS = [
  { id: 'seo-search', name: 'Google Search (SEO)' },
  { id: 'google-discover', name: 'Google Discover' },
  { id: 'llm-citation', name: 'LLM Citation' },
  { id: 'syndication', name: 'Syndication' },
  { id: 'affiliate-conversion', name: 'Affiliate Conversion' },
  { id: 'amazon-conversion', name: 'Amazon Conversion' },
  { id: 'social-sharing', name: 'Social Sharing' },
  { id: 'featured-snippet', name: 'Featured Snippet' },
  { id: 'evergreen', name: 'Evergreen / Long-term' },
]
const TONE_STANCES = [
  { id: 'sponsored-positive', name: 'Sponsored / Positive' },
  { id: 'unsponsored-honest', name: 'Unsponsored / Honest' },
  { id: 'satirical', name: 'Satirical' },
  { id: 'academic', name: 'Academic' },
  { id: 'conversational', name: 'Conversational' },
  { id: 'authoritative', name: 'Authoritative' },
  { id: 'humorous', name: 'Humorous' },
  { id: 'opinionated', name: 'Opinionated' },
  { id: 'neutral', name: 'Neutral' },
]
const WORD_COUNTS = [
  { id: '500', name: '500+ words (Short: introductory content, news, quick guides)' },
  { id: '700', name: '700+ words (Standard: blog posts, product overviews)' },
  { id: '1000', name: '1000+ words (Long Form: reviews, how-to guides, comparisons)' },
  { id: '1200', name: '1200+ words (In Depth: detailed reviews, buyer guides)' },
  { id: '1500', name: '1500+ words (Comprehensive: cornerstone support, opinion pieces)' },
  { id: '2000', name: '2000+ words (Authority: cornerstone content, pillar pages)' },
  { id: '2500', name: '2500+ words (Pillar: full topic coverage, research papers)' },
]

function Author({ navigate, syncUser, editingDraft, onEditDone }) {
  const { user } = useAuth()
  const [authors, setAuthors] = useState([])
  const [authorProfile, setAuthorProfile] = useState(null)
  const [authorProfileExpanded, setAuthorProfileExpanded] = useState(false)
  const [form, setForm] = useState({ author: '', topic: '', productLink: '', productDetailsManual: '', humanObservation: '', anecdotalStories: '', includeFaq: false, generateAudio: false, ttsVoiceId: 'eve', productImages: [], minWordCount: '', targetKeywords: '', articleFormat: 'blog-general', optimizationTarget: 'seo-search', tone_stance: 'neutral', vocalTone: '', youtube_url: '', use_youtube: false, relevantLinks: [], generateFeaturedImage: false, imagePromptDirection: '' })
  const [sourceMode, setSourceMode] = useState('topic') // 'topic' | 'youtube'
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [llmSlots, setLlmSlots] = useState([])
  const [llmSlotsLoading, setLlmSlotsLoading] = useState(true)
  const [contentRating, setContentRating] = useState(1)
  const [hoveredSlot, setHoveredSlot] = useState(null)
  // Post-submission image upload state
  const [submissionId, setSubmissionId] = useState(null)
  const [uploadedImages, setUploadedImages] = useState([])
  const [uploadingImages, setUploadingImages] = useState(false)
  const [uploadError, setUploadError] = useState('')

  useEffect(() => {
    api('/api/authors')
      .then(data => {
        if (data.authors && data.authors.length > 0) {
          setAuthors(data.authors)
          const initialSlug = editingDraft
            ? (editingDraft.author || data.authors[0].slug)
            : data.authors[0].slug
          if (editingDraft) {
            // Pre-fill form from saved draft
            setForm({
              author: initialSlug,
              topic: editingDraft.topic || '',
              productLink: editingDraft.product_link || '',
              productDetailsManual: editingDraft.product_details_manual || '',
              humanObservation: editingDraft.human_observation || '',
              anecdotalStories: editingDraft.anecdotal_stories || '',
              includeFaq: !!editingDraft.include_faq,
              generateAudio: !!editingDraft.generate_audio,
              generateFeaturedImage: !!editingDraft.generate_featured_image,
              imagePromptDirection: editingDraft.image_prompt_direction || '',
              ttsVoiceId: editingDraft.tts_voice_id || 'eve',
              productImages: [],
              minWordCount: editingDraft.min_word_count || '',
              targetKeywords: editingDraft.target_keywords || '',
              articleFormat: editingDraft.article_format || 'blog-general',
              optimizationTarget: editingDraft.optimization_target || 'seo-search',
              tone_stance: editingDraft.tone_stance || 'neutral',
              vocalTone: editingDraft.vocal_tone || '',
              email: editingDraft.email || user?.email || '',
              youtube_url: editingDraft.youtube_url || '',
              use_youtube: !!editingDraft.use_youtube,
              relevantLinks: (() => { try { return editingDraft.relevant_links ? JSON.parse(editingDraft.relevant_links) : [] } catch { return [] } })(),
            })
            if (editingDraft.use_youtube) setSourceMode('youtube')
          } else {
            setForm(f => ({ ...f, author: initialSlug }))
          }
          // Fetch initial author profile
          fetch(`/api/authors/${initialSlug}`, { credentials: 'include' })
            .then(r => r.json())
            .then(d => setAuthorProfile(d.author || null))
            .catch(() => setAuthorProfile(null))
        }
      })
      .catch(() => setAuthors([]))
  }, [user, editingDraft])

  useEffect(() => {
    let cancelled = false
    setLlmSlotsLoading(true)
    api('/api/llm-config')
      .then(d => { if (!cancelled) setLlmSlots(Array.isArray(d?.slots) ? d.slots : []) })
      .catch(() => { if (!cancelled) setLlmSlots([]) })
      .finally(() => { if (!cancelled) setLlmSlotsLoading(false) })
    return () => { cancelled = true }
  }, [])

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
  }

  async function handleAuthorChange(slug) {
    setForm(f => ({ ...f, author: slug }))
    setAuthorProfileExpanded(false)
    if (!slug) { setAuthorProfile(null); return; }
    try {
      const res = await fetch(`/api/authors/${slug}`, { credentials: 'include' })
      const data = await res.json()
      setAuthorProfile(data.author || null)
    } catch { setAuthorProfile(null) }
  }


  const handleImageChange = (e) => {
    const files = Array.from(e.target.files).slice(0, 10)
    setForm(prev => ({ ...prev, productImages: files }))
  }

  const removeImage = (index) => {
    setForm(prev => ({ ...prev, productImages: prev.productImages.filter((_, i) => i !== index) }))
  }

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  const handleSubmit = async (e, saveType = 'draft') => {
    e.preventDefault()
    setError('')
    if (saveType === 'saved') {
      if (!form.topic || form.topic.trim() === '') {
        setError('Please enter a topic to save your draft.')
        return
      }
    } else {
      if (!form.topic || !form.author || !form.articleFormat || !form.minWordCount || !form.humanObservation) {
        setError('Please fill in all required fields: topic, author, article format, word count, and human observation.')
        return
      }
    }
    setLoading(true)
    try {
      const result = await api('/api/submissions', {
        method: 'POST',
        body: JSON.stringify({
          topic: form.topic,
          author: form.author,
          article_format: form.articleFormat,
          optimization_target: form.optimizationTarget,
          tone_stance: form.tone_stance,
          vocal_tone: form.vocalTone,
          min_word_count: form.minWordCount,
          product_link: form.productLink,
          product_details_manual: form.productDetailsManual || null,
          target_keywords: form.targetKeywords,
          human_observation: form.humanObservation,
          anecdotal_stories: form.anecdotalStories,
          include_faq: form.includeFaq ? 1 : 0,
          generate_audio: form.generateAudio ? 1 : 0,
          generate_featured_image: form.generateFeaturedImage ? 1 : 0,
          image_prompt_direction: form.imagePromptDirection || null,
          tts_voice_id: form.ttsVoiceId || 'eve',
          has_images: form.productImages.length > 0 ? 1 : 0,
          email: form.email,
          youtube_url: form.youtube_url,
          use_youtube: (sourceMode === 'youtube' || form.use_youtube) ? 1 : 0,
          relevant_links: form.relevantLinks && form.relevantLinks.length ? JSON.stringify(form.relevantLinks) : null,
          content_rating: parseInt(contentRating, 10) || 1,
          status: saveType,
        }),
      })
      if (editingDraft) onEditDone()
      setSubmitted(true)
      const newId = result.submission?.id
      if (newId) {
        setSubmissionId(newId)
        // Upload product images to the new endpoint
        if (form.productImages.length > 0) {
          try {
            const fd = new FormData()
            for (const file of form.productImages) fd.append('images', file)
            await fetch(`/api/submissions/${newId}/images`, {
              method: 'POST',
              credentials: 'include',
              body: fd,
            })
          } catch (imgErr) {
            console.error('Image upload failed:', imgErr)
          }
        }
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }


  if (submitted) return (
    <div className="page"><div className="container"><div className="form-card"><div className="confirm-icon">✓</div><h1 className="confirm-title">Brief received.</h1><p className="confirm-sub">We'll have your content ready same-day. You'll receive a notification when it's available in your dashboard.</p>

    <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap', marginTop: '1.5rem' }}><button className="btn-primary" onClick={() => { if (editingDraft) onEditDone(); setSubmitted(false); setForm({ author: authors.length > 0 ? authors[0].slug : '', topic: '', productLink: '', productDetailsManual: '', humanObservation: '', anecdotalStories: '', includeFaq: false, generateAudio: false, productImages: [], minWordCount: '', targetKeywords: '', articleFormat: 'blog-general', optimizationTarget: 'seo-search', tone_stance: 'neutral', vocalTone: '', email: user?.email || '', youtube_url: '', use_youtube: false }); setSubmissionId(null); setUploadedImages([]); }}>Submit Another</button><button className="btn-secondary" onClick={() => navigate('/dashboard')}>View Dashboard</button></div></div></div></div>
  )

  const sectionTitleStyle = { fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, color: 'var(--text)', marginTop: 32, marginBottom: 16, paddingBottom: 8, borderBottom: '1px solid var(--border)' }
  const eyebrowStyle = { display: 'inline-block', fontSize: 10, fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--amber)', marginBottom: 6 }

  function addLink(){ setForm(f => ({ ...f, relevantLinks: [...(f.relevantLinks||[]), ''] })) }
  function setLink(i, v){ setForm(f => { const next = [...(f.relevantLinks||[])]; next[i] = v; return { ...f, relevantLinks: next } }) }
  function removeLink(i){ setForm(f => ({ ...f, relevantLinks: (f.relevantLinks||[]).filter((_,idx) => idx !== i) })) }

  return (
    <div className="page"><div style={{ maxWidth: 680, margin: '0 auto', padding: '32px 24px' }}>
        <h1 className="page-title">Build Article</h1>
        <p className="page-sub">Brief us in detail. Better signal in, better article out.</p>
        {error && <div style={{ background: 'var(--error-bg)', border: '1px solid var(--error-border)', borderRadius: 6, padding: '10px 14px', fontSize: 13, color: 'var(--error)', marginBottom: 16 }}>{error}</div>}
        <form onSubmit={handleSubmit}>
          {/* SOURCE TOGGLE */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 24, padding: 4, background: 'var(--surface-inp)', borderRadius: 10, border: '1px solid var(--border)' }}>
            <button type="button" onClick={() => setSourceMode('topic')}
              style={{ flex: 1, padding: '10px 16px', borderRadius: 7, border: 'none', cursor: 'pointer', background: sourceMode === 'topic' ? 'var(--card)' : 'transparent', color: sourceMode === 'topic' ? 'var(--text)' : 'var(--text-mid)', fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600, boxShadow: sourceMode === 'topic' ? '0 1px 3px rgba(34,26,16,0.08)' : 'none', transition: 'all 0.15s' }}>
              ✦ Supply Topic
            </button>
            <button type="button" onClick={() => setSourceMode('youtube')}
              style={{ flex: 1, padding: '10px 16px', borderRadius: 7, border: 'none', cursor: 'pointer', background: sourceMode === 'youtube' ? 'var(--card)' : 'transparent', color: sourceMode === 'youtube' ? 'var(--text)' : 'var(--text-mid)', fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600, boxShadow: sourceMode === 'youtube' ? '0 1px 3px rgba(34,26,16,0.08)' : 'none', transition: 'all 0.15s' }}>
              ▶ YouTube Topic
            </button>
          </div>

          {/* LLM SLOT SELECTOR — three horizontal radio-style cards */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'block', fontFamily: '"Playfair Display", Georgia, serif', fontSize: 20, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>
              Select Your Model
            </div>
            {llmSlotsLoading ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, padding: 4, background: 'var(--card)', borderRadius: 12, border: '1.5px solid var(--border)', boxShadow: '0 2px 12px rgba(34,26,16,0.08)' }}>
                {[1,2,3].map(i => (
                  <div key={i} style={{ flex: 1, height: 78, borderRadius: 8, background: 'var(--surface-inp)', border: '1px solid var(--border)', opacity: 0.6 }} />
                ))}
              </div>
            ) : llmSlots.length === 0 ? null : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, padding: 4, background: 'var(--card)', borderRadius: 12, border: '1.5px solid var(--border)', boxShadow: '0 2px 12px rgba(34,26,16,0.08)' }}>
                {llmSlots.map(s => {
                  const active = parseInt(contentRating, 10) === s.slot
                  const hovered = hoveredSlot === s.slot
                  const baseStyle = {
                    flex: 1,
                    textAlign: 'left',
                    padding: 16,
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontFamily: 'var(--font-ui)',
                    transition: 'all 0.15s',
                    minWidth: 0,
                  }
                  const activeStyle = {
                    background: 'var(--green)',
                    color: '#ffffff',
                    border: '2px solid var(--green)',
                    opacity: 1,
                  }
                  const hoverStyle = {
                    background: 'var(--surface-hover, var(--surface-inp))',
                    color: 'var(--text)',
                    border: '1.5px solid var(--border)',
                    opacity: 1,
                  }
                  const inactiveStyle = {
                    background: 'var(--card)',
                    color: 'var(--text)',
                    border: '1.5px solid var(--border)',
                    opacity: 1,
                  }
                  const cardStyle = active
                    ? { ...baseStyle, ...activeStyle }
                    : hovered
                      ? { ...baseStyle, ...hoverStyle }
                      : { ...baseStyle, ...inactiveStyle }

                  const titleColor = active ? '#ffffff' : 'var(--text)'
                  const descColor = active ? 'rgba(255,255,255,0.85)' : 'var(--text-mid)'

                  return (
                    <button
                      key={s.slot}
                      type="button"
                      onClick={() => setContentRating(s.slot)}
                      onMouseEnter={() => setHoveredSlot(s.slot)}
                      onMouseLeave={() => setHoveredSlot(prev => prev === s.slot ? null : prev)}
                      style={cardStyle}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, minWidth: 0 }}>
                        <span style={{
                          fontFamily: '"Playfair Display", Georgia, serif',
                          fontSize: 15,
                          fontWeight: 700,
                          color: titleColor,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}>{s.display_name || s.model_string || `Slot ${s.slot}`}</span>
                        {s.warning_badge && (
                          <span style={{
                            fontSize: 9,
                            fontWeight: 700,
                            letterSpacing: '0.04em',
                            textTransform: 'uppercase',
                            background: active ? '#FAF7F2' : 'var(--error-bg, #fce7e7)',
                            color: 'var(--error, #b91c1c)',
                            border: active ? 'none' : '1px solid var(--error-border, #f4c2c2)',
                            padding: '1px 6px',
                            borderRadius: 999,
                            flexShrink: 0,
                          }}>
                            {s.warning_badge}
                          </span>
                        )}
                      </div>
                      <div style={{
                        fontFamily: '"DM Sans", var(--font-ui), sans-serif',
                        fontSize: 12,
                        lineHeight: 1.35,
                        color: descColor,
                      }}>{s.descriptor}</div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {sourceMode === 'topic' ? (
            <div className="form-group">
              <label className="form-label">Article Topic <span className="required">✦</span></label>
              <input type="text" name="topic" className="form-input" placeholder="What are we writing about?" value={form.topic} onChange={handleChange} required />
            </div>
          ) : (
            <div className="form-group">
              <label className="form-label">YouTube URL <span className="required">✦</span></label>
              <input type="url" name="youtube_url" className="form-input" placeholder="https://www.youtube.com/watch?v=..." value={form.youtube_url} onChange={handleChange} required />
              <p className="form-hint">We'll pull the transcript and use it as the source material.</p>
            </div>
          )}

          {/* SECTION 1 — The Content */}
          <div style={sectionTitleStyle}><span style={eyebrowStyle}>Section 1</span><br/>The Content</div>

          <div className="form-group">
            <label className="form-label">Your Observation on This Topic or Product <span className="required">✦</span></label>
            <textarea name="humanObservation" className="form-input form-textarea" rows="4" placeholder="Why did you pick this? What do you know firsthand?" value={form.humanObservation} onChange={handleChange} required />
            <p className="form-hint">This anchors the article in real authority.</p>
          </div>

          <div className="form-group">
            <label className="form-label">Anecdotal Stories to Include</label>
            <textarea name="anecdotalStories" className="form-input form-textarea" rows="3" placeholder="Stories, scenarios, real-world examples..." value={form.anecdotalStories} onChange={handleChange} />
            <p className="form-hint">Real stories humanize content. Give the agent something to weave in.</p>
          </div>

          <div className="form-group">
            <label className="form-label">Relevant Links</label>
            {(form.relevantLinks || []).map((url, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                <input type="url" className="form-input" placeholder="https://..." value={url} onChange={e => setLink(i, e.target.value)} style={{ flex: 1, minWidth: 0 }} />
                <button type="button" onClick={() => removeLink(i)} className="btn-danger-sm">Remove</button>
              </div>
            ))}
            <button type="button" onClick={addLink} className="btn-ghost" style={{ marginTop: 4 }}>+ Add link</button>
            <p className="form-hint">Brand pages, product links, source articles — anything that helps paint the picture.</p>
          </div>

          {/* SECTION 2 — Voice & Style */}
          <div style={sectionTitleStyle}><span style={eyebrowStyle}>Section 2</span><br/>Voice &amp; Style</div>

          <div className="form-group">
            <label className="form-label">Author Voice</label>
            <select name="author" className="form-input form-select" value={form.author} onChange={e => handleAuthorChange(e.target.value)}>
              {authors.length === 0 ? <option value="">No author profiles available — contact admin</option> : authors.map(a => <option key={a.slug} value={a.slug}>{a.name}</option>)}
            </select>
          </div>

          {authorProfile && (
            <div style={{ background: 'var(--card-alt)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px', marginTop: -8, marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => setAuthorProfileExpanded(e => !e)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <span style={{ fontSize: 14, color: 'var(--text)', fontWeight: 600, flexShrink: 0 }}>{authorProfile.name}</span>
                  {!authorProfileExpanded && authorProfile.description && (
                    <span style={{ fontSize: 13, color: 'var(--text-light)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      — {authorProfile.description.slice(0, 80)}{authorProfile.description.length > 80 ? '…' : ''}
                    </span>
                  )}
                </div>
                <span style={{ fontSize: 12, color: 'var(--green)', flexShrink: 0, marginLeft: 12 }}>
                  {authorProfileExpanded ? '▲ Collapse' : '▼ Expand'}
                </span>
              </div>
              {authorProfileExpanded && (
                <div style={{ marginTop: 12 }}>
                  {authorProfile.description && (
                    <div style={{ fontSize: 14, color: 'var(--text-mid)', lineHeight: 1.6, marginBottom: 12 }}>{authorProfile.description}</div>
                  )}
                  {authorProfile.style_guide && (
                    <div style={{ background: 'var(--bg)', border: '1px solid var(--border-light)', borderRadius: 6, padding: '10px 12px' }}>
                      <div style={{ fontSize: 10, color: 'var(--amber)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8, fontWeight: 600 }}>Voice Guide</div>
                      <pre style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--text-mid)', lineHeight: 1.6, whiteSpace: 'pre-wrap', margin: 0 }}>{authorProfile.style_guide}</pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Tone / Stance</label>
            <select name="tone_stance" className="form-input form-select" value={form.tone_stance} onChange={handleChange}>
              {TONE_STANCES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Vocal Tone</label>
            <select name="vocalTone" className="form-input form-select" value={form.vocalTone} onChange={handleChange}>
              <option value="">Select a tone…</option>
              {VOCAL_TONES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>

          {/* SECTION 3 — Format & Specs */}
          <div style={sectionTitleStyle}><span style={eyebrowStyle}>Section 3</span><br/>Format &amp; Specs</div>

          <div className="form-group">
            <label className="form-label">Article Format</label>
            <select name="articleFormat" className="form-input form-select" value={form.articleFormat} onChange={handleChange}>
              {FORMATS.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Optimization Target</label>
            <select name="optimizationTarget" className="form-input form-select" value={form.optimizationTarget} onChange={handleChange}>
              {OPTIMIZATION_TARGETS.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Min Word Count</label>
            <select name="minWordCount" className="form-input form-select" value={form.minWordCount} onChange={handleChange}>
              <option value="">Select word count…</option>
              {WORD_COUNTS.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Target Keywords</label>
            <TagInput value={form.targetKeywords} onChange={v => setForm(f => ({ ...f, targetKeywords: v }))} placeholder="Type keyword, press Enter" />
            <p className="form-hint">First keyword (★) is the primary target. Press Enter or comma to add.</p>
          </div>

          {/* SECTION — Featured Image */}
          <div style={sectionTitleStyle}><span style={eyebrowStyle}>◆ Section</span><br/>Featured Image</div>
          <p style={{ fontSize: 13, color: 'var(--text-light)', marginTop: -8, marginBottom: 16 }}>
            An AI-generated graphic design hero image placed at the top of your article.
          </p>

          <div className="form-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                name="generateFeaturedImage"
                checked={form.generateFeaturedImage}
                onChange={handleChange}
              />
              <span>
                <strong>Generate Featured Image</strong>
                <br/><span style={{ fontSize: 12, color: 'var(--text-light)', fontWeight: 'normal' }}>Graphic design hero image, automatically created from your article content.</span>
              </span>
            </label>
          </div>

          {form.generateFeaturedImage && (
            <div className="form-group">
              <label className="form-label">Image direction</label>
              <textarea
                name="imagePromptDirection"
                className="form-input form-textarea"
                rows={3}
                placeholder="Describe the style, mood, setting, and color direction in your own words. Example: vintage editorial, warm amber tones, outdoor wilderness, high contrast graphic design."
                value={form.imagePromptDirection}
                onChange={handleChange}
              />
            </div>
          )}

          {/* SECTION 4 — Assets & Options */}
          <div style={sectionTitleStyle}><span style={eyebrowStyle}>Section 4</span><br/>Assets &amp; Options</div>

          <div className="form-group">
            <label className="form-label">Product Images</label>
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={handleImageChange} />
            <p className="form-hint">Up to 10 photos. We'll rename, optimize, and add SEO alt text + captions automatically.</p>
            {form.productImages.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 12 }}>
                {form.productImages.map((file, i) => (
                  <div key={i} style={{ position: 'relative', width: 80 }}>
                    <img src={URL.createObjectURL(file)} alt="" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }} />
                    <button type="button" onClick={() => removeImage(i)}
                      style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', background: 'var(--error)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 11, lineHeight: '20px', textAlign: 'center', padding: 0 }}>×</button>
                    <div style={{ fontSize: 10, color: 'var(--text-light)', marginTop: 4, wordBreak: 'break-all', textAlign: 'center' }}>{file.name.length > 12 ? file.name.slice(0, 10) + '…' : file.name}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="checkbox-label">
              <input type="checkbox" name="includeFaq" checked={form.includeFaq} onChange={handleChange} />
              <span>
                <strong>Include FAQ Section</strong>
                <br/><span style={{ fontSize: 12, color: 'var(--text-light)', fontWeight: 'normal' }}>Adds a 5–7 question FAQ + FAQPage structured data schema.</span>
              </span>
            </label>
          </div>

          <div className="form-group">
            <label className="checkbox-label">
              <input type="checkbox" name="generateAudio" checked={form.generateAudio} onChange={handleChange} />
              <span>
                <strong>Generate Audio Version</strong>
                <br/><span style={{ fontSize: 12, color: 'var(--text-light)', fontWeight: 'normal' }}>MP3 narration included in your download package.</span>
              </span>
            </label>
          </div>

          {form.generateAudio && (
            <div className="form-group">
              <label className="form-label">TTS Voice</label>
              <select name="ttsVoiceId" className="form-input form-select" value={form.ttsVoiceId} onChange={handleChange}>
                <option value="eve">Eve — energetic, upbeat, conversational (feminine)</option>
                <option value="ara">Ara — warm, friendly, approachable (feminine)</option>
                <option value="rex">Rex — confident, professional, measured (masculine)</option>
                <option value="sal">Sal — smooth, versatile, narrative (masculine)</option>
                <option value="leo">Leo — authoritative, strong, declarative (masculine)</option>
              </select>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Product Link (optional)</label>
            <input type="url" name="productLink" className="form-input" placeholder="https://..." value={form.productLink} onChange={handleChange} />
          </div>
          {form.productLink && (
            <div className="form-group">
              <label className="form-label">Product Details (optional)</label>
              <textarea name="productDetailsManual" className="form-input form-textarea" rows="3" placeholder="Paste specs, price, features…" value={form.productDetailsManual} onChange={handleChange} />
              <p className="form-hint">If the product page is age-gated, paste the specs here.</p>
            </div>
          )}

          {/* Submit row */}
          <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="btn-secondary"
              disabled={loading}
              onClick={(e) => { e.preventDefault(); handleSubmit(e, 'saved') }}
              onTouchEnd={(e) => {
                if (loading) return;
                e.preventDefault();
                if (document.activeElement && typeof document.activeElement.blur === 'function') document.activeElement.blur();
                handleSubmit(e, 'saved');
              }}
            >{loading ? 'Saving…' : 'Save as Draft'}</button>
            <button
              type="submit"
              className="btn-primary"
              disabled={loading}
              onTouchEnd={(e) => {
                if (loading) return;
                e.preventDefault();
                if (document.activeElement && typeof document.activeElement.blur === 'function') document.activeElement.blur();
                handleSubmit(e);
              }}
            >{loading ? 'Submitting…' : 'Build Article →'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}



// ─── Account ───────────────────────────────────────────────────────────────
function Account({ navigate, syncUser }) {
  const { user } = useAuth()
  const [inviteLink, setInviteLink] = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const [ingestLoading, setIngestLoading] = useState(false)
  const [ingestError, setIngestError] = useState('')
  const [ingestPreview, setIngestPreview] = useState(null)
  const [saveLoading, setSaveLoading] = useState(false)

  const handleIngestRss = async () => {
    setIngestLoading(true)
    setIngestError('')
    setIngestPreview(null)
    const rssUrl = document.getElementById('rss-url-input')?.value
    if (!rssUrl) {
      setIngestError('Please enter an RSS URL')
      setIngestLoading(false)
      return
    }
    try {
      const data = await api('/api/admin/authors/ingest', {
        method: 'POST',
        body: JSON.stringify({ rss_url: rssUrl })
      })
      console.log('Raw API response:', JSON.stringify(data));
      if (data.error) {
        setIngestError(data.error)
      } else {
        setIngestPreview(data)
      }
    } catch (err) {
      setIngestError(err.message)
    } finally {
      setIngestLoading(false)
    }
  }

  const handleIngestDocx = async () => {
    setIngestLoading(true)
    setIngestError('')
    setIngestPreview(null)
    const fileInput = document.getElementById('docx-file-input')
    const file = fileInput?.files?.[0]
    if (!file) {
      setIngestError('Please select a DOCX file')
      setIngestLoading(false)
      return
    }
    try {
      const formData = new FormData()
      formData.append('document', file)
      const response = await fetch('/api/admin/authors/ingest', {
        method: 'POST',
        credentials: 'include',
        body: formData
      })
      const data = await response.json()
      if (data.error) {
        setIngestError(data.error)
      } else {
        setIngestPreview(data)
      }
    } catch (err) {
      setIngestError(err.message)
    } finally {
      setIngestLoading(false)
    }
  }

  const handleSaveProfile = async () => {
    if (!ingestPreview) return
    setSaveLoading(true)
    try {
      const data = await api('/api/admin/authors/save', {
        method: 'POST',
        body: JSON.stringify(ingestPreview)
      })
      if (data.success) {
        setIngestPreview(null)
        document.getElementById('rss-url-input').value = ''
        document.getElementById('docx-file-input').value = ''
        alert('Author profile saved!')
      } else {
        setIngestError(data.error || 'Failed to save')
      }
    } catch (err) {
      setIngestError(err.message)
    } finally {
      setSaveLoading(false)
    }
  }

  const generateInvite = async () => {
    setInviteLoading(true)
    setInviteLink('')
    setInviteError('')
    try {
      const data = await api('/api/auth/invite', { method: 'POST', body: JSON.stringify({ max_uses: 1, expires_in_days: 30 }) })
      setInviteLink(data.inviteUrl)
    } catch (err) {
      setInviteError(err.message)
    } finally {
      setInviteLoading(false)
    }
  }

  return (
    <div className="page">
      <div className="container"><div className="account-section">
        <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '1.625rem', fontWeight: 700, color: 'var(--text)', marginBottom: '2rem' }}>Account Settings.</h1>
        <div className="account-grid">
          <div>
            <div className="account-title">Profile</div>
            <div className="form-group"><label className="form-label">Name</label><input type="text" className="form-input" defaultValue={user?.name || ''} /></div>
            <div className="form-group"><label className="form-label">Email</label><input type="email" className="form-input" defaultValue={user?.email || ''} /></div>
            <button className="btn-primary" style={{ marginTop: '0.5rem' }}>Save Changes</button>
          </div>
          <div>
            <div className="account-title">Password</div>
            <div className="form-group"><label className="form-label">Current Password</label><input type="password" className="form-input" placeholder="••••••••" /></div>
            <div className="form-group"><label className="form-label">New Password</label><input type="password" className="form-input" placeholder="••••••••" /></div>
            <button className="btn-secondary" style={{ marginTop: '0.5rem' }}>Update Password</button>
          </div>
        </div>



        {/* Sign out */}
        <div style={{ marginTop: '3rem', paddingTop: '2rem', borderTop: '1px solid var(--border)' }}>
          <button
            onClick={async () => {
              await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
              if (syncUser) syncUser(null);
              navigate('/');
            }}
            style={{ background: 'none', border: '0.5px solid #5a3a2a', color: '#a06050', padding: '14px 32px', borderRadius: '6px', fontSize: '16px', cursor: 'pointer', fontFamily: 'sans-serif' }}
          >
            Sign out
          </button>
        </div>
      </div></div></div>
  )
}

// ─── Writer (Sydney/Ben — edit article content) ─────────────────────────────────────
function Writer({ navigate, syncUser }) {
  const { user } = useAuth()
  const [submissions, setSubmissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null) // { id, article_content, status }
  const [saveLoading, setSaveLoading] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  const loadSubs = () => {
    setLoading(true)
    api('/api/submissions')
      .then(data => {
        // Show: done (needs content or needs revision), revision_requested
        const writable = (data.submissions || []).filter(s =>
          s.status === 'done' || s.status === 'revision_requested' || s.status === 'draft' || s.status === 'notified'
        )
        setSubmissions(writable)
      })
      .catch(err => console.error(err))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadSubs() }, [])

  const handleEdit = async (sub) => {
    setEditing({ id: sub.id, article_content: sub.article_content || '', status: sub.status, topic: sub.topic, revision_notes: sub.revision_notes || '', target_keywords: sub.target_keywords || '', seo_research: sub.seo_research, seoContextBlock: null, deepReport: null, researchLoading: false })
    setSaveMsg('')
    // Fetch SEO research if this submission has keywords or seo_research flag
    if (sub.target_keywords || sub.seo_research) {
      setEditing(prev => ({ ...prev, researchLoading: true }))
      try {
        const res = await fetch('/api/seo/research', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topic: sub.topic,
            target_keywords: sub.target_keywords || '',
            seo_research: sub.seo_research,
            article_format: sub.article_format
          })
        })
        if (res.ok) {
          const data = await res.json()
          setEditing(prev => ({
            ...prev,
            seoContextBlock: data.seoContextBlock,
            deepReport: data.deepReport,
            researchLoading: false
          }))
        }
      } catch (e) {
        console.warn('SEO research fetch failed:', e)
        setEditing(prev => ({ ...prev, researchLoading: false }))
      }
    }
  }

  const handleSave = async () => {
    if (!editing) return
    setSaveLoading(true)
    setSaveMsg('')
    try {
      const sub = submissions.find(s => s.id === editing.id)
      let content = editing.article_content

      // Append deep research report if seo_research is set and report is available
      if (editing.seo_research && editing.deepReport) {
        content = content.trim() + '\n' + editing.deepReport
      }

      const body = { article_content: editing.article_content }
      // Store deep SEO report separately
      if (editing.seo_research && editing.deepReport) {
        body.seo_report_content = editing.deepReport
      }
      // If it doesn't have content yet, mark as done on first save
      if (sub && (!sub.article_content || sub.status === 'draft' || sub.status === 'notified')) {
        body.status = 'done'
      }
      await api(`/api/submissions/${editing.id}`, {
        method: 'PUT',
        body: JSON.stringify(body)
      })
      setSaveMsg('Saved!')
      setEditing(null)
      loadSubs()
    } catch (e) {
      setSaveMsg('Error: ' + e.message)
    }
    setSaveLoading(false)
  }

  if (editing) {
    const wordCount = editing.article_content.trim().split(/\s+/).filter(Boolean).length
    return (
      <div className="page">
        <div className="container">
          <div style={{ marginBottom: '1.5rem' }}>
            <button onClick={() => setEditing(null)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: '0.875rem', marginBottom: '0.75rem' }}>← Back to list</button>
            <h1 style={{ fontFamily: "'Playfair Display', serif", marginBottom: '0.25rem' }}>{editing.topic}</h1>
            {editing.status === 'revision_requested' && editing.revision_notes && (
              <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '6px', padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.875rem', marginTop: '0.75rem' }}>
                <strong style={{ color: '#92400e' }}>Revision requested:</strong>
                <p style={{ color: '#78350f', marginTop: '0.25rem', whiteSpace: 'pre-wrap' }}>{editing.revision_notes}</p>
              </div>
            )}
            <p style={{ fontSize: '0.8125rem', color: '#6b7280' }}>{wordCount} words</p>
          </div>
          {editing.researchLoading && (
            <div style={{ background: '#f0f9ff', border: '1px solid #0ea5e9', borderRadius: '6px', padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.875rem', color: '#0369a1' }}>
              Running SEO research via DataforSEO...
            </div>
          )}
          {editing.seoContextBlock && !editing.article_content && (
            <div style={{ background: '#fefce8', border: '1px solid #facc15', borderRadius: '6px', padding: '1rem', marginBottom: '1rem', fontSize: '0.875rem', fontFamily: 'Georgia, serif', whiteSpace: 'pre-wrap' }}>
              <strong style={{ color: '#92400e' }}>SEO Context Block</strong> — paste this at the top of the article or use it as a reference while writing:
              <hr style={{ margin: '0.75rem 0', borderColor: '#facc15' }} />
              {editing.seoContextBlock}
            </div>
          )}
          <textarea
            value={editing.article_content}
            onChange={e => setEditing(prev => ({ ...prev, article_content: e.target.value }))}
            style={{ width: '100%', minHeight: '60vh', padding: '1rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '1rem', fontFamily: 'Georgia, serif', lineHeight: '1.8', boxSizing: 'border-box', resize: 'vertical' }}
            placeholder="Paste or write the article content here..."
          />
          {saveMsg && <p style={{ marginTop: '0.75rem', color: saveMsg.includes('Error') ? '#b05050' : '#16a34a', fontSize: '0.875rem' }}>{saveMsg}</p>}
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
            <button onClick={handleSave} disabled={saveLoading} className="btn-primary">{saveLoading ? 'Saving...' : 'Save & Mark Done'}</button>
            <button onClick={() => setEditing(null)} className="btn-secondary">Cancel</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="container">
        <div className="dashboard-header">
          <h1 className="dashboard-title">Writer.</h1>
          <p className="dashboard-sub">Edit and deliver article content.</p>
        </div>
        {loading ? (
          <p style={{ color: 'var(--text-mid)' }}>Loading...</p>
        ) : submissions.length === 0 ? (
          <p style={{ color: 'var(--text-mid)' }}>No articles to write right now.</p>
        ) : (
          <div className="section">
            <div className="grid">
              {submissions.map(sub => (
                <div key={sub.id} className="card">
                  <div className="card-meta">
                    {new Date(sub.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                    {' · '}{FORMAT_LABELS[sub.article_format] ?? FORMATS.find(f => f.id === sub.article_format)?.name ?? sub.article_format ?? 'Unknown'}
                  </div>
                  <div className="card-title">{sub.topic}</div>
                  {sub.product_link && (
                    <a href={sub.product_link} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.75rem', color: 'var(--green)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.25rem' }}>
                      🔗 Product link
                    </a>
                  )}
                  <KeywordPills keywordsJson={sub.target_keywords} />
                  <div style={{ marginTop: '0.5rem' }}>
                    <span className={`card-status status-${sub.status}`}>{sub.status}</span>
                    {' '}<span style={{ fontSize: '0.8125rem', color: 'var(--text-light)' }}>{sub.author}</span>
                  </div>
                  {sub.status === 'revision_requested' && sub.revision_notes && (
                    <p style={{ fontSize: '0.8125rem', color: '#d97706', marginTop: '0.5rem', fontStyle: 'italic' }}>{sub.revision_notes.slice(0, 100)}{sub.revision_notes.length > 100 ? '...' : ''}</p>
                  )}
                  <button
                    onClick={() => handleEdit(sub)}
                    className="btn-primary"
                    style={{ marginTop: '0.75rem', padding: '0.4rem 1rem', fontSize: '0.875rem' }}
                  >
                    {sub.article_content ? 'Edit Content' : 'Write Content'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Notification Bell ──────────────────────────────────────────────────
function NotificationBell({ syncUser }) {
  const { user } = useAuth()
  const [count, setCount] = useState(0)
  const [open, setOpen] = useState(false)
  const [notifs, setNotifs] = useState([])
  const [loading, setLoading] = useState(false)
  const wrapRef = useRef(null)

  // Close the popover on any navigation (sidebar click, browser back/forward, Escape, outside click).
  useEffect(() => {
    if (!open) return
    const onClick = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    const onPop   = () => setOpen(false)
    const onKey   = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClick)
    window.addEventListener('popstate', onPop)
    window.addEventListener('submoa:navigate', onPop)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      window.removeEventListener('popstate', onPop)
      window.removeEventListener('submoa:navigate', onPop)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  useEffect(() => {
    if (!user) return
    let mounted = true
    const poll = async () => {
      if (document.visibilityState === 'hidden') return
      // Prefer the dedicated notifications endpoint so we get the full shape
      // (title/body/type/link/read). Fall back to the sync endpoint's inline
      // summary when the direct call fails.
      try {
        const res = await fetch('/api/notifications', { credentials: 'include' })
        if (res.ok) {
          const d = await res.json()
          if (mounted) {
            setNotifs(d.notifications || d.items || [])
            setCount(d.unread_count || 0)
          }
          return
        }
      } catch {}
      try {
        const data = await syncUser()
        if (mounted && data?.notifications) {
          setNotifs(data.notifications.items || [])
          setCount(data.notifications.unread_count || 0)
        }
      } catch {}
    }
    poll()
    const interval = setInterval(poll, 30000)
    const onVis = () => { if (document.visibilityState === 'visible') poll() }
    document.addEventListener('visibilitychange', onVis)
    return () => { mounted = false; clearInterval(interval); document.removeEventListener('visibilitychange', onVis) }
  }, [user])

  useEffect(() => {
    const onFocus = () => { syncUser().then(data => { if (data?.notifications) { setNotifs(data.notifications.items); setCount(data.notifications.unread_count) } }) }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  const loadNotifs = async () => {
    setLoading(true)
    const data = await syncUser()
    if (data?.notifications) { setNotifs(data.notifications.items); setCount(data.notifications.unread_count) }
    setLoading(false)
  }

  const handleOpen = () => {
    setOpen(o => !o)
    if (!open) loadNotifs()
  }

  const markAllRead = async () => {
    await fetch('/api/notifications/read-all', { method: 'PATCH', credentials: 'include' })
    setCount(0)
    setNotifs(prev => prev.map(n => ({ ...n, is_read: 1 })))
  }

  const markRead = async (id, link) => {
    await fetch(`/api/notifications/${id}/read`, { method: 'PATCH', credentials: 'include' })
    setCount(c => Math.max(0, c - 1))
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, is_read: 1 } : n))
    if (link) window.location.href = link
  }

  const timeAgo = (ts) => {
    const diff = (Date.now() / 1000) - (ts / 1000)
    if (diff < 60) return 'just now'
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago'
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago'
    return Math.floor(diff / 86400) + 'd ago'
  }

  if (!user) return null

  return (
    <div style={{ position: 'relative' }} ref={wrapRef}>
      <button
        onClick={handleOpen}
        style={{ background: 'transparent', border: '1px solid var(--border-light)', borderRadius: 7, cursor: 'pointer', padding: '7px 10px', position: 'relative', display: 'inline-flex', alignItems: 'center', color: 'var(--text-mid)' }}
        aria-label="Notifications"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {count > 0 && (
          <span style={{ position: 'absolute', top: -5, right: -5, background: 'var(--amber)', color: 'var(--card)', borderRadius: '50%', fontSize: 10, minWidth: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', fontWeight: 700, fontFamily: 'var(--font-ui)' }}>
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>
      {open && (
        <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, width: 320, boxShadow: 'var(--shadow-card)', zIndex: 200, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)', fontFamily: 'var(--font-ui)' }}>Notifications</span>
            {count > 0 && <button onClick={markAllRead} style={{ background: 'none', border: 'none', fontSize: 12, color: 'var(--green)', cursor: 'pointer', textDecoration: 'underline', fontFamily: 'var(--font-ui)' }}>Mark all read</button>}
          </div>
          <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
            {loading ? (
              <p style={{ padding: 16, color: 'var(--text-light)', fontSize: 13, textAlign: 'center' }}>Loading...</p>
            ) : notifs.length === 0 ? (
              <p style={{ padding: 16, color: 'var(--text-light)', fontSize: 13, textAlign: 'center' }}>No notifications yet.</p>
            ) : notifs.map(n => (
              <div
                key={n.id}
                onClick={() => markRead(n.id, n.link)}
                style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-faint)', display: 'flex', gap: 10, alignItems: 'flex-start', background: n.is_read ? 'transparent' : 'var(--amber-light)', cursor: 'pointer' }}
              >
                {n.is_read ? null : <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--amber)', marginTop: 7, flexShrink: 0 }} />}
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 13, margin: 0, lineHeight: 1.5, color: 'var(--text)' }}>{n.message}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 4 }}>{timeAgo(n.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── ContentPage (Standalone Article View) ───────────────────────────────────
function ContentPage({ navigate }) {
  const { user } = useAuth()
  const [article, setArticle] = useState(null)
  const [articleContent, setArticleContent] = useState('')
  const [authorProfiles, setAuthorProfiles] = useState([])
  const [showTranscript, setShowTranscript] = useState(false)
  // Admin feedback panel state
  const [fbRating, setFbRating] = useState(0)
  const [fbNotes, setFbNotes] = useState('')
  const [fbAnswers, setFbAnswers] = useState({ q1: null, q2: null, q3: null, q4: null, q5: null })
  const [fbSubmitted, setFbSubmitted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const audioRef = useRef(null)
  const [audioPlaying, setAudioPlaying] = useState(false)
  const [audioProgress, setAudioProgress] = useState(0)
  const [audioDuration, setAudioDuration] = useState(0)
  const [audioSpeed, setAudioSpeed] = useState(1)

  // ─── Article flagging state ───────────────────────────────────────────
  const articleBodyRef = useRef(null)
  const [flags, setFlags] = useState([])
  const [popover, setPopover] = useState(null) // { x, y, selected_text, char_offset_start, char_offset_end }
  const [popoverType, setPopoverType] = useState(null) // pending flag_type
  const [popoverComment, setPopoverComment] = useState('')
  const [showReviewModal, setShowReviewModal] = useState(false)
  const [revisionMode, setRevisionMode] = useState('surgical')
  const [submittingReview, setSubmittingReview] = useState(false)
  const [toast, setToast] = useState(null)

  useEffect(() => {
    // Fetch author profiles for display name lookup
    api('/api/authors')
      .then(data => setAuthorProfiles(data.authors || []))
      .catch(() => setAuthorProfiles([]))
  }, [])

  useEffect(() => {
    if (!user) {
      navigate('/login')
      return
    }

    const controller = new AbortController()
    const id = window.location.pathname.split('/content/')[1]
    if (!id) {
      setError('No article ID provided')
      setLoading(false)
      return
    }

    setLoading(true)
    // Use fetch directly to get status code for proper redirects
    fetch(`/api/articles/content?id=${encodeURIComponent(id)}`, { credentials: 'include', signal: controller.signal })
      .then(res => {
        console.log('[/api/articles/content] status:', res.status)
        return res.text().then(text => {
          console.log('[/api/articles/content] body:', text)
          let data
          try { data = JSON.parse(text) } catch { data = { error: text } }
          if (res.status === 401) {
            navigate('/login')
            return null
          }
          if (res.status === 404) {
            navigate('/dashboard')
            return null
          }
          if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
          return data
        })
      })
      .then(data => {
        if (!data) return
        if (data.error) throw new Error(data.error)
        // Ownership check — admins and super admins can view any article
        const isOwner = data.article.user_id === user.id;
        const isAdmin = user.role === 'admin' || user.role === 'super_admin';
        if (!isOwner && !isAdmin) {
          navigate('/dashboard')
          return
        }
        setArticle(data.article)
        setArticleContent(data.content || '')
      })
      .catch(err => {
        if (err.name !== 'AbortError') {
          console.error('[/api/articles/content] fetch error:', err)
          setError(err.message)
        }
      })
      .finally(() => setLoading(false))

    return () => controller.abort()
  }, [user])

  // Load flags when article loads
  useEffect(() => {
    if (!article?.id) return
    fetch(`/api/submissions/${article.id}/flags`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => setFlags(d.flags || []))
      .catch(() => setFlags([]))
  }, [article?.id])

  // Apply highlights to article body whenever flags or content change
  useEffect(() => {
    const root = articleBodyRef.current
    if (!root || !flags.length) return
    const FLAG_COLOR = {
      revision: { bg: 'rgba(184,135,46,0.25)', border: 'var(--amber)' },
      'not-sure': { bg: 'rgba(184,135,46,0.25)', border: 'var(--amber)' },
      'fact-check': { bg: 'rgba(42,90,122,0.22)', border: 'var(--info)' },
      fabricated: { bg: 'rgba(139,58,42,0.22)', border: 'var(--error)' },
    }
    const FACT_COLOR = {
      Verified: 'var(--success)',
      Inaccurate: 'var(--error)',
      Unverifiable: 'var(--amber)',
    }
    // Walk text nodes, wrap first match per flag in a highlight span.
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    const textNodes = []
    let n; while ((n = walker.nextNode())) textNodes.push(n)
    flags.forEach(f => {
      if (!f.selected_text) return
      for (const node of textNodes) {
        const idx = node.nodeValue.indexOf(f.selected_text)
        if (idx >= 0) {
          const palette = FLAG_COLOR[f.flag_type] || FLAG_COLOR.revision
          const factBorder = f.fact_check_verdict ? FACT_COLOR[f.fact_check_verdict] : palette.border
          const range = document.createRange()
          range.setStart(node, idx)
          range.setEnd(node, idx + f.selected_text.length)
          const span = document.createElement('span')
          span.style.background = palette.bg
          span.style.borderBottom = `2px solid ${factBorder}`
          span.style.padding = '0 1px'
          span.setAttribute('data-flag-id', f.id)
          let tip = f.flag_type + (f.comment ? `: ${f.comment}` : '')
          if (f.fact_check_verdict) {
            try { tip += ` — ${f.fact_check_verdict}: ${JSON.parse(f.fact_check_result || '{}').summary || ''}` } catch {}
          }
          span.title = tip
          try { range.surroundContents(span); break } catch { /* range crosses element; skip */ }
        }
      }
    })
  }, [flags, articleContent])

  // Selection handler
  const handleMouseUp = () => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed) { setPopover(null); return }
    const text = sel.toString().trim()
    if (!text || text.length < 3) { setPopover(null); return }
    const range = sel.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    // Offset within articleContent (best-effort: indexOf)
    const offsetStart = articleContent.indexOf(text)
    const offsetEnd = offsetStart >= 0 ? offsetStart + text.length : text.length
    setPopover({
      x: rect.left + rect.width / 2 + window.scrollX,
      y: rect.bottom + window.scrollY + 8,
      selected_text: text,
      char_offset_start: offsetStart >= 0 ? offsetStart : 0,
      char_offset_end: offsetEnd,
    })
    setPopoverType(null)
    setPopoverComment('')
  }

  const submitFlag = async () => {
    if (!popover || !popoverType || !article) return
    const payload = {
      selected_text: popover.selected_text,
      comment: popoverComment,
      flag_type: popoverType,
      char_offset_start: popover.char_offset_start,
      char_offset_end: popover.char_offset_end,
    }
    try {
      const res = await fetch(`/api/submissions/${article.id}/flags`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save flag')
      const newFlag = data.flag
      setFlags(fs => [...fs, newFlag])
      // Fact-check path: fire and refresh
      if (popoverType === 'fact-check') {
        const ctxStart = Math.max(0, popover.char_offset_start - 300)
        const ctxEnd = Math.min(articleContent.length, popover.char_offset_end + 300)
        const article_context = articleContent.slice(ctxStart, ctxEnd)
        fetch(`/api/submissions/${article.id}/fact-check`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ flag_id: newFlag.id, selected_text: popover.selected_text, article_context }),
        }).then(r => r.json()).then((fc) => {
          setFlags(fs => fs.map(f => f.id === newFlag.id
            ? { ...f, fact_check_verdict: fc.verdict, fact_check_result: JSON.stringify(fc), flag_type: fc.verdict === 'Inaccurate' ? 'revision' : f.flag_type }
            : f))
        }).catch(() => {})
      }
      setPopover(null)
      setPopoverType(null)
      setPopoverComment('')
      window.getSelection()?.removeAllRanges()
    } catch (err) {
      alert(err.message)
    }
  }

  const submitReview = async () => {
    if (!article || flags.length === 0) return
    setSubmittingReview(true)
    try {
      const res = await fetch(`/api/submissions/${article.id}/revision-request`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision_mode: revisionMode }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Review request failed')
      setArticle(a => ({ ...a, status: 'revision_pending' }))
      setShowReviewModal(false)
      setToast("Flags submitted. We'll notify you when the review is ready.")
      setTimeout(() => setToast(null), 5000)
    } catch (err) {
      alert(err.message)
    } finally {
      setSubmittingReview(false)
    }
  }

  if (loading) {
    return (
      <div style={{ background: 'var(--bg)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--text-light)', fontSize: '0.9375rem' }}>Loading article...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ background: 'var(--bg)', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
        <p style={{ color: '#b05050', fontSize: '0.9375rem' }}>{error}</p>
        <button onClick={() => navigate('/dashboard')} style={{ background: 'var(--text)', color: 'var(--card)', border: 'none', padding: '0.5rem 1.25rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.875rem' }}>Back to Dashboard</button>
      </div>
    )
  }

  if (!article) return null

  // Known author fallback map
  const KNOWN_AUTHORS = { 'ben-ryder': 'Ben Ryder', 'andy-husek': 'Andy Husek', 'sydney': 'Sydney', 'adam-scepaniak': 'Adam Scepaniak' }

  // Author display name lookup
  const authorProfile = authorProfiles.find(p => p.slug === article.author)
  const authorDisplayName = authorProfile?.display_name || authorProfile?.name || KNOWN_AUTHORS[article.author] || article.author || 'Unknown'

  console.log('article.article_format:', article.article_format)
  console.log('FORMAT_LABELS:', FORMAT_LABELS)
  console.log('formatLabel computed:', FORMAT_LABELS[article.article_format])

  // Format badge label
  const formatLabel = FORMAT_LABELS[article.article_format] || article.article_format || 'Article'

  // Date formatting: "April 12, 2026"
  const dateStr = new Date(article.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  // Read time: article content word count / 238, rounded up
  const readTimeMinutes = articleContent ? Math.ceil(articleContent.split(/\s+/).length / 238) : 0
  const readTimeDisplay = readTimeMinutes > 0 ? `${readTimeMinutes} min read` : ''

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', paddingBottom: 80 }}>
      {/* Back link - fixed at top of page */}
      <div style={{ maxWidth: '740px', margin: '0 auto', padding: '1rem 1.5rem 0' }}>
        <button
          onClick={() => navigate('/dashboard')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8125rem', color: 'var(--text-light)', fontFamily: 'Inter, sans-serif', padding: '0', textAlign: 'left' }}
        >
          Back to Dashboard
        </button>
      </div>

      <div style={{ maxWidth: '740px', margin: '0 auto', padding: '1.5rem 1.5rem 0' }}>
        <article>
          <header style={{ marginBottom: '1.5rem' }}>
            {/* Format badge */}
            <span style={{ display: 'inline-block', fontSize: '0.6875rem', fontWeight: '600', color: 'var(--amber-dim)', background: 'var(--amber-light)', padding: '0.2rem 0.5rem', borderRadius: '3px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem', fontFamily: 'Inter, sans-serif' }}>
              {formatLabel}
            </span>

            {/* Article title — always rendered from article.topic so pages work
                even when markdown content does not start with an H1. */}
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(24px, 5vw, 40px)', margin: '0 0 0.75rem', lineHeight: 1.2, color: 'var(--text)' }}>
              {article.topic}
            </h1>

            {/* Meta row */}
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', fontSize: '0.875rem', color: 'var(--text-light)', fontFamily: 'Inter, sans-serif', marginBottom: '1.5rem' }}>
              <span>{authorDisplayName}</span>
              <span>·</span>
              <span>{dateStr}</span>
              {readTimeDisplay && (
                <>
                  <span>·</span>
                  <span>{readTimeDisplay}</span>
                </>
              )}
            </div>

            {/* Horizontal divider */}
            <div style={{ borderBottom: '1px solid var(--border-light)' }} />
          </header>

          {/* Photo gallery */}
          {(() => {
            let galleryImages = []
            try { galleryImages = JSON.parse(article.article_images || '[]') } catch {}
            if (!galleryImages.length) return null
            return (
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
                  {galleryImages.map((img, i) => (
                    <a key={i} href={`/api/images/serve?path=${img}`} target="_blank" rel="noopener noreferrer" style={{ display: 'block' }}>
                      <img
                        src={`/api/images/serve?path=${img}`}
                        alt=""
                        style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: '4px', cursor: 'pointer', display: 'block' }}
                      />
                    </a>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* YouTube embed */}
          {(() => {
            const videoId = extractYouTubeVideoId(article.youtube_url)
            if (!videoId) return null
            return (
              <div style={{ marginBottom: '2rem' }}>
                <iframe
                  width="100%"
                  height="auto"
                  style={{ aspectRatio: '16/9', borderRadius: '8px', display: 'block' }}
                  src={`https://www.youtube.com/embed/${videoId}`}
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  title="YouTube video"
                />
              </div>
            )
          })()}

          {/* Transcript toggle */}
          {article.youtube_transcript && (
            <div style={{ marginBottom: '2rem' }}>
              <button
                onClick={() => setShowTranscript(v => !v)}
                style={{ background: 'none', border: '1px solid var(--amber)', color: 'var(--amber)', padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600 }}
              >
                {showTranscript ? 'Hide transcript' : 'View transcript'}
              </button>
              {showTranscript && (
                <div style={{ marginTop: '1rem', padding: '1rem', background: 'var(--card-alt)', border: '1px solid var(--border-light)', borderRadius: '6px', maxHeight: '300px', overflowY: 'auto', fontSize: '0.875rem', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                  {article.youtube_transcript}
                </div>
              )}
            </div>
          )}

          {/* Audio player */}
          {article.audio_path && (
            <div style={{ marginBottom: '2rem', background: 'var(--amber-light)', border: '1px solid var(--amber)', borderRadius: '8px', padding: '1rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--amber-dim)', marginBottom: '0.75rem' }}>Audio Version</div>
              <audio
                ref={audioRef}
                src={`/api/images/serve?path=${article.audio_path}`}
                onTimeUpdate={() => {
                  if (audioRef.current) setAudioProgress(audioRef.current.currentTime)
                }}
                onLoadedMetadata={() => {
                  if (audioRef.current) setAudioDuration(audioRef.current.duration)
                }}
                onEnded={() => setAudioPlaying(false)}
                style={{ display: 'none' }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <button
                  onClick={() => {
                    if (!audioRef.current) return
                    if (audioPlaying) { audioRef.current.pause(); setAudioPlaying(false) }
                    else { audioRef.current.play(); setAudioPlaying(true) }
                  }}
                  style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--amber-dim)', color: 'var(--card)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '1rem' }}
                >
                  {audioPlaying ? '\u23F8' : '\u25B6'}
                </button>
                <div style={{ flex: 1 }}>
                  <div style={{ height: '4px', background: 'var(--border-light)', borderRadius: '2px', marginBottom: '0.25rem', cursor: 'pointer' }}
                    onClick={(e) => {
                      if (!audioRef.current) return
                      const rect = e.currentTarget.getBoundingClientRect()
                      const ratio = (e.clientX - rect.left) / rect.width
                      audioRef.current.currentTime = ratio * audioRef.current.duration
                      setAudioProgress(ratio * audioRef.current.duration)
                    }}
                  >
                    <div style={{ height: '100%', background: 'var(--amber-dim)', borderRadius: '2px', width: `${audioDuration ? (audioProgress / audioDuration) * 100 : 0}%`, transition: 'width 0.1s linear' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-light)' }}>
                    <span>{audioDuration ? formatTime(audioProgress) : '0:00'}</span>
                    <span>{audioDuration ? formatTime(audioDuration) : '--:--'}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
                  {[1, 1.25, 1.5].map(speed => (
                    <button
                      key={speed}
                      onClick={() => {
                        if (audioRef.current) { audioRef.current.playbackRate = speed; setAudioSpeed(speed) }
                      }}
                      style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', border: '1px solid', borderColor: audioSpeed === speed ? 'var(--amber-dim)' : 'var(--border)', background: audioSpeed === speed ? 'var(--amber-dim)' : 'transparent', color: audioSpeed === speed ? 'var(--card)' : 'var(--text-light)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}
                    >
                      {speed}x
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Featured image — AI-generated, only when generated_image_key is set */}
          {article?.generated_image_key && (
            <figure style={{ marginBottom: 32, borderRadius: 10, overflow: 'hidden', boxShadow: '0 4px 24px rgba(34,26,16,0.1)', margin: '0 0 32px 0' }}>
              <img
                src={`/api/submissions/${article.id}/featured-image`}
                alt={article.topic || ''}
                style={{ width: '100%', height: 'auto', display: 'block' }}
              />
              <figcaption style={{ fontSize: 12, color: 'var(--text-light)', padding: '8px 12px', fontStyle: 'italic', background: 'var(--card)', borderTop: '1px solid var(--border-faint)' }}>
                AI-generated featured image.
              </figcaption>
            </figure>
          )}

          {/* Article body */}
          <div
            ref={articleBodyRef}
            className="article-body"
            onMouseUp={handleMouseUp}
            dangerouslySetInnerHTML={{ __html: marked.parse(articleContent || '') }}
          />

          {/* Author bio card */}
          {(() => {
            const profile = authorProfiles.find(p => p.slug === article.author)
            const initials = (name) => name ? name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '??'
            const bioText = profile?.style_guide ? profile.style_guide.slice(0, 200) : 'Field reviewer and outdoor content writer.'
            return (
              <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '24px', marginTop: '2rem', display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--amber-dim)', color: 'var(--amber-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', fontWeight: 700, flexShrink: 0 }}>
                  {initials(authorDisplayName)}
                </div>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: '0.25rem' }}>{authorDisplayName}</div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-light)' }}>{bioText}</div>
                </div>
              </div>
            )
          })()}

          {/* Admin-only feedback panel */}
          {(user?.role === 'admin' || user?.role === 'super_admin') && (
            <div style={{ marginTop: '2.5rem', padding: '1.5rem', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, fontFamily: 'var(--font-ui)' }}>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.2em', color: 'var(--amber)', marginBottom: '1.25rem' }}>
                Article Feedback
              </div>

              {fbSubmitted ? (
                <div style={{ color: '#5ab85a', fontSize: '0.875rem', fontFamily: 'Inter, sans-serif' }}>Feedback submitted.</div>
              ) : (
                <>
                  {/* 10-star rating */}
                  <div style={{ marginBottom: '1.25rem' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: '0.5rem' }}>Overall rating</div>
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      {[1,2,3,4,5,6,7,8,9,10].map(star => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setFbRating(star)}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            fontSize: '1.375rem', lineHeight: 1, padding: '0 1px',
                            color: star <= fbRating ? 'var(--amber)' : 'var(--border)',
                            transition: 'color 0.1s',
                          }}
                        >★</button>
                      ))}
                      {fbRating > 0 && (
                        <span style={{ fontSize: '0.75rem', color: '#5a7a5a', marginLeft: 6, alignSelf: 'center', fontFamily: 'Inter, sans-serif' }}>
                          {fbRating}/10
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 5 yes/no questions */}
                  {[
                    { key: 'q1', label: 'Does the article sound like the selected author voice?' },
                    { key: 'q2', label: 'Is the content factually accurate?' },
                    { key: 'q3', label: 'Does the article meet the optimization target?' },
                    { key: 'q4', label: 'Is the writing free of AI patterns and tells?' },
                    { key: 'q5', label: 'Would you publish this article without major edits?' },
                  ].map(({ key, label }) => (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 0', gap: '1rem', borderBottom: '1px solid var(--border-faint)', background: 'transparent' }}>
                      <span style={{ fontSize: 14, color: 'var(--text)', flex: 1 }}>{label}</span>
                      <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                        {[{ val: true, label: 'Yes' }, { val: false, label: 'No' }].map(({ val, label: btnLabel }) => {
                          const selected = fbAnswers[key] === val
                          const isYes = val === true
                          return (
                            <button
                              key={btnLabel}
                              type="button"
                              onClick={() => setFbAnswers(a => ({ ...a, [key]: val }))}
                              style={{
                                padding: '0.3rem 0.85rem',
                                borderRadius: 6,
                                border: '1px solid',
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: 'pointer',
                                transition: 'all 0.12s',
                                borderColor: selected ? (isYes ? 'var(--green)' : 'var(--error)') : 'var(--border)',
                                background: selected ? (isYes ? 'var(--green)' : 'var(--error-bg)') : 'transparent',
                                color: selected ? (isYes ? 'var(--card)' : 'var(--error)') : 'var(--text-mid)',
                              }}
                            >{btnLabel}</button>
                          )
                        })}
                      </div>
                    </div>
                  ))}

                  {/* Notes */}
                  <div style={{ marginTop: '1rem', marginBottom: '1rem' }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: '0.375rem' }}>Notes (optional)</label>
                    <textarea
                      value={fbNotes}
                      onChange={e => setFbNotes(e.target.value)}
                      placeholder="Specific observations..."
                      style={{ width: '100%', minHeight: 80, padding: 10, background: 'var(--surface-inp)', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 14, fontFamily: 'var(--font-ui)', resize: 'vertical', boxSizing: 'border-box', color: 'var(--text)' }}
                    />
                  </div>

                  {/* Submit */}
                  <button
                    onClick={() => {
                      if (!fbRating) return
                      fetch(`/api/articles/${article.id}/feedback`, {
                        method: 'POST',
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          star_rating: fbRating,
                          notes: fbNotes,
                          answers: {
                            q1: fbAnswers.q1,
                            q2: fbAnswers.q2,
                            q3: fbAnswers.q3,
                            q4: fbAnswers.q4,
                            q5: fbAnswers.q5,
                          },
                        })
                      }).then(res => res.json()).then(data => {
                        if (data.error) throw new Error(data.error)
                        setFbSubmitted(true)
                      }).catch(err => alert('Error: ' + err.message))
                    }}
                    disabled={!fbRating}
                    style={{
                      background: fbRating ? 'var(--green)' : 'var(--border)',
                      color: fbRating ? 'var(--card)' : 'var(--text-dim)',
                      border: 'none',
                      padding: '0.65rem 1.5rem',
                      borderRadius: 7,
                      fontSize: 14,
                      cursor: fbRating ? 'pointer' : 'default',
                      fontWeight: 600,
                      fontFamily: 'var(--font-ui)',
                      transition: 'all 0.15s',
                    }}
                  >
                    Submit Feedback
                  </button>
                </>
              )}
            </div>
          )}


        </article>
      </div>

      {/* ─── Selection popover ─────────────────────────────────────────── */}
      {popover && (
        <div
          style={{
            position: 'absolute',
            left: Math.max(16, Math.min(popover.x - 220, (window.innerWidth || 1200) - 456)),
            top: popover.y,
            width: 440,
            background: 'var(--card)',
            border: '1.5px solid var(--border)',
            borderRadius: 10,
            boxShadow: '0 10px 40px rgba(34,26,16,0.18)',
            padding: 14,
            zIndex: 500,
            fontFamily: 'var(--font-ui)',
          }}
          onMouseDown={e => e.stopPropagation()}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
            Flag this text
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
            {[
              { type: 'revision',    label: 'Flag for Revision', color: 'var(--amber)', bg: 'var(--amber-light)' },
              { type: 'fact-check',  label: 'Fact Check',        color: 'var(--info)',  bg: 'var(--info-bg)' },
              { type: 'not-sure',    label: 'Not Sure',           color: 'var(--amber)', bg: 'var(--amber-light)' },
              { type: 'fabricated',  label: 'This is Fabricated', color: 'var(--error)', bg: 'var(--error-bg)' },
            ].map(opt => (
              <button
                key={opt.type}
                type="button"
                onClick={() => setPopoverType(opt.type)}
                style={{
                  padding: '8px 10px',
                  fontSize: 12,
                  fontWeight: 600,
                  borderRadius: 6,
                  cursor: 'pointer',
                  border: popoverType === opt.type ? `2px solid ${opt.color}` : `1px solid var(--border)`,
                  background: popoverType === opt.type ? opt.color : opt.bg,
                  color: popoverType === opt.type ? '#fff' : opt.color,
                  textAlign: 'left',
                  transition: 'all 0.12s',
                }}
              >{opt.label}</button>
            ))}
          </div>
          <textarea
            value={popoverComment}
            onChange={e => setPopoverComment(e.target.value)}
            placeholder="Add a comment (optional)…"
            style={{
              width: '100%', boxSizing: 'border-box',
              minHeight: 60, padding: 8, fontSize: 13,
              background: 'var(--surface-inp)',
              border: '1.5px solid var(--border)', borderRadius: 6,
              fontFamily: 'var(--font-ui)', resize: 'vertical', color: 'var(--text)',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <button
              type="button"
              onClick={() => { setPopover(null); window.getSelection()?.removeAllRanges() }}
              style={{ padding: '6px 12px', fontSize: 12, fontWeight: 600, background: 'transparent', color: 'var(--text-light)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer' }}
            >Cancel</button>
            <button
              type="button"
              onClick={submitFlag}
              disabled={!popoverType}
              style={{
                padding: '6px 14px', fontSize: 12, fontWeight: 600,
                background: popoverType ? 'var(--green)' : 'var(--border)',
                color: popoverType ? '#fff' : 'var(--text-dim)',
                border: 'none', borderRadius: 6,
                cursor: popoverType ? 'pointer' : 'default',
              }}
            >Save Flag</button>
          </div>
        </div>
      )}

      {/* ─── Sticky flag bar ────────────────────────────────────────────── */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'var(--card)', borderTop: '1px solid var(--border)',
        padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        boxShadow: '0 -2px 14px rgba(34,26,16,0.08)', zIndex: 400, fontFamily: 'var(--font-ui)',
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
          {article.status === 'revision_pending' || article.status === 'review_ready'
            ? 'Review Pending'
            : `${flags.length} flag${flags.length === 1 ? '' : 's'}`}
        </div>
        <button
          type="button"
          onClick={() => setShowReviewModal(true)}
          disabled={flags.length === 0 || article.status === 'revision_pending' || article.status === 'review_ready'}
          style={{
            padding: '8px 18px', fontSize: 13, fontWeight: 600,
            background: (flags.length > 0 && article.status !== 'revision_pending' && article.status !== 'review_ready') ? 'var(--green)' : 'var(--border)',
            color: (flags.length > 0 && article.status !== 'revision_pending' && article.status !== 'review_ready') ? '#fff' : 'var(--text-dim)',
            border: 'none', borderRadius: 7,
            cursor: (flags.length > 0 && article.status !== 'revision_pending' && article.status !== 'review_ready') ? 'pointer' : 'default',
          }}
        >Submit for Review</button>
      </div>

      {/* ─── Review mode modal ──────────────────────────────────────────── */}
      {showReviewModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 600 }}>
          <div style={{ width: 480, maxWidth: '90vw', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 22, fontFamily: 'var(--font-ui)' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, marginBottom: 6 }}>Submit for Review</div>
            <div style={{ fontSize: 13, color: 'var(--text-light)', marginBottom: 14 }}>Choose how the revision agent should handle your flags.</div>
            {[
              { id: 'full',     title: 'Full Rewrite',  desc: 'Revise flagged sections and improve surrounding flow and coherence.' },
              { id: 'surgical', title: 'Surgical Fix',  desc: 'Touch only the flagged sections. Leave everything else untouched.' },
            ].map(opt => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setRevisionMode(opt.id)}
                style={{
                  width: '100%', textAlign: 'left', padding: 14, marginBottom: 8,
                  background: revisionMode === opt.id ? 'var(--green)' : 'var(--card)',
                  color: revisionMode === opt.id ? '#fff' : 'var(--text)',
                  border: revisionMode === opt.id ? '2px solid var(--green)' : '1.5px solid var(--border)',
                  borderRadius: 8, cursor: 'pointer', display: 'block',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{opt.title}</div>
                <div style={{ fontSize: 12, opacity: 0.85 }}>{opt.desc}</div>
              </button>
            ))}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              <button type="button" onClick={() => setShowReviewModal(false)} style={{ padding: '8px 14px', fontSize: 13, background: 'transparent', color: 'var(--text-light)', border: '1px solid var(--border)', borderRadius: 7, cursor: 'pointer' }}>Cancel</button>
              <button type="button" onClick={submitReview} disabled={submittingReview} style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600, background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 7, cursor: submittingReview ? 'default' : 'pointer' }}>
                {submittingReview ? 'Submitting…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 70, left: '50%', transform: 'translateX(-50%)', background: 'var(--text)', color: 'var(--card)', padding: '10px 18px', borderRadius: 8, fontSize: 13, zIndex: 700, boxShadow: '0 4px 20px rgba(0,0,0,0.2)', fontFamily: 'var(--font-ui)' }}>
          {toast}
        </div>
      )}
    </div>
  )
}

// ─── ReviewPage ────────────────────────────────────────────────────────────
function ReviewPage({ navigate }) {
  const { user } = useAuth()
  const [submission, setSubmission] = useState(null)
  const [reviews, setReviews] = useState([])
  const [choices, setChoices] = useState({}) // { flag_id: 'remove'|'option_a'|'option_b' }
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState('')

  const submissionId = window.location.pathname.split('/content/')[1]?.split('/review')[0]

  useEffect(() => {
    if (!user) { navigate('/login'); return }
    if (!submissionId) { setError('No submission id'); setLoading(false); return }
    (async () => {
      try {
        const subRes = await fetch(`/api/submissions/${submissionId}`, { credentials: 'include' })
        const subData = await subRes.json()
        if (!subRes.ok) throw new Error(subData.error || 'Failed to load submission')
        setSubmission(subData.submission)
        const flagsRes = await fetch(`/api/submissions/${submissionId}/flags`, { credentials: 'include' })
        const flagsData = await flagsRes.json()
        const flagById = {}
        for (const f of (flagsData.flags || [])) flagById[f.id] = f
        // revision_reviews are fetched via a thin endpoint: reuse GET flags and join locally using D1 by calling a custom endpoint.
        const revRes = await fetch(`/api/submissions/${submissionId}/reviews`, { credentials: 'include' })
        const revData = await revRes.json()
        if (revRes.ok && revData.reviews) {
          setReviews(revData.reviews.map(r => ({ ...r, flag: flagById[r.flag_id] })))
        }
      } catch (err) { setError(err.message) } finally { setLoading(false) }
    })()
  }, [user, submissionId])

  const allChosen = reviews.length > 0 && reviews.every(r => choices[r.flag_id])

  const apply = async () => {
    setApplying(true)
    try {
      const payload = { selections: reviews.map(r => ({ flag_id: r.flag_id, chosen_option: choices[r.flag_id] })) }
      const res = await fetch(`/api/submissions/${submissionId}/apply-revisions`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Apply failed')
      navigate(`/content/${submissionId}`)
    } catch (err) { alert(err.message) } finally { setApplying(false) }
  }

  if (loading) return <div style={{ padding: 40, color: 'var(--text-light)', textAlign: 'center' }}>Loading review…</div>
  if (error) return <div style={{ padding: 40, color: 'var(--error)' }}>{error}</div>
  if (!reviews.length) return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <div style={{ marginBottom: 14 }}>No reviews to apply.</div>
      <button onClick={() => navigate(`/content/${submissionId}`)} style={{ padding: '8px 16px', background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer' }}>Back to article</button>
    </div>
  )

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', padding: '2rem 1.5rem 120px' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <button onClick={() => navigate(`/content/${submissionId}`)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-light)', fontSize: 13, marginBottom: 12 }}>← Back to article</button>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(22px, 4vw, 32px)', marginBottom: 6 }}>Review Revisions</h1>
        <div style={{ color: 'var(--text-light)', marginBottom: 24, fontSize: 14 }}>{submission?.topic} — pick one resolution per flag.</div>

        {reviews.map((r) => (
          <div key={r.id} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 16 }}>
            <div style={{ borderLeft: '3px solid var(--amber)', paddingLeft: 12, marginBottom: 10 }}>
              <div style={{ fontFamily: 'var(--font-read)', fontStyle: 'italic', fontSize: 15, color: 'var(--text)' }}>"{r.original_text}"</div>
            </div>
            {r.context_buffer && (
              <div style={{ fontSize: 12, color: 'var(--text-light)', marginBottom: 10, whiteSpace: 'pre-wrap' }}>{r.context_buffer}</div>
            )}
            {r.finding && (
              <div style={{ fontStyle: 'italic', fontSize: 13, color: 'var(--text-mid)', marginBottom: 12 }}>{r.finding}</div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {[
                { key: 'remove',   label: 'Remove It',  text: r.option_remove || 'Remove this section', color: 'var(--error)' },
                { key: 'option_a', label: 'Option A',   text: r.option_a || '', color: 'var(--green)' },
                { key: 'option_b', label: 'Option B',   text: r.option_b || '', color: 'var(--green)' },
              ].map(opt => {
                const selected = choices[r.flag_id] === opt.key
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setChoices(c => ({ ...c, [r.flag_id]: opt.key }))}
                    style={{
                      textAlign: 'left', padding: 14,
                      background: selected ? opt.color : 'var(--card)',
                      color: selected ? '#fff' : 'var(--text)',
                      border: selected ? `2px solid ${opt.color}` : `1.5px solid ${opt.color}`,
                      borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font-ui)',
                    }}
                  >
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
                      <span>{opt.label}</span>
                      {selected && <span>✓</span>}
                    </div>
                    <div style={{ fontSize: 13, lineHeight: 1.5 }}>{opt.text}</div>
                  </button>
                )
              })}
            </div>
          </div>
        ))}

        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'var(--card)', borderTop: '1px solid var(--border)', padding: '12px 20px', display: 'flex', justifyContent: 'flex-end', boxShadow: '0 -2px 14px rgba(34,26,16,0.08)', zIndex: 400 }}>
          <button
            type="button"
            onClick={apply}
            disabled={!allChosen || applying}
            style={{
              padding: '10px 20px', fontSize: 14, fontWeight: 600,
              background: allChosen ? 'var(--green)' : 'var(--border)',
              color: allChosen ? '#fff' : 'var(--text-dim)',
              border: 'none', borderRadius: 7,
              cursor: allChosen && !applying ? 'pointer' : 'default',
            }}
          >
            {applying ? 'Applying…' : 'Apply Selections'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Reset ─────────────────────────────────────────────────────────────────
function Reset({ navigate }) {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [token, setToken] = useState(null)
  const [password, setPassword] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const t = params.get('token')
    if (t) setToken(t)
  }, [])


  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api('/api/auth/reset', { method: 'POST', body: JSON.stringify({ email }) })
      setSent(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handlePasswordReset = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api('/api/auth/reset-confirm', { method: 'POST', body: JSON.stringify({ token, password }) })
      setDone(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (done) return (
    <div className="page"><div className="container"><div className="form-card"><div className="confirm-icon">✓</div><h1 className="confirm-title">Password updated.</h1><p className="confirm-sub">You can log in now.</p><button className="btn-primary" style={{ width: '100%' }} onClick={() => navigate('/login')}>Back to login</button></div></div></div>
  )


  if (token) return (
    <div className="page"><div className="container"><div className="form-card"><h1 className="form-title">New password.</h1><p className="form-sub">Enter your new password.</p><form onSubmit={handlePasswordReset}><div className="form-group"><label className="form-label">Password</label><input type="password" className="form-input" placeholder="Min. 8 characters" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} /></div>{error && <p style={{ color: 'var(--error)', fontSize: 13, marginBottom: 16 }}>{error}</p>}<button type="submit" className="btn-primary" style={{ width: '100%' }} disabled={loading}>{loading ? 'Saving...' : 'Save password'}</button></form></div></div></div>
  )

  if (sent) return (
    <div className="page"><div className="container"><div className="form-card"><div className="confirm-icon">✓</div><h1 className="confirm-title">Check your inbox.</h1><p className="confirm-sub">If an account exists with that email, we've sent a password reset link. It expires in 30 minutes.</p><button className="btn-secondary" style={{ width: '100%' }} onClick={() => navigate('/login')}>Back to login</button></div></div></div>
  )

  return (
    <div className="page"><div className="container"><div className="form-card"><h1 className="form-title">Reset your password.</h1><p className="form-sub">We'll send you a link to create a new password.</p><form onSubmit={handleSubmit}><div className="form-group"><label className="form-label">Email</label><input type="email" className="form-input" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required /></div>{error && <p style={{ color: 'var(--error)', fontSize: 13, marginBottom: 16 }}>{error}</p>}<button type="submit" className="btn-primary" style={{ width: '100%' }} disabled={loading}>{loading ? 'Sending...' : 'Send Reset Link'}</button><p className="form-link"><a href="#" onClick={e => { e.preventDefault(); navigate('/login') }}>Back to login</a></p></form></div></div></div>
  )
}

// ─── LegislativeGate ────────────────────────────────────────────────────────
// Only super_admin or users with legislative-intelligence:view grant may reach
// the page. Everyone else is bounced to /dashboard.
function LegislativeGate({ navigate }) {
  const { user } = useAuth()
  const [allowed, setAllowed] = useState(null) // null = checking, true/false after
  useEffect(() => {
    if (!user) { setAllowed(false); return }
    if (user.super_admin) { setAllowed(true); return }
    fetch('/api/access/my', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) { setAllowed(false); return }
        if (d.super_admin || d.all_access) { setAllowed(true); return }
        const ok = (d.grants || []).some(g => g.page_key === 'legislative-intelligence' && g.action_key === 'view')
        setAllowed(ok)
      })
      .catch(() => setAllowed(false))
  }, [user])
  useEffect(() => {
    if (allowed === false) navigate('/dashboard')
  }, [allowed, navigate])
  if (allowed === null) return <div style={{ padding: 60, color: 'var(--text-light)', textAlign: 'center' }}>Checking access…</div>
  if (!allowed) return null
  return <LegislativeIntelligence navigate={navigate} />
}

// ─── AdminGuard ─────────────────────────────────────────────────────────────
function AdminGuard({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" />;
  if (user.role !== 'admin' && user.role !== 'super_admin' && !user.impersonating) return <Navigate to="/dashboard" />;
  return children;
}

// ─── App ────────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const { page, navigate } = usePage()

  const fetchUser = async () => {
    try {
      const data = await api('/api/auth/me')
      setUser(data.user)
    } catch (_) {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchUser() }, [])

  const [syncData, setSyncData] = useState(null)
  const [editingDraft, setEditingDraft] = useState(null)
  const syncUser = async () => {
    try {
      const data = await api('/api/dashboard/sync')
      setSyncData(data)
      return data
    } catch { return null }
  }
  const authValue = { user, loading, fetchUser, syncUser, syncData }

  const useSidebar = !!user && isAppRoute(page)

  // Standalone preview frame — bypasses all app chrome so it can render
  // cleanly inside the Brand Bible admin iframe. Must be checked before
  // the main layout so sidebar/top-nav don't render on top of the preview.
  if (page === '/admin/brand-bible/preview-frame') {
    return (
      <AuthContext.Provider value={authValue}>
        {loading ? null : user ? <BrandBiblePreviewFrame /> : <Login navigate={navigate} />}
      </AuthContext.Provider>
    );
  }

  // Atomic Comp share view — public, no auth, no chrome. The recipient of
  // a share link should see only the comp.
  if (page.startsWith('/c/')) {
    return (
      <AuthContext.Provider value={authValue}>
        <AtomicCompShare />
      </AuthContext.Provider>
    );
  }

  // Atomic Comp builder — standalone full-viewport editor. Bypasses the
  // sidebar shell so the two-column layout (edit panel + canvas) gets the
  // full viewport height without fighting the app chrome.
  if (page === '/atomic/comp' || page.startsWith('/atomic/comp/')) {
    return (
      <AuthContext.Provider value={authValue}>
        {loading ? null : user ? <AtomicComp navigate={navigate} /> : <Login navigate={navigate} syncUser={syncUser} />}
      </AuthContext.Provider>
    );
  }

  // Quick Podcast — also standalone (no sidebar). Structurally separable
  // for the future product spinout; treated like a different app that
  // happens to share auth.
  if (page === '/listen') {
    return (
      <AuthContext.Provider value={authValue}>
        {loading ? null : user ? <QuickPodcast navigate={navigate} /> : <Login navigate={navigate} />}
      </AuthContext.Provider>
    );
  }

  return (
    <AuthContext.Provider value={authValue}>
      {user?.impersonating && <ImpersonationBanner user={user} syncUser={syncUser} navigate={navigate} />}
      {useSidebar
        ? <Sidebar navigate={navigate} page={page} syncUser={syncUser} />
        : <Nav navigate={navigate} syncUser={syncUser} />}
      <div className={useSidebar ? 'app-main' : 'page'} style={user?.impersonating ? { paddingTop: 38 } : undefined}>
        {useSidebar && (
          <div className="app-topbar">
            <div style={{ flex: 1 }} />
            <NotificationBell syncUser={syncUser} />
          </div>
        )}
        {page === '/login' && <Login navigate={navigate} syncUser={syncUser} />}
        {page === '/request' && <RequestAccess navigate={navigate} />}
        {page === '/register' && <Register navigate={navigate} />}
        {page === '/author' && (loading ? null : user ? <Author navigate={navigate} syncUser={syncUser} editingDraft={editingDraft} onEditDone={() => setEditingDraft(null)} /> : <Login navigate={navigate} syncUser={syncUser} />)}
        {page === '/dashboard' && (loading ? null : user ? <Dashboard /> : <Login navigate={navigate} />)}
        {page === '/account' && (loading ? null : user ? <Account navigate={navigate} syncUser={syncUser} /> : <Login navigate={navigate} syncUser={syncUser} />)}
        {page === '/writer' && (loading ? null : user ? <Writer navigate={navigate} syncUser={syncUser} /> : <Login navigate={navigate} syncUser={syncUser} />)}
        {page === '/admin' && (loading ? null : user ? <AdminGuard><AdminDashboard /></AdminGuard> : <Login navigate={navigate} />)}
        {page === '/admin/brand-bible' && (loading ? null : user ? <AdminGuard><AdminBrandBible /></AdminGuard> : <Login navigate={navigate} />)}
        {page === '/admin/features' && (loading ? null : user ? <AdminGuard><AdminFeatures /></AdminGuard> : <Login navigate={navigate} />)}
        {page === '/admin/bugs' && (loading ? null : user ? <AdminGuard><AdminBugs /></AdminGuard> : <Login navigate={navigate} />)}
        {page === '/admin/hosts' && (loading ? null : user ? <AdminGuard><AdminHosts /></AdminGuard> : <Login navigate={navigate} />)}
        {page === '/tts' && (loading ? null : user ? <TTSStudio /> : <Login navigate={navigate} syncUser={syncUser} />)}
        {(page === '/podcast-studio' || page.startsWith('/podcast-studio/')) && (loading ? null : user ? <PodcastStudio page={page} navigate={navigate} /> : <Login navigate={navigate} syncUser={syncUser} />)}
        {page.match(/^\/content\/[^/]+\/review$/) && (loading ? null : user ? <ReviewPage navigate={navigate} /> : <Login navigate={navigate} />)}
        {page.startsWith('/content/') && !page.match(/^\/content\/[^/]+\/review$/) && (loading ? null : user ? <ContentPage navigate={navigate} user={user} /> : <Login navigate={navigate} />)}
        {page === '/reset' && <Reset navigate={navigate} />}
        {page === '/about' && <About navigate={navigate} />}
        {page === '/platform' && <Platform navigate={navigate} />}
        {page === '/documentation' && <Documentation navigate={navigate} />}
        {page === '/author-frameworks' && <AuthorFrameworks navigate={navigate} />}
        {page === '/seo-methodology' && <SeoMethodology navigate={navigate} />}
        {page === '/brief/infographic' && (loading ? null : user ? <InfographicBrief navigate={navigate} /> : <Login navigate={navigate} syncUser={syncUser} />)}
        {page === '/prompt-builder' && (loading ? null : user ? <PromptBuilder /> : <Login navigate={navigate} syncUser={syncUser} />)}
        {page === '/brief/email' && (loading ? null : user ? <EmailBrief navigate={navigate} /> : <Login navigate={navigate} syncUser={syncUser} />)}
        {page.startsWith('/email-preview/') && (loading ? null : user ? <EmailPreview id={page.split('/')[2]} navigate={navigate} /> : <Login navigate={navigate} syncUser={syncUser} />)}
        {page === '/brief/presentation' && (loading ? null : user ? <PresentationBrief navigate={navigate} /> : <Login navigate={navigate} syncUser={syncUser} />)}
        {page === '/planner' && (loading ? null : user ? <Planner navigate={navigate} /> : <Login navigate={navigate} syncUser={syncUser} />)}
        {page === '/comp-studio' && (loading ? null : user ? <CompStudio /> : <Login navigate={navigate} syncUser={syncUser} />)}
        {page === '/youtube-transcript' && (loading ? null : user ? <YouTubeTranscript navigate={navigate} /> : <Login navigate={navigate} syncUser={syncUser} />)}
        {page === '/legislative-intelligence' && (loading ? null : user ? <LegislativeGate navigate={navigate} /> : <Login navigate={navigate} syncUser={syncUser} />)}
        {page === '/press-release' && (loading ? null : user ? <PressRelease navigate={navigate} /> : <Login navigate={navigate} syncUser={syncUser} />)}
        {page === '/brief-builder' && (loading ? null : user ? <BriefBuilder navigate={navigate} /> : <Login navigate={navigate} syncUser={syncUser} />)}
        {page.match(/^\/briefs\/[^/]+\/edit$/) && (loading ? null : user ? <BriefBuilder navigate={navigate} editId={page.split('/')[2]} /> : <Login navigate={navigate} syncUser={syncUser} />)}
        {page.match(/^\/planner\/building\/[^/]+$/) && (loading ? null : user ? <PlannerBuilding navigate={navigate} id={page.split('/')[3]} /> : <Login navigate={navigate} syncUser={syncUser} />)}
        {page.match(/^\/planner\/(?!building\/)[^/]+$/) && (loading ? null : user ? <PlannerDetail navigate={navigate} /> : <Login navigate={navigate} syncUser={syncUser} />)}
        {page.match(/^\/share\/[^/]+$/) && <ShareRedirect />}
        {page === '/' && <Landing navigate={navigate} />}
      </div>
      {user && <SiteAgentPanel user={user} currentPage={page} />}
    </AuthContext.Provider>
  )
}
