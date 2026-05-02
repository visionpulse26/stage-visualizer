# Local development (admin login + stage/media upload)

Use the git branch **`stage_beta_state`** for Epic / beta work. This doc lists everything needed so **Supabase auth**, **admin**, and **R2 uploads** work on your machine.

## Why not plain `npm run dev`?

`npm run dev` runs **Vite only**. Uploads call `POST /api/get-upload-url`, which is a **Vercel serverless function**. That route does not exist on the Vite dev server alone, so presigned uploads fail until you run the full stack.

**Use:**

```bash
npm install
npm run dev:local
```

This runs **`vercel dev`**, which serves the Vite app and the `api/` functions with the same origins your browser expects.

- Dev server port is **3000** (see `vite.config.js`). Open **http://localhost:3000**.

First time on a machine you may need to link the folder to your Vercel project (CLI will prompt), or rely on **`.env.local`** alone if your team uses env files without linking.

## Environment variables

1. Copy the template:

   ```bash
   cp .env.example .env.local
   ```

2. Fill **`.env.local`** (never commit it):

   | Variable | Purpose |
   |----------|---------|
   | `VITE_SUPABASE_URL` | Supabase project URL |
   | `VITE_SUPABASE_ANON_KEY` | Supabase anon (public) key |
   | `VITE_UPLOAD_SECRET` | Sent as `x-upload-token` from the browser |
   | `UPLOAD_SECRET` | **Same string** as `VITE_UPLOAD_SECRET` — validated in `api/get-upload-url.js` |
   | `R2_*` | Cloudflare R2 credentials and public base URL for your bucket |

   Use the **same Supabase project** as production/staging if you already have admin users and data, or a **separate Supabase project** for isolation (create users there).

3. Optional: **`VITE_APP_URL=http://localhost:3000`** if you need a fixed origin (usually unnecessary; the app defaults to `window.location.origin`).

## R2 CORS for localhost

Direct `PUT` uploads to R2 require the bucket CORS policy to allow your dev origin. Include **http://localhost:3000** (and optionally **http://localhost:5173** if you ever change the Vite port) in **AllowedOrigins**. See `r2-cors.example.json` in the repo root and paste an adapted policy in **Cloudflare → R2 → bucket → Settings → CORS**.

## Sanity checks

- **Login:** `/admin` should load after Supabase email magic link or your configured auth.
- **Upload:** Browser network tab should show `POST /api/get-upload-url` → `200`, then `PUT` to `*.r2.cloudflarestorage.com` or your public URL.

## Scripts reference

| Script | What it runs |
|--------|----------------|
| `npm run dev` | Vite only — fast UI work, **uploads will not work** |
| `npm run dev:local` | Vite + `/api/*` via Vercel dev — **use this for full local parity** |
| `npm run build` / `npm run preview` | Production build / static preview (no local API unless proxied) |

## Deploy branch

Pushing **`stage_beta_state`** to GitHub does not change production until you merge to **`main`** (Vercel deploys from `main` per project rules). Use this branch for POV / beta features without affecting the live site.
