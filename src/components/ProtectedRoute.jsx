import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

/**
 * Wraps protected routes (/admin, /collab/:id).
 * Shows a spinner while the session check is in-flight.
 * Redirects unauthenticated users to the login page (/).
 */
export default function ProtectedRoute({ children }) {
  // undefined = loading, null = no session, object = authenticated
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    // Grab the current session once on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session ?? null)
    })

    // Stay in sync if the user signs out in another tab
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  if (session === undefined) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-[#0a0a0c]">
        <div className="relative w-8 h-8">
          <div className="absolute inset-0 rounded-full border-2 border-white/10" />
          <div className="absolute inset-0 rounded-full border-2 border-t-violet-400 border-r-transparent border-b-transparent border-l-transparent animate-spin" />
        </div>
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/" replace />
  }

  return children
}
