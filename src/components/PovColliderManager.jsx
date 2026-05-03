import { useState, useMemo, useCallback } from 'react'

// Role definitions
const ROLES = ['auto', 'floor', 'blocker', 'ignore']

const ROLE_PILL = {
  floor:   'bg-emerald-500/15 border-emerald-500/30 text-emerald-400',
  blocker: 'bg-amber-500/15  border-amber-500/30  text-amber-400',
  ignore:  'bg-white/5        border-white/10       text-white/25',
  auto:    'bg-blue-500/10   border-blue-500/20   text-blue-400',
}

const ROLE_ACTIVE = {
  floor:   'bg-emerald-500/20 border-emerald-500/50 text-emerald-300',
  blocker: 'bg-amber-500/20  border-amber-500/50  text-amber-300',
  ignore:  'bg-white/10       border-white/20       text-white/50',
  auto:    'bg-blue-500/15   border-blue-500/40   text-blue-300',
}

/**
 * PovColliderManager
 *
 * Admin panel that lists all meshes from `meshMetadata` and lets the user
 * override the auto-suggested collider role per mesh.
 *
 * Props:
 *   meshMetadata        - MeshMeta[]  (from scanStageMeshes)
 *   povColliderConfig   - { overrides: { [id]: 'floor'|'blocker'|'ignore'|'auto' } }
 *   onConfigChange      - (newConfig) => void
 */
export function PovColliderManager({ meshMetadata = [], povColliderConfig = {}, onConfigChange }) {
  const [search, setSearch]     = useState('')
  const [filterRole, setFilter] = useState('all')

  const overrides = povColliderConfig?.overrides ?? {}

  // Effective role for a meta entry (taking override into account)
  const effectiveRole = useCallback(
    (meta) => {
      const ov = overrides[meta.id]
      return ov === undefined || ov === 'auto' ? meta.suggestedRole : ov
    },
    [overrides],
  )

  // Counts
  const counts = useMemo(() => {
    const c = { floor: 0, blocker: 0, ignore: 0 }
    meshMetadata.forEach((m) => {
      const r = effectiveRole(m)
      if (r in c) c[r]++
    })
    return c
  }, [meshMetadata, effectiveRole])

  // Filtered list
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return meshMetadata.filter((m) => {
      if (q && !m.name.toLowerCase().includes(q)) return false
      if (filterRole !== 'all' && effectiveRole(m) !== filterRole) return false
      return true
    })
  }, [meshMetadata, search, filterRole, effectiveRole])

  const setOverride = useCallback(
    (id, role) => {
      const next = { ...overrides }
      if (role === 'auto') {
        delete next[id]
      } else {
        next[id] = role
      }
      onConfigChange?.({ ...povColliderConfig, overrides: next })
    },
    [overrides, povColliderConfig, onConfigChange],
  )

  if (meshMetadata.length === 0) {
    return (
      <p className="text-[10px] text-white/25 py-2 leading-snug">
        Load a model first — meshes will appear here for collider assignment.
      </p>
    )
  }

  return (
    <div className="space-y-2.5">

      {/* ── Summary counts ─── */}
      <div className="flex gap-1.5 flex-wrap">
        <span className={`text-[9px] px-1.5 py-0.5 rounded border ${ROLE_PILL.floor}`}>
          {counts.floor} floor
        </span>
        <span className={`text-[9px] px-1.5 py-0.5 rounded border ${ROLE_PILL.blocker}`}>
          {counts.blocker} blocker
        </span>
        <span className={`text-[9px] px-1.5 py-0.5 rounded border ${ROLE_PILL.ignore}`}>
          {counts.ignore} ignore
        </span>
        <span className="ml-auto text-[9px] text-white/20">
          {meshMetadata.length} total
        </span>
      </div>

      {/* ── Search ─── */}
      <input
        type="text"
        placeholder="Search mesh name…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[11px] text-white/70 placeholder-white/20 focus:outline-none focus:border-violet-500/40"
      />

      {/* ── Filter tabs ─── */}
      <div className="flex gap-1">
        {['all', 'floor', 'blocker', 'ignore'].map((r) => (
          <button
            key={r}
            onClick={() => setFilter(r)}
            className={`flex-1 py-0.5 text-[8px] rounded-md uppercase tracking-wider transition-all ${
              filterRole === r
                ? 'bg-white/15 text-white/80'
                : 'text-white/25 hover:text-white/50'
            }`}
          >
            {r}
          </button>
        ))}
      </div>

      {/* ── Mesh list ─── */}
      <div className="max-h-72 overflow-y-auto space-y-px">
        {filtered.length === 0 && (
          <p className="text-[10px] text-white/20 py-3 text-center">No meshes match.</p>
        )}
        {filtered.map((meta) => {
          const ov   = overrides[meta.id]          // undefined | 'auto' | role
          const eff  = effectiveRole(meta)          // what actually happens
          const auto = ov === undefined || ov === 'auto'

          return (
            <div
              key={meta.id}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] transition-colors"
            >
              {/* Mesh info */}
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-white/60 truncate leading-tight">
                  {meta.name || <span className="italic text-white/20">unnamed</span>}
                </p>
                <p className="text-[8px] text-white/20 font-mono leading-tight">
                  {meta.size.x.toFixed(1)}×{meta.size.y.toFixed(1)}×{meta.size.z.toFixed(1)}m
                  {!meta.visible && ' · hidden'}
                </p>
              </div>

              {/* Role buttons: A F B I */}
              <div className="flex gap-px flex-shrink-0">
                {ROLES.map((role) => {
                  // Determine if this button is the currently active selection
                  const isActive = role === 'auto' ? auto : ov === role
                  // Display pill colour based on the EFFECTIVE role for 'auto' button
                  const pillKey  = role === 'auto' ? eff : role
                  return (
                    <button
                      key={role}
                      title={role}
                      onClick={() => setOverride(meta.id, role)}
                      className={`w-5 h-5 flex items-center justify-center text-[8px] rounded border transition-all ${
                        isActive
                          ? ROLE_ACTIVE[pillKey]
                          : 'border-transparent text-white/20 hover:border-white/15 hover:text-white/40'
                      }`}
                    >
                      {role === 'auto' ? 'A' : role[0].toUpperCase()}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      <p className="text-[9px] text-white/20 leading-snug">
        A=Auto (uses suggestion) · F=Floor · B=Blocker · I=Ignore<br />
        Changes apply on next POV entry. Save with Publish.
      </p>
    </div>
  )
}
