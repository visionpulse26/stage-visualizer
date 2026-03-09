import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'
import { REALTIME_CHANNEL_NAME } from '../lib/analyticsTracker'

const FONT_FAMILY = "'Chakra Petch', sans-serif"
const ACCENT = '#FF5F1F'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'media', label: 'Media' },
  { id: 'camera', label: 'Camera' },
  { id: 'devices', label: 'Devices' },
]

export default function ClientRadarPanel({ publishedId }) {
  const [collapsed, setCollapsed] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')
  const [onlineCount, setOnlineCount] = useState(0)
  const [stats, setStats] = useState({
    total_views: 0,
    total_screenshots: 0,
    total_camera_changes: 0,
    total_clip_clicks: 0,
    clip_popularity: {},
    camera_popularity: {},
    screenshot_hotspots: {},
    clip_watch_seconds: {},
    session_duration_avg: 0,
    device_os: {},
    form_factor: {},
    screen_resolutions: {},
  })
  const [loading, setLoading] = useState(false)

  const loadStats = useCallback(async () => {
    if (!publishedId) return
    setLoading(true)
    const projectIdStr = String(publishedId)

    const [
      { count: viewCount },
      { count: clipCount },
      { count: screenshotCount },
      { count: cameraCount },
      { data: clipEvents },
      { data: cameraEvents },
      { data: screenshotEvents },
      clipWatchResult,
      sessionsResult,
    ] = await Promise.all([
      supabase.from('client_page_views').select('*', { count: 'exact', head: true }).eq('project_id', projectIdStr),
      supabase.from('client_interactions').select('*', { count: 'exact', head: true }).eq('project_id', projectIdStr).eq('event_type', 'clip_play'),
      supabase.from('client_interactions').select('*', { count: 'exact', head: true }).eq('project_id', projectIdStr).eq('event_type', 'screenshot'),
      supabase.from('client_interactions').select('*', { count: 'exact', head: true }).eq('project_id', projectIdStr).eq('event_type', 'camera_change'),
      supabase.from('client_interactions').select('event_key').eq('project_id', projectIdStr).eq('event_type', 'clip_play'),
      supabase.from('client_interactions').select('event_key').eq('project_id', projectIdStr).eq('event_type', 'camera_change'),
      supabase.from('client_interactions').select('event_key').eq('project_id', projectIdStr).eq('event_type', 'screenshot'),
      supabase.from('client_clip_watch').select('clip_key, watch_seconds').eq('project_id', projectIdStr).then((r) => r),
      supabase.from('client_sessions').select('duration_seconds, device_os, form_factor, screen_width, screen_height').eq('project_id', projectIdStr).then((r) => r),
    ])
    const clipWatchRows = Array.isArray(clipWatchResult?.data) ? clipWatchResult.data : []
    const sessionsRows = Array.isArray(sessionsResult?.data) ? sessionsResult.data : []

    const agg = (rows, keyField = 'event_key', valField) => {
      const out = {}
      ;(rows || []).forEach((row) => {
        const k = row[keyField] || 'Unknown'
        const v = valField ? (row[valField] || 0) : 1
        out[k] = (out[k] || 0) + v
      })
      return out
    }

    const clipWatch = agg(clipWatchRows || [], 'clip_key', 'watch_seconds')
    // Device/screen: from ALL sessions (set at insert)
    const deviceOs = agg(sessionsRows || [], 'device_os')
    const formFactor = agg(sessionsRows || [], 'form_factor')
    const screenRes = {}
    ;(sessionsRows || []).forEach((r) => {
      const w = r.screen_width
      const h = r.screen_height
      if (w && h) {
        const k = `${w}×${h}`
        screenRes[k] = (screenRes[k] || 0) + 1
      }
    })
    // Avg duration: only from sessions that have duration_seconds (PATCH on unload)
    const durations = (sessionsRows || []).map((r) => r.duration_seconds).filter((n) => n != null && n > 0)
    const avgDuration = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0

    setStats((prev) => ({
      ...prev,
      total_views: viewCount ?? 0,
      total_screenshots: screenshotCount ?? 0,
      total_camera_changes: cameraCount ?? 0,
      total_clip_clicks: clipCount ?? 0,
      clip_popularity: agg(clipEvents),
      camera_popularity: agg(cameraEvents),
      screenshot_hotspots: agg(screenshotEvents),
      clip_watch_seconds: clipWatch,
      session_duration_avg: Math.round(avgDuration),
      device_os: deviceOs,
      form_factor: formFactor,
      screen_resolutions: screenRes,
    }))
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
        <span className="text-sm font-bold uppercase tracking-wider -rotate-90 whitespace-nowrap" style={{ color: ACCENT }}>
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
        width: 340,
        maxHeight: 'calc(100vh - 140px)',
        background: 'rgba(10,10,12,0.92)',
        borderColor: `${ACCENT}40`,
        fontFamily: FONT_FAMILY,
      }}
    >
      <div className="flex items-center justify-between px-4 py-2.5 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
        <span className="text-sm font-bold uppercase tracking-widest" style={{ color: ACCENT }}>
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

      {/* Live Pulse — sticky at top */}
      <div className="flex items-center gap-2 px-4 py-3 border-b shrink-0" style={{ borderColor: `${ACCENT}30`, background: 'rgba(0,0,0,0.2)' }}>
        <span
          className="w-2.5 h-2.5 rounded-full animate-pulse flex-shrink-0"
          style={{ background: ACCENT, boxShadow: `0 0 8px ${ACCENT}` }}
        />
        <span className="text-sm font-bold uppercase tracking-wider" style={{ color: ACCENT }}>
          LIVE PULSE: {onlineCount} USER{onlineCount !== 1 ? 'S' : ''} ONLINE
        </span>
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 px-2 py-2 border-b shrink-0" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === t.id
                ? 'text-white'
                : 'text-white/50 hover:text-white/70 hover:bg-white/5'
            }`}
            style={activeTab === t.id ? { background: `${ACCENT}25`, color: ACCENT } : {}}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content — scrollable */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        {publishedId ? (
          loading ? (
            <p className="text-sm text-white/40">Loading…</p>
          ) : (
            <>
              {activeTab === 'overview' && (
                <OverviewTab stats={stats} onRefresh={loadStats} loading={loading} />
              )}
              {activeTab === 'media' && (
                <MediaTab clipPopularity={stats.clip_popularity} clipWatchSeconds={stats.clip_watch_seconds} />
              )}
              {activeTab === 'camera' && (
                <CameraTab cameraPopularity={stats.camera_popularity} screenshotHotspots={stats.screenshot_hotspots} />
              )}
              {activeTab === 'devices' && (
                <DevicesTab deviceOs={stats.device_os} formFactor={stats.form_factor} screenResolutions={stats.screen_resolutions} />
              )}
            </>
          )
        ) : (
          <p className="text-sm text-white/40">Open a project to view stats</p>
        )}
      </div>
    </div>
  )
}

function OverviewTab({ stats, onRefresh, loading }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wider text-white/50">Aggregate Metrics</p>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="text-xs uppercase tracking-wider hover:opacity-80 disabled:opacity-50 transition-opacity"
          style={{ color: ACCENT }}
        >
          Refresh
        </button>
      </div>
      <p className="text-xs text-white/35 leading-relaxed">
        Plays, screenshots, and camera changes update here. Click <strong>Refresh</strong> after activity.
      </p>
      <div className="space-y-3">
        <MetricRow icon="👁️" label="Total Views" value={stats.total_views} />
        <MetricRow icon="⏱️" label="Avg Session (sec)" value={stats.session_duration_avg || '—'} />
        <MetricRow icon="📸" label="Screenshots Taken" value={stats.total_screenshots} />
        <MetricRow icon="🎥" label="Camera Angles Explored" value={stats.total_camera_changes} />
        <MetricRow icon="🎬" label="Media Clips Played" value={stats.total_clip_clicks} />
      </div>
    </div>
  )
}

function MediaTab({ clipPopularity, clipWatchSeconds }) {
  const plays = topEntries(clipPopularity, 5)
  const watch = topEntries(clipWatchSeconds, 5)
  const maxPlay = Math.max(...plays.map((p) => p.value), 1)
  const maxWatch = Math.max(...watch.map((w) => w.value), 1)
  const hasData = plays.length > 0 || watch.length > 0

  return (
    <div className="space-y-5">
      <SectionTitle>Top Clips (Plays)</SectionTitle>
      {plays.length === 0 ? (
        <p className="text-sm text-white/35 italic">No clip plays yet</p>
      ) : (
        <div className="space-y-3">
          {plays.map(({ key, value }) => (
            <BarRow key={key} label={key} value={value} max={maxPlay} />
          ))}
        </div>
      )}
      <SectionTitle>Clip Watch Time (sec)</SectionTitle>
      {watch.length === 0 ? (
        <p className="text-sm text-white/35 italic">No watch time yet</p>
      ) : (
        <div className="space-y-3">
          {watch.map(({ key, value }) => (
            <BarRow key={key} label={key} value={value} max={maxWatch} />
          ))}
        </div>
      )}
    </div>
  )
}

function CameraTab({ cameraPopularity, screenshotHotspots }) {
  const cameras = topEntries(cameraPopularity, 5)
  const hotspots = topEntries(screenshotHotspots, 5)
  const maxCam = Math.max(...cameras.map((c) => c.value), 1)
  const maxHot = Math.max(...hotspots.map((h) => h.value), 1)

  return (
    <div className="space-y-5">
      <SectionTitle>Top Camera Angles</SectionTitle>
      {cameras.length === 0 ? (
        <p className="text-sm text-white/35 italic">No camera changes yet</p>
      ) : (
        <div className="space-y-3">
          {cameras.map(({ key, value }) => (
            <BarRow key={key} label={key} value={value} max={maxCam} />
          ))}
        </div>
      )}
      <SectionTitle>Screenshot Hotspots</SectionTitle>
      {hotspots.length === 0 ? (
        <p className="text-sm text-white/35 italic">No screenshots yet</p>
      ) : (
        <div className="space-y-3">
          {hotspots.map(({ key, value }) => (
            <BarRow key={key} label={key} value={value} max={maxHot} />
          ))}
        </div>
      )}
    </div>
  )
}

function DevicesTab({ deviceOs, formFactor, screenResolutions }) {
  const os = topEntries(deviceOs, 5)
  const ff = topEntries(formFactor, 3)
  const res = topEntries(screenResolutions, 5)
  const maxOs = Math.max(...os.map((o) => o.value), 1)
  const maxFf = Math.max(...ff.map((f) => f.value), 1)
  const maxRes = Math.max(...res.map((r) => r.value), 1)

  return (
    <div className="space-y-5">
      <SectionTitle>Device OS</SectionTitle>
      {os.length === 0 ? (
        <p className="text-sm text-white/35 italic">No device data yet</p>
      ) : (
        <div className="space-y-3">
          {os.map(({ key, value }) => (
            <BarRow key={key} label={key} value={value} max={maxOs} />
          ))}
        </div>
      )}
      <SectionTitle>Form Factor</SectionTitle>
      {ff.length === 0 ? (
        <p className="text-sm text-white/35 italic">No data yet</p>
      ) : (
        <div className="space-y-3">
          {ff.map(({ key, value }) => (
            <BarRow key={key} label={key} value={value} max={maxFf} />
          ))}
        </div>
      )}
      <SectionTitle>Screen Sizes</SectionTitle>
      {res.length === 0 ? (
        <p className="text-sm text-white/35 italic">No screen data yet</p>
      ) : (
        <div className="space-y-3">
          {res.map(({ key, value }) => (
            <BarRow key={key} label={key} value={value} max={maxRes} />
          ))}
        </div>
      )}
    </div>
  )
}

function SectionTitle({ children }) {
  return <p className="text-xs font-semibold uppercase tracking-wider text-white/50">{children}</p>
}

function MetricRow({ icon, label, value }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-white/80">
        <span className="mr-2">{icon}</span>
        {label}
      </span>
      <span className="text-base font-semibold" style={{ color: ACCENT }}>{value}</span>
    </div>
  )
}

function BarRow({ label, value, max }) {
  const pct = max > 0 ? (value / max) * 100 : 0
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-sm text-white/80 truncate max-w-[180px]" title={label}>{label}</span>
        <span className="text-sm font-semibold shrink-0 ml-2" style={{ color: ACCENT }}>{value}</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${pct}%`, background: ACCENT }}
        />
      </div>
    </div>
  )
}

function topEntries(obj, limit = 5) {
  if (!obj || typeof obj !== 'object') return []
  return Object.entries(obj)
    .map(([k, v]) => ({ key: k, value: typeof v === 'number' ? v : parseInt(v, 10) || 0 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit)
}
