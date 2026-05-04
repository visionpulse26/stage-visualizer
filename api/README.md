# API: Presigned Upload URL (R2)

**Endpoint:** `POST /api/get-upload-url`

Returns a presigned PUT URL so the frontend can upload files directly to Cloudflare R2 (no 100MB proxy limit).

## Request headers

| Header | Required | Description |
|--------|----------|-------------|
| `Content-Type` | Yes | `application/json` |
| `x-upload-token` | No | Removed. Upload auth is now enforced server-side via request origin policy. |

## Request body

```json
{
  "filename": "video.mp4",
  "contentType": "video/mp4",
  "projectId": "optional-uuid-or-slug",
  "type": "media"
}
```

- `type`: `"media"` (video/image) or `"hdri"` (`.hdr`/`.exr`)

## Response

```json
{
  "putUrl": "https://...",
  "publicUrl": "https://your-r2-public.domain/path/to/key",
  "key": "projectId/media/1234567890_video.mp4"
}
```

- **putUrl**: Use with `PUT` and the raw file body (frontend uploads here).
- **publicUrl**: Save this in your DB (e.g. `media_playlist[].url`, `scene_config.customHdriUrl`). Must be the public base URL for your R2 bucket (custom domain or `*.r2.dev`).

## Environment variables (Vercel / backend)

| Variable | Description |
|----------|-------------|
| `R2_ACCOUNT_ID` | Cloudflare account ID (for R2 endpoint) |
| `R2_ACCESS_KEY_ID` | R2 API token access key |
| `R2_SECRET_ACCESS_KEY` | R2 API token secret |
| `R2_BUCKET` | Bucket name |
| `R2_PUBLIC_BASE_URL` | Public URL base for the bucket (e.g. `https://pub-xxx.r2.dev` or custom domain). Trailing slash optional. |
| `ALLOWED_UPLOAD_ORIGINS` | Optional allowlist (comma-separated origins). Example: `https://stage-visualizer.vercel.app,https://preview-stage.example.com`. If empty, same-host origin is allowed by default. |

## R2 CORS

Allow your app origin and `PUT` on the bucket:

- **Allowed origins:** your frontend origin (e.g. `https://your-app.vercel.app`)
- **Allowed methods:** `GET`, `PUT`, `HEAD`
- **Allowed headers:** `Content-Type`, `*` (or list explicitly)

See `r2-cors.example.json` in the repo root for a policy you can adapt in the Cloudflare R2 bucket **Settings → CORS**.

## Analytics cleanup (PRIV-02)

**Endpoint:** `GET` or `POST` `/api/cleanup-analytics`

Deletes rows older than **90 days** (override with `RETENTION_DAYS`, max 365) from:

`client_sessions` (`started_at`), `client_clip_watch`, `client_interactions`, `client_page_views` (`viewed_at`).

**Auth:** must be a Vercel Cron invocation (`x-vercel-cron: 1`) **or** `Authorization: Bearer <CRON_SECRET>` when `CRON_SECRET` is set in the project (manual runs and secured cron).

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes* | Same value as `VITE_SUPABASE_URL` if you do not set this separately. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role key from Supabase (never expose to the client). |
| `CRON_SECRET` | Recommended | Random string; Vercel injects `Authorization: Bearer …` on scheduled cron when this is set. |
| `RETENTION_DAYS` | No | Default `90`. |

Cron is declared in `vercel.json` (daily 03:00 UTC). On Supabase Pro you can instead use `pg_cron`; see `supabase/priv_02_cleanup_analytics.sql`.

## Vercel

The `api/` folder is deployed as serverless functions. Ensure env vars above are set in Vercel → Settings → Environment Variables.
