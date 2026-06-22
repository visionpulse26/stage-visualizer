---
title: System Protocols
type: protocol
tags: [protocol, rls, rpc, realtime, supabase, r2, analytics, stage-visualizer]
related: ["[[01_Product/Core_Concept]]", "[[02_Architecture/System_Architecture]]"]
---

# Stage Visualizer — System Protocols

> Extracted strictly from source: `supabase/rls_policies.sql`, `supabase/presentation_versions_rls_v3.sql`, `supabase/presentation_version_lifecycle_rpc.sql`, `supabase/project_stats_schema.sql`, `supabase/presentation_guests_migration.sql`, `src/hooks/useCollaborativeEditing.js`, `src/hooks/usePresenceChannel.js`, `src/hooks/useVersionWatcher.js`, `src/lib/trackingService.js`, and `api/get-upload-url.js` / `api/get-snapshot-url.js` / `api/admin/*`.

---

## 1. Database RPC & RLS Protocols

There are **two RLS regimes** in the repository. `presentation_versions_rls_v3.sql` is the hardened, owner-scoped successor that **drops and replaces** the policies from `rls_policies.sql` and adds `projects.owner_id UUID DEFAULT auth.uid()`. Both are documented; v3 is authoritative where applied. See [[01_Product/Core_Concept#2. Target Users|Target Users]] for the role definitions these policies enforce.

### `projects`

**Baseline (`rls_policies.sql`):** RLS enabled.
| Policy | Command | Predicate |
|--------|---------|-----------|
| `projects_select_public` | SELECT | `USING (true)` — anyone (client/collab load) |
| `projects_insert_authenticated` | INSERT | `WITH CHECK (auth.role() = 'authenticated')` |
| `projects_update_authenticated` | UPDATE | `USING/CHECK (auth.role() = 'authenticated')` |
| `projects_delete_authenticated` | DELETE | `USING (auth.role() = 'authenticated')` |

**Hardened v3 (`presentation_versions_rls_v3.sql`):** the four baseline policies are `DROP`ed; `REVOKE ALL ... FROM anon`; anon read is moved to two sanitizing **views** instead of the base table:
- `projects_public` — columns subset, `scene_config` passed through `sanitize_public_scene_config()` (strips keys matching `^_private`), filtered to `embed_enabled = true`.
- `projects_client_public` — same column/sanitize subset, **no** `embed_enabled` filter (client `/view` path).
- Authenticated access becomes **owner-scoped**: `projects_auth_owner_{select,insert,update,delete}` all gate on `owner_id = auth.uid()`.

> ⚠️ Code/schema tension: `AdminPage.handlePublish` writes via `supabase.from('projects').upsert(...)` from the browser (see [[02_Architecture/System_Architecture#Stage model + full save (AdminPage.handlePublish)|publish flow]]). Under v3 owner-scoping the row's `owner_id` must equal `auth.uid()` (column default supplies it on INSERT); rows with NULL `owner_id` become inaccessible to authenticated mutations. `api/get-upload-url.js` separately notes it treats `owner_id` as "never migrated" and accepts any signed-in user.

### `presentation_versions`
- **Baseline:** `anon read presentation_versions` (SELECT, `USING true`); `auth all presentation_versions` (ALL, `USING/CHECK true`).
- **v3:** replaced by `anon_read_published_versions_for_public_projects` (anon SELECT only where `status = 'published'` and the parent project exists) and `auth_owner_all_presentation_versions` (ALL where parent `projects.owner_id = auth.uid()`). `GRANT SELECT ... TO anon`. See [[01_Product/Core_Concept#`presentation_versions`|presentation_versions schema]].

### `client_feedback_items`
- **Baseline:** anon `SELECT / INSERT / UPDATE / DELETE` all `USING/CHECK true`; `auth all` ALL.
- **v3:** all anon direct grants `REVOKE`d; anon reads only the `client_feedback_public` **view** (rows whose `presentation_version_id` is a **published** version). Authenticated access via `auth_owner_all_client_feedback_items` (owner-scoped). All anon writes funnel through guest RPCs (below). See [[01_Product/Core_Concept#`client_feedback_items`|feedback schema]].

### `presentation_guests`
- RLS enabled; **`REVOKE ALL FROM anon AND authenticated`** — no direct table access at all. Service role: full. Authenticated: read-only for owned projects (baseline migration). Every guest operation is mediated by a `SECURITY DEFINER` RPC. See [[01_Product/Core_Concept#`presentation_guests`|guests schema]].

### Key `SECURITY DEFINER` RPCs

**Stat increments (`project_stats_schema.sql`)** — granted to `anon` + `authenticated`:
| RPC | Params | Behavior |
|-----|--------|----------|
| `increment_project_stat` | `(p_project_id UUID, p_stat_name TEXT)` | `+1` to one of `total_views \| total_screenshots \| total_camera_changes \| total_clip_clicks`; unknown names no-op. |
| `increment_project_jsonb_key` | `(p_project_id UUID, p_column TEXT, p_key TEXT)` | `+1` to a key inside `clip_popularity \| camera_popularity \| screenshot_hotspots`; rejects other columns / empty keys. |
| `batch_increment_project_stats` | `(p_project_id UUID, p_ops JSONB)` | Iterates an ops array `[{type:'stat',stat_name} \| {type:'jsonb',column,key}]`; the primary path used by [[#4. Analytics Telemetry Protocol|TrackingService]]. |
| `clone_project` | `(p_source_id UUID, p_new_name TEXT)` | Duplicates source row → new UUID; reuses `stage_url`/HDRI, **resets** `media_playlist`/stats, joins `group_id = COALESCE(src.group_id, src.id)`, blanks `scene_config.versionStatus`. Granted anon + authenticated. |
| `can_safely_delete_storage` | `(p_project_id UUID) → BOOLEAN` | TRUE only when no *other* project's `stage_url`/`customHdriUrl` references this project's folder. authenticated only. |

**Guest feedback RPCs (`presentation_guests_migration.sql`, re-defined in v3)** — granted anon + authenticated, all token-gated (`token_expires_at > NOW()`):
| RPC | Params | Behavior / Guards |
|-----|--------|-------------------|
| `upsert_guest` | `(p_presentation_id TEXT, p_email TEXT, p_name TEXT) → JSONB` | Normalizes/validates email (regex) + name (1–100 chars); requires project to exist. New → insert; returning → refresh `last_seen_at`/`token_expires_at` (+30 days). Returns `{is_new,id,name,email,guest_token,token_expires_at}`. (Migration variant keeps stored name on return; v3 variant overwrites name.) |
| `lookup_guest` | `(p_presentation_id TEXT, p_email TEXT) → JSONB` | Email-only return-login; raises `guest_not_found` if unknown. |
| `submit_guest_feedback` | `(p_guest_token UUID, p_presentation_version_id UUID, p_slide_id TEXT, p_clip_id TEXT, p_clip_time_seconds DOUBLE PRECISION, p_camera_snapshot_json JSONB, p_annotation_json JSONB, p_reviewer_name TEXT, p_comment TEXT) → client_feedback_items` | Validates token + that the version is **published** & belongs to the guest's project; inserts row with `guest_id`, `status='pending'`, falling back `reviewer_name → guest.name`; bumps `last_seen_at`. Raises `guest_token_invalid` / `presentation_version_not_available`. |
| `update_guest_feedback` | `(p_guest_token UUID, p_feedback_id UUID, p_comment TEXT)` | Updates `comment` **only** on rows where `guest_id = guest.id`; raises `feedback_not_found` otherwise. |
| `delete_guest_feedback` | `(p_guest_token UUID, p_feedback_id UUID)` | Deletes only own (`guest_id`) row; raises `feedback_not_found`. |
| `load_guest_feedback` | `(p_guest_token UUID, p_project_id TEXT, p_slide_id TEXT=NULL, p_status TEXT=NULL, p_presentation_version_id UUID=NULL) → TABLE(...)` | Returns published-version feedback for the project with a computed `can_edit = (guest_id = guest.id)`; raises `guest_project_mismatch` on token/project mismatch. |
| `resolve_embed_project` (v3) | `(p_token TEXT) → SETOF projects_public` | Maps opaque `embed_token` → sanitized public project where `embed_enabled = true`. anon + authenticated. |

**Version lifecycle RPCs (`presentation_version_lifecycle_rpc.sql`)** — granted `authenticated` only; each takes `PERFORM pg_advisory_xact_lock(hashtext(p_project_id))` to **serialize per project** and enforces optimistic locking via `p_expected_token` (raises `version_conflict` on mismatch). Surfaced to the client through `src/lib/presentationVersions.js`:
| RPC | Params | Behavior |
|-----|--------|----------|
| `save_draft_version` | `(p_project_id TEXT, p_snapshot_json JSONB, p_version_name TEXT='', p_release_notes TEXT='', p_expected_token UUID=NULL, p_created_by TEXT='')` | Updates existing draft (token-checked) or inserts a new `draft`. |
| `publish_presentation_version` | `(p_project_id TEXT, p_snapshot_json JSONB, p_version_name='', p_release_notes='', p_expected_token UUID=NULL, p_published_by TEXT='', p_created_by TEXT='')` | Archives current `published` (sets `superseded_by`), promotes draft → `published` with `published_at=NOW()`, or inserts a published row directly. |
| `discard_draft_version` | `(p_project_id TEXT)` | Deletes the project's `draft` row. |
| `restore_presentation_version` | `(p_project_id TEXT, p_source_version_id UUID, p_created_by TEXT='')` | Archives any existing draft, inserts a new `draft` cloned from source with `restored_from = source.id`; raises `source_version_not_found`. |
| `assign_presentation_version_number` (trigger) | — | BEFORE INSERT: advisory-locks per project, sets `version_number = MAX+1`. Backed by unique index `(project_id, version_number)`. |

---

## 2. Realtime Communication Protocol

Three Supabase Realtime channels, all keyed by `projectId`, established/torn down in `src/hooks/`.

### a) Collaborative editing — broadcast (`useCollaborativeEditing.js`)
- **Channel:** `` `collab:presentation:${projectId}` ``
- **Event:** `slide_op` (broadcast type).
- **Envelope:** `{ by: userInfo.userId, op: <operation> }` sent via `channel.send({ type: 'broadcast', event: 'slide_op', payload })`.
- **Loopback mitigation:** on receive, `if (payload?.by === userInfo?.userId) return` — the sender ignores its own echoed messages by matching `by` against the local `userId`. Only `payload.op` is forwarded to `onApplyOp`.
- **Operation payloads** (emitted from `PresentationEditorPage.jsx`):
  | `op.type` | Shape |
  |-----------|-------|
  | `slide_update` | `{ type, slideId, patch }` |
  | `slide_add` | `{ type, slide }` · or `{ type, slide, clip }` · or `{ type, slide, afterId }` |
  | `slide_delete` | `{ type, slideId }` |
  | `slide_reorder` | `{ type, dragId, dropId }` |
- **Subscription dependency:** effect re-subscribes only on `[projectId, userInfo?.userId]` (display-name changes intentionally do **not** re-subscribe).

### b) Presence — who is editing (`usePresenceChannel.js`)
- **Channel:** `` `presence:presentation:${projectId}` `` with `config: { presence: { key: userInfo.userId } }`.
- **Tracked state** (on `SUBSCRIBED`, via `channel.track`): `{ userId, email, displayName, joinedAt: ISOString }`.
- **Sync:** on `presence` `sync` event, `presenceState()` (shape `{ [key]: [payload] }`) is flattened with `Object.values(state).flat()` into `presenceList`.
- **Teardown:** `channel.untrack()` + `removeChannel` on unmount; presence key = `userId` deduplicates a user's own tabs.

### c) Version watcher — Postgres CDC (`useVersionWatcher.js`)
- **Channel:** `` `db:presentation_versions:${projectId}` ``.
- **Subscription:** `postgres_changes`, `{ event: 'UPDATE', schema: 'public', table: 'presentation_versions', filter: 'project_id=eq.${projectId}' }`.
- **Trigger condition:** fires `onRemoteSave(payload.new)` **only when** `newRow.version_token !== tokenRef.current` (the locally loaded token, held in a ref so the callback always sees the latest without re-subscribing). This is the realtime counterpart to the optimistic-lock `version_conflict` (see [[#1. Database RPC & RLS Protocols|lifecycle RPCs]]).

---

## 3. Storage (R2) Key & Validation Protocols

Asset bytes are signed and PUT directly to R2; see [[02_Architecture/System_Architecture#Data Flow Pipeline (Upload & CDN)|Data Flow Pipeline]]. Key generation and the validation gate live in `api/get-upload-url.js`.

### Key naming conventions (`sanitizeKey`)
- `safeProject = projectId.replace(/[^a-zA-Z0-9_-]/g, '_')` (defaults to `default`).
- `base = filename.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.{2,}/g, '.')` ; `ts = Date.now()`.

| `type` | Generated key | Bucket |
|--------|---------------|--------|
| `stage` | `{safeProject}/stage/{ts}_{base}` | public (`R2_BUCKET`) |
| `hdri` | `{safeProject}/hdri/{ts}_{base}` | public |
| `media` | `{safeProject}/media/{ts}_{base}` | public |
| `snapshot` | `{safeProject}/feedback-snapshots/{ts}_{randomSuffix()}_{base}` | `R2_PRIVATE_BUCKET` if set, else public |

- `randomSuffix()` = 16-hex from `crypto.randomUUID()` (anti-enumeration for snapshots).
- Public URL = `` `${R2_PUBLIC_BASE_URL}/${key}` `` (null for private-bucket snapshots → fetched via `/api/get-snapshot-url`).

### Server-side validation matrix (gate before signing)
Each request must pass MIME **and** extension **and** byte checks for its `type`:

| `type` | Allowed MIME (`ALLOWED_MIME`) | Allowed extensions (`ALLOWED_EXTENSIONS`) | Max bytes (`MAX_BYTES`) |
|--------|-------------------------------|--------------------------------------------|--------------------------|
| `stage` | `model/gltf-binary`, `model/gltf+json`, `application/octet-stream` | `.glb`, `.gltf` | `200 * 1024 * 1024` (200 MB) |
| `hdri` | `image/x-hdr`, `image/vnd.radiance`, `image/hdr`, `application/octet-stream` | `.hdr`, `.exr` | `80 * 1024 * 1024` (80 MB) |
| `snapshot` | `image/webp`, `image/png`, `image/jpeg` | `.webp`, `.png`, `.jpg`, `.jpeg` | `4 * 1024 * 1024` (4 MB) |
| `media` | `image/png`, `image/jpeg`, `image/webp`, `image/gif`, `video/mp4`, `video/webm`, `video/quicktime`, `video/mov`, `application/octet-stream` | `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, `.mp4`, `.webm`, `.mov` | `500 * 1024 * 1024` (500 MB) |

**Additional rules:**
- `media` **images** are held to `MAX_IMAGE_BYTES = 25 * 1024 * 1024` (25 MB); `application/octet-stream` of unknown type is treated as video (conservative, 500 MB).
- `application/octet-stream` is accepted only if the **extension** is on the allowlist (handles `.mov` with no browser MIME).
- Request body capped at `1mb` (`config.api.bodyParser.sizeLimit`); `contentLength` must be a finite positive number.
- Presigned PUT `expiresIn = 300` seconds. Auth: `Authorization: Bearer <JWT>` re-verified by `supabase.auth.getUser` (401 if absent/invalid). `type` ∉ set → 400.

### Signed-read & admin storage routes
- `GET /api/get-snapshot-url?key=` — private snapshots only. Rejects keys with `..`/`\0`; derives `projectId` from `^([\w-]+)/feedback-snapshots/`; authorizes via service-role lookup `projects.owner_id === user.id`; mints a 300s signed GET. Returns 503 if `R2_PRIVATE_BUCKET` unset.
- `GET /api/admin/r2-objects?prefix=` — authenticated admin; normalizes prefix (`[^a-zA-Z0-9_/-]` → `_`, trailing `/`); paginates `ListObjectsV2` → `{key,size,lastModified}[]`.
- `POST /api/admin/delete-r2` `{ keys: string[] }` — authenticated admin; `isAllowedKey` requires `^([a-zA-Z0-9_-]+)/(.+)$`, length 3–2048, no `..`/leading `/`; deletes in chunks of 1000 (`DeleteObjectsCommand`); returns `{ deleted, failed[] }` (policy-rejected keys reported as failures).

---

## 4. Analytics Telemetry Protocol

Defined in `src/lib/trackingService.js` — a client-side queue that batches engagement events into the stat RPCs (see [[#1. Database RPC & RLS Protocols|RPC table]]). Anon may only INSERT analytics; see [[01_Product/Core_Concept#Engagement Analytics (analytics_schema.sql, client_page_views_schema.sql, project_stats_schema.sql)|Engagement Analytics]].

### Timing & batching constants
| Constant | Value | Role |
|----------|-------|------|
| `FLUSH_INTERVAL_MS` | `800` | Delay before a scheduled flush runs (`scheduleFlush` → `setTimeout(doFlush, 800)`). |
| `FLUSH_MAX_ITEMS` | `10` | Max queue items drained per flush (`queue.splice(0, 10)`); leftovers reschedule. |
| `DEBOUNCE_MS` | `400` | Coalescing window — repeat events for the same key within 400 ms bump `count` instead of enqueuing a new op. |

### Validation sets (reject silently if not a member)
- `VALID_STATS = { total_views, total_screenshots, total_camera_changes, total_clip_clicks }`
- `VALID_JSONB = { clip_popularity, camera_popularity, screenshot_hotspots }`

### Public API
- `trackStat(projectId, statName)` → `enqueue(projectId, 'stat', statName)`.
- `trackJsonb(projectId, columnName, key)` → trims `key`; ignored if empty.
- `flushNow()` → cancels timer and forces `doFlush()` (used before page unload).

### Coalescing & queue key
- `queueKey`: stats → `` `${projectId}|stat|${statName}|` ``; jsonb → `` `${projectId}|jsonb|${column}|${key}` ``.
- Within `DEBOUNCE_MS` and a non-empty queue, an existing matching op has its `count` incremented; `lastSent` map tracks per-key last flush time.

### Flush payload structure → `batch_increment_project_stats`
`doFlush` groups drained items **by `projectId`**, expands each item's `count` into individual ops, and calls one RPC per project:
```js
supabase.rpc('batch_increment_project_stats', {
  p_project_id: <projectId>,
  p_ops: [
    { type: 'stat', stat_name: 'total_views' },          // × count
    { type: 'jsonb', column: 'clip_popularity', key: '<clipId|name>' }, // × count
    // …
  ],
})
```
**Failure fallback:** if the batch RPC errors, each op is retried individually via `increment_project_stat` (`p_project_id`, `p_stat_name`) or `increment_project_jsonb_key` (`p_project_id`, `p_column`, `p_key`). All errors are swallowed with `console.warn` (fire-and-forget, non-blocking). If `queue.length > 0` after a flush, another flush is scheduled.
