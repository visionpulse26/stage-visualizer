# Chạy local (admin + upload)

Tài liệu chia hai phần: **(A) làm trên máy** và **(B) chỉ hướng dẫn trên dashboard** — không thay thế việc bạn đăng nhập Cloudflare / Vercel / Supabase.

---

## A — Trên máy (repo + terminal)

Làm lần lượt:

1. **Nhánh có đủ script** (nếu bạn dùng nhánh beta):

   ```bash
   git fetch origin && git checkout stage_beta_state
   ```

2. **Cài package:**

   ```bash
   npm install
   ```

3. **Tạo `.env.local` từ mẫu** (chỉ tạo nếu chưa có file):

   ```bash
   npm run setup:local
   ```

4. **Mở `.env.local`** và điền giá trị thật. Bạn lấy từng giá trị theo mục B bên dưới (Supabase, R2). Upload API không dùng `VITE_UPLOAD_SECRET`; frontend phải có Supabase session và gửi bearer token.

5. **Chạy app** — một trong hai:

   - **`npm run dev`** (mặc định): Vite port 3000 + middleware chạy toàn bộ handler trong `api/**/*.js` (upload, admin scan, v.v.) miễn là biến môi trường trong `.env.local` đã đủ.

   - **`npm run dev:local`**: `vercel dev` nếu bạn muốn môi trường giống production Vercel tuyệt đối.

6. Mở **http://localhost:3000** — port cố định trong `vite.config.js`.

   **Service role (admin data):** để trang `/admin/data` scan đủ và cho phép xóa/restore project, thêm `SUPABASE_SERVICE_ROLE_KEY` vào `.env.local` (lấy từ Supabase → Settings → API → *service_role* secret). `vercel dev` và Vite middleware đều đọc biến này từ file env local.

   Nếu đã thêm mà banner vẫn báo thiếu key: **restart `vercel dev`**. Code server còn đọc trực tiếp `.env.local` ở root repo khi chạy local để bù trường hợp CLI không inject secret vào function.

**Lần đầu `vercel dev`:** CLI có thể hỏi **link** tới project Vercel; chọn đúng repo hoặc bỏ qua nếu env đã đủ trong `.env.local`.

| Script | Khi nào dùng |
|--------|----------------|
| `npm run setup:local` | Tạo `.env.local` lần đầu |
| `npm run dev:local` | Dev đầy đủ (UI + `POST /api/get-upload-url`) |
| `npm run dev` | UI + `/api/*` (Vite middleware chạy các file trong `api/`, giống Vercel) |

**Nếu Network báo 404 cho `/@vite/client` hoặc `/src/main.jsx`:** nguyên nhân thường là rewrite SPA kiểu `"/(.*)" → /index.html` khiến `vercel dev` trả HTML thay cho module Vite. Repo này dùng rewrite **theo từng route** (`/admin`, `/privacy`, `/collab/...`, `/view/...`) để tránh lỗi đó. Trên production, URL lạ không thuộc các route đó có thể thành **404 của Vercel** (không còn fallback React `*`).

---

## B — Chỉ làm trên dashboard (cloud)

### B1 — Supabase

1. **Project → Settings → API**
   - Copy **Project URL** → `VITE_SUPABASE_URL`
   - Copy **anon public** key → `VITE_SUPABASE_ANON_KEY`

2. **Authentication → URL configuration** (nếu dùng magic link / OAuth):
   - **Site URL** có thể là production hoặc `http://localhost:3000` khi chỉ dev local.
   - **Redirect URLs:** thêm `http://localhost:3000/**` (hoặc đường dẫn callback mà Supabase yêu cầu) để link đăng nhập không bị chặn khi chạy local.

3. Dùng **cùng project** với production để có sẵn user/project trong DB, hoặc project riêng cho dev (tạo user admin mới ở đó).

---

### B2 — Cloudflare R2

1. **R2 → bucket** dùng cho asset (cùng bucket prod hoặc bucket dev).

2. **Settings → CORS policy:** cho phép origin dev, ví dụ thêm vào **Allowed Origins**:
   - `http://localhost:3000`
   - (tuỳ chọn) `http://localhost:5173` nếu sau này đổi port Vite  
   Mẫu JSON: xem `r2-cors.example.json` ở root repo — chỉnh thêm domain production của bạn.

3. **R2 API token** (hoặc S3-compatible credentials) để điền:
   - `R2_ACCOUNT_ID`
   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`
   - `R2_BUCKET`
   - `R2_PUBLIC_BASE_URL` — URL public của bucket (ví dụ `https://pub-xxxxx.r2.dev`, không có `/` cuối).

---

### B3 — Vercel (deploy production, không bắt buộc cho dev thuần local)

Khi deploy từ `main`, trong **Project → Settings → Environment Variables** cần (tối thiểu cho app + upload):

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only, dùng cho API upload kiểm tra owner project)
- Toàn bộ `R2_*` như trong `.env.example`

Cron / analytics (nếu dùng): `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, v.v. — xem `api/README.md`.

---

## Kiểm tra nhanh

- **`/admin`** mở được sau khi đăng nhập.
- DevTools → **Network:** `POST .../api/get-upload-url` → **200**, sau đó **PUT** tới R2.

---

## Nhánh deploy

Làm feature beta trên **`stage_beta_state`**; production Vercel thường gắn **`main`** — merge khi sẵn sàng.
