import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

const BADGE_COLORS = {
  violet: 'bg-violet-500/20 border-violet-500/30 text-violet-300',
  cyan:   'bg-cyan-500/20   border-cyan-500/30   text-cyan-300',
  blue:   'bg-blue-500/20   border-blue-500/30   text-blue-300',
}

/**
 * Top-right overlay used on protected pages (Admin, Collab).
 * Shows the role badge alongside a Sign Out button.
 */
export default function TopBar({ role, color }) {
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    navigate('/', { replace: true })
  }

  return (
    <div className="absolute top-4 right-4 flex items-center gap-2">
      {/* Sign Out */}
      <button
        onClick={handleSignOut}
        title="Sign Out"
        className="flex items-center gap-1.5 px-3 py-1.5 bg-black/40 backdrop-blur-sm border border-white/10 hover:border-red-500/40 rounded-lg text-[10px] font-medium text-white/35 hover:text-red-400 transition-all"
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
        </svg>
        Sign Out
      </button>

      {/* Role badge */}
      <div className={`px-3 py-1.5 rounded-lg border text-[10px] font-semibold uppercase tracking-widest backdrop-blur-sm ${BADGE_COLORS[color]}`}>
        {role}
      </div>
    </div>
  )
}
