import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'

// ── Constants ──────────────────────────────────────────────────────────────────

const STORAGE_KEY = (presentationId) => `sv_guest_${presentationId}`

const BRAND = {
  orange:     '#FF5500',
  orangeDeep: '#FF3300',
  orangeBg1:  '#FF4500',
  orangeBg2:  '#FF6A00',
  hexStroke:  '#CC3300',
}

// ── Background SVG ─────────────────────────────────────────────────────────────

function GateBackground() {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 0,
      background: `linear-gradient(135deg, ${BRAND.orangeBg1} 0%, ${BRAND.orangeBg2} 100%)`,
      overflow: 'hidden',
    }}>
      <svg
        viewBox="0 0 1440 900"
        xmlns="http://www.w3.org/2000/svg"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        preserveAspectRatio="xMidYMid slice"
      >
        {/* Radial glow blobs */}
        <defs>
          <radialGradient id="blob1" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#CC2200" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#CC2200" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="blob2" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#CC2200" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#CC2200" stopOpacity="0" />
          </radialGradient>
        </defs>
        <ellipse cx="200" cy="300" rx="340" ry="280" fill="url(#blob1)" />
        <ellipse cx="1200" cy="600" rx="300" ry="260" fill="url(#blob2)" />

        {/* Large hexagons */}
        <polygon
          points="-60,80 160,-40 380,80 380,320 160,440 -60,320"
          stroke={BRAND.hexStroke} strokeOpacity="0.1" strokeWidth="2.5" fill="none"
        />
        <polygon
          points="980,340 1200,220 1420,340 1420,580 1200,700 980,580"
          stroke={BRAND.hexStroke} strokeOpacity="0.1" strokeWidth="2.5" fill="none"
        />
        <polygon
          points="400,560 560,470 720,560 720,740 560,830 400,740"
          stroke={BRAND.hexStroke} strokeOpacity="0.07" strokeWidth="2" fill="none"
        />

        {/* Diamond / chevron shapes */}
        <polygon
          points="1050,60 1200,180 1050,300 900,180"
          stroke={BRAND.hexStroke} strokeOpacity="0.08" strokeWidth="2" fill="none"
        />
        <polygon
          points="150,600 280,700 150,800 20,700"
          stroke={BRAND.hexStroke} strokeOpacity="0.08" strokeWidth="2" fill="none"
        />

        {/* Decorative pill shapes (top corners, like reference image) */}
        <rect x="80" y="22" width="60" height="12" rx="6"
          fill="#1a0800" fillOpacity="0.5" />
        <rect x="1300" y="22" width="60" height="12" rx="6"
          fill="#1a0800" fillOpacity="0.5" />
      </svg>

      {/* Bottom center logo area */}
      <div style={{
        position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
        opacity: 0.5,
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: '50%',
          border: `1.5px solid ${BRAND.hexStroke}`,
          background: 'rgba(26,8,0,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="7" r="5.5" stroke="#CC3300" strokeWidth="1.2" fill="none"/>
            <ellipse cx="7" cy="7" rx="2.5" ry="5.5" stroke="#CC3300" strokeWidth="1" fill="none"/>
            <line x1="1.5" y1="7" x2="12.5" y2="7" stroke="#CC3300" strokeWidth="1"/>
          </svg>
        </div>
        <span style={{
          fontFamily: "'Chakra Petch', sans-serif",
          fontSize: 9, letterSpacing: '0.15em', color: '#CC3300',
          textTransform: 'uppercase',
        }}>SINCE 2023</span>
      </div>
    </div>
  )
}

// ── Modal Card ─────────────────────────────────────────────────────────────────

function GateModal({ children }) {
  return (
    <>
      <style>{`
        @keyframes gateSlideUp {
          from { opacity: 0; transform: translateY(28px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)   scale(1); }
        }
        .gate-modal {
          position: relative; z-index: 10;
          width: 420px; max-width: calc(100vw - 32px);
          background: rgba(8, 6, 6, 0.78);
          backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 20px;
          padding: 40px 36px;
          box-shadow: 0 0 60px rgba(255,80,0,0.22), 0 24px 48px rgba(0,0,0,0.55);
          animation: gateSlideUp 0.35s cubic-bezier(0.22,1,0.36,1) both;
          font-family: 'Chakra Petch', sans-serif;
        }
        @media (max-width: 480px) {
          .gate-modal {
            position: fixed !important;
            bottom: 0; left: 0; right: 0;
            width: 100% !important; max-width: 100% !important;
            border-radius: 20px 20px 0 0;
            padding: 32px 24px 40px;
          }
        }
        .gate-input {
          width: 100%; height: 44px;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 10px;
          padding: 0 16px;
          color: #fff;
          font-size: 14px;
          font-family: 'Chakra Petch', sans-serif;
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .gate-input::placeholder { color: rgba(255,255,255,0.25); }
        .gate-input:focus {
          border-color: #FF5500;
          box-shadow: 0 0 0 3px rgba(255,85,0,0.2);
        }
        .gate-input:disabled { opacity: 0.5; cursor: not-allowed; }
        .gate-btn-primary {
          width: 100%; height: 48px;
          background: linear-gradient(135deg, #FF5500, #FF3300);
          border: none; border-radius: 10px;
          color: #fff; font-size: 15px; font-weight: 600;
          font-family: 'Chakra Petch', sans-serif;
          letter-spacing: 0.3px;
          cursor: pointer;
          transition: filter 0.15s, transform 0.1s;
          display: flex; align-items: center; justify-content: center; gap: 8px;
        }
        .gate-btn-primary:hover:not(:disabled) { filter: brightness(1.1); transform: scale(1.015); }
        .gate-btn-primary:active:not(:disabled) { transform: scale(0.98); }
        .gate-btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
        .gate-btn-ghost {
          width: 100%; height: 40px;
          background: none;
          border: 1px solid rgba(255,255,255,0.15);
          border-radius: 10px;
          color: rgba(255,255,255,0.5);
          font-size: 13px;
          font-family: 'Chakra Petch', sans-serif;
          cursor: pointer;
          transition: border-color 0.15s, color 0.15s;
        }
        .gate-btn-ghost:hover { border-color: rgba(255,85,0,0.5); color: rgba(255,255,255,0.75); }
        .gate-label {
          display: block;
          font-size: 11px; font-weight: 500;
          text-transform: uppercase; letter-spacing: 0.1em;
          color: rgba(255,255,255,0.4);
          margin-bottom: 6px;
          font-family: 'Chakra Petch', sans-serif;
        }
        .gate-error {
          font-size: 12px; color: #ff7761;
          font-family: 'Chakra Petch', sans-serif;
          margin-top: 8px; text-align: center;
        }
      `}</style>
      <div className="gate-modal">{children}</div>
    </>
  )
}

// ── Spinner ────────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
      style={{ animation: 'spin 0.7s linear infinite' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <circle cx="8" cy="8" r="6" stroke="rgba(255,255,255,0.3)" strokeWidth="2" fill="none"/>
      <path d="M8 2a6 6 0 0 1 6 6" stroke="#fff" strokeWidth="2" strokeLinecap="round" fill="none"/>
    </svg>
  )
}

// ── Logo slot ──────────────────────────────────────────────────────────────────

function LogoSlot({ logoSrc }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <div style={{
        width: 52, height: 52, borderRadius: '50%',
        border: `2px solid ${BRAND.orange}`,
        background: 'rgba(255,85,0,0.12)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden',
      }}>
        {logoSrc
          ? <img src={logoSrc} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          : <span style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 18, fontWeight: 700, color: BRAND.orange }}>SV</span>
        }
      </div>
      <span style={{
        fontFamily: "'Chakra Petch', sans-serif",
        fontSize: 11, fontWeight: 500,
        textTransform: 'uppercase', letterSpacing: '0.15em',
        color: '#FF7733',
      }}>Stage Visualizer</span>
    </div>
  )
}

// ── Form state ─────────────────────────────────────────────────────────────────

function FormState({ mode, onSubmit, onSwitchMode, loading, error, logoSrc }) {
  const [name,  setName]  = useState('')
  const [email, setEmail] = useState('')

  const isLogin = mode === 'login'

  function handleSubmit(e) {
    e.preventDefault()
    onSubmit(name.trim(), email.trim())
  }

  const canSubmit = isLogin ? !!email.trim() : (!!name.trim() && !!email.trim())

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <LogoSlot logoSrc={logoSrc} />

      <h1 style={{
        fontFamily: "'Chakra Petch', sans-serif",
        fontSize: 26, fontWeight: 700, color: '#fff',
        marginTop: 20, textAlign: 'center', lineHeight: 1.25,
      }}>
        {isLogin ? 'Welcome back 👋' : 'Hey there, stranger 👋'}
      </h1>
      <p style={{
        fontFamily: "'Chakra Petch', sans-serif",
        fontSize: 14, color: 'rgba(255,255,255,0.55)',
        marginTop: 8, textAlign: 'center', lineHeight: 1.6,
        maxWidth: 290, alignSelf: 'center',
      }}>
        {isLogin
          ? 'Enter the email you registered with — we\'ll bring back your name.'
          : 'Drop your name & email so we know who\'s in the room.'}
      </p>

      <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {!isLogin && (
          <div>
            <label className="gate-label">Your Name</label>
            <input
              className="gate-input"
              type="text"
              placeholder="e.g. Alex Johnson"
              value={name}
              onChange={e => setName(e.target.value)}
              disabled={loading}
              required
              maxLength={100}
              autoComplete="name"
            />
          </div>
        )}
        <div>
          <label className="gate-label">Email Address</label>
          <input
            className="gate-input"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            disabled={loading}
            required
            autoComplete="email"
          />
        </div>
      </div>

      {error && <p className="gate-error">{error}</p>}

      <button
        type="submit"
        className="gate-btn-primary"
        style={{ marginTop: 20 }}
        disabled={loading || !canSubmit}
      >
        {loading
          ? <><Spinner /> Checking...</>
          : (isLogin ? 'Continue →' : 'Let me in →')}
      </button>

      <button
        type="button"
        className="gate-btn-ghost"
        style={{ marginTop: 10 }}
        onClick={() => onSwitchMode(isLogin ? 'signup' : 'login')}
        disabled={loading}
      >
        {isLogin ? 'First time here? Register' : 'Already registered? Just enter your email'}
      </button>
    </form>
  )
}

// ── Welcome-back state ─────────────────────────────────────────────────────────

function WelcomeBackState({ guest, onConfirm, onNotMe, loading, logoSrc }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <LogoSlot logoSrc={logoSrc} />

      <h1 style={{
        fontFamily: "'Chakra Petch', sans-serif",
        fontSize: 26, fontWeight: 700, color: '#fff',
        marginTop: 20, textAlign: 'center',
      }}>
        Welcome back! 🎉
      </h1>
      <p style={{
        fontFamily: "'Chakra Petch', sans-serif",
        fontSize: 14, color: 'rgba(255,255,255,0.55)',
        marginTop: 8, textAlign: 'center', lineHeight: 1.6,
      }}>
        Looks like you've been here before.
      </p>

      {/* Identity confirmation banner */}
      <div style={{
        marginTop: 24,
        background: 'rgba(255,85,0,0.12)',
        border: '1px solid rgba(255,85,0,0.28)',
        borderRadius: 10,
        padding: '14px 16px',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 6,
        }}>
          <span style={{
            fontFamily: "'Chakra Petch', sans-serif",
            fontSize: 11, fontWeight: 600,
            textTransform: 'uppercase', letterSpacing: '0.1em',
            color: BRAND.orange,
          }}>Registered identity</span>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="7" r="6.5" stroke={BRAND.orange} strokeWidth="1.2"/>
            <path d="M4 7l2 2 4-4" stroke={BRAND.orange} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <p style={{
          fontFamily: "'Chakra Petch', sans-serif",
          fontSize: 18, fontWeight: 700, color: '#fff',
          margin: 0,
        }}>{guest.name}</p>
        <p style={{
          fontFamily: "'Chakra Petch', sans-serif",
          fontSize: 13, color: 'rgba(255,255,255,0.5)',
          margin: '2px 0 0',
        }}>{guest.email}</p>
      </div>

      <button
        className="gate-btn-primary"
        style={{ marginTop: 20 }}
        onClick={onConfirm}
        disabled={loading}
      >
        {loading ? <><Spinner /> One sec...</> : "That's me, let me in →"}
      </button>

      <button
        className="gate-btn-ghost"
        style={{ marginTop: 10 }}
        onClick={onNotMe}
        disabled={loading}
      >
        Not me — use different email
      </button>
    </div>
  )
}

// ── Main GuestGate ─────────────────────────────────────────────────────────────

/**
 * Wraps client view pages. Shows an identity gate before rendering children.
 * Skips gate if:
 *   - authenticated admin session exists (pass isAdmin=true)
 *   - valid guest_token found in localStorage
 *
 * @param {object}  props
 * @param {string}  props.presentationId   — project UUID from URL
 * @param {boolean} [props.isAdmin=false]  — authenticated admin bypass
 * @param {string}  [props.logoSrc]        — optional logo image URL
 * @param {React.ReactNode} props.children
 */
/**
 * @param {function} [props.onConfirmed] — callback mode: called when gate passes, renders nothing.
 *   Use this when you need an early-return pattern (e.g. ClientPage).
 *   If omitted, renders children when confirmed (wrapper mode).
 * @param {function} [props.onDismiss] — if provided, shows a close control (X button,
 *   backdrop click, Escape key) so the gate can be opened on-demand (e.g. only when
 *   a viewer tries to leave feedback) instead of blocking the whole page.
 */
export default function GuestGate({ presentationId, isAdmin = false, logoSrc, onConfirmed, onDismiss, children }) {
  // 'checking' | 'gate' | 'welcome-back' | 'confirmed'
  const [phase, setPhase] = useState('checking')
  // 'signup' | 'login' — controls the gate form layout
  const [mode, setMode] = useState('signup')
  const [returnGuest, setReturnGuest] = useState(null)
  const [pendingGuest, setPendingGuest] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (phase === 'confirmed' && onConfirmed) {
      onConfirmed(pendingGuest || getStoredGuest(presentationId))
    }
  }, [phase, onConfirmed, pendingGuest, presentationId])

  // ── Dismiss on Escape (only when the gate is closable) ────────────────────
  useEffect(() => {
    if (!onDismiss) return undefined
    const onKeyDown = (e) => { if (e.key === 'Escape') onDismiss() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onDismiss])

  // ── Mount: check localStorage fast-pass ──────────────────────────────────
  useEffect(() => {
    if (!presentationId) return

    // Admin users always bypass
    if (isAdmin) {
      setPhase('confirmed')
      return
    }

    try {
      const raw = localStorage.getItem(STORAGE_KEY(presentationId))
      if (raw) {
        const stored = JSON.parse(raw)
        if (stored?.expires_at && new Date(stored.expires_at) > new Date()) {
          setPendingGuest(stored)
          setPhase('confirmed')
          return
        }
        // Expired — clean up
        localStorage.removeItem(STORAGE_KEY(presentationId))
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY(presentationId))
    }

    setPhase('gate')
  }, [presentationId, isAdmin])

  // ── Switch between signup / login modes ───────────────────────────────────
  const handleSwitchMode = useCallback((next) => {
    setError(null)
    setMode(next)
  }, [])

  // ── Form submit ───────────────────────────────────────────────────────────
  const handleFormSubmit = useCallback(async (name, email) => {
    const isLogin = mode === 'login'
    if (!email || (!isLogin && !name)) return
    setLoading(true)
    setError(null)

    try {
      const { data, error: rpcError } = isLogin
        ? await supabase.rpc('lookup_guest', {
            p_presentation_id: presentationId,
            p_email:           email,
          })
        : await supabase.rpc('upsert_guest', {
            p_presentation_id: presentationId,
            p_email:           email,
            p_name:            name,
          })

      if (rpcError) {
        const msg = rpcError.message || ''
        if (msg.includes('guest_not_found')) {
          setError('No registration found for that email. Switch to "Register" to sign up.')
        }
        else if (msg.includes('invalid_email'))         setError('That doesn\'t look like a valid email.')
        else if (msg.includes('invalid_name'))     setError('Please enter a valid name (1–100 characters).')
        else if (msg.includes('presentation_not_found')) setError('This presentation link is no longer active.')
        else if (msg.includes('Could not find the function') || msg.includes('schema cache')) {
          setError('Guest access is not ready yet. Run the presentation guests migration, then refresh.')
        } else setError(msg || 'Something went wrong. Please try again.')
        return
      }

      if (data.is_new) {
        // New guest — confirm immediately
        persistGuest(data)
        setPendingGuest(data)
        setPhase('confirmed')
      } else {
        // Returning guest (existing email, or login lookup) — confirm identity.
        // The stored name is authoritative; we never override it here.
        setPendingGuest(data)
        setReturnGuest({ name: data.name, email: data.email })
        setPhase('welcome-back')
      }
    } catch {
      setError('Network error. Please check your connection.')
    } finally {
      setLoading(false)
    }
  }, [presentationId, mode])

  // ── Welcome-back confirm ──────────────────────────────────────────────────
  const handleConfirm = useCallback(() => {
    if (!pendingGuest) return
    setLoading(true)
    persistGuest(pendingGuest)
    setPhase('confirmed')
    setLoading(false)
  }, [pendingGuest])

  // ── "Not me" → back to fresh form ────────────────────────────────────────
  const handleNotMe = useCallback(() => {
    setReturnGuest(null)
    setPendingGuest(null)
    setError(null)
    setMode('signup')
    setPhase('gate')
  }, [])

  // ── Persist to localStorage ───────────────────────────────────────────────
  function persistGuest(data) {
    try {
      localStorage.setItem(STORAGE_KEY(presentationId), JSON.stringify({
        id:          data.id,
        name:        data.name,
        email:       data.email,
        guest_token: data.guest_token,
        expires_at:  data.token_expires_at,
      }))
    } catch {
      // localStorage blocked (private mode) — session continues without persistence
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (phase === 'checking') return null

  if (phase === 'confirmed') {
    if (onConfirmed) return null   // caller handles rendering
    return <>{children}</>
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={(e) => { if (onDismiss && e.target === e.currentTarget) onDismiss() }}
    >
      <GateBackground />

      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Close"
          style={{
            position: 'absolute', top: 20, right: 20, zIndex: 20,
            width: 36, height: 36, borderRadius: '50%',
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.15)',
            color: '#fff', fontSize: 20, lineHeight: 1,
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >×</button>
      )}

      {phase === 'gate' && (
        <GateModal>
          <FormState
            mode={mode}
            onSubmit={handleFormSubmit}
            onSwitchMode={handleSwitchMode}
            loading={loading}
            error={error}
            logoSrc={logoSrc}
          />
        </GateModal>
      )}

      {phase === 'welcome-back' && returnGuest && (
        <GateModal>
          <WelcomeBackState
            guest={returnGuest}
            onConfirm={handleConfirm}
            onNotMe={handleNotMe}
            loading={loading}
            logoSrc={logoSrc}
          />
        </GateModal>
      )}
    </div>
  )
}

// ── Helper: read stored guest from localStorage ────────────────────────────────
// Used by ClientPage to get guest_id for feedback submissions.
export function getStoredGuest(presentationId) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY(presentationId))
    if (!raw) return null
    const stored = JSON.parse(raw)
    if (!stored?.expires_at || new Date(stored.expires_at) <= new Date()) return null
    return stored
  } catch {
    return null
  }
}
