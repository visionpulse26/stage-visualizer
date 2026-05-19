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
| **P4** | POV HUD lockout + headless media hotkeys (`Q/E`, number keys, screenshot shortcut) | **Done** (beta) |
| **P5** | Collider debug overlay + more detailed blocker colliders / step-climb refinement | Planned |

### Epic #1 Notes

- Public client route `/view/:projectId` remains orbit-only.
- `@react-three/rapier` is lazy-loaded through `PovFpsRig`, so physics is mounted only when POV is active.
- Current blockers are still cuboid colliders around selected meshes. This is usable for safety boundaries but not yet mesh-accurate.
- P4: In POV, Admin/Collab side panels and TopBar hide; fixed **Exit POV** + hotkey legend; `Q`/`E` cycle playlist, `1`–`9` jump to slot, `P` saves a watermarked screenshot (pointer-lock on canvas only).
- Production build passes; POV chunk remains large and should be code-split further later.

## EPIC #2 - Embed widget (public stage in iframe / LMS)

Phases tracked in code comments (`EmbedPage.jsx`, `App.jsx`). Status reflects the repository as of the latest commit.

| Phase | Scope | Status |
|-------|-------|--------|
| **P6** | Route `/embed/:embedToken`, admin toggle `embed_enabled`, base layout + sidebar (embed code / preview chrome) | Done |
| **P7** | Wire **3D `StageCanvas`** (same scene as Client view): load `stage_url`, `scene_config`, `camera_presets`, optional `media_playlist` / `video_url`; minimal controls (camera presets, orbit) | Done |
| **P8** | Deploy headers / CSP so the embed URL can be iframed on external sites (e.g. Canvas LMS): relax `frame-ancestors` + remove `X-Frame-Options: DENY` for `/embed` only | Done |
| **P9** | **Embed token** — column `embed_token`, public `/embed/:token` without login, legacy project UUID in URL still works when embed_enabled; admin regenerate token + iframe-only UI for anonymous | **Done** (beta worktree) |
| **P10** | Optional: analytics for embed views, rate limits, signed short-lived URLs | Future |

## EPIC #3 - Client Review & Feedback System

Versioned presentation delivery to end-clients with structured feedback capture.
Design reference: `docs/Stage Visualizer Hi-Fi v2.html` (adjusted to include Publish Checklist).

| Phase | Scope | Status |
|-------|-------|--------|
| **Phase 0** | Supabase schema: `presentation_versions` + `client_feedback_items` tables, RLS, triggers, lib helpers | **Done** |
| **Phase 1** | Admin Presentation Editor: `/admin/:projectId/presentation` — slide list, stage canvas, context panel, publish modal, publish checklist | **Done** |
| **Phase 2** | Desktop Client Presentation View: `/view/:projectId` redesign — `ClientTopBar`, `ClipStrip`, collapsible `ContextPanel`, clip title header, camera fly, client zoom guard, version badge | **Done** |
| **Phase 3** | Desktop Feedback Draft: feedback mode lock (clip + camera + timestamp), `FeedbackDraftPanel`, `AnnotationLayer` (circle/region SVG), `AnnotationToolbar`, `FeedbackTopBar`, reviewer name gate + localStorage, submit to Supabase | **Done** |
| **Phase 4** | Admin Feedback Review: full queue page at `/admin/:projectId/feedback` — list items, resolve/reopen, admin note, filter by status/slide; + Feedback Jump / View Restore (jump from review queue → exact slide + camera + timestamp in Presentation Editor) | **Done** (beta worktree) |
| **Phase 5** | Mobile View-Only Client: bottom tabs (Clips / Context / References), no feedback | **Done** (beta worktree) |

### Epic #3 Notes

- Feedback items attach to `presentation_version_id + slide_id + clip_id + clip_time_seconds + camera_snapshot_json + annotation_json`.
- Screen-space annotations stored as normalized 0-1 coords plus viewport/snapshot metadata: `{ type: 'circle'|'region', bounds: { x, y, width, height }, viewport: { width, height }, snapshot: { dataUrl, width, height } }`.
- Client zoom guard: `minDistance = 8`, `maxDistance = 220` world units.
- Reviewer name persisted at `localStorage` key `stageviz:reviewer-name:{projectId}`.
- `FeedbackDraftPanel`, `AnnotationLayer`, `AnnotationToolbar`, `FeedbackTopBar`, `FeedbackLockBanner`, `StageLockBadge` all exported from `src/components/FeedbackDraftPanel.jsx`.

### Epic #2 Notes

- **Admin preview**: logged-in users opening `/embed/:token` see chrome + iframe snippet; anonymous visitors see the stage canvas only.
- **Security**: Run `supabase/embed_token_migration.sql` on production DB before relying on opaque URLs. Until migration, embed links fall back to project UUID with a warning in Admin publish panel.
