# Stage Visualizer — Architecture Overhaul

## Executive Summary

This document covers:
1. **Multi-Round Versioning (Asset Soft-Clone)** — Shallow copy at DB level; safe delete with reference-awareness.
2. **Advanced Aggregate Tracking** — Batched TrackingService + backend upsert; fix metrics stuck at 0.

---

## Task 1: Multi-Round Versioning (Asset Soft-Clone)

### Current Flow

- **Clone** (`clone_project` RPC): Copies `stage_url`, `scene_config` (HDRI), `camera_presets`; resets `media_playlist` to `[]`, analytics to `{}`.
- **Delete** (`handleDelete`): Lists `projects/{project_id}/`, removes all files, then deletes the DB row.

### The "Mồi" — Delete Hazard

Round 2 clones Round 1. Round 2's `stage_url` and `scene_config.customHdriUrl` point to Round 1's storage paths:

- `projects/{round1_id}/stage.glb`
- `projects/{round1_id}/environment.hdr`

If Round 1 is deleted, `handleDelete` removes `projects/{round1_id}/` → Round 2's stage and HDRI break.

### Recommended Strategy: Reference-Aware Delete

**Option A — Soft Delete (recommended for NAS optimization)**

1. Add `deleted_at TIMESTAMPTZ` to `projects`.
2. Delete flow: Set `deleted_at = now()`, keep storage untouched.
3. Admin UI: Filter out `deleted_at IS NOT NULL` projects.
4. Cron job / manual cleanup: Identify orphaned storage paths (paths not referenced by any non-deleted project), then delete those files.

**Option B — Reference Check Before Hard Delete**

1. Before deleting project P's storage, query:
   ```sql
   SELECT id FROM projects WHERE id != :p_id
   AND (stage_url LIKE '%' || :p_id || '%'
        OR scene_config->>'customHdriUrl' LIKE '%' || :p_id || '%')
   ```
2. If any row exists → **do not delete storage**, only delete the DB row.
3. If no row → safe to delete storage (project-specific media) + optionally stage/HDRI.

**Option C — Reference-Count Table (for heavy reuse)**

Create `asset_references(project_id, storage_path, ref_count)` updated on clone/delete. Delete file only when `ref_count = 0`.

### Implementation Chosen: Option B (Reference Check)

- Minimal schema change (no new tables).
- Delete logic: Only delete storage if no other project references P's `stage_url` or `customHdriUrl`.
- Implemented via new RPC `can_safely_delete_storage(p_project_id UUID)` returning boolean, called from frontend before storage deletion.

---

## Task 2: Advanced Aggregate Tracking & Bug Fix

### Suspected Root Causes of 0-Value Bug

| Cause | Evidence | Fix |
|-------|----------|-----|
| **1. Fire-and-forget, no error surfacing** | `analyticsTracker` uses `.then().catch(() => {})` — errors swallowed | Await RPC, log failures, add retry |
| **2. Throttle / event storm** | No throttle on camera orbit; orbit could trigger many events | Batch events; debounce per key |
| **3. Payload mismatch** | RPC expects `p_project_id`, `p_stat_name` | Verified correct; add runtime validation |
| **4. RLS / anon** | Anon cannot UPDATE `projects` directly | RPC uses SECURITY DEFINER ✓ |

### New Goals

- Track **Most Viewed Media Clip ID** and **Most Captured Camera ID**.
- Existing JSONB columns `clip_popularity` and `camera_popularity` already support this: keys = clip name or ID, values = count.
- Use **clip.id** and **camera preset id/name** as keys for consistency.

### Solution Architecture

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────────┐
│ ClientPage /    │────▶│ TrackingService      │────▶│ Supabase RPC        │
│ CollabPage      │     │ (batch, debounce)    │     │ batch_upsert_stats   │
└─────────────────┘     └──────────────────────┘     └─────────────────────┘
```

- **TrackingService**: Queues events in memory, flushes every N ms or when queue reaches M items.
- **Backend**: New RPC `batch_increment_project_stats` accepts array of `{stat_name, jsonb_column, jsonb_key}` and applies all in one transaction.
- **Debounce**: For same `(projectId, column, key)` within 500ms, coalesce to single increment of N.

---

## File Mapping

| Component | File |
|-----------|------|
| Schema + RPCs | `supabase/project_stats_schema.sql` (extend) |
| Safe-delete RPC | `supabase/safe_delete_schema.sql` (new) |
| TrackingService | `src/lib/trackingService.js` (new) |
| useProjectStats | `src/hooks/useProjectStats.js` (wire to TrackingService) |
| Delete flow | `src/components/ProjectsDashboard.jsx` (use safe-delete) |
| Collab screenshot | `src/pages/CollabPage.jsx` (add incrementJsonb) |
