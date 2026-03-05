import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'
import { REALTIME_CHANNEL_NAME } from '../lib/analyticsTracker'

const FONT_FAMILY = "'Chakra Petch', sans-serif"
const ACCENT = '#FF5F1F'

// ── Parse user agent for display ─────────────────────────────────────────────
function parseUserAgent(ua) {
  if (!ua) return '—'
  const s = ua.substring(0, 80)
  if (s.includes('Chrome') && !s.includes('Edg')) return 'Chrome'
  if (s.includes('Firefox')) return 'Firefox'
  if (s.includes('Safari') && !s.includes('Chrome')) return 'Safari'
  if (s.includes('Edg')) return 'Edge'
  return s.split(' ').slice(0, 2).join(' ') || '—'
}

// ── Format time for timeline ─────────────────────────────────────────────────
function fmtTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}

// ── Event type to label + icon ───────────────────────────────────────────────
const EVENT_LABELS = {
  SESSION_END:       { icon: '🔴', label: 'Session Ended' },
  CAMERA_CHANGE:     { icon: '🎥', label: 'Camera' },
  AUTOPLAY_TOGGLED:  { icon: '▶️', label: 'Autoplay' },
  SCREENSHOT_TAKEN:  { icon: '📸', label: 'Screenshot Taken' },
}
function getEventDisplay(eventType, eventDetail) {
  const { icon, label } = EVENT_LABELS[eventType] || { icon: '•', label: eventType }
  if (eventType === 'CAMERA_CHANGE' && eventDetail?.presetName) {
    return { icon, text: `Changed Camera to "${eventDetail.presetName}"` }
  }
  if (eventType === 'AUTOPLAY_TOGGLED' && eventDetail?.state) {
    return { icon, text: eventDetail.state === 'ON' ? 'Started Autoplay' : 'Stopped Autoplay' }
  }
  if (eventType === 'SCREENSHOT_TAKEN') return { icon, text: 'Took a Screenshot' }
  if (eventType === 'SESSION_END') {
    const dur = eventDetail?.durationSeconds
    const min = dur != null ? Math.floor(dur / 60) : 0
    return { icon, text: `User left${dur != null ? ` (Duration: ${min}m)` : ''}` }
  }
  return { icon, text: label }
}

// ── Session X-Ray Modal ──────────────────────────────────────────────────────
function SessionXRayModal({ sessionId, visitor, onClose }) {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!sessionId) return
    setLoading(true)
    supabase
      .from('interaction_events')
      .select('id, event_type, event_detail, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        setEvents(data || [])
        setLoading(false)
      })
  }, [sessionId])

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="relative w-full max-w-md max-h-[85vh] flex flex-col rounded-2xl overflow-hidden border"
        style={{
          background: '#0a0a0c',
          borderColor: 'rgba(255,95,31,0.3)',
          fontFamily: FONT_FAMILY,
        }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 flex-shrink-0">
          <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: ACCENT }}>
            Session X-Ray
          </h3>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-all"
          >
            ✕
          </button>
        </div>
        <div className="px-4 py-2 border-b border-white/5 flex-shrink-0">
          <p className="text-[10px] text-white/40 uppercase tracking-widest">Session ID</p>
          <p className="text-xs text-white/70 font-mono truncate mt-0.5">{sessionId}</p>
          {visitor && (
            <p className="text-[10px] text-white/35 mt-1">
              {fmtTime(visitor.created_at)} · {parseUserAgent(visitor.user_agent)} · {visitor.page_visited}
            </p>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-0">
          {loading ? (
            <p className="text-white/40 text-xs">Loading timeline…</p>
          ) : events.length === 0 ? (
            <p className="text-white/35 text-xs">No events for this session.</p>
          ) : (
            <div className="relative pl-5">
              <div
                className="absolute left-[5px] top-2 bottom-2 w-0.5 rounded-full"
                style={{ background: ACCENT, opacity: 0.6 }}
              />
              {/* Synthetic session start row */}
              {visitor && (
                <div className="relative flex items-start gap-3 pb-4">
                  <span
                    className="absolute left-0 w-2.5 h-2.5 rounded-full border-2 flex-shrink-0 mt-0.5"
                    style={{
                      background: ACCENT,
                      borderColor: ACCENT,
                      transform: 'translateX(-50%)',
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] text-white/45 font-mono" style={{ color: 'rgba(255,95,31,0.9)' }}>
                      [{fmtTime(visitor.created_at)}]
                    </p>
                    <p className="text-xs text-white/85 mt-0.5"><span className="mr-1.5">🟢</span>User joined.</p>
                  </div>
                </div>
              )}
              {events.map((evt) => {
                const { icon, text } = getEventDisplay(evt.event_type, evt.event_detail || {})
                const isEnd = evt.event_type === 'SESSION_END'
                return (
                  <div key={evt.id} className="relative flex items-start gap-3 pb-4 last:pb-0">
                    <span
                      className="absolute left-0 w-2.5 h-2.5 rounded-full border-2 flex-shrink-0 mt-0.5"
                      style={{
                        background: isEnd ? '#0a0a0c' : ACCENT,
                        borderColor: ACCENT,
                        transform: 'translateX(-50%)',
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] text-white/45 font-mono" style={{ color: 'rgba(255,95,31,0.9)' }}>
                        [{fmtTime(evt.created_at)}]
                      </p>
                      <p className="text-xs text-white/85 mt-0.5"><span className="mr-1.5">{icon}</span>{text}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Client Radar Tab ────────────────────────────────────────────────────────
export default function ClientRadarTab() {
  const [onlineCount, setOnlineCount] = useState(0)
  const [visitors, setVisitors] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedSession, setSelectedSession] = useState(null)
  const [selectedVisitor, setSelectedVisitor] = useState(null)

  const loadVisitors = useCallback(async () => {
    const { data, error } = await supabase
      .from('visitor_logs')
      .select('id, session_id, created_at, user_agent, page_visited')
      .order('created_at', { ascending: false })
      .limit(100)
    if (!error) setVisitors(data || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    loadVisitors()
  }, [loadVisitors])

  useEffect(() => {
    const channel = supabase.channel(REALTIME_CHANNEL_NAME)
    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState()
        const keys = new Set()
        Object.values(state).forEach((presences) => {
          (presences || []).forEach((p) => {
            if (p.session_id) keys.add(p.session_id)
          })
        })
        setOnlineCount(keys.size)
      })
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const openSession = (v) => {
    setSelectedVisitor(v)
    setSelectedSession(v.session_id)
  }

  return (
    <div className="space-y-5" style={{ fontFamily: FONT_FAMILY }}>
      {/* Section 1: Live Pulse */}
      <div
        className="rounded-xl border p-4"
        style={{
          background: 'rgba(0,0,0,0.4)',
          borderColor: 'rgba(255,95,31,0.25)',
        }}
      >
        <p className="text-[10px] uppercase tracking-widest text-white/40 mb-1">Live Pulse</p>
        <div className="flex items-center gap-2">
          <span
            className="w-2.5 h-2.5 rounded-full animate-pulse"
            style={{ background: ACCENT, boxShadow: `0 0 8px ${ACCENT}` }}
          />
          <span className="text-lg font-bold" style={{ color: ACCENT }}>
            CURRENTLY ONLINE: {onlineCount} USER{onlineCount !== 1 ? 'S' : ''}
          </span>
        </div>
      </div>

      {/* Section 2: Visitor History */}
      <div
        className="rounded-xl border overflow-hidden"
        style={{
          background: 'rgba(0,0,0,0.4)',
          borderColor: 'rgba(255,95,31,0.2)',
        }}
      >
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-widest text-white/40">Visitor History</p>
          <button
            onClick={() => { setLoading(true); loadVisitors().then(() => setLoading(false)) }}
            className="text-[10px] uppercase tracking-wider text-white/50 hover:text-[#FF5F1F] transition-colors"
          >
            Refresh
          </button>
        </div>
        <div className="max-h-64 overflow-y-auto">
          {loading ? (
            <div className="py-8 text-center text-white/30 text-xs">Loading…</div>
          ) : visitors.length === 0 ? (
            <div className="py-8 text-center text-white/35 text-xs">No visitor logs yet.</div>
          ) : (
            <ul className="divide-y divide-white/5">
              {visitors.map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => openSession(v)}
                    className="w-full text-left px-4 py-3 hover:bg-white/5 transition-colors flex items-center gap-3"
                  >
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: ACCENT, opacity: 0.8 }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-white/80 truncate">
                        {fmtTime(v.created_at)} · {v.page_visited}
                      </p>
                      <p className="text-[10px] text-white/40 truncate mt-0.5">
                        {parseUserAgent(v.user_agent)}
                      </p>
                    </div>
                    <span className="text-[10px] text-white/30">View →</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Section 3: Session X-Ray Modal */}
      {selectedSession && (
        <SessionXRayModal
          sessionId={selectedSession}
          visitor={selectedVisitor}
          onClose={() => { setSelectedSession(null); setSelectedVisitor(null) }}
        />
      )}
    </div>
  )
}
