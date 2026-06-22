---
title: Current Sprint — Stabilize, Secure & Fix Data Integrity
type: task-management
tags: [tasks, sprint, backlog, changelog]
related: ["[[01_Product/Core_Concept]]", "[[02_Architecture/System_Architecture]]", "[[03_Protocol/System_Protocols]]", "[[04_UI_system/System_UI]]", "[[05_AI_rules/AI_Rules]]"]
---

# Current Sprint — Stabilize, Secure & Fix Data Integrity

> High-critical, immediate actions. Each item traces to a documented friction or verified code path (no live `TODO`/`FIXME`/`BUG` markers exist in `src/` or `api/` — risks are architectural and behavioral).

## 🚨 P0 — Secondary Admin Data Loss & Overnight Fallback Bug

- [ ] **Reproduce & fix: secondary-admin edits revert to an old draft overnight**
  - **Why it matters:** A secondary admin ("admin phụ") edits a presentation (title, notes, slide hide/unhide) — changes hold temporarily, then overnight the presentation reverts to an older draft, wiping the new data. This is the worst class of bug: silent, delayed, data-destroying.
  - **Prior context (verify, do not assume fixed):** A **stale auto-save force-write** vector was root-caused and patched on 2026-05-27 — `runAutoSave` previously sent `expectedToken: null`, so an overnight-open tab that received a remote `slide_op` broadcast (→ `isDirty=true` via `applyRemoteOp`) would force-overwrite newer DB state with its stale local snapshot. Current code (`PresentationEditorPage.jsx` ~L1340–1400) now passes `draftVersionRef.current?.version_token` as `expectedToken`, reloads-on-conflict, and wires `useVersionWatcher`. **First action: confirm this fix is still intact and actually deployed — a regression here reproduces the exact symptom.** See [[03_Protocol/System_Protocols#c) Version watcher — Postgres CDC (useVersionWatcher.js)|version watcher]].
  - **Root Cause Direction — audit three vectors:**
    - [ ] **(1) RLS v3 cross-account violation (NEW, not covered by the 2026-05-27 fix).** `auth_owner_all_presentation_versions` gates ALL authenticated access on `projects.owner_id = auth.uid()`. A secondary admin who is authenticated but does **not own** the root project row is invisible to RLS. The `SECURITY DEFINER` lifecycle RPCs (`save_draft_version`) bypass RLS and would succeed — **but `presentationVersions.js` has a direct-table fallback** (`isMissingFunctionError` → `supabase.from('presentation_versions').update/insert`). On that fallback the secondary admin's `UPDATE` matches **0 rows** under RLS → `maybeSingle()` returns `null` → throws a *phantom* `VersionConflictError`, or the `INSERT` is rejected. Result: write never lands server-side; data lives only in the browser until reload. See [[03_Protocol/System_Protocols#`presentation_versions`|presentation_versions RLS]] and [[01_Product/Core_Concept#2. Target Users|Target Users / ownership model]].
      - *Check:* Does `presentation_versions_rls_v3.sql` strictly enforce `owner_id = auth.uid()`? Is there any concept of shared/co-owner admins? Confirm whether the live DB uses RLS v3 (owner-scoped) or the baseline `auth.role()='authenticated'` regime — the repo contains both. See [[05_AI_rules/AI_Rules#Database mutations — respect Hardened RLS v3|RLS v3 enforcement rule]].
    - [ ] **(2) Silent frontend failure / volatile-cache survival.** Audit whether `saveDraft` failures are swallowed. In `runAutoSave`, a non-conflict error currently hits `console.error('[AutoSave] failed:', err)` with **no user-facing alert** and `autoSaveStatus` falls back to `'idle'` — visually indistinguishable from success. PostgREST RLS errors (403 / `42501`) or relation errors (`42P01`) and phantom `VersionConflictError`s therefore leave edits alive only in React state / browser memory, lost on the overnight session-expiry reload. See [[02_Architecture/System_Architecture#b) Presentation/Feedback state — owned by src/pages/PresentationEditorPage.jsx|editor state ownership]].
      - *Check:* Surface a persistent "save failed / not saved" banner to the editing admin; distinguish RLS-denied (permanent) from conflict (recoverable) from network (retry). Stop treating non-conflict errors as `'idle'`.
    - [ ] **(3) Overnight pruning / lifecycle misfire.** Verify no automated routine silently demotes/deletes the active draft overnight. `prune_archived_presentation_versions` (pg_cron) is scoped to `status='archived'` only — confirm it never touches `draft`/`published`, and check for **timezone/timestamp anomalies** (`NOW()` vs `created_at`/`archived_at`/`updated_at`, `make_interval(days=>…)`) that could mis-bucket a fresh draft. Confirm `discard_draft_version` is never invoked by a cron/trigger, only by explicit user discard. Re-check the publish path (`publish_presentation_version`) doesn't archive the wrong row. See [[03_Protocol/System_Protocols#1. Database RPC & RLS Protocols|lifecycle RPCs]].
  - **Acceptance:** Secondary admin edits persist server-side across an overnight session and a forced reload; any failed save is loudly surfaced, never silently dropped; no cron/trigger mutates `draft` rows; root cause identified among (1)/(2)/(3) and regression-tested with two distinct admin accounts.

## 🔴 P0 — Security & Data Integrity

- [ ] **Audit & resolve the `owner_id` RLS-v3 vs. browser `upsert` tension**
  - **Why it matters:** `AdminPage.handlePublish` does `supabase.from('projects').upsert(record)` from the browser while `api/get-upload-url.js` treats `owner_id` as "never migrated" and accepts any signed-in user — yet RLS v3 is owner-scoped. `NULL`-owner rows become inaccessible to authenticated mutations, silently breaking publish/update. Directly compounds the P0 bug above (vector 1). See [[03_Protocol/System_Protocols#`projects`|projects RLS]] and [[05_AI_rules/AI_Rules#Database mutations — respect Hardened RLS v3|publish friction warning]].
  - **Root Cause Direction:** Confirm the live RLS regime; ensure every `projects`/`presentation_versions` write sets/relies on the `owner_id` default; backfill `NULL`-owner rows; verify publish upsert succeeds end-to-end. Never strip or hardcode `owner_id`.

- [ ] **Tighten loose `application/octet-stream` validation on R2 uploads**
  - **Why it matters:** The upload gate accepts `application/octet-stream` whenever the file extension is allowlisted (to handle MIME-less `.mov`) and treats unknown octet-stream as video at the 500 MB ceiling — weakening the MIME half of the MIME-AND-extension-AND-size check. See [[03_Protocol/System_Protocols#Server-side validation matrix (gate before signing)|validation matrix]] and [[02_Architecture/System_Architecture#2. Data Flow Pipeline (Upload & CDN)|upload pipeline]].
  - **Root Cause Direction:** Narrow the octet-stream fallback to genuinely MIME-less extensions; reject it for `stage`/`hdri`/`snapshot`; keep per-type + 25 MB image ceilings and the signed-Content-Type match.

## 🟠 P1 — Architectural Stabilization

- [ ] **Deflate the `AdminPage` God Component (~1,300 lines, ~40 state slices)**
  - **Why it matters:** `AdminPage` co-mingles high-frequency 3D render state (sun, bloom, POV colliders, camera) with structural project metadata (name, publish, embed, playlist), flattened into `scene_config` only at save time — conflating re-render-hot state with persistence state. See [[02_Architecture/System_Architecture#a) 3D Stage state — owned by src/pages/AdminPage.jsx|3D stage state ownership]].
  - **Root Cause Direction:** Extract cohesive **custom hooks** (`useStageLighting`, `useMediaPlaylist`, `usePublishLifecycle`, `usePovColliders`) that still **lift state into `AdminPage`** and pass explicit props down — preserving the [[02_Architecture/System_Architecture#Admin component architecture container presentational split|container ↔ presentational split]]. A **project-local Zustand store is permitted ONLY for this refactor with explicit in-session human authorization**, per [[05_AI_rules/AI_Rules#1. State Management & Architecture Guardrails|the State guardrails]]; no global state otherwise.

## Definition of Done (sprint)
- Overnight secondary-admin revert no longer reproducible across two admin accounts; failed saves are surfaced, not swallowed.
- No `projects`/`presentation_versions` write path produces or depends on `NULL`-owner rows.
- Upload validation rejects spoofed/oversized octet-stream where a real MIME is expected.
- `AdminPage` render-hot state isolated from structural metadata without violating the no-global-store rule.
