---
title: Core Concept
type: product-foundation
app: Stage Visualizer
domain: stage.tooawake.mov
storage: Cloudflare R2
backend: Supabase (Postgres + Auth + RLS)
tags: [product, foundation, architecture, stage-visualizer]
---

# Stage Visualizer — Core Concept

> Foundational context document. Extracted strictly from source: route definitions (`src/App.jsx`), the R2 upload pipeline (`src/utils/r2Upload.js`, `api/get-upload-url.js`, `api/lib/*`), and the Supabase schema/RPC layer (`supabase/*.sql`, `src/lib/presentationVersions.js`).

---

## 1. Core Problem & Objectives

Stage Visualizer is a web platform for **presenting interactive 3D stage designs to clients and collecting structured, frame-accurate feedback on them**. The architecture reveals the exact problem being solved:

- **A 3D stage asset must be shown to a non-technical reviewer.** Each project carries a 3D model (`stage_url` — `.glb`/`.gltf`), an environment map (`scene_config.customHdriUrl` — `.hdr`/`.exr`), a media playlist of clips (`media_playlist`), and saved camera viewpoints (`camera_presets`). These large binaries are offloaded to **Cloudflare R2** via direct, presigned, browser-to-bucket uploads — keeping heavy assets off the application server.

- **The thing being reviewed must be frozen so feedback maps to an exact state.** Editing a live presentation while clients comment on it would desynchronize comments from content. The system solves this with an **immutable snapshot model**: a `presentation_versions` row stores the full client-facing payload (`snapshot_json`) and moves through a `draft → published → archived` lifecycle. Exactly one published version may exist per project (`presentation_versions_one_published` unique partial index).

- **Feedback must be precise, not vague.** A `client_feedback_items` row binds each comment to a specific `slide_id`, `clip_id`, `clip_time_seconds`, a `camera_snapshot_json` (the exact camera the reviewer saw), and an `annotation_json` (a drawn circle/region). The objective is to **restore exactly what the reviewer was looking at** when they commented.

- **Reviewers must participate without accounts.** The whole client-facing surface (`/view`, `/collab`, `/embed`) runs unauthenticated. A soft "guest identity" layer (`presentation_guests` + `SECURITY DEFINER` RPCs) gives anonymous reviewers an identity and edit-scope without a real login.

- **The admin needs to know the work is being seen.** Stealth analytics tables (`visitor_logs`, `interaction_events`, `client_page_views`, `client_interactions`) plus per-project aggregate counters capture views, clip plays, camera changes, and screenshots.

**Objectives, as encoded in the system:**
1. Serve heavy 3D/media assets cheaply and safely via R2 presigned URLs (size/MIME/extension gated server-side).
2. Version presentations immutably so client feedback always maps to a known snapshot.
3. Capture frame-accurate, camera-aware, annotated feedback from login-less reviewers.
4. Support multi-round project iteration via cloning while protecting shared storage from deletion.
5. Track client engagement without interrupting the viewing experience.

---

## 2. Target Users

User roles are inferred from `ProtectedRoute` usage in `src/App.jsx`, RLS policies, and the guest RPC layer. There are two privilege tiers and three anonymous personas.

### Authenticated Admin (Studio / Designer)
- The only role requiring a **Supabase auth session** (`<ProtectedRoute>` wraps every `/admin/*` route).
- RLS grants `authenticated` users **full access** to `presentation_versions` and `client_feedback_items` (`auth all …` policies) and **read-only** access to all analytics tables (`*_select_authenticated` policies use `auth.role() = 'authenticated'`).
- Admin-only serverless routes (`api/admin/*`) verify the bearer JWT via `verifyBearerUser` before listing or deleting R2 objects.
- Capabilities: edit the 3D stage (`/admin/stage`), author & publish presentations (`/admin/:projectId/presentation`), triage feedback (`/admin/:projectId/feedback`), and manage R2 assets + analytics (`/admin/data`).
- **Note:** the `projects` table has no `owner_id` column wired into upload auth — `canUploadForProject` accepts *any* signed-in user (origin-trust model, per `api/get-upload-url.js` comments).

### End-Client Reviewer (anonymous)
- Visits `/view/:projectId` — no login. Sees the **published** snapshot only.
- Gated by `GuestGate` → `presentation_guests`: provides name + email to obtain a `guest_token` (30-day expiry). Returning guests can re-enter by email only (`lookup_guest`).
- Can submit / edit / delete **only their own** feedback, enforced server-side by guest-token-scoped RPCs (`submit_guest_feedback`, `update_guest_feedback`, `delete_guest_feedback`).
- Access can be cut off per project via `is_client_locked` (returns 403 to unauthenticated users).

### Collaborator (anonymous, shareable link)
- Visits `/collab/:projectId` — public, "no login required" (per route comment). A shareable working view distinct from the polished client view.

### Embed Viewer (anonymous, iframe)
- Visits `/embed/:embedToken` using an **opaque `embed_token` UUID** rather than the raw project id, so public iframes don't leak internal project UUIDs. Gated per project by `embed_enabled`; regenerating the token revokes old links.

---

## 3. Key Features (Implemented)

### Direct-to-R2 Asset Upload (`src/utils/r2Upload.js`, `api/get-upload-url.js`)
- Two-step presigned **PUT** flow: client requests a signed URL from `/api/get-upload-url`, then `XMLHttpRequest` PUTs the file straight to R2 with progress events.
- Four upload **types**, each with its own validation profile:

| Type | Allowed extensions | Max size | Key prefix |
|------|-------------------|----------|------------|
| `stage` | `.glb`, `.gltf` | 200 MB | `{project}/stage/` |
| `hdri` | `.hdr`, `.exr` | 80 MB | `{project}/hdri/` |
| `media` | `.png .jpg .jpeg .webp .gif .mp4 .webm .mov` | 500 MB (25 MB for images) | `{project}/media/` |
| `snapshot` | `.webp .png .jpg .jpeg` | 4 MB | `{project}/feedback-snapshots/` |

- Server validates **MIME + extension + byte length**, sanitizes keys, signs URLs with a 300s expiry, and requires a Supabase bearer token.
- **Private bucket option:** when `R2_PRIVATE_BUCKET` is set, feedback `snapshot` uploads go to a non-public bucket and return no public URL — they must be fetched later through `/api/get-snapshot-url` (signed GET). Snapshot keys also get a non-guessable random suffix to prevent enumeration.

### Presentation Versioning & Lifecycle (`src/lib/presentationVersions.js`, `presentation_versions*.sql`)
- Immutable snapshots with a `draft → published → archived` state machine; auto-incremented `version_number` (advisory-lock guarded), human `version_name`, and `release_notes`.
- **Optimistic locking** via `version_token` (rotated by trigger whenever `snapshot_json` changes) → throws `VersionConflictError` on concurrent edits.
- Operations: `saveDraft`, `publishVersion`, `discardDraft`, `restoreVersion` (any version → new draft, `restored_from` lineage), `revertDraftToPublished`, `renameVersion`, `deleteVersion` (archived only), `pruneArchivedVersions` (retention: keep latest K, drop older than N days).
- Snapshot tooling: `buildSnapshot`, `hydrateSnapshot` (schema v1→v2 in-memory migration of director notes), `snapshotSummary`, `snapshotDiff`, `slidePublishChecklist`.

### Camera-Aware, Annotated Client Feedback (`client_feedback_items`, guest RPCs)
- Each comment stores `slide_id`, `clip_id`, `clip_time_seconds`, `camera_snapshot_json`, and `annotation_json`.
- `pending → resolved` workflow with `resolved_by` / `resolved_at` and an admin-only `admin_note`.
- Public read is mediated by the `client_feedback_public` view (only feedback tied to a **published** version is exposed to anon).

### Guest Identity Gate (`presentation_guests`, `guest_login_mode_migration.sql`)
- `upsert_guest` / `lookup_guest` issue a 30-day `guest_token`; returning guests keep their original registered name. All guest writes flow through `SECURITY DEFINER` RPCs — no direct anon table access.

### Multi-Round Cloning & Safe Deletion (`clone_project`, `can_safely_delete_storage`, `r2ReferenceProtection.js`)
- `clone_project` RPC duplicates a project for a new "round," reusing `stage_url` / HDRI, resetting `media_playlist` and all stats, and joining the source's `group_id` (project stacking).
- Reference-aware deletion: `can_safely_delete_storage` and `filterDeletableR2Keys` prevent purging R2 objects still referenced by sibling/cloned projects.

### Engagement Analytics (`analytics_schema.sql`, `client_page_views_schema.sql`, `project_stats_schema.sql`)
- Session-level `visitor_logs` + granular `interaction_events`; simpler `client_page_views` + `client_interactions`.
- Per-project aggregate counters and JSONB popularity maps incremented via `SECURITY DEFINER` RPCs (`increment_project_stat`, `increment_project_jsonb_key`, `batch_increment_project_stats`).

### Embeddable / Shareable Distribution
- `/embed/:embedToken` (opaque token, `embed_enabled` gated), `/collab/:projectId` (shareable working view), `/view/:projectId` (gated client view), oEmbed endpoint (`api/oembed.js`).

---

## 4. Data Models & Schemas

> Note: `projects.id` is **TEXT** (not UUID); foreign keys to it are TEXT, and RPCs cast with `::TEXT` to stay compatible. The base `projects` table predates these migrations and is extended additively via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.

### `projects`
The central asset & configuration record (one row = one "round").

| Column | Type | Notes / Validation |
|--------|------|--------------------|
| `id` | TEXT (PK) | TEXT, not UUID |
| `name` | TEXT | Display name |
| `stage_url` | TEXT | R2 URL of the `.glb`/`.gltf` stage model |
| `video_url` | TEXT | Legacy single-media URL (reset to NULL on clone) |
| `media_playlist` | JSONB array | Clip objects: `{ url, thumbnailUrl, … }` |
| `camera_presets` | JSONB array | `{ id, name, position{x,y,z}, target{x,y,z} }` |
| `grid_cell_size` | numeric | Default 1 |
| `scene_config` | JSONB | Holds `customHdriUrl`, `versionStatus`, etc. |
| `group_id` | TEXT → `projects(id)` ON DELETE SET NULL | Stacking: links rounds of one project |
| `is_client_locked` | BOOLEAN, NOT NULL, default `false` | `true` → `/view/:id` 403s for anon |
| `embed_token` | UUID, UNIQUE, NOT NULL, default `gen_random_uuid()` | Opaque public embed segment |
| `embed_enabled` | BOOLEAN, NOT NULL, default `false` | Per-project embed switch (indexed) |
| `pov_height_offset` | DOUBLE PRECISION, NOT NULL, default `1.7` | POV eye height (meters) |
| `deleted_at` | TIMESTAMPTZ, default NULL | Soft-delete marker |
| `total_views` | INTEGER, NOT NULL, default 0 | Aggregate counter |
| `total_screenshots` | INTEGER, NOT NULL, default 0 | Aggregate counter |
| `total_camera_changes` | INTEGER, NOT NULL, default 0 | Aggregate counter |
| `total_clip_clicks` | INTEGER, NOT NULL, default 0 | Aggregate counter |
| `clip_popularity` | JSONB, NOT NULL, default `{}` | key → count |
| `camera_popularity` | JSONB, NOT NULL, default `{}` | key → count |
| `screenshot_hotspots` | JSONB, NOT NULL, default `{}` | key → count |

**RPCs:** `increment_project_stat`, `increment_project_jsonb_key`, `batch_increment_project_stats`, `clone_project(p_source_id, p_new_name)`, `can_safely_delete_storage(p_project_id)` (all `SECURITY DEFINER`).

### `presentation_versions`
Immutable client-facing snapshot per project.

| Column | Type | Notes |
|--------|------|------|
| `id` | UUID (PK), default `gen_random_uuid()` | |
| `project_id` | TEXT, NOT NULL → `projects(id)` ON DELETE CASCADE | |
| `version_number` | INTEGER, NOT NULL | Auto-incremented per project (advisory-lock guarded trigger) |
| `version_name` | TEXT, NOT NULL, default `''` | |
| `status` | TEXT, NOT NULL, default `'draft'` | **CHECK** ∈ `draft`, `published`, `archived` |
| `release_notes` | TEXT, NOT NULL, default `''` | |
| `snapshot_json` | JSONB, NOT NULL, default `{}` | Frozen client payload (see Snapshot below) |
| `version_token` | UUID, NOT NULL, default `gen_random_uuid()` | Rotated on `snapshot_json` change → optimistic lock |
| `superseded_by` | UUID → self, ON DELETE SET NULL | Lineage |
| `restored_from` | UUID → self, ON DELETE SET NULL | Restore lineage |
| `created_by` / `published_by` | TEXT, NOT NULL, default `''` | (+ `*_user_id` UUID variants used opportunistically) |
| `published_at` | TIMESTAMPTZ | |
| `created_at` / `updated_at` | TIMESTAMPTZ, NOT NULL, default NOW() | `updated_at` via trigger |

**Constraints/Indexes:** unique partial index `presentation_versions_one_published` (≤1 published per project); unique `(project_id, version_number)`; lookup indexes on `(project_id, created_at DESC)` and `(project_id, status, version_number DESC)`.

#### `snapshot_json` shape (JSDoc in `presentationVersions.js`)
```
SnapshotJson {
  schemaVersion: number          // current = 2
  projectName: string
  slides: Slide[]
  cameraPresets: CameraPreset[]
}

Slide {
  id, clipId, title, subtitle: string
  directorNote: string           // DEPRECATED (v1 compat)
  directorNoteVisible: boolean    // DEPRECATED (v1 compat)
  directorNotes: DirectorNote[]   // v2 replacement
  defaultCameraPresetId: string
  hiddenFromClient: boolean
  durationSeconds: number
  thumbnailUrl: string            // blob: URLs stripped on save
  references: SlideRef[]
  sortOrder: number
}

DirectorNote {
  id, text: string
  visibleToClient: boolean
  annotation: Annotation | null
  cameraPresetId: string
  clipTimeSeconds: number | null
  sortOrder: number
  createdAt, updatedAt: string
}

SlideRef { id, type('image'|'gif'|'link'), url, caption, visibleToClient, sortOrder }
CameraPreset { id, name, position{x,y,z}, target{x,y,z} }
Annotation { type('circle'|'region'), bounds{x,y,width,height}(0-1 normalized), viewport?{width,height} }
```

### `client_feedback_items`
One reviewer comment, with restoration context.

| Column | Type | Notes |
|--------|------|------|
| `id` | UUID (PK) | |
| `project_id` | TEXT, NOT NULL → `projects(id)` CASCADE | |
| `presentation_version_id` | UUID → `presentation_versions(id)` ON DELETE SET NULL | |
| `guest_id` | UUID → `presentation_guests(id)` ON DELETE SET NULL | Nullable (legacy anon rows) |
| `slide_id` / `clip_id` | TEXT, NOT NULL, default `''` | |
| `reviewer_name` | TEXT, NOT NULL, default `''` | |
| `comment` | TEXT, NOT NULL, default `''` | |
| `status` | TEXT, NOT NULL, default `'pending'` | **CHECK** ∈ `pending`, `resolved` |
| `clip_time_seconds` | FLOAT | Playback timestamp of the comment |
| `camera_snapshot_json` | JSONB | `{ presetId, name, position, target, fov }` |
| `annotation_json` | JSONB | `{ type, space, bounds, viewport }` |
| `admin_note` | TEXT, NOT NULL, default `''` | Admin-only, not client-visible |
| `resolved_at` | TIMESTAMPTZ | |
| `resolved_by` | TEXT, NOT NULL, default `''` | (+ `resolved_by_user_id` UUID, opportunistic) |
| `created_at` / `updated_at` | TIMESTAMPTZ, NOT NULL, default NOW() | |

**View:** `client_feedback_public` exposes a column subset to `anon`/`authenticated`, filtered to feedback whose version is **published**.
**Guest RPCs:** `submit_guest_feedback`, `update_guest_feedback`, `delete_guest_feedback`, `load_guest_feedback` (all guest-token + 30-day-expiry scoped, `SECURITY DEFINER`).

### `presentation_guests`
Soft identity for anonymous reviewers.

| Column | Type | Notes |
|--------|------|------|
| `id` | UUID (PK) | |
| `presentation_id` | TEXT, NOT NULL → `projects(id)` CASCADE | |
| `email` | TEXT, NOT NULL | Normalized lowercase; RFC-pattern validated in RPC |
| `name` | TEXT, NOT NULL | Length 1–100 validated |
| `guest_token` | UUID, NOT NULL, UNIQUE, default `gen_random_uuid()` | |
| `token_expires_at` | TIMESTAMPTZ, NOT NULL, default `NOW() + 30 days` | |
| `created_at` / `last_seen_at` | TIMESTAMPTZ, NOT NULL, default NOW() | |

**Constraint:** `UNIQUE(presentation_id, email)`. **RLS:** no direct anon access — all I/O via RPC; `service_role` full, `authenticated` read for owned projects.

### Analytics Tables
- **`visitor_logs`** — `id` UUID, `session_id` TEXT NOT NULL, `created_at`, `user_agent` TEXT, `page_visited` TEXT NOT NULL.
- **`interaction_events`** — `id` UUID, `session_id` TEXT NOT NULL, `event_type` TEXT NOT NULL, `event_detail` JSONB default `{}`, `created_at`.
- **`client_page_views`** — `id` UUID, `project_id` TEXT NOT NULL, `viewed_at` TIMESTAMPTZ.
- **`client_interactions`** — `id` UUID, `project_id` TEXT NOT NULL, `event_type` TEXT (`'clip_play'|'screenshot'|'camera_change'`), `event_key` TEXT, `created_at`.

**RLS pattern (all analytics):** `anon` may **INSERT** only; `authenticated` may **SELECT** only (`auth.role() = 'authenticated'`).

### Relationships (summary)
```
projects (1) ──< presentation_versions   (project_id, CASCADE)
projects (1) ──< client_feedback_items    (project_id, CASCADE)
projects (1) ──< presentation_guests      (presentation_id, CASCADE)
projects (1) ──< client_page_views / client_interactions (project_id)
projects.group_id ──> projects.id          (self-FK, project stacking / rounds, SET NULL)

presentation_versions (1) ──< client_feedback_items (presentation_version_id, SET NULL)
presentation_versions.superseded_by / .restored_from ──> presentation_versions.id (self-FK, SET NULL)

presentation_guests (1) ──< client_feedback_items (guest_id, SET NULL)
```
