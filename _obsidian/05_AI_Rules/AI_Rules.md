---
title: AI Coding Rules & Guardrails
type: ai-rules
tags: [ai, guardrails, vibe-coding, rules, development]
related: ["[[01_Product/Core_Concept]]", "[[02_Architecture/System_Architecture]]", "[[03_Protocol/System_Protocols]]", "[[04_UI_system/System_UI]]"]
---

# AI Coding Rules & Guardrails — Stage Visualizer

> **Read first, every session:** [[01_Product/Core_Concept]] · [[02_Architecture/System_Architecture]] · [[03_Protocol/System_Protocols]] · [[04_UI_system/System_UI]]. These rules are derived from the *actual* codebase, including its known anomalies. Do not "fix" an anomaly into a different paradigm unless the human explicitly authorizes it — match what exists.

This file is a **behavioral override** for any AI assistant (Cursor, Claude Code, or otherwise) working on `stage.tooawake.mov`. When a request conflicts with these guardrails, **stop and surface the conflict** rather than silently re-architecting.

---

## 1. State Management & Architecture Guardrails

This app has **no global state library** and that is a deliberate constraint — verified absent: no Redux, Zustand, Jotai, or React Context (`createContext`/`useReducer`). See [[02_Architecture/System_Architecture#1. Frontend Framework & State Management|State Management strategy]].

**HARD PROHIBITIONS**
- ❌ **Do NOT add** `zustand`, `redux`, `@reduxjs/toolkit`, `jotai`, `recoil`, `valtio`, or introduce a React `createContext` provider, without explicit human authorization in the current session.
- ❌ Do NOT "lift state to a store to clean things up." The flattening of editor state into payloads happens **at save time**, not in a store (e.g. `scene_config` is assembled only inside `handlePublish`).
- ❌ Do NOT convert prop-drilled components to consume a context to "reduce prop count." `UIPanel` taking ~50 explicit props is the intended pattern.

**REQUIRED PATTERN — how to add a feature**
1. **Own state in the page-level container.** New stateful logic lives in the relevant container: `AdminPage` (3D stage domain), `PresentationEditorPage` (slides/feedback domain), or `ProjectsDashboard` (project list). These are the single sources of truth per [[02_Architecture/System_Architecture#Admin component architecture container presentational split|the container ↔ presentational split]].
2. **Declare state as local `useState`/`useRef`**, grouped under a section comment matching the existing style, with derived values via `useMemo` and handlers wrapped in `useCallback`.
3. **Pass values + `onX` callbacks down as explicit props** to presentational components. Presentational components (`UIPanel`, `StageCanvas`, `TopBar`, `FeedbackDraftPanel`) **must not** fetch or own server state — they render and call back up.
4. **Cross-client/shared state goes through Supabase Realtime hooks, not a store** — reuse the existing patterns in [[02_Architecture/System_Architecture#c) Realtime collaboration state — Supabase Realtime hooks (src/hooks/)|the realtime hooks]] (`useCollaborativeEditing`, `usePresenceChannel`, `useVersionWatcher`). New realtime features must follow the same channel-keyed-by-`projectId` + ref-stable-callback shape documented in [[03_Protocol/System_Protocols#2. Realtime Communication Protocol|the Realtime Protocol]].
5. **Auth/session is read at point-of-use** via `supabase.auth.getSession()` / `onAuthStateChange` (as in `ProtectedRoute`); do not cache it in a global.

---

## 2. UI & Styling Generation Rules

There are **two segregated styling systems** and **no merge utilities**. See [[04_UI_system/System_UI#2. Core Component Library|Core Component Library]] and [[04_UI_system/System_UI#1. Design System & Theming|Design System & Theming]].

**SURFACE SEGREGATION — pick the correct system by surface**
- ✅ **Admin authoring chrome** (`AdminPage`, `UIPanel`, `TopBar`, `ProjectsDashboard`, admin POV controls) → **Tailwind utility classes**. Use the existing glass-card idiom: `bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl`, violet/cyan accents, `scrollbar-thin`.
- ✅ **Client / Collab / Feedback surfaces** (`ClientPage`, `PresentationEditorPage`, `FeedbackDraftPanel`, annotation chrome) → **inline `style={{}}` objects built from the `T` ember-token object** described in [[04_UI_system/System_UI#Secondary "Hi-Fi v2" ember theme (inline token object)|the Hi-Fi v2 ember theme]]. Reuse `T.ember/ember2/glass/glassDark/cam/amber/green/text…` and the `Row`/`Col`/`SLabel`/`Divider` inline primitives. Do not introduce Tailwind into these files.
- ❌ Do NOT mix the two systems within one component. If a new component spans both worlds, ask which surface it belongs to.

**BRAND ENFORCEMENT (non-negotiable)**
- ✅ Every new visual component uses **`Chakra Petch`** — `var(--font-brand)` (Tailwind side, inherited from the shell) or `fontFamily: 'Chakra Petch, sans-serif'` (inline side). No other typeface.
- ✅ Honor the global shell from [[04_UI_system/System_UI#Global CSS variables & resets (src/index.css)|`src/index.css`]]: fixed full-viewport `overflow:hidden`, the custom orange scrollbars (WebKit + Firefox), `--tooawake-orange` brand mark, and the `select`/`range` control styling. Do not add page-level scrolling or override the scrollbar theme.
- ✅ Status/semantic colors are fixed: ember/orange = brand action, `cam #1FA0EE` = camera context, amber = `pending`, green = `resolved` (mirrors [[01_Product/Core_Concept#`client_feedback_items`|feedback status]]).

**DEPENDENCY PROHIBITIONS**
- ❌ Do NOT add an external UI/component library (MUI, shadcn/ui, Radix, Chakra UI, Headless UI, Mantine, etc.). No `src/components/ui/` or `src/components/common/` exists and none should be created without authorization.
- ❌ Do NOT add or use `clsx`, `classnames`, `tailwind-merge`, `cva`, or `styled-components` — they are **not in the dependency tree**. Conditional styling uses template-literal ternaries (Tailwind side) or ternaries inside `style={{}}` objects (inline side), exactly as existing code does.
- ✅ Icons: extend the **hand-rolled inline `<svg stroke="currentColor" viewBox="0 0 24 24">` component** pattern (as in `UIPanel`/`ProjectsDashboard`), or use **`lucide-react`** (the only icon dep) where that file already imports it (`PresentationEditorPage`). Do not add a different icon package.

---

## 3. Data Flow & Security Enforcement

### Upload pipeline — bytes never touch the app server
See [[02_Architecture/System_Architecture#2. Data Flow Pipeline (Upload & CDN)|Data Flow Pipeline]] and [[03_Protocol/System_Protocols#3. Storage (R2) Key & Validation Protocols|Storage Protocols]].

- ❌ **ABSOLUTE BOUNDARY:** Never route file bytes (GLB, GLTF, HDR/EXR, video, image, snapshot) through a serverless API route, multipart form post, or base64 body. Serverless endpoints only **sign** and return metadata.
- ✅ All heavy binaries stream **browser → R2 directly** via presigned PUT: call `getPresignedUploadUrl({ filename, contentType, contentLength, projectId, type })` → `uploadFileToPresignedUrl(putUrl, file, publicUrl, onProgress)`. Persist **only the resulting URL string** to Supabase.
- ✅ New asset categories must extend the **server-side validation matrix** in `api/get-upload-url.js` (allowed MIME, allowed extensions, byte ceilings) — see [[03_Protocol/System_Protocols#Server-side validation matrix (gate before signing)|the validation matrix]] — and the `sanitizeKey` path convention `{project}/{type}/{ts}_{name}`. Keep the 300s presign expiry and the `Authorization: Bearer <JWT>` requirement.
- ✅ Content-Type sent on the PUT must match what was signed (mismatch → R2 `403 SignatureDoesNotMatch`). Private snapshots have no public URL and must be read via `/api/get-snapshot-url`.

### Database mutations — respect Hardened RLS v3
The authoritative regime is **owner-scoped RLS v3** (`presentation_versions_rls_v3.sql`): `projects.owner_id UUID DEFAULT auth.uid()`, with `projects`, `presentation_versions`, and `client_feedback_items` all gated on `owner_id = auth.uid()`. See [[03_Protocol/System_Protocols#1. Database RPC & RLS Protocols|RPC & RLS Protocols]].

- ✅ Any new or modified mutation to `projects` / `presentation_versions` **must account for `owner_id = auth.uid()`**. On INSERT the column default supplies `owner_id`; on UPDATE/DELETE the row's `owner_id` must already equal the caller. Rows with `NULL` `owner_id` are inaccessible to authenticated mutations — never write a path that depends on NULL-owner rows.
- ⚠️ **KNOWN FRICTION — do not break the publish write path.** `AdminPage.handlePublish` performs `supabase.from('projects').upsert(record)` from the browser, while `api/get-upload-url.js` comments treat `owner_id` as "never migrated" and accept any signed-in user. This is the documented [[03_Protocol/System_Protocols#`projects`|projects RLS tension]]. Before editing publish/upsert logic: (a) preserve the upsert's reliance on the `owner_id` default, (b) do **not** strip or hardcode `owner_id`, (c) if a change would require the row to already be owned, flag it to the human first.
- ✅ Anonymous/guest writes go **only** through `SECURITY DEFINER` RPCs (`upsert_guest`, `submit_guest_feedback`, `update_guest_feedback`, `delete_guest_feedback`, `resolve_embed_project`) — never grant anon direct table DML. Anon reads come from the sanitizing views (`projects_public`, `projects_client_public`, `client_feedback_public`), respecting the published-version filter. See [[01_Product/Core_Concept#2. Target Users|Target Users]].
- ✅ Version writes are optimistic-locked: pass `expectedToken`/`p_expected_token` and handle `VersionConflictError` / `version_conflict`; the realtime counterpart is `useVersionWatcher` comparing `version_token`. Do not bypass the advisory-locked lifecycle RPCs.
- ✅ Analytics are **batched, fire-and-forget** through `trackingService` → `batch_increment_project_stats`. Do not write raw analytics rows or call increment RPCs in tight loops; use `trackStat`/`trackJsonb` and respect the debounce/flush constants in [[03_Protocol/System_Protocols#4. Analytics Telemetry Protocol|the Telemetry Protocol]].

---

## 4. 3D Canvas & Overlay Constraints

See [[04_UI_system/System_UI#4. 3D/Canvas UI Overlays|3D/Canvas UI Overlays]].

**Overlay layering — DOM siblings, not R3F children**
- ✅ New 2D UI over the stage must be rendered as a **DOM sibling of `<Canvas>`**, passed in as `children` of `StageCanvas` and positioned `absolute` within the `relative w-full h-full` wrapper. Respect the existing z-index ladder: annotation SVG `z:5`, lock badge `z:8`, toolbars/top bars `z:10`, `UIPanel` `z-10`, POV buttons `z-[5000+]`.
- ❌ Do NOT place HTML/2D UI inside the React Three Fiber scene graph to position it.
- ✅ Preserve canvas invariants when adding overlays: keep `dpr={[1,2]}`, the ACES tone mapping (`toneMappingExposure: 0.62`), and switch `frameloop` to `'demand'` (`freezeRenderLoop`) when a heavy overlay (e.g. feedback mode) is open. Keep overlay containers click-through (`pointerEvents:'none'`) except where interaction is required.

**Annotations — normalized SVG only**
- ✅ Annotation/marker geometry uses a **native `<svg viewBox="0 0 100 100" preserveAspectRatio="none">`** with **normalized 0–1 coordinates** stored in `annotation_json.bounds` (plus a `viewport {width,height}`), exactly as `AnnotationLayer` does. Shapes must use `vectorEffect="non-scaling-stroke"`.
- ✅ Gate `pointerEvents` conditionally (`readOnly ? 'none' : (activeTool || annotation ? 'all' : 'none')`) so camera/orbit controls stay usable beneath the overlay. Do not store pixel coordinates as the source of truth.

**`<Html>` usage — strictly limited**
- ❌ Do NOT use `@react-three/drei` `<Html>` for feedback markers, annotation pins, contextual tooltips, or any 3D-coordinate-anchored label. Annotations are normalized-SVG DOM siblings, not `<Html>`.
- ✅ `<Html>` is permitted **only** for fullscreen, click-through HUD interfaces inside the POV rigs (`PovFpsRig`, `PovSimpleRig`), in the existing form `<Html fullscreen style={{ pointerEvents: 'none' }}>` with an inner `pointer-events-auto` control. Any other `<Html>` use requires human authorization.

---

## Escalation Rule

If a requested change would require violating any rule above — adding a store, mixing styling systems, adding a forbidden dependency, routing bytes through the server, writing NULL-owner rows, or anchoring `<Html>` to 3D coordinates — **do not proceed silently.** State which guardrail it touches, link the relevant section, and ask the human to confirm the exception.
