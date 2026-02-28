import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

export default function LoginPage() {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [checking, setChecking] = useState(true)
  const [error,    setError]    = useState('')
  const navigate = useNavigate()

  // If already logged in, skip straight to admin
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate('/admin', { replace: true })
      else setChecking(false)
    })
  }, [navigate])

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      navigate('/admin', { replace: true })
    }
  }

  // Brief spinner while we check existing session
  if (checking) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-[#0a0a0c]">
        <div className="relative w-8 h-8">
          <div className="absolute inset-0 rounded-full border-2 border-white/10" />
          <div className="absolute inset-0 rounded-full border-2 border-t-violet-400 border-r-transparent border-b-transparent border-l-transparent animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen w-full bg-[#0a0a0c] flex items-center justify-center relative overflow-hidden">

      {/* Ambient background glows */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-violet-600/8 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-72 h-72 bg-cyan-500/6 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-2/3 left-1/4 w-48 h-48 bg-violet-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 w-full max-w-sm px-6">

        {/* ── Branding ── */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-violet-500/15 border border-violet-500/25 rounded-2xl mb-5 shadow-lg shadow-violet-500/10">
            <svg className="w-8 h-8 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-[0.2em] uppercase">TOO:AWAKE</h1>
          <p className="text-[10px] text-white/30 mt-1.5 tracking-[0.4em] uppercase">Stage Visualizer</p>
        </div>

        {/* ── Login card ── */}
        <div className="bg-black/50 backdrop-blur-xl border border-white/10 rounded-2xl p-7 shadow-2xl">
          <p className="text-sm font-semibold text-white/70 mb-6">Sign in to your studio</p>

          <form onSubmit={handleLogin} className="space-y-4">

            {/* Email */}
            <div className="space-y-1.5">
              <label className="text-[10px] text-white/35 uppercase tracking-widest block">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                autoComplete="email"
                className="w-full bg-white/5 border border-white/10 focus:border-violet-500/60 focus:bg-violet-500/5 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 outline-none transition-all"
              />
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="text-[10px] text-white/35 uppercase tracking-widest block">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                autoComplete="current-password"
                className="w-full bg-white/5 border border-white/10 focus:border-violet-500/60 focus:bg-violet-500/5 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 outline-none transition-all"
              />
            </div>

            {/* Error message */}
            {error && (
              <div className="flex items-start gap-2.5 bg-red-500/10 border border-red-500/20 rounded-xl px-3.5 py-3 text-xs text-red-400">
                <svg className="w-3.5 h-3.5 flex-shrink-0 mt-px" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 mt-1 bg-violet-600/30 hover:bg-violet-600/45 border border-violet-500/40 hover:border-violet-500/70 text-violet-200 hover:text-white shadow-lg shadow-violet-500/10 hover:shadow-violet-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
                  Signing in…
                </>
              ) : (
                <>
                  Sign In
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Footer note */}
        <p className="text-center text-[10px] text-white/15 mt-6 tracking-wide">
          Admin &amp; Collaborator access only · Client links are always public
        </p>
      </div>
    </div>
  )
}
