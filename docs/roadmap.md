# Roadmap - Stage Visualizer

## EPIC #1 - Immersive Audience POV (Admin / Collab)

Release scope for `main`: bring over the stable POV stack only. Public client route stays orbit-only.

| Phase | Scope | Status |
|-------|-------|--------|
| **P1** | POV foundation: `pov_height_offset` schema, admin height control, saved publish payload | Done |
| **P2** | POV entry / exit: orbit state capture, smooth camera transition, pointer-lock handoff, Esc exit | Done |
| **P3** | FPS controller: mouse look, WASD movement, Rapier physics capsule, gravity, geofence walls | Done |
| **P3a** | Admin collider manager: scan GLB meshes, assign `Auto / Floor / Blocker / Ignore`, save config in `scene_config.povColliderConfig` | Done |
| **P3b** | Floor collider refinement: tile floor colliders instead of one large mesh bbox | Done |
| **P3c** | Space jump: grounded jump using Rapier vertical velocity; supports default floor and assigned floor colliders | Done |
| **P4** | POV HUD lockout + headless media hotkeys (`Q/E`, number keys, screenshot shortcut) | Done |
| **P5** | Collider debug overlay + blocker detail refinement + stair step-assist | Planned |

### EPIC #1 Collider Plan

- Keep collider assignment in Admin: `Auto / Floor / Blocker / Ignore`.
- Floors and stairs should be treated as walkable surfaces, not blockers.
- Use tiled floor colliders for big floor meshes so walking remains stable without one giant over-blocking box.
- Add step-assist next: when the capsule hits a small vertical lip, test a short forward probe at foot height and a second probe at step height, then lift the body only if the target tile is walkable and below the configured step limit.
- Keep blockers conservative by default: one simple cuboid per selected blocker mesh, optionally split only along the longest axis for very long objects.
- Avoid dense X/Z blocker subdivision as the default, because it still follows the bounding box, not the real mesh, and can block empty space.
- Add a debug overlay before making blockers more detailed, so Admin can see exactly which objects are Floor, Blocker, or Ignore.
- Do not require C4D collider meshes or material-name-only workflows. Material/name heuristics can suggest defaults, but Admin selection must be the source of truth.

### EPIC #1 Notes

- `@react-three/rapier` should be lazy-loaded through the POV rig, so physics mounts only when POV is active.
- POV belongs to Admin and Collab routes first. Client view remains simple and stable until this is proven in production.
- The current main release intentionally excludes the beta P5 blocker refinement that generated many AABB subdivisions.
- P4: In POV, Admin/Collab side panels and TopBar hide; fixed **Exit POV** + hotkey legend; `Q`/`E` cycle playlist, `1`-`9` jump to slot, `P` saves a watermarked screenshot.

## EPIC #2 - Embed widget (public stage in iframe / LMS)

Phases tracked in code comments (`EmbedPage.jsx`, `App.jsx`). Status reflects `main` scope only.

| Phase | Scope | Status |
|-------|--------|--------|
| **P6** | Route `/embed/:projectId`, admin toggle `embed_enabled`, base layout + sidebar (embed code / preview chrome) | Done |
| **P7** | Wire **3D `StageCanvas`** (same scene as Client view): load `stage_url`, `scene_config`, `camera_presets`, optional `media_playlist` / `video_url`; minimal controls (camera presets, orbit) | Done |
| **P8** | Deploy headers / CSP so the embed URL can be iframed on external sites (e.g. Canvas LMS): relax `frame-ancestors` + remove `X-Frame-Options: DENY` for `/embed` only | Done |
| **P9** | **Embed token API** - public URL by opaque token (not raw project UUID), optional regenerate/revoke; remove `ProtectedRoute` from embed when ready | Planned |
| **P10** | Optional: analytics for embed views, rate limits, signed short-lived URLs | Future |

### EPIC #2 Notes

- Admin preview (`/embed/:projectId` behind `ProtectedRoute`): full stage preview with embed chrome; mirrors what will ship publicly after P9.
- Until P9, only authenticated admins can open `/embed/...`. After P9, enforce `embed_enabled` + token for anonymous access.
