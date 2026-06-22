---
title: Current Sprint — Stabilize & Secure
type: task-management
tags: [tasks, sprint, backlog, changelog]
related: ["[[01_Product/Core_Concept]]", "[[02_Architecture/System_Architecture]]", "[[03_Protocol/System_Protocols]]", "[[04_UI_system/System_UI]]", "[[05_AI_rules/AI_Rules]]"]
---

# Current Sprint — Stabilize & Secure

> High-critical, immediate actions to stabilize and secure the core platform. Each item traces to a documented friction or technical risk. Sourced from the system docs (no live `TODO`/`FIXME`/`BUG` markers exist in `src/` or `api/`; risks are architectural).

## 🔴 P0 — Security & Data Integrity

- [ ] **Audit & resolve the `owner_id` RLS-v3 vs. browser `upsert` tension**
  - **Why it matters:** `AdminPage.handlePublish` does `supabase.from('projects').upsert(record)` from the browser, while `api/get-upload-url.js` treats `owner_id` as "never migrated" and accepts any signed-in user — yet the authoritative regime is owner-scoped (`owner_id = auth.uid()`). Rows with `NULL` `owner_id` become inaccessible to authenticated mutations, silently breaking publish/update. See [[03_Protocol/System_Protocols#`projects`|projects RLS]] and [[05_AI_rules/AI_Rules#Database mutations — respect Hardened RLS v3|the publish friction warning]].
  - **Acceptance:** Confirm which RLS regime is actually live; ensure every `projects`/`presentation_versions` write path sets/relies on `owner_id` default; backfill any `NULL`-owner rows; verify the publish upsert still succeeds end-to-end. Do **not** strip or hardcode `owner_id`.

- [ ] **Tighten loose `application/octet-stream` validation on R2 uploads**
  - **Why it matters:** The upload gate accepts `application/octet-stream` whenever the file *extension* is allowlisted (to handle browsers that report no MIME for `.mov`), and treats unknown octet-stream as video at the 500 MB ceiling. This weakens the MIME half of the MIME-AND-extension-AND-size check. See [[03_Protocol/System_Protocols#Server-side validation matrix (gate before signing)|validation matrix]] and [[02_Architecture/System_Architecture#2. Data Flow Pipeline (Upload & CDN)|upload pipeline]].
  - **Acceptance:** Narrow the octet-stream fallback to the smallest set of genuinely-MIME-less extensions; reject octet-stream for `stage`/`hdri`/`snapshot` where the browser should report a real MIME; keep the 25 MB image / per-type ceilings; preserve the signed-Content-Type match so R2 doesn't 403.

## 🟠 P1 — Architectural Stabilization

- [ ] **Deflate the `AdminPage` God Component (~1,300 lines, ~40 state slices)**
  - **Why it matters:** `AdminPage` co-mingles high-frequency 3D render state (sun, bloom, POV colliders, camera) with structural project metadata (name, publish, embed, playlist) in one container, all flattened into `scene_config` only at save time. This conflates re-render-hot state with persistence state. See [[02_Architecture/System_Architecture#a) 3D Stage state — owned by src/pages/AdminPage.jsx|3D stage state ownership]].
  - **Acceptance:** Extract cohesive **custom hooks** (e.g. `useStageLighting`, `useMediaPlaylist`, `usePublishLifecycle`, `usePovColliders`) that still **lift state into the `AdminPage` container** and pass explicit props down — preserving the [[02_Architecture/System_Architecture#Admin component architecture container presentational split|container ↔ presentational split]]. A **project-local Zustand store is permitted ONLY for this refactor if a human authorizes it in-session**, per the standing prohibition in [[05_AI_rules/AI_Rules#1. State Management & Architecture Guardrails|the State guardrails]]; do not introduce global state otherwise.

## Definition of Done (sprint)
- No `projects`/`presentation_versions` write path can produce or depend on `NULL`-owner rows.
- Upload validation rejects spoofed/oversized octet-stream where a real MIME is expected.
- `AdminPage` render-hot state is isolated from structural metadata without violating the no-global-store rule.
