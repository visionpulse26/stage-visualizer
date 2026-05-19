# Admin Data Control Panel — Implementation Plan

> **Mục tiêu**: Trang quản trị tập trung để scan, kiểm soát và dọn dẹp toàn bộ data (Supabase + R2) trước khi hệ thống trở nên quá phức tạp để kiểm soát thủ công.

---

## Bối cảnh & Gap hiện tại

| Entity | Nơi lưu | Ghi chú |
|---|---|---|
| Projects | Supabase `projects` | Soft-delete qua `deleted_at` |
| Stage models (.glb) | R2 `{id}/stage/` | URL lưu trong `projects.stage_url` |
| HDRI | R2 `{id}/hdri/` | URL lưu trong `scene_config.customHdriUrl` |
| Media playlist | R2 `{id}/media/` | Array lưu trong `projects.media_playlist` |
| Analytics | 6 Supabase tables | Gắn theo `project_id` |

**Gap nguy hiểm nhất**: Không có R2 delete endpoint — khi project bị soft-delete, files vẫn còn nguyên trên R2 chiếm dung lượng mãi mãi.

---

## Phase 1 — Backend: R2 List & Delete API

### `api/admin/r2-objects.js`

`GET /api/admin/r2-objects?prefix={projectId}`

Dùng AWS SDK `ListObjectsV2Command` để scan thực tế file trên R2.

```json
// Response
[
  { "key": "abc123/stage/model.glb", "size": 4820000, "lastModified": "2026-03-01T..." },
  { "key": "abc123/media/0_intro.mp4", "size": 120000000, "lastModified": "..." }
]
```

### `api/admin/delete-r2.js`

`POST /api/admin/delete-r2`

```json
// Request
{ "keys": ["projectId/stage/file.glb", "projectId/media/intro.mp4"] }

// Response
{ "deleted": ["..."], "failed": ["..."] }
```

- Dùng `DeleteObjectsCommand` (batch tối đa 1000 keys/request)
- Auth guard: chỉ authenticated Supabase session

---

## Phase 2 — Backend: Orphan Scanner

### `api/admin/scan.js`

`GET /api/admin/scan`

Logic:
1. Lấy toàn bộ projects từ Supabase (kể cả soft-deleted)
2. ListObjectsV2 theo từng `projectId` prefix
3. So sánh R2 keys với URLs đang được reference trong DB
4. Detect analytics rows gắn với project_id không còn tồn tại

```json
// Response
{
  "projects": [
    {
      "id": "abc123",
      "name": "Client A — Round 1",
      "deleted_at": null,
      "r2_files": [
        { "key": "abc123/stage/model.glb", "size": 4820000 }
      ],
      "r2_size_bytes": 4820000,
      "db_analytics_rows": 142
    }
  ],
  "orphaned_keys": [
    { "key": "old_id/stage/leftover.glb", "size": 9200000 }
  ],
  "total_r2_bytes": 0,
  "total_r2_files": 0
}
```

---

## Phase 3 — Frontend: Trang `/admin/data`

**File**: `src/pages/AdminDataPage.jsx`

### A. Dashboard Header

- Tổng dung lượng R2 (hiển thị GB)
- Badge: số projects active / soft-deleted / có orphaned files
- Nút **"Scan Now"** — trigger lại `/api/admin/scan`, hiện spinner trong lúc chờ

### B. Project Table

```
[✓] Project Name   | Status       | Stage | HDRI | Media | R2 Size  | Analytics | Actions
----|--------------|--------------|-------|------|-------|----------|-----------|--------
[✓] Client A R1   | active       | ✓     | ✓    | 3     | 127 MB   | 1,204     | [⋯]
[ ] Client B R2   | soft-deleted | ✓     | —    | 7     | 340 MB   | 89        | [⋯]
[ ] Old Project   | locked       | ✓     | ✓    | 0     | 4.8 MB   | 0         | [⋯]
```

Per-row actions (dropdown):
- **Delete Files Only** — xóa R2, xóa URL trong DB, giữ analytics
- **Hard Delete All** — xóa DB row + R2 prefix + analytics rows
- **Restore** (chỉ với soft-deleted) — clear `deleted_at`

Bulk select + nút **"Delete Files for Selected"**

### C. Orphaned Files Panel

Files trên R2 không có project nào reference → hiện list với size, checkbox select, nút **"Delete Orphans"**.

---

## Phase 4 — Delete Flows

| Action | DB | R2 | Analytics |
|---|---|---|---|
| **Delete Files Only** | Null `stage_url`, `media_playlist`, `customHdriUrl` | Xóa R2 objects | Giữ nguyên |
| **Soft Delete** | Set `deleted_at = now()` | Giữ R2 | Giữ |
| **Hard Delete All** | Xóa row khỏi `projects` | Xóa toàn bộ `{id}/` prefix | Xóa analytics theo `project_id` |
| **Delete Orphans** | — | Xóa orphaned keys | — |

> Mọi action destructive đều có **confirm dialog** hiện rõ: tên project + số file + dung lượng sẽ mất không khôi phục được.

---

## Phase 5 — Route & Auth

- Route: `/admin/data` — wrap trong `ProtectedRoute` giống AdminPage hiện tại
- Thêm link từ **Admin landing** (`AdminLandingPage`) — nút "Data & storage"
- API endpoints kiểm tra Supabase session server-side — không public

---

## Thứ tự implement

```
1. admin/r2-objects.js   ← list R2 (GET `/api/admin/r2-objects`)
2. admin/scan.js         ← aggregate
3. admin/delete-r2.js
4. admin/project-mutate.js
5. AdminDataPage.jsx
6. Route + nav + vercel rewrite; `vite.config.js` middleware cho `npm run dev`
```

---

## Files sẽ tạo mới

```
api/lib/adminApiCommon.js
api/lib/r2Admin.js
api/admin/scan.js
api/admin/delete-r2.js
api/admin/project-mutate.js
api/admin/r2-objects.js
src/utils/adminDataApi.js
src/pages/AdminDataPage.jsx
```

## Files sẽ chỉnh sửa

```
vercel.json              ← rewrite /admin/data → index.html
vite.config.js           ← middleware chạy `api/**/*.js` khi `npm run dev`
src/App.jsx              ← thêm route /admin/data
src/pages/AdminLandingPage.jsx  ← nút Data & storage
.env.example             ← ghi chú SERVICE_ROLE cho admin API
```
