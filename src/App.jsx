import { useState, useEffect, createContext, useContext } from 'react'
import { marked } from 'marked'
import './index.css'

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
function Nav({ navigate, syncUser }) {
  const { user, loading } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const toggleMenu = () => setMenuOpen(o => !o)
  const closeMenu = () => setMenuOpen(false)

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
          <img src="/logo.jpg" alt="SubMoa Content" className="nav-mobile-logo" onClick={() => { closeMenu(); navigate('/') }} />
          <div className="nav-mobile-links">
            {!loading && !user && (
              <>
                <a href="#how-it-works" onClick={e => { e.preventDefault(); closeMenu(); document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' }); navigate('/') }}>How It Works</a>
                <a href="#features" onClick={e => { e.preventDefault(); closeMenu(); document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' }); navigate('/') }}>Features</a>
                <a href="#" onClick={e => { e.preventDefault(); closeMenu(); navigate('/login') }}>Login</a>
                <a href="#" className="nav-mobile-cta" onClick={e => { e.preventDefault(); closeMenu(); navigate('/request') }}>Request Access</a>
              </>
            )}
            {!loading && user && (
              <>
                <a href="#" onClick={e => { e.preventDefault(); closeMenu(); navigate('/author') }}>Submit Brief</a>
                <a href="#" onClick={e => { e.preventDefault(); closeMenu(); navigate('/dashboard') }}>Dashboard</a>
                <a href="#" onClick={e => { e.preventDefault(); closeMenu(); navigate('/account') }}>Account</a>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Desktop nav */}
      <nav className="nav">
        <div className="container">
          <div className="nav-inner">
            <img src="/logo.jpg" alt="SubMoa Content" className="nav-logo" onClick={() => navigate('/')} style={{ cursor: 'pointer' }} />
            <div className="nav-links">
              {!loading && !user && (
                <>
                  <a href="#how-it-works" className="nav-link" onClick={e => { e.preventDefault(); document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' }); navigate('/') }}>How It Works</a>
                  <a href="#features" className="nav-link" onClick={e => { e.preventDefault(); document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' }); navigate('/') }}>Features</a>
                  <a href="#" className="nav-link" onClick={e => { e.preventDefault(); navigate('/login') }}>login</a>
                  <a href="#" className="nav-cta" onClick={e => { e.preventDefault(); navigate('/request') }}>Request Access</a>
                </>
              )}
              {!loading && user && (
                <>
                  <a href="#" className="nav-link" onClick={e => { e.preventDefault(); navigate('/author') }}>Submit Brief</a>
                  <a href="#" className="nav-link" onClick={e => { e.preventDefault(); navigate('/dashboard') }}>Dashboard</a>
                  <NotificationBell syncUser={syncUser} />
                  <a href="#" className="nav-link" onClick={e => { e.preventDefault(); navigate('/account') }}>Account</a>
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
      <section className="hero">
        <div className="hero-map" style={{ backgroundImage: "url('/hero-bg.jpg')" }} />
        <div className="hero-overlay" />
        <div className="hero-bg-line" />
        <div className="container">
          <div className="hero-content">
            <img src="/logo.jpg" alt="SubMoa Content" className="hero-logo-overlay" />
            <h1 className="hero-title">
              Precision Content at{' '}
              <span className="accent">Sub-MOA Accuracy</span>
            </h1>
            <p className="hero-sub">AI-generated editorial built on proven field-tested workflows, real author frameworks, and SEO systems designed to dominate rankings at scale.</p>
            <div className="hero-actions">
              <button className="btn-primary" onClick={() => navigate('/request')}>Request Access</button>
            </div>
            <p className="hero-support">Built for publishers, operators, and media brands that need volume without sacrificing authority.</p>
          </div>
        </div>
      </section>
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
  const [form, setForm] = useState({ author: '', topic: '', productLink: '', humanObservation: '', anecdotalStories: '', includeFaq: false, productImages: [], minWordCount: '', targetKeywords: '', articleFormat: 'blog-general', optimizationTarget: 'seo-search', tone_stance: 'neutral', vocalTone: '' })
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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
              humanObservation: editingDraft.human_observation || '',
              anecdotalStories: editingDraft.anecdotal_stories || '',
              includeFaq: !!editingDraft.include_faq,
              productImages: [],
              minWordCount: editingDraft.min_word_count || '',
              targetKeywords: editingDraft.target_keywords || '',
              articleFormat: editingDraft.article_format || 'blog-general',
              optimizationTarget: editingDraft.optimization_target || 'seo-search',
              tone_stance: editingDraft.tone_stance || 'neutral',
              vocalTone: editingDraft.vocal_tone || '',
              email: editingDraft.email || user?.email || ''
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
      await api('/api/submissions', {
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
          target_keywords: form.targetKeywords,
          human_observation: form.humanObservation,
          anecdotal_stories: form.anecdotalStories,
          include_faq: form.includeFaq ? 1 : 0,
          has_images: form.productImages.length > 0 ? 1 : 0,
          email: form.email,
          status: saveType,
        }),
      })
      if (editingDraft) onEditDone()
      setSubmitted(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (submitted) return (
    <div className="page"><div className="container"><div className="form-card"><div className="confirm-icon">✓</div><h1 className="confirm-title">Brief received.</h1><p className="confirm-sub">We'll have your content ready same-day. You'll receive a notification when it's available in your dashboard.</p><div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}><button className="btn-primary" onClick={() => { if (editingDraft) onEditDone(); setSubmitted(false); setForm({ author: authors.length > 0 ? authors[0].slug : '', topic: '', productLink: '', humanObservation: '', anecdotalStories: '', includeFaq: false, productImages: [], minWordCount: '', targetKeywords: '', articleFormat: 'blog-general', optimizationTarget: 'seo-search', tone_stance: 'neutral', vocalTone: '', email: user?.email || '' }) }}>Submit Another</button><button className="btn-secondary" onClick={() => navigate('/dashboard')}>View Dashboard</button></div></div></div></div>
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
            <label className="checkbox-label">
              <input type="checkbox" name="includeFaq" checked={form.includeFaq} onChange={handleChange} />
              Include FAQ Section
            </label>
            <p className="form-helper">Adds a 5 to 7 question FAQ section at the end of the article and generates FAQPage structured data schema.</p>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
            <button type="submit" className="btn-primary" style={{ flex: 1 }} disabled={loading} onClick={() => {}}>{loading ? 'Submitting...' : 'Submit Brief'}</button>
            <button type="button" className="btn-secondary" style={{ flex: 1, border: '1px solid #d97706', color: '#d97706' }} disabled={loading} onClick={(e) => { e.preventDefault(); handleSubmit(e, 'saved') }}>{loading ? 'Saving...' : 'Save as Draft'}</button>
          </div>
        </form>
      </div></div>
    </div>
  )
}

// ─── Dashboard ──────────────────────────────────────────────────────────────
function Dashboard({ navigate, syncUser, onEditDraft }) {
  const { user } = useAuth()
  const [submissions, setSubmissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [viewArticle, setViewArticle] = useState(null)
  const [showRevisionModal, setShowRevisionModal] = useState(false)
  const [revisionNotes, setRevisionNotes] = useState('')
  const [revisionLoading, setRevisionLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(null)
  const [userRole, setUserRole] = useState('user')
  const [viewMode, setViewMode] = useState('user')

  const loadSubmissions = () => {
    api('/api/submissions')
      .then(data => {
        setSubmissions(data.submissions || [])
        setUserRole(data.role || 'user')
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadSubmissions()
    const interval = setInterval(loadSubmissions, 30000)
    const onFocus = () => loadSubmissions()
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(interval); window.removeEventListener('focus', onFocus) }
  }, [])

  const handleDownload = (sub) => {
    const content = sub.article_content || sub.brief || ''
    const text = content
      .replace(/#{1,6}\s+/g, '')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/\[(.+?)\]\(.+?\)/g, '$1')
      .replace(/^\s*[-*]\s+/gm, '')
      .replace(/^\s*\d+\.\s+/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(sub.topic || 'article').replace(/[^a-z0-9]/gi, '-').toLowerCase()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleDownloadSeoReport = (sub) => {
    if (!sub.seo_report_content) return
    const blob = new Blob([sub.seo_report_content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(sub.topic || 'article').replace(/[^a-z0-9]/gi, '-').toLowerCase()}-seo-report.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleViewArticle = (sub) => {
    // Navigate to the published content page (always relative path)
    if (sub.content_path) {
      const slug = sub.content_path.replace('/content/', '').replace('.md', '')
      navigate('/content/' + slug)
    } else {
      // Fallback to CMS view if no content_path
      navigate('/content/' + sub.id)
    }
  }

  const handleRequestEdits = () => {
    if (!viewArticle) return
    setRevisionNotes(viewArticle.revision_notes || '')
    setShowRevisionModal(true)
  }

  const submitRevision = async () => {
    if (!revisionNotes.trim()) return
    setRevisionLoading(true)
    try {
      await api(`/api/submissions/${viewArticle.id}/revision`, {
        method: 'PUT',
        body: JSON.stringify({ revision_notes: revisionNotes })
      })
      setShowRevisionModal(false)
      setViewArticle(null)
      loadSubmissions()
    } catch (e) { console.error(e) }
    setRevisionLoading(false)
  }

  const handleHide = async (sub) => {
    setActionLoading(sub.id)
    try {
      await api(`/api/submissions/${sub.id}`, {
        method: 'PUT',
        body: JSON.stringify({ is_hidden: sub.is_hidden ? 0 : 1 })
      })
      loadSubmissions()
    } catch (e) { console.error(e) }
    setActionLoading(null)
  }

  const handleDelete = async (sub) => {
    if (!confirm('Delete this article request? This cannot be undone.')) return
    setActionLoading(sub.id)
    try {
      await api(`/api/submissions/${sub.id}`, {
        method: 'PUT',
        body: JSON.stringify({ is_deleted: 1 })
      })
      loadSubmissions()
    } catch (e) { console.error(e) }
    setActionLoading(null)
  }

  const handleDiscardDraft = async (sub) => {
    setActionLoading(sub.id)
    try {
      await api(`/api/submissions/${sub.id}`, { method: 'DELETE' })
      loadSubmissions()
    } catch (e) { console.error(e) }
    setActionLoading(null)
  }

  return (
    <div className="page">
      <div className="container">
        <div className="dashboard-header">
          <h1 className="dashboard-title">Your Content.</h1>
          <p className="dashboard-sub">{user ? `Signed in as ${user.name}` : 'Track and manage all your content requests.'}</p>
          {userRole === 'admin' && (
            <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <span style={{ fontSize: '0.8125rem', color: 'var(--text-dim)' }}>View:</span>
              <button className={viewMode === 'user' ? 'btn-primary' : 'btn-secondary'} style={{ padding: '0.3rem 0.75rem', fontSize: '0.8125rem' }} onClick={() => setViewMode('user')}>My Dashboard</button>
              <button className={viewMode === 'global' ? 'btn-primary' : 'btn-secondary'} style={{ padding: '0.3rem 0.75rem', fontSize: '0.8125rem', cursor: 'pointer' }} onClick={() => setViewMode('global')}>Global (admin)</button>
            </div>
          )}
        </div>
        {error && <p style={{ color: '#b05050', fontSize: '0.875rem', marginBottom: '1rem' }}>{error}</p>}
        {loading ? (
          <p style={{ color: 'var(--text-muted)' }}>Loading...</p>
        ) : submissions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 0', border: '1px solid var(--hunter-border)', background: 'var(--hunter-mid)' }}>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>No submissions yet.</p>
            <button className="btn-primary" onClick={() => navigate('/author')}>Submit Your First Brief</button>
          </div>
        ) : (
          <div className="section">
            <div className="grid">
              {(viewMode === 'global' ? submissions : submissions.filter(s => s.user_id === user?.id)).map(sub => (
                <div key={sub.id} className="card">
                  <div className="card-meta">{new Date(sub.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })} · {FORMAT_LABELS[sub.article_format] ?? FORMATS.find(f => f.id === sub.article_format)?.name ?? sub.article_format ?? 'Unknown'}</div>
                  <div className="card-title">{sub.topic}</div>
                  {sub.product_link && (
                    <a href={sub.product_link} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.75rem', color: 'var(--gold)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.25rem' }}>
                      🔗 Product link
                    </a>
                  )}
                  <KeywordPills keywordsJson={sub.target_keywords} />
                  <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    {sub.status === 'saved' ? (
                      <>
                        <span style={{ background: '#d97706', color: 'white', fontSize: '0.75rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: '4px' }}>DRAFT</span>
                        <button onClick={() => onEditDraft(sub)} style={{ padding: '0.3rem 0.75rem', fontSize: '0.8125rem', background: '#d97706', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Edit</button>
                        <button onClick={() => { if (window.confirm('Discard this draft? This cannot be undone.')) handleDiscardDraft(sub) }} style={{ padding: '0.3rem 0.75rem', fontSize: '0.8125rem', background: 'none', color: '#b05050', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Discard</button>
                      </>
                    ) : (
                      <span className={`card-status status-${sub.status}`}>{sub.status}</span>
                    )}
                    <span style={{ fontSize: '0.8125rem', color: 'var(--text-dim)' }}>{sub.author}</span>
                    <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>·</span>
                    <button onClick={() => handleHide(sub)} disabled={actionLoading === sub.id} style={{ background: 'none', border: 'none', color: sub.is_hidden ? '#6b7280' : '#9ca3af', cursor: 'pointer', fontSize: '0.75rem', padding: '0', textDecoration: 'underline' }}>{sub.is_hidden ? 'Unhide' : 'Hide'}</button>
                    <button onClick={() => handleDelete(sub)} disabled={actionLoading === sub.id} style={{ background: 'none', border: 'none', color: '#b05050', cursor: 'pointer', fontSize: '0.75rem', padding: '0', textDecoration: 'underline' }}>Delete</button>
                    {(sub.status === 'done' || sub.status === 'article_done' || sub.status === 'in_review') && (
                      <>
                        <button onClick={() => handleDownload(sub)} className="btn-primary" style={{ padding: '0.3rem 0.75rem', fontSize: '0.8125rem' }}>Download</button>
                        {sub.seo_research && sub.seo_report_content && (
                          <button onClick={() => handleDownloadSeoReport(sub)} style={{ padding: '0.3rem 0.75rem', fontSize: '0.8125rem', background: '#1a1a1a', color: '#faf9f7', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>SEO Report</button>
                        )}
                        <button onClick={() => handleViewArticle(sub)} className="btn-secondary" style={{ padding: '0.3rem 0.75rem', fontSize: '0.8125rem' }}>View</button>
                      </>
                    )}
                    {sub.status === 'revision_requested' && (
                      <span style={{ fontSize: '0.75rem', color: '#d97706', fontStyle: 'italic' }}>Revision requested</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {viewArticle && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }} onClick={() => setViewArticle(null)}>
            <div style={{ background: '#faf9f7', maxWidth: '760px', width: '100%', maxHeight: '90vh', overflow: 'auto', borderRadius: '8px', padding: '2rem', position: 'relative' }} onClick={e => e.stopPropagation()}>
              <button onClick={() => setViewArticle(null)} style={{ position: 'absolute', top: '1rem', right: '3.5rem', background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#6b7280' }}>×</button>
              <button onClick={() => handleDownload(viewArticle)} style={{ position: 'absolute', top: '1rem', right: '1rem', background: '#1a1a1a', border: 'none', color: '#faf9f7', padding: '0.35rem 0.75rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8125rem' }}>Download .txt</button>
              <h2 style={{ fontFamily: "'Playfair Display', serif", marginBottom: '0.5rem', paddingRight: '6rem' }}>{viewArticle.topic}</h2>
              <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1.5rem' }}>By {viewArticle.author} · {viewArticle.email}</p>
              {viewArticle.status === 'revision_requested' && viewArticle.revision_notes && (
                <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '6px', padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.875rem' }}>
                  <strong style={{ color: '#92400e' }}>Your revision request:</strong>
                  <p style={{ color: '#78350f', marginTop: '0.25rem', whiteSpace: 'pre-wrap' }}>{viewArticle.revision_notes}</p>
                </div>
              )}
              <div style={{ fontSize: '1.0625rem', lineHeight: '1.85', color: '#1a1a1a' }} dangerouslySetInnerHTML={{ __html: marked.parse(viewArticle.article_content || viewArticle.brief || '') }} />
              {(viewArticle.status === 'done' || viewArticle.status === 'article_done' || viewArticle.status === 'in_review') && (
                <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid #e5e5e5', display: 'flex', justifyContent: 'flex-end' }}>
                  <button onClick={handleRequestEdits} className="btn-secondary" style={{ padding: '0.5rem 1.25rem' }}>Request Edits</button>
                </div>
              )}
            </div>
          </div>
        )}

        {showRevisionModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }} onClick={() => setShowRevisionModal(false)}>
            <div style={{ background: '#faf9f7', maxWidth: '600px', width: '100%', borderRadius: '8px', padding: '2rem', position: 'relative' }} onClick={e => e.stopPropagation()}>
              <button onClick={() => setShowRevisionModal(false)} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#6b7280' }}>×</button>
              <h2 style={{ fontFamily: "'Playfair Display', serif", marginBottom: '0.5rem' }}>Request Edits</h2>
              <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1.25rem' }}>Describe the changes you need. Be specific about what to adjust, add, or remove.</p>
              <textarea
                value={revisionNotes}
                onChange={e => setRevisionNotes(e.target.value)}
                placeholder="Example: The third paragraph is too wordy, cut it in half. Also, can you add a sentence about durability near the end?"
                rows={6}
                style={{ width: '100%', padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9375rem', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', lineHeight: '1.6' }}
              />
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                <button onClick={() => setShowRevisionModal(false)} className="btn-secondary" style={{ padding: '0.5rem 1rem' }}>Cancel</button>
                <button onClick={submitRevision} disabled={revisionLoading || !revisionNotes.trim()} className="btn-primary" style={{ padding: '0.5rem 1rem' }}>{revisionLoading ? 'Submitting...' : 'Submit Revision Request'}</button>
              </div>
            </div>
          </div>
        )}
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
  }, [user, syncUser])

  useEffect(() => {
    const onFocus = () => { syncUser().then(data => { if (data?.notifications) { setNotifs(data.notifications.items); setCount(data.notifications.unread_count) } }) }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [syncUser])

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
  const [authorProfiles, setAuthorProfiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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

    const id = window.location.pathname.split('/content/')[1]
    if (!id) {
      setError('No article ID provided')
      setLoading(false)
      return
    }

    // Use fetch directly to get status code for proper redirects
    fetch(`/api/articles/content?id=${encodeURIComponent(id)}`, { credentials: 'include' })
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
        // Ownership check
        if (data.article.user_id !== user.id && user.role !== 'admin') {
          navigate('/dashboard')
          return
        }
        setArticle(data.article)
      })
      .catch(err => {
        console.error('[/api/articles/content] fetch error:', err)
        setError(err.message)
      })
      .finally(() => setLoading(false))
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

  // Author display name lookup
  const authorProfile = authorProfiles.find(p => p.slug === article.author)
  const authorDisplayName = authorProfile?.display_name || authorProfile?.name || article.author || 'Unknown'

  // Format badge label
  const formatLabel = FORMAT_LABELS[article.article_format] || article.article_format || 'Article'

  // Date formatting: "April 12, 2026"
  const formattedDate = new Date(article.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  // Read time: word_count / 238, rounded up
  const wordCount = article.word_count || 0
  const readTimeMinutes = Math.ceil(wordCount / 238)
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
              <span>{formattedDate}</span>
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

          {/* Article body goes here - not implemented yet per Ben chunk 2 */}
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
        {page === '/author' && (user ? <Author navigate={navigate} syncUser={syncUser} editingDraft={editingDraft} onEditDone={() => setEditingDraft(null)} /> : <Login navigate={navigate} syncUser={syncUser} />)}
        {page === '/dashboard' && (user ? <Dashboard navigate={navigate} syncUser={syncUser} onEditDraft={(sub) => { setEditingDraft(sub); navigate('/author') }} /> : <Login navigate={navigate} />)}
        {page === '/account' && (user ? <Account navigate={navigate} syncUser={syncUser} /> : <Login navigate={navigate} syncUser={syncUser} />)}
        {page === '/writer' && (user ? <Writer navigate={navigate} syncUser={syncUser} /> : <Login navigate={navigate} syncUser={syncUser} />)}
        {page.startsWith('/content/') && (user ? <ContentPage navigate={navigate} user={user} /> : <Login navigate={navigate} />)}
        {page === '/reset' && <Reset navigate={navigate} />}
        {page === '/' && <Landing navigate={navigate} />}
      </div>
    </AuthContext.Provider>
  )
}
