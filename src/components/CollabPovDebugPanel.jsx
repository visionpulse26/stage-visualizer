export default function CollabPovDebugPanel({
  visible,
  povMode,
  povStatus,
  povEvents = [],
  modelUrl,
  modelMetrics,
  meshCount,
  colliderCount,
  povHeightOffset,
  pointerLocked,
  sceneReady,
  onClear,
}) {
  if (!visible) return null

  const metrics = modelMetrics
    ? {
        radius: Number(modelMetrics.radius || 0).toFixed(2),
        size: [
          Number(modelMetrics.size?.x || 0).toFixed(2),
          Number(modelMetrics.size?.y || 0).toFixed(2),
          Number(modelMetrics.size?.z || 0).toFixed(2),
        ].join(' x '),
        center: [
          Number(modelMetrics.center?.x || 0).toFixed(2),
          Number(modelMetrics.center?.y || 0).toFixed(2),
          Number(modelMetrics.center?.z || 0).toFixed(2),
        ].join(', '),
      }
    : null

  return (
    <div
      className="fixed left-4 bottom-4 z-[7000] w-[min(92vw,440px)] rounded-xl border border-cyan-400/25 bg-black/85 p-3 text-[11px] text-cyan-50/80 shadow-2xl backdrop-blur-md"
      style={{ fontFamily: "'Chakra Petch', monospace" }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="font-bold uppercase tracking-widest text-cyan-200">
          POV Debug
        </div>
        <button
          type="button"
          onClick={onClear}
          className="rounded border border-white/10 px-2 py-1 text-[10px] uppercase text-white/55 hover:border-cyan-400/45 hover:text-cyan-100"
        >
          Clear
        </button>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1 border-b border-white/10 pb-2">
        <span className="text-white/35">status</span><span>{povStatus || 'idle'}</span>
        <span className="text-white/35">povMode</span><span>{String(!!povMode)}</span>
        <span className="text-white/35">pointerLock</span><span>{String(!!pointerLocked)}</span>
        <span className="text-white/35">sceneReady</span><span>{String(!!sceneReady)}</span>
        <span className="text-white/35">rig</span><span>simple-collab</span>
        <span className="text-white/35">height</span><span>{Number(povHeightOffset || 0).toFixed(2)}</span>
        <span className="text-white/35">meshes</span><span>{meshCount ?? 0}</span>
        <span className="text-white/35">colliders</span><span>{colliderCount ?? 0}</span>
        <span className="text-white/35">model</span><span className="truncate">{modelUrl ? 'loaded' : 'missing'}</span>
        {metrics && (
          <>
            <span className="text-white/35">size</span><span>{metrics.size}</span>
            <span className="text-white/35">center</span><span>{metrics.center}</span>
            <span className="text-white/35">radius</span><span>{metrics.radius}</span>
          </>
        )}
      </div>

      <div className="mt-2 max-h-48 overflow-y-auto pr-1">
        {povEvents.length === 0 ? (
          <div className="text-white/35">No POV events yet.</div>
        ) : (
          povEvents.slice(-12).map((event, index) => (
            <div key={`${event.t}-${index}`} className="mb-1 border-b border-white/5 pb-1">
              <div className="text-cyan-200/80">{event.t} · {event.type}</div>
              {event.message && <div className="break-words text-white/65">{event.message}</div>}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
