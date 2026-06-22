---
title: Changelog Archive — Operational Milestones
type: task-management
tags: [tasks, sprint, backlog, changelog]
related: ["[[01_Product/Core_Concept]]", "[[02_Architecture/System_Architecture]]", "[[03_Protocol/System_Protocols]]", "[[04_UI_system/System_UI]]", "[[05_AI_rules/AI_Rules]]"]
---

# Changelog Archive — Operational Milestones

> Historical record of implemented, currently-operational core architecture. Everything below is verified present in source or documented as existing in the core docs.

## 🧱 Core Infrastructure (Existing)

- ✅ **Direct-to-bucket Browser → R2 upload pipeline** with a server-side validation matrix.
  - Presigned PUT flow (`getPresignedUploadUrl` → `uploadFileToPresignedUrl`); file bytes never transit the app server — only URL strings persist to Supabase. Per-type MIME/extension/byte ceilings (`stage` 200 MB, `hdri` 80 MB, `media` 500 MB / image 25 MB, `snapshot` 4 MB), sanitized key paths, 300s presign expiry, JWT-gated. See [[02_Architecture/System_Architecture#2. Data Flow Pipeline (Upload & CDN)|pipeline]] · [[03_Protocol/System_Protocols#3. Storage (R2) Key & Validation Protocols|storage protocols]].

- ✅ **In-browser video transcode before upload** — `transcodeToHalfRes` (`@ffmpeg/ffmpeg`) to half-res H.264; images pass through. See [[01_Product/Core_Concept#Direct-to-R2 Asset Upload (src/utils/r2Upload.js, api/get-upload-url.js)|upload feature]].

- ✅ **Private-bucket signed-GET path for feedback snapshots** — `R2_PRIVATE_BUCKET` + `/api/get-snapshot-url` (owner-checked, 300s signed GET, anti-enumeration random key suffix). See [[03_Protocol/System_Protocols#Signed-read & admin storage routes|signed-read routes]].

- ✅ **Admin R2 management endpoints** — authenticated list (`/api/admin/r2-objects`) and reference-aware batch delete (`/api/admin/delete-r2`, 1000/chunk, policy-validated keys); reference protection via `can_safely_delete_storage` / `filterDeletableR2Keys`.

## 🔐 Security & Identity (Existing)

- ✅ **Token-gated anonymous guest feedback infrastructure** via `SECURITY DEFINER` RPC layers.
  - `upsert_guest` / `lookup_guest` issue 30-day `guest_token`s; `submit_/update_/delete_/load_guest_feedback` mutate only the caller's own rows; anon has **no direct table DML**. See [[01_Product/Core_Concept#Guest Identity Gate (presentation_guests, guest_login_mode_migration.sql)|guest gate]] · [[03_Protocol/System_Protocols#1. Database RPC & RLS Protocols|RPC & RLS]].

- ✅ **Hardened RLS v3 regime** — `projects.owner_id = auth.uid()` owner-scoping; anon reads via sanitizing views (`projects_public`, `projects_client_public`, `client_feedback_public`) filtered to published versions; opaque embed resolution via `resolve_embed_project`. *(Owner-scoping is also the suspected root of the secondary-admin write bug — see [[tasks/current_sprint#🚨 P0 — Secondary Admin Data Loss & Overnight Fallback Bug|current sprint]].)* See [[03_Protocol/System_Protocols#`projects`|projects RLS]].

- ✅ **`ProtectedRoute` session guard + server-side JWT re-verification** — three-state session machine on the client; `verifyBearerUser` at every privileged API edge; authority ultimately in Postgres RLS. See [[02_Architecture/System_Architecture#`<ProtectedRoute>` logic (src/components/ProtectedRoute.jsx)|ProtectedRoute]].

## 📦 Presentation & Versioning (Existing)

- ✅ **Immutable presentation versioning engine** — `draft → published → archived` lifecycle with **optimistic locking via `version_token`** (rotated on `snapshot_json` change) and **advisory-lock-guarded** per-project version-number increment triggers; atomic lifecycle RPCs (`save_draft_version`, `publish_presentation_version`, `discard_draft_version`, `restore_presentation_version`). One published version per project enforced by partial unique index. See [[01_Product/Core_Concept#2. Presentation Versioning & Lifecycle (src/lib/presentationVersions.js, presentation_versions*.sql)|versioning]] · [[03_Protocol/System_Protocols#1. Database RPC & RLS Protocols|lifecycle RPCs]].

- ✅ **Overnight stale auto-save force-write fix (2026-05-27)** — `runAutoSave` now passes the current `version_token` as `expectedToken` (conflict check active), reloads server state silently on conflict, and wires `useVersionWatcher` so stale tabs re-sync; `lastSavedTokenRef`/`draftVersionRef`/`isDirtyRef` prevent false-positive conflicts. *(Addresses the force-write vector only — the RLS cross-account vector is being re-audited in [[tasks/current_sprint#🚨 P0 — Secondary Admin Data Loss & Overnight Fallback Bug|the current sprint]].)*

- ✅ **Archived-version retention pruning function** — `prune_archived_presentation_versions` (pg_cron-ready) + client `pruneArchivedVersions`; scoped to `status='archived'` only. *(Live scheduling tracked in [[tasks/backlog#🏗️ Future Infrastructure|backlog]].)*

- ✅ **Snapshot tooling** — `buildSnapshot` / `hydrateSnapshot` (schema v1→v2 director-note migration), `snapshotDiff`, `snapshotSummary`, `slidePublishChecklist`.

## 🔄 Realtime Collaboration (Existing)

- ✅ **Broadcast collaborative slide editing** — channel `collab:presentation:${projectId}`, `slide_op` events (`slide_update/add/delete/reorder`), loopback suppressed by `payload.by === userId`. See [[03_Protocol/System_Protocols#a) Collaborative editing — broadcast (useCollaborativeEditing.js)|collab protocol]].
- ✅ **Presence avatars** — channel `presence:presentation:${projectId}`, presence key = `userId`, tracked `{userId,email,displayName,joinedAt}`.
- ✅ **Postgres-CDC version watcher** — `db:presentation_versions:${projectId}` UPDATE subscription firing only on `version_token` change (remote-save / conflict detection).

## 📊 Telemetry (Existing)

- ✅ **Client-side batched telemetry tracking service** — `trackingService` queues/debounces (`DEBOUNCE_MS=400`, `FLUSH_INTERVAL_MS=800`, `FLUSH_MAX_ITEMS=10`) and flushes through the unified `batch_increment_project_stats` RPC, with per-op fallback to `increment_project_stat`/`increment_project_jsonb_key`. Anon may only INSERT analytics. See [[03_Protocol/System_Protocols#4. Analytics Telemetry Protocol|telemetry protocol]].
- ✅ **Aggregate counters + JSONB popularity maps** on `projects` (`total_views/screenshots/camera_changes/clip_clicks`, `clip_/camera_popularity`, `screenshot_hotspots`). See [[01_Product/Core_Concept#`projects`|projects schema]].

## 🎛️ UI & 3D (Existing)

- ✅ **Normalized SVG 2D overlay coordinate canvas (0–1 mapping)** for frame-accurate review annotations — native `<svg viewBox="0 0 100 100" preserveAspectRatio="none">`, `vectorEffect="non-scaling-stroke"`, click-through `pointerEvents` gating, bounds stored normalized in `annotation_json`. See [[04_UI_system/System_UI#Annotations — normalized SVG overlay (not `<Html>`)|annotation overlay]].
- ✅ **DOM-sibling overlay layering over `<Canvas>`** with a fixed z-index ladder; `<Html>` restricted to fullscreen click-through POV HUDs. See [[04_UI_system/System_UI#4. 3D/Canvas UI Overlays|canvas overlays]].
- ✅ **R3F stage renderer** — ACES Filmic tone mapping (`exposure 0.62`), `dpr=[1,2]`, on-demand `frameloop` when overlays are open, WebGL-context-loss + CSP-eval error boundaries (`StageErrorBoundary`, `PovRuntimeBoundary`). See [[04_UI_system/System_UI#Performance & visual-consistency strategies (from code)|performance strategies]].
- ✅ **Audience POV mode** — Rapier-collider FPS/simple rigs, pointer-lock HUD, per-project `pov_height_offset`. See [[02_Architecture/System_Architecture#a) 3D Stage state — owned by src/pages/AdminPage.jsx|POV state]].

## 🗂️ Project Lifecycle (Existing)

- ✅ **Multi-round project cloning & stacking** — `clone_project` RPC reuses stage/HDRI, resets playlist/stats, joins `group_id = COALESCE(src.group_id, src.id)`; dashboard groups rounds by `group_id`. See [[01_Product/Core_Concept#Multi-Round Cloning & Safe Deletion (clone_project, can_safely_delete_storage, r2ReferenceProtection.js)|cloning]].
- ✅ **Per-project client lock & opaque embed** — `is_client_locked` (403 for anon), `embed_token` (opaque public segment) + `embed_enabled`. See [[01_Product/Core_Concept#`projects`|projects schema]].
- ✅ **Director Notes feature** (G6.5a–g) — completed and merged per project history.
