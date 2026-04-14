import { useState, useEffect, createContext, useContext, useRef } from 'react'
import { marked } from 'marked'
import Dashboard from './pages/Dashboard'
import AdminDashboard from './pages/AdminDashboard'
import About from './pages/About'
import Platform from './pages/Platform'
import Documentation from './pages/Documentation'
import AuthorFrameworks from './pages/AuthorFrameworks'
import SeoMethodology from './pages/SeoMethodology'

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

// Override H1 in markdown body to render as H2 (page title is the real H1)
const renderer = new marked.Renderer()
let firstHeadingSkipped = false
renderer.heading = function(token) {
  if (!firstHeadingSkipped && (token.depth === 1 || token.depth === 2)) {
    firstHeadingSkipped = true
    return ''
  }
  const level = token.depth === 1 ? 2 : token.depth
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
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', padding: '0.5rem', border: '1px solid var(--hunter-border)', borderRadius: '6px', background: 'var(--hunter-bg)', minHeight: '44px', alignItems: 'center', cursor: 'text' }}
      onClick={() => document.getElementById('tag-input-field')?.focus()}>
      {tags.map((tag, i) => (
        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', background: 'var(--gold)', color: 'var(--hunter)', fontSize: '0.75rem', fontWeight: 600, padding: '0.2rem 0.5rem', borderRadius: '3px', textTransform: 'lowercase' }}>
          {tag}
          <button type="button" onClick={() => removeTag(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 0 2px', color: 'var(--hunter)', fontSize: '0.875rem', lineHeight: 1 }}>×</button>
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
        style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: '0.875rem', color: 'var(--text)', flex: '1', minWidth: '120px', padding: '0.125rem 0' }}
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
        <span key={i} style={{ fontSize: '0.6875rem', background: 'var(--hunter-mid)', color: 'var(--gold)', padding: '0.15rem 0.4rem', borderRadius: '3px', textTransform: 'lowercase' }}>{tag}</span>
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

  const isActive = (path) => activePath === path ? ' active' : ''

  return (
    <>
      {/* Mobile hamburger */}
      <button className="nav-hamburger" onClick={toggleMenu} aria-label="Toggle menu">
        <span className={`hamburger-line${menuOpen ? ' open' : ''}`} />
        <span className={`hamburger-line${menuOpen ? ' open' : ''}`} />
        <span className={`hamburger-line${menuOpen ? ' open' : ''}`} />
      </button>

      {/* Mobile menu overlay */}
      <div className={`nav-mobile-overlay${menuOpen ? ' nav-mobile-overlay--open' : ''}`} onClick={closeMenu}>
        <div className="nav-mobile-menu" onClick={e => e.stopPropagation()}>
          <button className="nav-mobile-close" onClick={closeMenu}>×</button>
          <img src="/logo.png" alt="SubMoa Content" className="nav-mobile-logo" onClick={() => { closeMenu(); navigate('/') }} />
          <div className="nav-mobile-links">
            {!loading && !user && (
              <>
                <a href="#" onClick={e => { e.preventDefault(); closeMenu(); navigate('/platform') }}>Platform</a>
                <a href="#" onClick={e => { e.preventDefault(); closeMenu(); navigate('/login') }}>Login</a>
                <a href="#" className="nav-mobile-cta" onClick={e => { e.preventDefault(); closeMenu(); navigate('/request') }}>Request access</a>
              </>
            )}
            {!loading && user && (
              <>
                <a href="#" className={isActive('/') ? 'active' : ''} onClick={e => { e.preventDefault(); closeMenu(); navigate('/') }}>Home</a>
                <a href="#" className={isActive('/author') ? 'active' : ''} onClick={e => { e.preventDefault(); closeMenu(); navigate('/author') }}>Submit brief</a>
                <a href="#" className={isActive('/dashboard') ? 'active' : ''} onClick={e => { e.preventDefault(); closeMenu(); navigate('/dashboard') }}>Dashboard</a>
                <a href="#" className={isActive('/account') ? 'active' : ''} onClick={e => { e.preventDefault(); closeMenu(); navigate('/account') }}>Account</a>
                {user.role === 'admin' && (
                  <a href="#" className={isActive('/admin') ? 'active' : ''} onClick={e => { e.preventDefault(); closeMenu(); navigate('/admin') }}>Admin</a>
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
            <img
              src="/logo.png"
              alt="SubMoa Content"
              className="nav-logo"
              onClick={() => navigate('/')}
              style={{ cursor: 'pointer' }}
            />
            <div className="nav-links">
              {!loading && !user && (
                <>
                  <a href="#" className="nav-link" onClick={e => { e.preventDefault(); navigate('/platform') }}>Platform</a>
                  <a href="#" className="nav-link" onClick={e => { e.preventDefault(); navigate('/login') }}>Login</a>
                  <a href="#" className="nav-cta" onClick={e => { e.preventDefault(); navigate('/request') }}>Request access</a>
                </>
              )}
              {!loading && user && (
                <>
                  <a href="#" className={`nav-link${isActive('/')}`} onClick={e => { e.preventDefault(); navigate('/') }}>Home</a>
                  <a href="#" className={`nav-link${isActive('/author')}`} onClick={e => { e.preventDefault(); navigate('/author') }}>Submit brief</a>
                  <a href="#" className={`nav-link${isActive('/dashboard')}`} onClick={e => { e.preventDefault(); navigate('/dashboard') }}>Dashboard</a>
                  <a href="#" className={`nav-link${isActive('/account')}`} onClick={e => { e.preventDefault(); navigate('/account') }}>Account</a>
                  {user.role === 'admin' && (
                    <a href="#" className={`nav-link${isActive('/admin')}`} onClick={e => { e.preventDefault(); navigate('/admin') }}>Admin</a>
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
    <div className="page">
      <div style={{
        backgroundImage: 'url(/hero-bg.jpg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        position: 'relative',
      }}>
        {/* Dark overlay so text is readable */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(10, 26, 10, 0.65)',
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
          padding: 'clamp(4rem, 10vw, 8rem) 24px',
        }}>
          <img
            src="/logo.png"
            alt="SubMoa Content"
            style={{
              height: 'clamp(80px, 12vw, 160px)',
              width: 'auto',
              objectFit: 'contain',
              imageRendering: '-webkit-optimize-contrast',
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
          {error && <p style={{ color: '#b05050', fontSize: '0.875rem', marginBottom: '1rem' }}>{error}</p>}
          <div className="form-group"><label className="form-label">Email</label><input type="email" className="form-input" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required /></div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <div style={{ position: 'relative' }}>
              <input type={showPw ? 'text' : 'password'} className="form-input" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required style={{ paddingRight: '2.5rem' }} />
              <button type="button" onClick={() => setShowPw(v => !v)} style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1rem', lineHeight: 1, padding: '0.25rem' }}>{showPw ? '👁' : '👁‍🗨'}</button>
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
  const { fetchUser } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Read invite code from URL params on mount
  const [inviteCode] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('code') || ''
  })

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
        <p className="form-sub">Accepted invite only. Your account will be linked to your Google account.</p>

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

        {inviteCode && (
          <p style={{ fontSize: '0.8125rem', color: 'var(--gold)', textAlign: 'center', marginBottom: '1rem' }}>
            Invite code applied: <code style={{ fontFamily: 'monospace', background: 'var(--hunter-mid)', padding: '0.1em 0.4em', borderRadius: '2px' }}>{inviteCode}</code>
          </p>
        )}

        <form onSubmit={handleSubmit}>
          {error && <p style={{ color: '#b05050', fontSize: '0.875rem', marginBottom: '1rem' }}>{error}</p>}
          <div className="form-group"><label className="form-label">Name</label><input type="text" className="form-input" placeholder="Your name" value={name} onChange={e => setName(e.target.value)} required /></div>
          <div className="form-group"><label className="form-label">Email</label><input type="email" className="form-input" placeholder="you@company.com" value={email} onChange={e => setEmail(e.target.value)} required /></div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <div style={{ position: 'relative' }}>
              <input type={showPw ? 'text' : 'password'} className="form-input" placeholder="Min. 8 characters" value={password} onChange={e => setPassword(e.target.value)} required style={{ paddingRight: '2.5rem' }} />
              <button type="button" onClick={() => setShowPw(v => !v)} style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1rem', lineHeight: 1, padding: '0.25rem' }}>{showPw ? '👁' : '👁‍🗨'}</button>
            </div>
          </div>
          <button type="submit" className="btn-primary" style={{ width: '100%' }} disabled={loading || !inviteCode}>{loading ? 'Creating account...' : 'Create account'}</button>
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
          {error && <p style={{ color: '#b05050', fontSize: '0.875rem', marginBottom: '1rem' }}>{error}</p>}
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
  const [form, setForm] = useState({ author: '', topic: '', productLink: '', productDetailsManual: '', humanObservation: '', anecdotalStories: '', includeFaq: false, generateAudio: false, productImages: [], minWordCount: '', targetKeywords: '', articleFormat: 'blog-general', optimizationTarget: 'seo-search', tone_stance: 'neutral', vocalTone: '', youtube_url: '', use_youtube: false })
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
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
          if (editingDraft) {
            // Pre-fill form from saved draft
            setForm({
              author: editingDraft.author || data.authors[0].slug,
              topic: editingDraft.topic || '',
              productLink: editingDraft.product_link || '',
              productDetailsManual: editingDraft.product_details_manual || '',
              humanObservation: editingDraft.human_observation || '',
              anecdotalStories: editingDraft.anecdotal_stories || '',
              includeFaq: !!editingDraft.include_faq,
              generateAudio: !!editingDraft.generate_audio,
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
            })
          } else {
            setForm(f => ({ ...f, author: data.authors[0].slug }))
          }
        }
      })
      .catch(() => setAuthors([]))
  }, [user, editingDraft])

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
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
          has_images: form.productImages.length > 0 ? 1 : 0,
          email: form.email,
          youtube_url: form.youtube_url,
          use_youtube: form.use_youtube ? 1 : 0,
          status: saveType,
        }),
      })
      if (editingDraft) onEditDone()
      setSubmitted(true)
      if (result.submission?.id) setSubmissionId(result.submission.id)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handlePostSubmitImageUpload = async (e) => {
    const files = Array.from(e.target.files)
    if (!files.length || !submissionId) return
    setUploadingImages(true)
    setUploadError('')
    try {
      const newUrls = []
      for (const file of files) {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('submission_id', submissionId)
        const res = await fetch('/api/images/upload', { method: 'POST', credentials: 'include', body: fd })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Upload failed')
        newUrls.push(data.url)
      }
      const allUrls = [...uploadedImages, ...newUrls]
      setUploadedImages(allUrls)
      // Store back in submission record
      await api(`/api/submissions/${submissionId}`, {
        method: 'PUT',
        body: JSON.stringify({ article_images: JSON.stringify(allUrls) }),
      })
    } catch (err) {
      setUploadError(err.message)
    } finally {
      setUploadingImages(false)
    }
  }

  if (submitted) return (
    <div className="page"><div className="container"><div className="form-card"><div className="confirm-icon">✓</div><h1 className="confirm-title">Brief received.</h1><p className="confirm-sub">We'll have your content ready same-day. You'll receive a notification when it's available in your dashboard.</p>

    <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap', marginTop: '1.5rem' }}><button className="btn-primary" onClick={() => { if (editingDraft) onEditDone(); setSubmitted(false); setForm({ author: authors.length > 0 ? authors[0].slug : '', topic: '', productLink: '', productDetailsManual: '', humanObservation: '', anecdotalStories: '', includeFaq: false, generateAudio: false, productImages: [], minWordCount: '', targetKeywords: '', articleFormat: 'blog-general', optimizationTarget: 'seo-search', tone_stance: 'neutral', vocalTone: '', email: user?.email || '', youtube_url: '', use_youtube: false }); setSubmissionId(null); setUploadedImages([]); }}>Submit Another</button><button className="btn-secondary" onClick={() => navigate('/dashboard')}>View Dashboard</button></div></div></div></div>
  )

  return (
    <div className="page"><div className="container"><div style={{ maxWidth: '640px', margin: '0 auto', padding: '3rem 0' }}>
        <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '1.625rem', fontWeight: 700, color: 'var(--cream)', marginBottom: '2rem' }}>Submit a Brief.</h1>
        {error && <p style={{ color: '#b05050', fontSize: '0.875rem', marginBottom: '1rem' }}>{error}</p>}
        <form onSubmit={handleSubmit}>
          <div className="form-group"><label className="form-label">Topic</label><input type="text" name="topic" className="form-input" placeholder="What are we writing about?" value={form.topic} onChange={handleChange} required /></div>
          <div className="form-group"><label className="form-label">Author Voice</label><select name="author" className="form-input" value={form.author} onChange={handleChange}>{authors.length === 0 ? <option value="">No author profiles available — contact admin</option> : authors.map(a => <option key={a.slug} value={a.slug}>{a.name}</option>)}</select></div>
          <div className="form-group"><label className="form-label">Article Format</label><select name="articleFormat" className="form-input" value={form.articleFormat} onChange={handleChange}>{FORMATS.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></div>
          <div className="form-group"><label className="form-label">Optimization Target</label><select name="optimizationTarget" className="form-input" value={form.optimizationTarget} onChange={handleChange}>{OPTIMIZATION_TARGETS.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></div>
          <div className="form-group"><label className="form-label">Tone / Stance (relationship to the subject)</label><select name="tone_stance" className="form-input" value={form.tone_stance} onChange={handleChange}>{TONE_STANCES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
          <div className="form-group"><label className="form-label">Vocal Tone (Optional) (writing style and rhythm)</label><select name="vocalTone" className="form-input" value={form.vocalTone} onChange={handleChange}><option value="">Select a tone...</option>{VOCAL_TONES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select></div>
          <div className="form-group"><label className="form-label">Min Word Count</label><select name="minWordCount" className="form-input" value={form.minWordCount} onChange={handleChange}><option value="">Select word count...</option>{WORD_COUNTS.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
          <div className="form-group"><label className="form-label">Product Link (Optional)</label><input type="url" name="productLink" className="form-input" placeholder="https://..." value={form.productLink} onChange={handleChange} /></div>
          {form.productLink && (
            <div className="form-group">
              <label className="form-label">Product Details (Optional)</label>
              <textarea
                name="productDetailsManual"
                className="form-input"
                rows="4"
                placeholder="Paste product name, specs, price, features, availability..."
                value={form.productDetailsManual}
                onChange={handleChange}
              />
              <p className="form-helper">If the product page is age-gated or behind a login, paste the product specs and details here manually.</p>
            </div>
          )}
          <div className="form-group"><label className="form-label">Target Keywords (If Known)</label><TagInput value={form.targetKeywords} onChange={v => setForm(f => ({ ...f, targetKeywords: v }))} placeholder="Type keyword, press Enter" /></div>
          
          <div className="form-group"><label className="form-label">Human Observation on the Product</label><textarea name="humanObservation" className="form-input" rows="4" placeholder="Your direct experience with the product..." value={form.humanObservation} onChange={handleChange} required /></div>
          <div className="form-group"><label className="form-label">Anecdotal Stories to Include (Optional)</label><textarea name="anecdotalStories" className="form-input" rows="3" placeholder="Stories, scenarios, or use cases..." value={form.anecdotalStories} onChange={handleChange} /></div>
          <div className="form-group">
            <label className="form-label">Product Images (Optional)</label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={handleImageChange}
              style={{ display: 'block', marginTop: '0.5rem' }}
            />
            <p className="form-helper">Upload up to 10 product photos. Images will be renamed, optimized, and given SEO alt text and captions automatically.</p>
            {form.productImages.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginTop: '0.75rem' }}>
                {form.productImages.map((file, i) => (
                  <div key={i} style={{ position: 'relative', width: '80px' }}>
                    <img
                      src={URL.createObjectURL(file)}
                      alt=""
                      style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '4px', border: '1px solid var(--border)' }}
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(i)}
                      style={{ position: 'absolute', top: '-6px', right: '-6px', width: '20px', height: '20px', borderRadius: '50%', background: 'var(--text-dim)', color: 'white', border: 'none', cursor: 'pointer', fontSize: '12px', lineHeight: '20px', textAlign: 'center' }}
                    >x</button>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', marginTop: '0.25rem', wordBreak: 'break-all', textAlign: 'center' }}>{file.name.length > 12 ? file.name.slice(0, 10) + '...' : file.name}<br/>{formatFileSize(file.size)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="form-group">
            <label className="form-label">YouTube URL (Optional)</label>
            <input
              type="url"
              name="youtube_url"
              className="form-input"
              placeholder="https://www.youtube.com/watch?v=..."
              value={form.youtube_url}
              onChange={handleChange}
            />
          </div>
          {form.youtube_url && (
            <div className="form-group">
              <label className="checkbox-label">
                <input type="checkbox" name="use_youtube" checked={form.use_youtube} onChange={handleChange} />
                Base article content on this video
              </label>
            </div>
          )}
          <div className="form-group">
            <label className="checkbox-label">
              <input type="checkbox" name="includeFaq" checked={form.includeFaq} onChange={handleChange} />
              Include FAQ Section
            </label>
            <p className="form-helper">Adds a 5 to 7 question FAQ section at the end of the article and generates FAQPage structured data schema.</p>
          </div>
          <div className="form-group">
            <label className="checkbox-label">
              <input type="checkbox" name="generateAudio" checked={form.generateAudio} onChange={handleChange} />
              <span>
                <strong>Generate audio version</strong>
                <br />
                <span style={{ fontWeight: 'normal', fontSize: '0.875rem', color: 'var(--text-dim)' }}>Creates an MP3 audio reading of the article included in your download package.</span>
              </span>
            </label>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
            <button type="submit" className="btn-primary" style={{ flex: 1 }} disabled={loading} onClick={() => {}}>{loading ? 'Submitting...' : 'Submit Brief'}</button>
            <button type="button" className="btn-secondary" style={{ flex: 1 }} disabled={loading} onClick={(e) => { e.preventDefault(); handleSubmit(e, 'saved') }}>{loading ? 'Saving...' : 'Save as Draft'}</button>
          </div>
        </form>
      </div></div>
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
        <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '1.625rem', fontWeight: 700, color: 'var(--cream)', marginBottom: '2rem' }}>Account Settings.</h1>
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

        {user?.role === 'admin' && (
        <div style={{ marginTop: '3rem', padding: '2rem', border: '1px solid var(--hunter-border)', background: 'var(--hunter-mid)' }}>
          <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '1.125rem', fontWeight: 600, color: 'var(--cream)', marginBottom: '0.5rem' }}>Generate Invite Link</div>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>Create a single-use invite link valid for 30 days. Share this with your team.</p>
          {inviteError && <p style={{ color: '#b05050', fontSize: '0.875rem', marginBottom: '1rem' }}>{inviteError}</p>}
          {!inviteLink ? (
            <button className="btn-primary" onClick={generateInvite} disabled={inviteLoading}>{inviteLoading ? 'Generating...' : 'Generate Invite Link'}</button>
          ) : (
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <input type="text" readOnly value={inviteLink} style={{ flex: 1, minWidth: '240px', padding: '0.75rem 1rem', background: 'var(--hunter)', border: '1px solid var(--hunter-border)', borderRadius: '2px', color: 'var(--cream)', fontFamily: 'inherit', fontSize: '0.875rem' }} />
              <button className="btn-secondary" onClick={() => navigator.clipboard.writeText(inviteLink)} style={{ whiteSpace: 'nowrap' }}>Copy Link</button>
            </div>
          )}
        </div>
        )}

        {user?.role === 'admin' && (
        <div style={{ marginTop: '3rem', padding: '2rem', border: '1px solid var(--hunter-border)', background: 'var(--hunter-mid)' }}>
          <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '1.125rem', fontWeight: 600, color: 'var(--cream)', marginBottom: '0.5rem' }}>Author Voices</div>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>Ingest an author profile from an RSS feed or DOCX file. The AI will analyze writing style and generate a profile.</p>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <input type="text" id="rss-url-input" placeholder="https://example.com/rss/feed" style={{ flex: 1, minWidth: '200px', padding: '0.75rem 1rem', background: 'var(--hunter)', border: '1px solid var(--hunter-border)', borderRadius: '2px', color: 'var(--cream)', fontFamily: 'inherit', fontSize: '0.875rem' }} />
            <button className="btn-primary" onClick={handleIngestRss} disabled={ingestLoading}>{ingestLoading ? 'Analyzing...' : 'Ingest via RSS'}</button>
          </div>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="file" id="docx-file-input" accept=".docx" style={{ flex: 1, color: 'var(--text-muted)', fontSize: '0.875rem' }} />
            <button className="btn-secondary" onClick={handleIngestDocx} disabled={ingestLoading}>{ingestLoading ? 'Analyzing...' : 'Ingest via DOCX'}</button>
          </div>
          {ingestError && <p style={{ color: '#b05050', fontSize: '0.875rem', marginTop: '1rem' }}>{ingestError}</p>}
          {ingestPreview && (
            <div style={{ marginTop: '1.5rem', padding: '1.25rem', background: 'var(--hunter)', border: '1px solid var(--hunter-border)', borderRadius: '6px' }}>
              <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>Preview</div>
              <div style={{ marginBottom: '0.5rem' }}><strong style={{ color: 'var(--cream)' }}>Slug:</strong> <span style={{ color: '#a3a3a3', fontFamily: 'monospace', fontSize: '0.8125rem' }}>{ingestPreview.slug}</span></div>
              <div style={{ marginBottom: '0.5rem' }}><strong style={{ color: 'var(--cream)' }}>Name:</strong> <span style={{ color: '#a3a3a3' }}>{ingestPreview.name}</span></div>
              <div style={{ marginBottom: '0.75rem' }}>
                <strong style={{ color: 'var(--cream)', display: 'block', marginBottom: '0.25rem' }}>Style Guide:</strong>
                <pre style={{ color: '#a3a3a3', fontSize: '0.75rem', whiteSpace: 'pre-wrap', maxHeight: '150px', overflow: 'auto', margin: 0 }}>{ingestPreview.style_guide?.slice(0, 500)}</pre>
              </div>
              {ingestPreview.keyword_themes?.length > 0 && (
                <div style={{ marginBottom: '0.5rem' }}>
                  <strong style={{ color: 'var(--cream)', fontSize: '0.8125rem' }}>Top Keywords:</strong>
                  <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap', marginTop: '0.375rem' }}>
                    {ingestPreview.keyword_themes.slice(0, 8).map((kw, i) => (
                      <span key={i} style={{ background: 'var(--hunter-border)', color: '#a3a3a3', padding: '0.125rem 0.5rem', borderRadius: '3px', fontSize: '0.6875rem' }}>{kw}</span>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button className="btn-primary" onClick={handleSaveProfile} disabled={saveLoading}>{saveLoading ? 'Saving...' : 'Save Profile'}</button>
                <button className="btn-secondary" onClick={() => setIngestPreview(null)}>Discard</button>
              </div>
            </div>
          )}
        </div>
        )}

        {/* Sign out */}
        <div style={{ marginTop: '3rem', paddingTop: '2rem', borderTop: '1px solid var(--hunter-border)' }}>
          <button
            onClick={async () => {
              await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
              if (syncUser) syncUser(null);
              navigate('/');
            }}
            style={{ background: 'none', border: '0.5px solid #5a3a2a', color: '#a06050', padding: '7px 16px', borderRadius: '5px', fontSize: '12px', cursor: 'pointer', fontFamily: 'sans-serif' }}
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
          <p style={{ color: 'var(--text-muted)' }}>Loading...</p>
        ) : submissions.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No articles to write right now.</p>
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
                    <a href={sub.product_link} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.75rem', color: 'var(--gold)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.25rem' }}>
                      🔗 Product link
                    </a>
                  )}
                  <KeywordPills keywordsJson={sub.target_keywords} />
                  <div style={{ marginTop: '0.5rem' }}>
                    <span className={`card-status status-${sub.status}`}>{sub.status}</span>
                    {' '}<span style={{ fontSize: '0.8125rem', color: 'var(--text-dim)' }}>{sub.author}</span>
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

  useEffect(() => {
    if (!user) return
    let mounted = true
    const poll = async () => {
      if (!document.hasFocus()) return
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
    return () => { mounted = false; clearInterval(interval) }
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
    <div style={{ position: 'relative' }}>
      <button
        onClick={handleOpen}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 0.75rem', position: 'relative' }}
        aria-label="Notifications"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" style={{ color: 'white' }}>
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {count > 0 && (
          <span style={{ position: 'absolute', top: '-4px', right: '2px', background: '#b05050', color: '#fff', borderRadius: '50%', fontSize: '0.625rem', minWidth: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', fontWeight: 700 }}>
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>
      {open && (
        <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', background: '#faf9f7', border: '1px solid #e5e5e5', borderRadius: '8px', width: '320px', boxShadow: '0 4px 20px rgba(0,0,0,0.12)', zIndex: 200, overflow: 'hidden' }}>
          <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #e5e5e5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>Notifications</span>
            {count > 0 && <button onClick={markAllRead} style={{ background: 'none', border: 'none', fontSize: '0.75rem', color: '#6b7280', cursor: 'pointer', textDecoration: 'underline' }}>Mark all read</button>}
          </div>
          <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
            {loading ? (
              <p style={{ padding: '1rem', color: '#6b7280', fontSize: '0.875rem', textAlign: 'center' }}>Loading...</p>
            ) : notifs.length === 0 ? (
              <p style={{ padding: '1rem', color: '#6b7280', fontSize: '0.875rem', textAlign: 'center' }}>No notifications yet.</p>
            ) : notifs.map(n => (
              <div
                key={n.id}
                onClick={() => markRead(n.id, n.link)}
                style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #f0f0f0', display: 'flex', gap: '0.75rem', alignItems: 'flex-start', background: n.is_read ? 'transparent' : '#f9fafb', cursor: 'pointer' }}
              >
                {n.is_read ? null : <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#b05050', marginTop: '6px', flexShrink: 0 }} />}
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: '0.875rem', margin: 0, lineHeight: 1.5 }}>{n.message}</p>
                  <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' }}>{timeAgo(n.created_at)}</p>
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
  const [rating, setRating] = useState(0)
  const [whatWorked, setWhatWorked] = useState('')
  const [whatNeedsWork, setWhatNeedsWork] = useState('')
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false)
  const [showTranscript, setShowTranscript] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const audioRef = useRef(null)
  const [audioPlaying, setAudioPlaying] = useState(false)
  const [audioProgress, setAudioProgress] = useState(0)
  const [audioDuration, setAudioDuration] = useState(0)
  const [audioSpeed, setAudioSpeed] = useState(1)

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
        // Ownership check on data.article.user_id
        if (data.article.user_id !== user.id && user.role !== 'admin') {
          navigate('/dashboard')
          return
        }
        firstHeadingSkipped = false
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

  if (loading) {
    return (
      <div style={{ background: '#ffffff', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#6b7280', fontSize: '0.9375rem' }}>Loading article...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ background: '#ffffff', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
        <p style={{ color: '#b05050', fontSize: '0.9375rem' }}>{error}</p>
        <button onClick={() => navigate('/dashboard')} style={{ background: '#1a1a1a', color: '#faf9f7', border: 'none', padding: '0.5rem 1.25rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.875rem' }}>Back to Dashboard</button>
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
    <div style={{ background: '#ffffff', minHeight: '100vh' }}>
      {/* Back link - fixed at top of page */}
      <div style={{ maxWidth: '740px', margin: '0 auto', padding: '1rem 1.5rem 0' }}>
        <button
          onClick={() => navigate('/dashboard')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8125rem', color: '#9ca3af', fontFamily: 'Inter, sans-serif', padding: '0', textAlign: 'left' }}
        >
          Back to Dashboard
        </button>
      </div>

      <div style={{ maxWidth: '740px', margin: '0 auto', padding: '1.5rem 1.5rem 0' }}>
        <article>
          <header style={{ marginBottom: '1.5rem' }}>
            {/* Format badge */}
            <span style={{ display: 'inline-block', fontSize: '0.6875rem', fontWeight: '600', color: '#92400e', background: '#fef3c7', padding: '0.2rem 0.5rem', borderRadius: '3px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem', fontFamily: 'Inter, sans-serif' }}>
              {formatLabel}
            </span>

            {/* Article title */}
            <h1 style={{ fontFamily: "'Crimson Pro', Georgia, serif", fontSize: '2.5rem', fontWeight: '700', color: '#1a1a1a', marginBottom: '1rem', lineHeight: '1.2' }}>
              {article.topic}
            </h1>

            {/* Meta row */}
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', fontSize: '0.875rem', color: '#6b7280', fontFamily: 'Inter, sans-serif', marginBottom: '1.5rem' }}>
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
            <div style={{ borderBottom: '1px solid #e5e5e5' }} />
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
                style={{ background: 'none', border: '1px solid #d97706', color: '#d97706', padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600 }}
              >
                {showTranscript ? 'Hide transcript' : 'View transcript'}
              </button>
              {showTranscript && (
                <div style={{ marginTop: '1rem', padding: '1rem', background: '#f9fafb', border: '1px solid #e5e5e5', borderRadius: '6px', maxHeight: '300px', overflowY: 'auto', fontSize: '0.875rem', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                  {article.youtube_transcript}
                </div>
              )}
            </div>
          )}

          {/* Audio player */}
          {article.audio_path && (
            <div style={{ marginBottom: '2rem', background: '#fef9c3', border: '1px solid #f59e0b', borderRadius: '8px', padding: '1rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#92400e', marginBottom: '0.75rem' }}>Audio Version</div>
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
                  style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#92400e', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '1rem' }}
                >
                  {audioPlaying ? '\u23F8' : '\u25B6'}
                </button>
                <div style={{ flex: 1 }}>
                  <div style={{ height: '4px', background: '#e5e5e5', borderRadius: '2px', marginBottom: '0.25rem', cursor: 'pointer' }}
                    onClick={(e) => {
                      if (!audioRef.current) return
                      const rect = e.currentTarget.getBoundingClientRect()
                      const ratio = (e.clientX - rect.left) / rect.width
                      audioRef.current.currentTime = ratio * audioRef.current.duration
                      setAudioProgress(ratio * audioRef.current.duration)
                    }}
                  >
                    <div style={{ height: '100%', background: '#92400e', borderRadius: '2px', width: `${audioDuration ? (audioProgress / audioDuration) * 100 : 0}%`, transition: 'width 0.1s linear' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#6b7280' }}>
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
                      style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', border: '1px solid', borderColor: audioSpeed === speed ? '#92400e' : '#d1d5db', background: audioSpeed === speed ? '#92400e' : 'transparent', color: audioSpeed === speed ? '#fff' : '#6b7280', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}
                    >
                      {speed}x
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Article body */}
          <div className="article-body" dangerouslySetInnerHTML={{ __html: marked.parse(articleContent || '') }} />

          {/* Author bio card */}
          {(() => {
            const profile = authorProfiles.find(p => p.slug === article.author)
            const initials = (name) => name ? name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '??'
            const bioText = profile?.style_guide ? profile.style_guide.slice(0, 200) : 'Field reviewer and outdoor content writer.'
            return (
              <div style={{ background: '#f9fafb', border: '1px solid #e5e5e5', borderRadius: '8px', padding: '24px', marginTop: '2rem', display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#92400e', color: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', fontWeight: 700, flexShrink: 0 }}>
                  {initials(authorDisplayName)}
                </div>
                <div>
                  <div style={{ fontWeight: 600, color: '#1a1a1a', marginBottom: '0.25rem' }}>{authorDisplayName}</div>
                  <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>{bioText}</div>
                </div>
              </div>
            )
          })()}

          {/* Revision request */}
          <div style={{ marginTop: '2rem' }}>
            <textarea
              id="revision-notes"
              placeholder="Describe what you would like changed..."
              style={{ width: '100%', minHeight: '120px', padding: '12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9375rem', fontFamily: 'Inter, sans-serif', resize: 'vertical', boxSizing: 'border-box' }}
            />
            <button
              onClick={() => {
                const notes = document.getElementById('revision-notes').value
                if (!notes.trim()) return
                fetch(`/api/submissions/${article.id}/revision`, {
                  method: 'PUT',
                  credentials: 'include',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ revision_notes: notes })
                }).then(res => res.json()).then(data => {
                  if (data.error) throw new Error(data.error)
                  alert('Revision request submitted.')
                }).catch(err => alert('Error: ' + err.message))
              }}
              style={{ marginTop: '0.75rem', background: '#1a1a1a', color: '#faf9f7', border: 'none', padding: '0.625rem 1.25rem', borderRadius: '6px', fontSize: '0.875rem', cursor: 'pointer', fontWeight: 500 }}
            >
              Submit revision request
            </button>
          </div>

          {/* Feedback block */}
          <div style={{ marginTop: '2rem', padding: '1.5rem', background: '#f9fafb', border: '1px solid #e5e5e5', borderRadius: '8px' }}>
            <div style={{ fontWeight: 600, color: '#1a1a1a', marginBottom: '1rem' }}>How was this article?</div>

            {/* Star rating */}
            <div style={{ display: 'flex', gap: '0.375rem', marginBottom: '1.25rem' }}>
              {[1, 2, 3, 4, 5].map(star => (
                <button
                  key={star}
                  type="button"
                  className="star-btn"
                  onClick={() => !feedbackSubmitted && setRating(star)}
                  disabled={feedbackSubmitted}
                  style={{ cursor: feedbackSubmitted ? 'default' : 'pointer', fontSize: '1.5rem', lineHeight: 1, color: star <= rating ? '#d97706' : '#d1d5db' }}
                >
                  ★
                </button>
              ))}
            </div>

            {/* Side-by-side textareas on desktop, stacked on mobile */}
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 45%', minWidth: '240px' }}>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: '#374151', marginBottom: '0.375rem' }}>What did we get right?</label>
                <textarea
                  value={whatWorked}
                  onChange={e => !feedbackSubmitted && setWhatWorked(e.target.value)}
                  disabled={feedbackSubmitted}
                  placeholder="The tone was perfect..."
                  style={{ width: '100%', minHeight: '96px', padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.875rem', fontFamily: 'Inter, sans-serif', resize: 'vertical', boxSizing: 'border-box', background: feedbackSubmitted ? '#f3f4f6' : '#fff' }}
                />
              </div>
              <div style={{ flex: '1 1 45%', minWidth: '240px' }}>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: '#374151', marginBottom: '0.375rem' }}>What needs work?</label>
                <textarea
                  value={whatNeedsWork}
                  onChange={e => !feedbackSubmitted && setWhatNeedsWork(e.target.value)}
                  disabled={feedbackSubmitted}
                  placeholder="The conclusion felt rushed..."
                  style={{ width: '100%', minHeight: '96px', padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.875rem', fontFamily: 'Inter, sans-serif', resize: 'vertical', boxSizing: 'border-box', background: feedbackSubmitted ? '#f3f4f6' : '#fff' }}
                />
              </div>
            </div>

            {/* Submit */}
            <button
              onClick={() => {
                if (!rating) return
                fetch(`/api/articles/${article.id}/feedback`, {
                  method: 'POST',
                  credentials: 'include',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ rating, what_worked: whatWorked, what_needs_work: whatNeedsWork })
                }).then(res => res.json()).then(data => {
                  if (data.error) throw new Error(data.error)
                  setFeedbackSubmitted(true)
                  alert('Feedback submitted. Thank you!')
                }).catch(err => alert('Error: ' + err.message))
              }}
              disabled={feedbackSubmitted || !rating}
              style={{ marginTop: '1rem', background: feedbackSubmitted ? '#9ca3af' : '#1a1a1a', color: '#faf9f7', border: 'none', padding: '0.625rem 1.25rem', borderRadius: '6px', fontSize: '0.875rem', cursor: feedbackSubmitted || !rating ? 'default' : 'pointer', fontWeight: 500 }}
            >
              {feedbackSubmitted ? 'Feedback submitted' : 'Submit Feedback'}
            </button>
          </div>


        </article>
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
    <div className="page"><div className="container"><div className="form-card"><h1 className="form-title">New password.</h1><p className="form-sub">Enter your new password.</p><form onSubmit={handlePasswordReset}><div className="form-group"><label className="form-label">Password</label><input type="password" className="form-input" placeholder="Min. 8 characters" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} /></div>{error && <p style={{ color: '#b05050', fontSize: '0.875rem', marginBottom: '1rem' }}>{error}</p>}<button type="submit" className="btn-primary" style={{ width: '100%' }} disabled={loading}>{loading ? 'Saving...' : 'Save password'}</button></form></div></div></div>
  )

  if (sent) return (
    <div className="page"><div className="container"><div className="form-card"><div className="confirm-icon">✓</div><h1 className="confirm-title">Check your inbox.</h1><p className="confirm-sub">If an account exists with that email, we've sent a password reset link. It expires in 30 minutes.</p><button className="btn-secondary" style={{ width: '100%' }} onClick={() => navigate('/login')}>Back to login</button></div></div></div>
  )

  return (
    <div className="page"><div className="container"><div className="form-card"><h1 className="form-title">Reset your password.</h1><p className="form-sub">We'll send you a link to create a new password.</p><form onSubmit={handleSubmit}><div className="form-group"><label className="form-label">Email</label><input type="email" className="form-input" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required /></div>{error && <p style={{ color: '#b05050', fontSize: '0.875rem', marginBottom: '1rem' }}>{error}</p>}<button type="submit" className="btn-primary" style={{ width: '100%' }} disabled={loading}>{loading ? 'Sending...' : 'Send Reset Link'}</button><p className="form-link"><a href="#" onClick={e => { e.preventDefault(); navigate('/login') }}>Back to login</a></p></form></div></div></div>
  )
}

// ─── AdminGuard ─────────────────────────────────────────────────────────────
function AdminGuard({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" />;
  if (user.role !== 'admin') return <Navigate to="/dashboard" />;
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

  return (
    <AuthContext.Provider value={authValue}>
      <Nav navigate={navigate} syncUser={syncUser} />
      <div className="page">
        {page === '/login' && <Login navigate={navigate} syncUser={syncUser} />}
        {page === '/request' && <RequestAccess navigate={navigate} />}
        {page === '/register' && <Register navigate={navigate} />}
        {page === '/author' && (loading ? null : user ? <Author navigate={navigate} syncUser={syncUser} editingDraft={editingDraft} onEditDone={() => setEditingDraft(null)} /> : <Login navigate={navigate} syncUser={syncUser} />)}
        {page === '/dashboard' && (loading ? null : user ? <Dashboard /> : <Login navigate={navigate} />)}
        {page === '/account' && (loading ? null : user ? <Account navigate={navigate} syncUser={syncUser} /> : <Login navigate={navigate} syncUser={syncUser} />)}
        {page === '/writer' && (loading ? null : user ? <Writer navigate={navigate} syncUser={syncUser} /> : <Login navigate={navigate} syncUser={syncUser} />)}
        {page === '/admin' && (loading ? null : user ? <AdminGuard><AdminDashboard /></AdminGuard> : <Login navigate={navigate} />)}
        {page.startsWith('/content/') && (loading ? null : user ? <ContentPage navigate={navigate} user={user} /> : <Login navigate={navigate} />)}
        {page === '/reset' && <Reset navigate={navigate} />}
        {page === '/about' && <About navigate={navigate} />}
        {page === '/platform' && <Platform navigate={navigate} />}
        {page === '/documentation' && <Documentation navigate={navigate} />}
        {page === '/author-frameworks' && <AuthorFrameworks navigate={navigate} />}
        {page === '/seo-methodology' && <SeoMethodology navigate={navigate} />}
        {page === '/' && <Landing navigate={navigate} />}
      </div>
    </AuthContext.Provider>
  )
}
