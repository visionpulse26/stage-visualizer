# API: Presigned Upload URL (R2)

**Endpoint:** `POST /api/get-upload-url`

Returns a presigned PUT URL so the frontend can upload files directly to Cloudflare R2 (no 100MB proxy limit).

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

## R2 CORS

Allow your app origin and `PUT` on the bucket:

- **Allowed origins:** your frontend origin (e.g. `https://your-app.vercel.app`)
- **Allowed methods:** `GET`, `PUT`, `HEAD`
- **Allowed headers:** `Content-Type`, `*` (or list explicitly)

## Vercel

The `api/` folder is deployed as serverless functions. Ensure env vars above are set in Vercel → Settings → Environment Variables.
