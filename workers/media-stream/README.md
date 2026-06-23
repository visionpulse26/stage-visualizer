# media-stream Worker

Signed, Range-capable streaming proxy in front of the R2 media bucket. Lets
`<video src>` stream video directly (HTTP Range → 206) instead of the app
downloading the whole file into a blob before playback.

## How it fits together

```
ClientPage/Embed/Collab  ──POST /api/get-stream-token──▶  Vercel (HMAC sign)
        │                                                   token = exp.hmacHex
        ▼
  <video src="https://media.<domain>/v/<key>?t=<token>">
        │  Range: bytes=0-
        ▼
  media-stream Worker ──verify token──▶ R2 binding (range read) ──206──▶ browser
```

- Token is bound to the project: `projectId = key.split('/')[0]`, signed as
  `HMAC-SHA256(secret, "<projectId>:<exp>")`. A token for project A cannot stream
  project B's objects. Must match `signStreamToken` in
  [`api/get-stream-token.js`](../../api/get-stream-token.js) (cross-checked by
  `src/worker.test.js`).
- Images are **not** served here — they keep the app's blob loader (IP
  protection). Only video playback uses this Worker.

## Deploy

```bash
cd workers/media-stream
# 1. edit wrangler.toml: bucket_name, routes pattern/zone (or use a Custom Domain)
wrangler secret put MEDIA_STREAM_SECRET   # same value as Vercel env MEDIA_STREAM_SECRET
wrangler deploy
```

Then set the app env:

- `VITE_MEDIA_STREAM_BASE = https://media.<domain>` (public; inlined into bundle)
- `MEDIA_STREAM_SECRET = <same secret>` on Vercel (server-only — NOT a VITE_ var)

Until `VITE_MEDIA_STREAM_BASE` and the Vercel secret are set, the app falls back
to the existing blob loader automatically — deploy order is safe.

## Caching

Responses set `Cache-Control: public, max-age=31536000, immutable` (keys are
timestamped, so bytes never change). Edge-caching of partial (Range) responses
relies on Cloudflare's tiered cache on the custom domain. A future optimization
can add an explicit token-stripped Cache API key; correctness/streaming does not
depend on it.

## Local test

```bash
node --test workers/media-stream/src/worker.test.js   # token verify + range parsing
wrangler dev                                           # needs a real R2 binding
```
