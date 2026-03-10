# Signed URLs for Asset Protection

This guide explains how to replace static public URLs with short-lived signed URLs to prevent hotlinking and sharing of proprietary assets.

## Current vs. Target Architecture

| Current | Target |
|---------|--------|
| `stage_url`, `customHdriUrl`, `media_playlist[].url` store full public URLs | Store **storage paths** (e.g. `projects/{id}/stage.glb`) |
| Client receives permanent URLs in API response | Backend generates signed URLs (exp 15–30 min) when serving project data |
| URLs can be shared or reused indefinitely | URLs expire; sharing pastes stop working |

---

## Schema Changes

### Option A: Store Paths Only (Recommended)

Add columns or use conventions for internal paths:

```sql
-- projects table
ALTER TABLE projects ADD COLUMN IF NOT EXISTS stage_storage_path TEXT;
-- e.g. 'projects/abc123/stage.glb'

-- scene_config JSONB: change customHdriUrl to customHdriPath
-- e.g. { "customHdriPath": "projects/abc123/env.hdr" }

-- media_playlist: change url to storage_path for Supabase-backed items
-- { "storage_path": "projects/abc123/media/0_clip.mp4", "external": false }
```

Keep `stage_url` / `customHdriUrl` for backward compatibility, but **don't expose them** to the client. Expose only signed URLs derived from paths.

### Option B: Keep Current Columns, Resolve at Serve Time

Keep `stage_url`, `customHdriUrl`, etc. as-is. If they point to Supabase Storage public URLs:

- Parse the path from the URL (e.g. extract `projects/...` from `https://...supabase.co/storage/v1/object/public/projects/...`)
- Generate a signed URL from that path
- Return the signed URL in the API response instead of the original

---

## Backend Implementation

### Supabase Edge Function (Recommended)

Create an Edge Function that:

1. Fetches project data from `projects`
2. For each asset (stage, HDRI, media items), resolves the storage path
3. Calls Supabase `storage.from('bucket').createSignedUrl(path, expiresIn)` (e.g. 1800 seconds = 30 min)
4. Returns project data with signed URLs in place of raw paths/URLs

**Example (pseudo-code):**

```ts
// supabase/functions/get-project-with-signed-urls/index.ts
const { data: project } = await supabase
  .from('projects')
  .select('*')
  .eq('id', projectId)
  .single()

if (project.stage_storage_path) {
  const { data } = await supabase.storage
    .from('projects')
    .createSignedUrl(project.stage_storage_path, 1800)
  project.stage_url = data?.signedUrl ?? project.stage_url
}

// Similar for customHdriPath, media_playlist[].storage_path
return new Response(JSON.stringify(project), { headers: { 'Content-Type': 'application/json' } })
```

### Alternative: PostgreSQL Function + Supabase Storage RPC

Supabase does not support `createSignedUrl` from PostgreSQL. Use an Edge Function or a separate API (e.g. Next.js API route, serverless function) to:

1. Receive project ID
2. Load project
3. Generate signed URLs for each asset path
4. Return project with signed URLs

---

## Frontend Integration

1. **Client/Collab**: Call the new API (e.g. `GET /functions/v1/get-project-with-signed-urls?projectId=xxx`) instead of querying `projects` directly.
2. **Blob routing**: Continue using `fetchAndCacheAsset()` / `fetchAsBlobUrlWithCache()` on the signed URLs. The signed URL is never passed to `<img>`, `<video>`, or TextureLoader; only the resulting `blob:` URL is used.
3. **Refresh on expiry**: Signed URLs expire. If the user keeps the page open for 30+ minutes, subsequent loads will need a fresh project fetch (new signed URLs). The existing loading flow already refetches on project change; consider a periodic refresh or “session validity” window.

---

## Migration Steps

1. Add `stage_storage_path` (or equivalent) to schema; backfill from existing `stage_url` by parsing paths.
2. Update Admin publish flow to save storage paths instead of (or in addition to) public URLs.
3. Create Edge Function or API route for project fetch with signed URL resolution.
4. Point Client/Collab to the new endpoint.
5. Optionally remove or deprecate public access on the storage bucket; serve only via signed URLs.
