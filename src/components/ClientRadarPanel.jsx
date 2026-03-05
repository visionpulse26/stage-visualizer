import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'
import { REALTIME_CHANNEL_NAME } from '../lib/analyticsTracker'

const FONT_FAMILY = "'Chakra Petch', sans-serif"
const ACCENT = '#FF5F1F'

export default function ClientRadarPanel({ publishedId }) {
  const [collapsed, setCollapsed] = useState(false)
  const [onlineCount, setOnlineCount] = useState(0)
  const [stats, setStats] = useState({
    total_views: 0,
    total_screenshots: 0,
    total_camera_changes: 0,
    total_clip_clicks: 0,
  })
  const [loading, setLoading] = useState(false)

  const loadStats = useCallback(async () => {
    if (!publishedId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('projects')
      .select('total_views, total_screenshots, total_camera_changes, total_clip_clicks')
      .eq('id', publishedId)
      .single()
    if (!error && data) {
      setStats({
        total_views: data.total_views ?? 0,
        total_screenshots: data.total_screenshots ?? 0,
        total_camera_changes: data.total_camera_changes ?? 0,
        total_clip_clicks: data.total_clip_clicks ?? 0,
      })
    }
    setLoading(false)
  }, [publishedId])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  useEffect(() => {
    const channel = supabase.channel(REALTIME_CHANNEL_NAME)
    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState()
        const keys = new Set()
        Object.values(state || {}).forEach((presences) => {
          (presences || []).forEach((p) => {
            if (p.session_id) keys.add(p.session_id)
          })
        })
        setOnlineCount(keys.size)
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="fixed z-50 flex items-center justify-center w-10 h-24 rounded-l-xl border-l border-t border-b transition-all hover:opacity-90"
        style={{
          right: 0,
          top: '140px',
          background: 'rgba(10,10,12,0.92)',
          borderColor: `${ACCENT}40`,
          fontFamily: FONT_FAMILY,
        }}
        title="Expand Client Radar"
      >
        <span className="text-[10px] font-bold uppercase tracking-wider -rotate-90 whitespace-nowrap" style={{ color: ACCENT }}>
          Radar
        </span>
      </button>
    )
  }

  return (
    <div
      className="fixed z-50 flex flex-col rounded-xl overflow-hidden border shadow-2xl"
      style={{
        right: 20,
        top: 100,
        width: 300,
        background: 'rgba(10,10,12,0.92)',
        borderColor: `${ACCENT}40`,
        fontFamily: FONT_FAMILY,
      }}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: ACCENT }}>
          Client Radar & Logs
        </span>
        <button
          onClick={() => setCollapsed(true)}
          className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white/70 transition-all"
          title="Minimize"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      <div className="p-3 space-y-3">
        {/* Live Pulse */}
        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full animate-pulse flex-shrink-0"
            style={{ background: ACCENT, boxShadow: `0 0 6px ${ACCENT}` }}
          />
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: ACCENT }}>
            LIVE PULSE: {onlineCount} USER{onlineCount !== 1 ? 'S' : ''} ONLINE
          </span>
        </div>

        <div className="h-px" style={{ background: `${ACCENT}30` }} />

        {/* Aggregate Metrics */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[9px] uppercase tracking-widest text-white/40">Aggregate Metrics</p>
            {publishedId && (
              <button
                onClick={loadStats}
                disabled={loading}
                className="text-[9px] uppercase tracking-wider hover:opacity-80 disabled:opacity-50 transition-opacity"
                style={{ color: ACCENT }}
              >
                Refresh
              </button>
            )}
          </div>
          {publishedId ? (
            loading ? (
              <p className="text-[10px] text-white/35">Loading…</p>
            ) : (
              <div className="space-y-1.5 text-[11px]">
                <MetricRow icon="👁️" label="Total Views" value={stats.total_views} />
                <MetricRow icon="📸" label="Screenshots Taken" value={stats.total_screenshots} />
                <MetricRow icon="🎥" label="Camera Angles Explored" value={stats.total_camera_changes} />
                <MetricRow icon="🎬" label="Media Clips Played" value={stats.total_clip_clicks} />
              </div>
            )
          ) : (
            <p className="text-[10px] text-white/35">Open a project to view stats</p>
          )}
        </div>
      </div>
    </div>
  )
}

function MetricRow({ icon, label, value }) {
  const ACCENT = '#FF5F1F'
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-white/70">
        <span className="mr-1.5">{icon}</span>
        {label}
      </span>
      <span className="font-semibold" style={{ color: ACCENT }}>{value}</span>
    </div>
  )
}
