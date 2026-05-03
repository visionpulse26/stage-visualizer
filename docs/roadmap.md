# Roadmap - Stage Visualizer

## EPIC #1 - Immersive Audience POV (Admin / Collab)

Status reflects the beta worktree after the latest local POV updates.

| Phase | Scope | Status |
|-------|-------|--------|
| **P1** | POV foundation: `pov_height_offset` schema, admin height control, saved publish payload | Done |
| **P2** | POV entry / exit: orbit state capture, smooth camera transition, pointer-lock handoff, Esc exit | Done |
| **P3** | FPS controller: mouse look, WASD movement, Rapier physics capsule, gravity, geofence walls | Done |
| **P3a** | Admin collider manager: scan GLB meshes, assign `Auto / Floor / Blocker / Ignore`, save config in `scene_config.povColliderConfig` | Done |
| **P3b** | Floor collider refinement: tile floor colliders instead of one large mesh bbox | Done |
| **P3c** | Space jump: grounded jump using Rapier vertical velocity; supports default floor and assigned floor colliders | Done (local beta) |
| **P4** | POV HUD lockout + headless media hotkeys (`Q/E`, number keys, screenshot shortcut) | Planned |
| **P5** | Collider debug overlay + more detailed blocker colliders / step-climb refinement | Planned |

### Epic #1 Notes

- Public client route `/view/:projectId` remains orbit-only.
- `@react-three/rapier` is lazy-loaded through `PovFpsRig`, so physics is mounted only when POV is active.
- Current blockers are still cuboid colliders around selected meshes. This is usable for safety boundaries but not yet mesh-accurate.
- Space jump is committed locally in beta and needs push when accepted.
- Production build passes; POV chunk remains large and should be code-split further later.

## EPIC #2 - Embed widget (public stage in iframe / LMS)

Phases tracked in code comments (`EmbedPage.jsx`, `App.jsx`). Status reflects the repository as of the latest commit.

| Phase | Scope | Status |
|-------|-------|--------|
| **P6** | Route `/embed/:projectId`, admin toggle `embed_enabled`, base layout + sidebar (embed code / preview chrome) | Done |
| **P7** | Wire **3D `StageCanvas`** (same scene as Client view): load `stage_url`, `scene_config`, `camera_presets`, optional `media_playlist` / `video_url`; minimal controls (camera presets, orbit) | Done |
| **P8** | Deploy headers / CSP so the embed URL can be iframed on external sites (e.g. Canvas LMS): relax `frame-ancestors` + remove `X-Frame-Options: DENY` for `/embed` only | Done |
| **P9** | **Embed token API** - public URL by opaque token (not raw project UUID), optional regenerate/revoke; remove `ProtectedRoute` from embed when ready | Planned |
| **P10** | Optional: analytics for embed views, rate limits, signed short-lived URLs | Future |

### Epic #2 Notes

- **Admin preview** (`/embed/:projectId` behind `ProtectedRoute`): full stage preview with embed chrome; mirrors what will ship publicly after P9.
- **Security**: Until P9, only authenticated admins can open `/embed/...`. After P9, enforce `embed_enabled` + token for anonymous access.
