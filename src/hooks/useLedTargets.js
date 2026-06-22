import { useMemo } from 'react'
import { discoverLedSurfaces, resolveLedTargets } from '../utils/ledMaterialTargets'

/**
 * Resolve the LED maps ("mapled") of the currently-loaded stage.
 *
 * Bridges the GLB mesh scan with the admin's role assignment (`ledTargetMap`,
 * persisted in `scene_config`) into:
 *   • `surfaces` — every distinct LED candidate surface, for the selector UI
 *   • `targets`  — the canonical logical targets (roles) the editor uploads
 *                  against and the client plays back (sorted by order)
 *   • `isMultiMapled` — convenience: more than one logical target
 *
 * Zero-config behaviour: a convention-named GLB (LED_MAPLED_MAIN / _SIDE)
 * resolves straight to its targets with no `ledTargetMap` needed. A legacy
 * single-LED stage collapses to one `master` target (full back-compat).
 *
 * @param {Array<{ name?: string, materialNames?: string[] }>} meshScan
 * @param {Object<string, { targetId?: string, label?: string, order?: number }>} ledTargetMap
 */
export default function useLedTargets(meshScan, ledTargetMap) {
  const surfaces = useMemo(() => discoverLedSurfaces(meshScan || []), [meshScan])

  const targets = useMemo(
    () => resolveLedTargets(meshScan || [], ledTargetMap || {}),
    [meshScan, ledTargetMap],
  )

  return useMemo(
    () => ({
      surfaces,
      targets,
      isMultiMapled: targets.length > 1,
      hasUnassignedHeuristic: surfaces.some((s) => s.matchKind === 'heuristic'),
    }),
    [surfaces, targets],
  )
}
