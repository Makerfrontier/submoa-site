import { useState, useEffect, createContext, useContext } from 'react'
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

// ─── Nav ────────────────────────────────────────────────────────────────
function Nav({ navigate }) {
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
            <a href="#how-it-works" onClick={e => { e.preventDefault(); closeMenu(); document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' }); navigate('/') }}>How It Works</a>
            <a href="#features" onClick={e => { e.preventDefault(); closeMenu(); document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' }); navigate('/') }}>Features</a>
            {!loading && !user && (
              <>
                <a href="#" onClick={e => { e.preventDefault(); closeMenu(); navigate('/login') }}>Login</a>
                <a href="#" className="nav-mobile-cta" onClick={e => { e.preventDefault(); closeMenu(); navigate('/request') }}>Request Access</a>
              </>
            )}
            {!loading && user && (
              <>
                <a href="#" onClick={e => { e.preventDefault(); closeMenu(); navigate('/author') }}>Submit Brief</a>
                {user?.role === 'admin' && <a href="#" onClick={e => { e.preventDefault(); closeMenu(); navigate('/writer') }}>Writer</a>}
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
              <a href="#how-it-works" className="nav-link" onClick={e => { e.preventDefault(); document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' }); navigate('/') }}>How It Works</a>
              <a href="#features" className="nav-link" onClick={e => { e.preventDefault(); document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' }); navigate('/') }}>Features</a>
              {!loading && !user && (
                <>
                  <a href="#" className="nav-link" onClick={e => { e.preventDefault(); navigate('/login') }}>login</a>
                  <a href="#" className="nav-cta" onClick={e => { e.preventDefault(); navigate('/request') }}>Request Access</a>
                </>
              )}
              {!loading && user && (
                <>
                  <a href="#" className="nav-link" onClick={e => { e.preventDefault(); navigate('/author') }}>Submit Brief</a>
                  {user?.role === 'admin' && <a href="#" className="nav-link" onClick={e => { e.preventDefault(); navigate('/writer') }}>Writer</a>}
                  <a href="#" className="nav-link" onClick={e => { e.preventDefault(); navigate('/dashboard') }}>Dashboard</a>
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
      <Nav navigate={navigate} />
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
function Login({ navigate }) {
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
const AUTHORS = [
  { id: 'ben-ryder', name: 'First Person Field Reviewer' },
  { id: 'andy-husek', name: 'Trusted Field Expert' },
  { id: 'adam-scepaniak', name: 'Formal and Structured Product Manager' },
  { id: 'sydney', name: 'Sydney - AI Agent' }
]
const FORMATS = [
  { id: 'seo-blog', name: 'SEO Blog Article', desc: 'Product reviews, how-to guides, most topics' },
  { id: 'scientific', name: 'Scientific Research Paper', desc: 'Academic tone, satirical research papers' },
  { id: 'llm-blog', name: 'LLM-Optimized Blog', desc: 'Clear facts, direct answers, good for citation' },
  { id: 'discover-news', name: 'Google Discover News', desc: 'Hook-first, short paragraphs' }
]
const VOCAL_TONES = [
  { id: 'expert', label: 'Expert — Authoritative, confident, precise' },
  { id: 'professional', label: 'Professional — Neutral, polished, corporate' },
  { id: 'analytical', label: 'Analytical — Logical, data-driven, structured' },
  { id: 'educational', label: 'Educational — Clear, explanatory, teaching-focused' },
  { id: 'technical', label: 'Technical — Detailed, system-focused, precise' },
  { id: 'scientific', label: 'Scientific — Formal, evidence-oriented, cautious' },
  { id: 'journalistic', label: 'Journalistic — Objective, fact-based, neutral' },
  { id: 'advisory', label: 'Advisory — Guidance-driven, helpful, supportive' },
  { id: 'conversational', label: 'Conversational — Casual, direct, approachable' },
  { id: 'humorous', label: 'Humorous — Playful, witty, engaging' },
  { id: 'storytelling', label: 'Storytelling — Narrative, immersive, descriptive' },
  { id: 'opinionated', label: 'Opinionated — Assertive, strong voice, clear stance' },
  { id: 'relatable', label: 'Relatable — Familiar, everyday, human' },
  { id: 'entertaining', label: 'Entertaining — Engaging, light, enjoyable' },
  { id: 'provocative', label: 'Provocative — Bold, challenging, attention-grabbing' },
  { id: 'satirical', label: 'Satirical — Ironic, exaggerated, indirect' },
  { id: 'instructional', label: 'Instructional — Step-by-step, actionable' },
  { id: 'listicle', label: 'Listicle — Structured, scannable' },
  { id: 'review-focused', label: 'Review-Focused — Evaluative, experience-driven' },
  { id: 'comparison', label: 'Comparison — Side-by-side, decision-oriented' }
]
const WORD_COUNTS = ['700', '800', '900', '1000', '1200', '1500']

function Author({ navigate }) {
  const { user } = useAuth()
  const [form, setForm] = useState({ author: 'ben-ryder', topic: '', productLink: '', humanObservation: '', anecdotalStories: '', minWordCount: '1200', targetKeywords: '', seoResearch: false, articleFormat: 'seo-blog', vocalTone: '', email: '' })
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { if (user?.email) setForm(f => ({ ...f, email: user.email })) }, [user])

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api('/api/submissions', {
        method: 'POST',
        body: JSON.stringify({
          topic: form.topic,
          author: form.author,
          article_format: form.articleFormat,
          vocal_tone: form.vocalTone,
          min_word_count: form.minWordCount,
          product_link: form.productLink,
          target_keywords: form.targetKeywords,
          seo_research: form.seoResearch,
          human_observation: form.humanObservation,
          anecdotal_stories: form.anecdotalStories,
          email: form.email,
        }),
      })
      setSubmitted(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (submitted) return (
    <div className="page"><div className="container"><div className="form-card"><div className="confirm-icon">✓</div><h1 className="confirm-title">Brief received.</h1><p className="confirm-sub">We'll have your content ready same-day. You'll receive a notification when it's available in your dashboard.</p><div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}><button className="btn-primary" onClick={() => { setSubmitted(false); setForm({ author: 'ben-ryder', topic: '', productLink: '', humanObservation: '', anecdotalStories: '', minWordCount: '1200', targetKeywords: '', seoResearch: false, articleFormat: 'seo-blog', vocalTone: '', email: user?.email || '' }) }}>Submit Another</button><button className="btn-secondary" onClick={() => navigate('/dashboard')}>View Dashboard</button></div></div></div></div>
  )

  return (
    <div className="page"><div className="container"><div style={{ maxWidth: '640px', margin: '0 auto', padding: '3rem 0' }}>
        <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '1.625rem', fontWeight: 700, color: 'var(--cream)', marginBottom: '2rem' }}>Submit a Brief.</h1>
        {error && <p style={{ color: '#b05050', fontSize: '0.875rem', marginBottom: '1rem' }}>{error}</p>}
        <form onSubmit={handleSubmit}>
          <div className="form-group"><label className="form-label">Topic</label><input type="text" name="topic" className="form-input" placeholder="What are we writing about?" value={form.topic} onChange={handleChange} required /></div>
          <div className="form-group"><label className="form-label">Author Voice</label><select name="author" className="form-input" value={form.author} onChange={handleChange}>{AUTHORS.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
          <div className="form-group"><label className="form-label">Article Format</label><select name="articleFormat" className="form-input" value={form.articleFormat} onChange={handleChange}>{FORMATS.map(f => <option key={f.id} value={f.id}>{f.name} — {f.desc}</option>)}</select></div>
          <div className="form-group"><label className="form-label">Vocal Tone (Optional)</label><select name="vocalTone" className="form-input" value={form.vocalTone} onChange={handleChange}><option value="">Select a tone...</option>{VOCAL_TONES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select></div>
          <div className="form-group"><label className="form-label">Min Word Count</label><select name="minWordCount" className="form-input" value={form.minWordCount} onChange={handleChange}>{WORD_COUNTS.map(w => <option key={w} value={w}>{w}+ words</option>)}</select></div>
          <div className="form-group"><label className="form-label">Product Link (Optional)</label><input type="url" name="productLink" className="form-input" placeholder="https://..." value={form.productLink} onChange={handleChange} /></div>
          <div className="form-group"><label className="form-label">Target Keywords (If Known)</label><input type="text" name="targetKeywords" className="form-input" placeholder="Comma-separated" value={form.targetKeywords} onChange={handleChange} /></div>
          <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}><input type="checkbox" name="seoResearch" checked={form.seoResearch} onChange={handleChange} style={{ width: '16px', height: '16px', accentColor: 'var(--gold)' }} /><label className="form-label" style={{ marginBottom: 0, textTransform: 'none', fontSize: '0.8125rem', letterSpacing: 0, color: 'var(--text-muted)' }}>Request Deep SEO Research (generates separate report)</label></div>
          <div className="form-group"><label className="form-label">Human Observation on the Product</label><textarea name="humanObservation" className="form-input" rows="4" placeholder="Your direct experience with the product..." value={form.humanObservation} onChange={handleChange} required /></div>
          <div className="form-group"><label className="form-label">Anecdotal Stories to Include (Optional)</label><textarea name="anecdotalStories" className="form-input" rows="3" placeholder="Stories, scenarios, or use cases..." value={form.anecdotalStories} onChange={handleChange} /></div>
          <div className="form-group"><label className="form-label">Your Email</label><input type="email" name="email" className="form-input" placeholder="For delivery" value={form.email} onChange={handleChange} required /></div>
          <button type="submit" className="btn-primary" style={{ width: '100%', marginTop: '1rem' }} disabled={loading}>{loading ? 'Submitting...' : 'Submit Brief'}</button>
        </form>
      </div></div>
    </div>
  )
}

// ─── Dashboard ──────────────────────────────────────────────────────────────
function Dashboard({ navigate }) {
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

  const loadSubmissions = () => {
    api('/api/submissions')
      .then(data => {
        setSubmissions(data.submissions || [])
        setUserRole(data.role || 'user')
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadSubmissions() }, [])

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

  const handleViewArticle = (sub) => setViewArticle(sub)

  const handleRequestEdits = () => {
    if (!viewArticle) return
    setRevisionNotes(sub.revision_notes || '')
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

  return (
    <div className="page">
      <div className="container">
        <div className="dashboard-header">
          <h1 className="dashboard-title">Your Content.</h1>
          <p className="dashboard-sub">{user ? `Signed in as ${user.name}` : 'Track and manage all your content requests.'}</p>
          {userRole === 'admin' && (
            <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <span style={{ fontSize: '0.8125rem', color: 'var(--text-dim)' }}>View:</span>
              <button className="btn-secondary" style={{ padding: '0.3rem 0.75rem', fontSize: '0.8125rem' }}>My Dashboard</button>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Global (admin)</span>
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
              {submissions.map(sub => (
                <div key={sub.id} className="card">
                  <div className="card-meta">{new Date(sub.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })} · {sub.article_format}</div>
                  <div className="card-title">{sub.topic}</div>
                  <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className={`card-status status-${sub.status}`}>{sub.status}</span>
                    <span style={{ fontSize: '0.8125rem', color: 'var(--text-dim)' }}>{sub.author}</span>
                    <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>·</span>
                    <button onClick={() => handleHide(sub)} disabled={actionLoading === sub.id} style={{ background: 'none', border: 'none', color: sub.is_hidden ? '#6b7280' : '#9ca3af', cursor: 'pointer', fontSize: '0.75rem', padding: '0', textDecoration: 'underline' }}>{sub.is_hidden ? 'Unhide' : 'Hide'}</button>
                    <button onClick={() => handleDelete(sub)} disabled={actionLoading === sub.id} style={{ background: 'none', border: 'none', color: '#b05050', cursor: 'pointer', fontSize: '0.75rem', padding: '0', textDecoration: 'underline' }}>Delete</button>
                    {sub.status === 'done' && (
                      <>
                        <button onClick={() => handleDownload(sub)} className="btn-primary" style={{ padding: '0.3rem 0.75rem', fontSize: '0.8125rem' }}>Download</button>
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
              <div style={{ fontSize: '1.0625rem', lineHeight: '1.85', whiteSpace: 'pre-wrap', color: '#1a1a1a' }}>{viewArticle.article_content || viewArticle.brief}</div>
              {viewArticle.status === 'done' && (
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
function Account({ navigate }) {
  const { user } = useAuth()
  const [inviteLink, setInviteLink] = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteError, setInviteError] = useState('')

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
      </div></div></div>
  )
}

// ─── Writer (Sydney/Ben — edit article content) ─────────────────────────────────────
function Writer({ navigate }) {
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

  const handleEdit = (sub) => {
    setEditing({ id: sub.id, article_content: sub.article_content || '', status: sub.status, topic: sub.topic, revision_notes: sub.revision_notes || '' })
    setSaveMsg('')
  }

  const handleSave = async () => {
    if (!editing) return
    setSaveLoading(true)
    setSaveMsg('')
    try {
      const body = { article_content: editing.article_content }
      // If it doesn't have content yet, mark as done on first save
      const sub = submissions.find(s => s.id === editing.id)
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
                    {' · '}{sub.article_format}
                  </div>
                  <div className="card-title">{sub.topic}</div>
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

  const authValue = { user, loading, fetchUser }

  return (
    <AuthContext.Provider value={authValue}>
      <Nav navigate={navigate} />
      <div className="page">
        {page === '/login' && <Login navigate={navigate} />}
        {page === '/request' && <RequestAccess navigate={navigate} />}
        {page === '/register' && <Register navigate={navigate} />}
        {page === '/author' && (user ? <Author navigate={navigate} /> : <Login navigate={navigate} />)}
        {page === '/dashboard' && (user ? <Dashboard navigate={navigate} /> : <Login navigate={navigate} />)}
        {page === '/account' && (user ? <Account navigate={navigate} /> : <Login navigate={navigate} />)}
        {page === '/writer' && (user ? <Writer navigate={navigate} /> : <Login navigate={navigate} />)}
        {page === '/reset' && <Reset navigate={navigate} />}
        {page === '/' && <Landing navigate={navigate} />}
      </div>
    </AuthContext.Provider>
  )
}
