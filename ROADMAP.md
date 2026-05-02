# Stage Visualizer — Feature Roadmap
## Epic 1: Immersive Audience POV · Epic 2: Headless Embed Widget

> **Codebase baseline** (as of Phase 3 audit): Vite + React 18 + R3F 8 + Three.js r165 +
> `@react-three/drei` · Supabase auth/DB/realtime · Cloudflare R2 · Vercel serverless.
> Current routes: `/admin` · `/collab/:projectId` · `/view/:projectId` · `/embed/:projectId` (new).
> Camera: `CameraControls` (drei) + `CameraSmoothFlyController` (custom useFrame lerp).

---

## EPIC 1 — Immersive Audience POV (First-Person Kinematic Controller)

### Product scope (locked)

**Epic 1 ships only on `AdminPage` (`/admin`) and `CollabPage` (`/collab/:projectId`).**

The public presentation route **`ClientPage` (`/view/:projectId`)** stays **orbit-only**: `CameraControls` + presets + autoplay — **no POV toggle**, no pointer lock, no FPS rig, and the client bundle does not hydrate `pov_height_offset` for POV (admins still tune height in Admin; it persists on `projects` for Collab preview).

Rationale: POV needs calibration, pointer lock, and staging review — operator-facing surfaces — not the anonymous share link.

### Architecture Overview

```
AdminPage / CollabPage
  └─ <StageCanvas>
       ├─ <CameraControls ref={cameraControlsRef} />   ← ORBIT MODE (default)
       ├─ <CameraAutoFrame />                           ← auto-fit on model load
       ├─ <CameraSmoothFlyController />                 ← preset lerp
       └─ <PovFpsRig />        ← mounted only when povMode === true
            ├─ @react-three/rapier (floor + boundary walls + kinematic capsule)
            ├─ PointerLock API
            └─ WASD movement (hook drives capsule; camera follows after step)
```

```
ClientPage  (/view)
  └─ <StageCanvas>   ← same scene stack, povMode always false (no PovFpsRig)
```

State lifted to page level (**`AdminPage` / `CollabPage` only**):
- `povMode: boolean` — gate for mounting `PovFpsRig`, pausing auto-frame / fly
- `povHeightOffset: number` — eye height (default `1.7`, published on `projects`)
- `modelMetrics` / geofence — derived inside `StageCanvas` from `onModelMetrics` (Scene)

---

### Phase 1 — Foundation: Toggle & Camera Transition (no FPS yet)

**Goal:** Smooth lerp from current orbit camera position → ground-level eye height.  
No new dependencies. Pure CameraControls API.

#### 1.1 — DB schema change

Add `pov_height_offset FLOAT DEFAULT 1.7` to the `projects` / `rounds` table:

```sql
ALTER TABLE rounds
  ADD COLUMN pov_height_offset FLOAT NOT NULL DEFAULT 1.7;
```

Update the Supabase `publish` payload in `AdminPage` to write this field.  
`CollabPage` hydrates `pov_height_offset` for the shared review session. **`ClientPage` does not read it** (Epic 1 not exposed on `/view`).

#### 1.2 — Admin calibration slider

In `UIPanel.jsx`, add under Scene Config:

```jsx
// pov_height_offset slider  (0.5 m → 2.5 m)
<input
  type="range" min={0.5} max={2.5} step={0.05}
  value={povHeightOffset}
  onChange={e => setPovHeightOffset(Number(e.target.value))}
/>
<span>{povHeightOffset.toFixed(2)} m</span>
```

The value is passed to `StageCanvas` → stored in a `povHeightOffsetRef` so
`FpsController` always reads the current value without a re-render.

#### 1.3 — Toggle button

- **`CollabPanel.jsx`** — “Audience POV” / exit (non-touch devices).
- **`AdminPage`** — toolbar “Audience POV” next to the stage (same behavior).

Do **not** add this control to `ClientPanel` / `/view`.

#### 1.4 — Smooth entry transition

When `povMode` flips `false → true`, fire a single `CameraControls.setLookAt()`
animation **before** `FpsController` mounts, so the user sees a cinematic drop
from wherever the orbit camera was to eye level.

```js
// utils/enterPovMode.js
export async function enterPovMode(controls, modelMetrics, povHeightOffset) {
  if (!controls || !modelMetrics) return
  const { center } = modelMetrics
  const eyeY = povHeightOffset          // e.g. 1.7 m above floor
  const startX = center.x              // start at model center
  const startZ = center.z + modelMetrics.radius * 0.6 // slightly in front
  await controls.setLookAt(
    startX, eyeY, startZ,             // camera position
    center.x, eyeY, center.z,         // look-at target
    true                              // animate
  )
}
```

Call this with `await` before setting `povMode = true`. After the lerp resolves,
mount `<FpsController>` and call `controls.disconnect()` (disables orbit drag).

On exit: call `controls.connect()`, then `controls.reset()` or restore the last
saved orbit state from a `savedOrbitRef`.

---

### Phase 2 — FPS Controller (PointerLock + WASD + Mouse Look)

**New dependency:** none (use native PointerLock API + R3F `useFrame`).

#### 2.1 — `usePovController.js` hook

```js
// src/hooks/usePovController.js
import { useEffect, useRef, useCallback } from 'react'
import * as THREE from 'three'

export function usePovController({
  enabled,
  camera,
  gl,           // WebGLRenderer — needed for canvas.requestPointerLock()
  floorY,       // computed: modelMetrics.center.y + povHeightOffset
  geofence,     // THREE.Box3 | null — movement AABB
  moveSpeed = 5,
  lookSensitivity = 0.002,
  onExit,       // called when Escape released PointerLock
}) {
  const keysRef   = useRef({})      // { w, a, s, d, q, e }
  const yawRef    = useRef(0)       // horizontal angle (radians)
  const pitchRef  = useRef(0)       // vertical angle  (clamped ±80°)
  const velRef    = useRef(new THREE.Vector3())

  // ── PointerLock request ────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return
    gl.domElement.requestPointerLock()
  }, [enabled, gl])

  // ── PointerLock release (Escape) → exit POV ────────────────────────────
  useEffect(() => {
    const onPLChange = () => {
      if (!document.pointerLockElement) onExit?.()
    }
    document.addEventListener('pointerlockchange', onPLChange)
    return () => document.removeEventListener('pointerlockchange', onPLChange)
  }, [onExit])

  // ── Mouse look ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return
    const onMouseMove = (e) => {
      if (document.pointerLockElement !== gl.domElement) return
      yawRef.current   -= e.movementX * lookSensitivity
      pitchRef.current -= e.movementY * lookSensitivity
      pitchRef.current  = Math.max(-1.39, Math.min(1.39, pitchRef.current)) // ±80°
    }
    document.addEventListener('mousemove', onMouseMove)
    return () => document.removeEventListener('mousemove', onMouseMove)
  }, [enabled, gl, lookSensitivity])

  // ── WASD keydown/up ────────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return
    const down = (e) => { keysRef.current[e.code] = true }
    const up   = (e) => { keysRef.current[e.code] = false }
    document.addEventListener('keydown', down)
    document.addEventListener('keyup',   up)
    return () => {
      document.removeEventListener('keydown', down)
      document.removeEventListener('keyup',   up)
    }
  }, [enabled])

  // ── Per-frame movement tick (called from Scene or StageCanvas useFrame) ─
  // Returns a tick function — caller invokes it inside useFrame(tick, delta)
  const tick = useCallback((delta) => {
    if (!enabled || !camera) return

    // 1. Build orientation quaternion from yaw + pitch
    const euler = new THREE.Euler(pitchRef.current, yawRef.current, 0, 'YXZ')
    camera.quaternion.setFromEuler(euler)

    // 2. Derive movement direction (forward = -Z in camera space)
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion)
    forward.y = 0; forward.normalize()
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion)
    right.y = 0; right.normalize()

    const keys = keysRef.current
    const dir  = new THREE.Vector3()
    if (keys['KeyW'] || keys['ArrowUp'])    dir.addScaledVector(forward,  1)
    if (keys['KeyS'] || keys['ArrowDown'])  dir.addScaledVector(forward, -1)
    if (keys['KeyA'] || keys['ArrowLeft'])  dir.addScaledVector(right,   -1)
    if (keys['KeyD'] || keys['ArrowRight']) dir.addScaledVector(right,    1)

    if (dir.lengthSq() > 0) dir.normalize()

    // 3. Apply velocity with simple friction
    velRef.current.addScaledVector(dir, moveSpeed * delta)
    velRef.current.multiplyScalar(0.85)

    camera.position.addScaledVector(velRef.current, delta)

    // 4. Floor clamp — never go below eye level
    camera.position.y = floorY

    // 5. Geofence AABB clamp
    if (geofence) {
      camera.position.x = Math.max(geofence.min.x, Math.min(geofence.max.x, camera.position.x))
      camera.position.z = Math.max(geofence.min.z, Math.min(geofence.max.z, camera.position.z))
    }
  }, [enabled, camera, floorY, geofence, moveSpeed])

  return { tick }
}
```

#### 2.2 — Wire tick into StageCanvas

Add `<FpsTicker>` as an R3F component (has access to `useFrame`):

```jsx
function FpsTicker({ tick }) {
  useFrame((_, delta) => tick(delta))
  return null
}

// In StageCanvas JSX:
{povMode && <FpsTicker tick={fpsTick} />}
```

`PovFpsRig` + `usePovController` run inside `StageCanvas` when `povMode` is true (wired from **Admin / Collab** only).

#### 2.3 — Mobile: disable POV or virtual joystick

Recommendation: **disable the toggle on mobile** for V1 (the PointerLock API
requires user gesture + is unavailable in iOS Safari / some Android browsers).
Detect via:

```js
const isTouchDevice = () => window.matchMedia('(pointer: coarse)').matches
```

Hide the "Audience POV" button when `isTouchDevice()` is true.

For V2 (future), use `nipplejs` or a custom touch-joystick component:
- Left joystick: WASD movement
- Right swipe area: mouse-look (no PointerLock needed, use `touchmove.movementX`)

---

### Phase 3 — Collision Detection & Geofencing

**Shipped (Phase 3a — 2026-05):** `@react-three/rapier@1.3.1` (R3F 8–compatible) mounts only while POV is active (`PovFpsRig`): zero-gravity world, large fixed floor, four fixed **CuboidCollider** walls aligned to the same expanded XZ bounds as the old software clamp, and a **`kinematicPosition` capsule** whose translation is driven each physics step by `usePovController` then copied back to the default camera. Per-mesh Rapier colliders and NavMesh remain future work.

Two strategies — pick based on model complexity (longer-term):

#### Option A: Lightweight Rapier physics (recommended for production)

```
npm install @react-three/rapier
```

**Approach:**  
Do NOT feed raw GLB meshes to Rapier — this tanks FPS for dense models.  
Instead, generate **simplified invisible colliders** at runtime from the model AABB:

```jsx
// In ModelContent (Scene.jsx), after model loads:
import { RigidBody, CuboidCollider } from '@react-three/rapier'

// Per mesh: compute its AABB and create a single CuboidCollider
clonedScene.traverse(child => {
  if (!child.isMesh || child.name.startsWith('LED')) return
  const box = new THREE.Box3().setFromObject(child)
  const size   = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  // Emit { center, halfExtents } to parent for Rapier collider placement
})
```

The FPS camera becomes a Rapier `KinematicPositionBased` RigidBody (capsule
collider, r=0.3, h=1.0). Movement is applied via `rigidBody.setNextKinematicTranslation()`.

Floor is a single `CuboidCollider` at `y = 0`, half-extents `[500, 0.05, 500]`.

**Key advantage:** Rapier handles floor clamp, wall collision, and geofencing
automatically from the physics step. No manual AABB math.

#### Option B: NavMesh via `recast-navigation-js` (deterministic, no physics step overhead)

```
npm install @recast-navigation/three @recast-navigation/generators
```

**Approach:**  
1. After GLB loads, collect all non-LED `BufferGeometry` meshes.
2. Call `generateTiledNavMesh(meshes, config)` in a Web Worker (offload baking).
3. NavMesh gives you a `crowdAgent` that can query walkable positions.

```js
// worker: navmesh-bake.worker.js
import { init, generateSoloNavMesh } from '@recast-navigation/generators'
self.onmessage = async ({ data: { positions, indices } }) => {
  await init()
  const { navMesh } = generateSoloNavMesh(positions, indices, {
    cs: 0.2, ch: 0.1,
    walkableSlopeAngle: 30,
    walkableHeight: 2,
    walkableClimb: 0.4,
    walkableRadius: 0.3,
  })
  self.postMessage({ navMesh: navMesh.serialize() })
}
```

4. At runtime: use `navMesh.findNearestPoint()` to clamp every WASD step to
   the nearest walkable surface, replacing the manual `position.y = floorY` clamp.

**Recommendation:** Use **Option A (Rapier)** for this project. The stage models
are architectural, not open-world terrain — simple box colliders around trusses
and LED walls are sufficient and cost near-zero CPU.

#### 3.1 — Geofence AABB

Derive automatically from the model AABB emitted by `onModelMetrics` (already
wired into `StageCanvas` via the linter-added `CameraAutoFrame`):

```js
const geofence = useMemo(() => {
  if (!modelMetrics) return null
  const { center, size } = modelMetrics
  const pad = 2 // allow 2m outside model extents
  const box = new THREE.Box3(
    new THREE.Vector3(center.x - size.x / 2 - pad, -Infinity, center.z - size.z / 2 - pad),
    new THREE.Vector3(center.x + size.x / 2 + pad,  Infinity, center.z + size.z / 2 + pad),
  )
  return box
}, [modelMetrics])
```

---

### Phase 4 — HUD Lockout & Headless Hotkeys

#### 4.1 — Aggressive HUD unmounting

When `povMode === true` (Admin / Collab):
- Unmount heavy chrome (`<UIPanel>` / `<CollabPanel>` overlays as applicable) to
  free JS event listeners and reduce repaint surface — **not applicable on `/view`** (no POV there).
- Keep a minimal overlay:

```jsx
{povMode && (
  <div className="absolute inset-0 pointer-events-none z-[9999]">
    {/* Crosshair */}
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="w-4 h-4 border border-white/40 rounded-full" />
    </div>
    {/* Exit hint */}
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/40 text-xs tracking-widest">
      ESC to exit
    </div>
    {/* Headless media controls */}
    <div className="absolute top-4 right-4 text-white/30 text-xs">
      Q / E — prev / next visual
    </div>
    {/* Screenshot still works via hotkey */}
    <button
      className="absolute top-4 left-4 pointer-events-auto ..."
      onClick={handleScreenshot}
    >
      📷
    </button>
  </div>
)}
```

#### 4.2 — Headless media hotkey system

Add a global `keydown` listener that is active **only while `povMode === true`**:

```js
// src/hooks/useHeadlessHotkeys.js
export function useHeadlessHotkeys({ enabled, playlist, activeVideoId, onSelectVideo }) {
  useEffect(() => {
    if (!enabled || !playlist.length) return
    const handler = (e) => {
      const idx = playlist.findIndex(v => v.id === activeVideoId)
      if (e.code === 'KeyQ') {
        const prev = playlist[(idx - 1 + playlist.length) % playlist.length]
        onSelectVideo(prev.id)
      }
      if (e.code === 'KeyE') {
        const next = playlist[(idx + 1) % playlist.length]
        onSelectVideo(next.id)
      }
      // Number keys 1-9 → direct index
      const num = parseInt(e.key, 10)
      if (!isNaN(num) && num >= 1 && num <= playlist.length) {
        onSelectVideo(playlist[num - 1].id)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [enabled, playlist, activeVideoId, onSelectVideo])
}
```

Use in **`AdminPage` / `CollabPage`** (when implemented), not on `ClientPage`.
```js
useHeadlessHotkeys({
  enabled: povMode,
  playlist: videoPlaylist,
  activeVideoId,
  onSelectVideo: setActiveVideoId,
})
```

#### 4.3 — Unified ESC exit hook

```js
// In usePovController or page level:
useEffect(() => {
  const onPLChange = () => {
    if (!document.pointerLockElement) exitPovMode()
  }
  document.addEventListener('pointerlockchange', onPLChange)
  return () => document.removeEventListener('pointerlockchange', onPLChange)
}, [exitPovMode])

function exitPovMode() {
  setPovMode(false)
  if (document.pointerLockElement) document.exitPointerLock()
  cameraControlsRef.current?.connect()     // re-enable orbit drag
  // Restore saved orbit state:
  const s = savedOrbitRef.current
  if (s) cameraControlsRef.current?.setLookAt(s.px, s.py, s.pz, s.tx, s.ty, s.tz, true)
}
```

---

## EPIC 2 — Headless Embed Widget (Canva / Notion iFrame)

### Architecture Overview

```
/embed/:projectId
  └─ EmbedPage.jsx          ← new, lazy-loaded chunk
       ├─ EmbedStageCanvas  ← stripped StageCanvas (no admin tools)
       ├─ EmbedHUD          ← Play/Pause + Camera Preset dropdown only
       └─ EmbedDataLayer    ← fetch project from Supabase (public RLS)
```

---

### Phase 5 — Dedicated Route & Bundle Splitting

#### 5.1 — App.jsx route addition

```jsx
// App.jsx — add lazy import
const EmbedPage = lazy(() => import('./pages/EmbedPage'))

// Route:
<Route path="/embed/:projectId" element={
  <Suspense fallback={<div className="bg-black w-full h-screen" />}>
    <EmbedPage />
  </Suspense>
} />
```

`EmbedPage` is **never** referenced from `AdminPage`, `ClientPage`, or
`CollabPage`, so Vite's static analysis will split it into its own chunk
automatically.

#### 5.2 — Vite chunk control (vite.config.js)

```js
// vite.config.js
build: {
  rollupOptions: {
    output: {
      manualChunks(id) {
        if (id.includes('src/pages/EmbedPage')) return 'embed'
        if (id.includes('three/examples'))      return 'three-extras'
        if (id.includes('node_modules/three'))  return 'three'
        if (id.includes('@react-three'))        return 'r3f'
      }
    }
  }
}
```

**What is excluded from the embed chunk:**
- `UIPanel`, `TopBar`, `ProjectsDashboard`, `ClientRadarPanel` — never imported
- `r2Upload`, `screenshotWithWatermark` — never imported
- `supabase` admin operations — embed only calls the public `select` query
- `secureAssetLoader` with blob-URL caching — embed uses direct presigned URLs
  (assets are already streamed by the player, no need to hide them in embed)

**Target embed chunk size:** < 600 KB gzipped (vs ~1.8 MB for admin).

---

### Phase 6 — EmbedPage: Minimalist UI + Restricted Camera

#### 6.1 — `EmbedPage.jsx`

```jsx
import { lazy, Suspense, useState, useRef, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import EmbedStageCanvas from '../components/EmbedStageCanvas'

export default function EmbedPage() {
  const { projectId } = useParams()
  const [project, setProject] = useState(null)
  const [activePresetIdx, setActivePresetIdx] = useState(0)
  const [isPlaying, setIsPlaying] = useState(true)
  const videoRef = useRef(null)
  const cameraControlsRef = useRef(null)

  // Hydrate from Supabase (public RLS select)
  useEffect(() => {
    supabase
      .from('rounds')
      .select('scene_config, camera_presets, video_playlist, stage_url, name')
      .eq('id', projectId)
      .eq('is_published', true)  // never serve unpublished projects
      .single()
      .then(({ data, error }) => {
        if (!error) setProject(data)
      })
  }, [projectId])

  // Apply camera preset when dropdown changes
  useEffect(() => {
    const presets = project?.camera_presets ?? []
    const preset  = presets[activePresetIdx]
    if (!preset || !cameraControlsRef.current) return
    cameraControlsRef.current.setLookAt(
      preset.position.x, preset.position.y, preset.position.z,
      preset.target.x,   preset.target.y,   preset.target.z,
      true
    )
  }, [activePresetIdx, project])

  if (!project) return <div className="bg-black w-full h-screen" />

  const sceneConfig = project.scene_config ?? {}
  const presets     = project.camera_presets ?? []

  return (
    <div className="w-full h-screen relative bg-black overflow-hidden">
      <EmbedStageCanvas
        modelUrl={project.stage_url}
        sceneConfig={sceneConfig}
        videoRef={videoRef}
        isPlaying={isPlaying}
        cameraControlsRef={cameraControlsRef}
      />

      {/* Minimal HUD — bottom bar only */}
      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-4 py-3 bg-black/60 backdrop-blur-sm">
        {/* Play / Pause */}
        <button
          onClick={() => {
            setIsPlaying(v => !v)
            isPlaying ? videoRef.current?.pause() : videoRef.current?.play()
          }}
          className="text-white/80 text-sm hover:text-white"
        >
          {isPlaying ? '⏸ Pause' : '▶ Play'}
        </button>

        {/* Camera preset selector */}
        {presets.length > 1 && (
          <select
            value={activePresetIdx}
            onChange={e => setActivePresetIdx(Number(e.target.value))}
            className="bg-black/40 text-white/80 text-sm rounded px-2 py-1 border border-white/10"
          >
            {presets.map((p, i) => (
              <option key={i} value={i}>{p.name ?? `View ${i + 1}`}</option>
            ))}
          </select>
        )}

        {/* TooAwake branding */}
        <span className="text-white/30 text-xs tracking-widest">
          TOOAWAKE
        </span>
      </div>
    </div>
  )
}
```

#### 6.2 — `EmbedStageCanvas.jsx` — restricted orbit controls

Key difference from `StageCanvas`: `CameraControls` has hard polar/azimuth/distance clamps.

```jsx
import { CameraControls } from '@react-three/drei'

// In EmbedStageCanvas:
<CameraControls
  ref={cameraControlsRef}
  makeDefault
  minPolarAngle={Math.PI / 6}     // 30° — never go below floor level
  maxPolarAngle={Math.PI / 2.2}   // ~82° — never flip to top-down
  minDistance={4}                  // never zoom inside geometry
  maxDistance={35}                 // never zoom so far scene disappears
  minAzimuthAngle={-Math.PI / 3}  // ±60° horizontal range
  maxAzimuthAngle={Math.PI / 3}
  smoothTime={0.6}
  dollySpeed={0.3}
/>
```

Exclude: `CameraSmoothFlyController` (managed by EmbedPage directly via `setLookAt`).  
Exclude: `CameraAutoFrame` (no metrics callback needed, simpler load path).  
Exclude: `EffectComposer` Bloom (expensive, not needed for lightweight embed).  
Include: `ReflectiveFloor`, `ContactShadows`, `AtmosphericDust` for visual quality.

---

### Phase 7 — Security Headers & iFrame Policy

#### 7.1 — `vercel.json` — add embed-specific route headers

```json
{
  "headers": [
    {
      "source": "/embed/:path*",
      "headers": [
        {
          "key": "Content-Security-Policy",
          "value": "frame-ancestors 'self' https://www.canva.com https://canva.com https://www.notion.so https://notion.so https://*.notion.site"
        },
        {
          "key": "X-Frame-Options",
          "value": "ALLOWALL"
        },
        {
          "key": "Cross-Origin-Embedder-Policy",
          "value": "unsafe-none"
        },
        {
          "key": "Cross-Origin-Resource-Policy",
          "value": "cross-origin"
        }
      ]
    },
    {
      "source": "/((?!embed).*)",
      "headers": [
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "Content-Security-Policy",
          "value": "frame-ancestors 'none'"
        }
      ]
    }
  ]
}
```

**Critical:** The existing `X-Frame-Options: DENY` on `vercel.json` must be
**scoped to non-embed routes only** using the negative lookahead pattern above.
The `frame-ancestors` CSP directive takes precedence over `X-Frame-Options`
in modern browsers — but both must be set correctly for IE11 compat.

#### 7.2 — Supabase RLS for embed data

The embed fetches from `rounds` using the anon key. Verify RLS:

```sql
-- Allow public read of published rounds (already exists)
CREATE POLICY "public_read_published"
ON rounds FOR SELECT
USING (is_published = true);

-- Embed must NOT expose: admin_notes, private_config, supabase_uid
-- Use a restricted view instead of direct table select:
CREATE VIEW embed_rounds AS
  SELECT id, name, stage_url, camera_presets, video_playlist, scene_config, pov_height_offset
  FROM rounds
  WHERE is_published = true;

GRANT SELECT ON embed_rounds TO anon;
```

EmbedPage queries `embed_rounds` instead of `rounds` directly.

#### 7.3 — Canva App integration (future V2)

Canva's App SDK (`@canva/app-ui-kit`) allows richer integration than plain iFrame.
For V1, plain `<iframe src="https://stage.tooawake.online/embed/{id}" />` works.

For Canva App SDK (V2): use `postMessage` channel for bidirectional comm:
```js
// Inside EmbedPage, listen for parent commands:
window.addEventListener('message', (e) => {
  if (e.origin !== 'https://www.canva.com') return
  if (e.data.type === 'SET_PRESET') setActivePresetIdx(e.data.index)
  if (e.data.type === 'PLAY')       videoRef.current?.play()
  if (e.data.type === 'PAUSE')      videoRef.current?.pause()
})
```

---

### Phase 8 — Data Hydration & Presigned URL Strategy

#### 8.1 — Model URL strategy for embed

The embed cannot use `fetchAsBlobUrlWithCache` (that hides the URL from DevTools —
unnecessary for embed since the user who embeds is the owner). Instead:

1. Load the GLB directly via `useLoader(GLTFLoader, project.stage_url)` — the
   presigned R2 URL has a TTL (typically 7 days). For embed, use a longer-lived
   URL or a public R2 bucket subdomain if IP protection is not required for
   embedded context.

2. **Option A:** Store a separate `embed_stage_url` column with a public-readable
   R2 URL (no presigning). Only set this when the admin publishes with "Enable Embed".

3. **Option B:** Add an API route `/api/embed-token?projectId=` that returns a
   fresh presigned URL valid 1 hour, called on embed mount. Embed never has
   the R2 access key.

Recommendation: **Option B** — consistent with existing upload security model.

```js
// api/embed-token.js (new Vercel serverless function)
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  const { projectId } = req.query
  if (!projectId) return res.status(400).json({ error: 'Missing projectId' })

  // Verify project is published (no auth required — public check)
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const { data } = await supabase
    .from('rounds').select('stage_r2_key, is_published').eq('id', projectId).single()

  if (!data?.is_published) return res.status(403).json({ error: 'Not published' })

  const client = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId:     process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  })

  const url = await getSignedUrl(client, new GetObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key:    data.stage_r2_key,
  }), { expiresIn: 3600 })

  res.setHeader('Cache-Control', 'no-store')
  res.json({ url })
}
```

EmbedPage calls this on mount before rendering the canvas.

---

## Implementation Phases Summary

| Phase | Epic | Effort | Blocking? | Key files |
|-------|------|--------|-----------|-----------|
| **P1** — DB schema + calibration slider | E1 | 1 day | No | `AdminPage.jsx`, `UIPanel.jsx`, Supabase SQL |
| **P2** — Toggle + camera lerp transition | E1 | 1 day | No | `AdminPage.jsx`, `CollabPage.jsx`, `povCamera.js` |
| **P3** — `usePovController` + `PovFpsRig` | E1 | 2 days | After P2 | `usePovController.js`, `PovFpsRig.jsx`, `StageCanvas.jsx` |
| **P4** — Rapier colliders + geofence | E1 | 2 days | After P3 | `Scene.jsx`, `StageCanvas.jsx` |
| **P5** — HUD lockout + headless hotkeys | E1 | 1 day | After P3 | `AdminPage.jsx`, `CollabPage.jsx`, `useHeadlessHotkeys.js` |
| **P6** — `/embed` route + bundle split | E2 | 1 day | No | `App.jsx`, `EmbedPage.jsx`, `vite.config.js` |
| **P7** — `EmbedStageCanvas` + restricted orbit | E2 | 1 day | After P6 | `EmbedStageCanvas.jsx` |
| **P8** — `vercel.json` header routing | E2 | 0.5 day | After P6 | `vercel.json` |
| **P9** — `/api/embed-token` + Supabase view | E2 | 1 day | After P6 | `api/embed-token.js`, Supabase SQL |

**Total estimate:** Epic 1 ≈ 7 dev-days · Epic 2 ≈ 3.5 dev-days

---

## Dependency Matrix

```
Epic 1:  P1 → P2 → P3 ──→ P4
                    └──→ P5

Epic 2:  P6 → P7
         P6 → P8
         P6 → P9

Epics are independent — can be built in parallel by two engineers.
```

---

## Library Decisions

| Need | Library | Why |
|------|---------|-----|
| Physics colliders | `@react-three/rapier` | WASM SIMD, zero CPU overhead when idle, works with R3F |
| NavMesh (V2) | `@recast-navigation/three` | Web Worker baking, deterministic, no runtime overhead |
| Virtual joystick (mobile V2) | `nipplejs` | 3 KB, no React dep, battle-tested |
| Canva SDK (V2) | `@canva/app-ui-kit` | First-party, typed postMessage channel |

---

## DB Columns to Add

```sql
-- Rounds table additions
ALTER TABLE rounds
  ADD COLUMN pov_height_offset FLOAT    NOT NULL DEFAULT 1.7,
  ADD COLUMN embed_enabled     BOOLEAN  NOT NULL DEFAULT false,
  ADD COLUMN stage_r2_key      TEXT;        -- raw R2 object key (for embed-token signing)

-- embed_rounds view (Phase 9)
CREATE VIEW embed_rounds AS
  SELECT id, name, stage_url, camera_presets, video_playlist,
         scene_config, pov_height_offset
  FROM rounds
  WHERE is_published = true AND embed_enabled = true;

GRANT SELECT ON embed_rounds TO anon;
```

---

## Open Questions Before Build

1. **Scale calibration default:** Is `1.7 m` the correct eye-level default for your
   most common stage exports? Some C4D pipelines export in cm (1 unit = 1 cm),
   meaning eye level would be `170` units. The `CameraAutoFrame` `modelMetrics.radius`
   can auto-detect this — add a `unitScale` inference step.

2. **Embed auth model:** Should embed work for *all published projects* or only
   when admin explicitly enables "Embed Mode" per project? Recommend gating behind
   `embed_enabled` column (already in schema above) to prevent unintended exposure.

3. **Canva App Store vs raw iFrame:** Canva's App Store submission requires a review
   process (~2 weeks). For immediate client demos, raw iFrame is sufficient.
   Plan App Store submission for public launch.

4. **Rapier WASM size:** Adding `@react-three/rapier` adds ~700 KB to the bundle
   (WASM, loaded async). Since it is only needed in POV mode, lazy-load it:
   ```js
   const { Physics, RigidBody } = await import('@react-three/rapier')
   ```
   Mount `<Physics>` only when `povMode === true`.

---

*Last updated: 2026-05-03 · Epic 1 scope: Admin + Collab only (`/view` orbit-only).*
