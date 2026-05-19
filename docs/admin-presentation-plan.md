# Admin Presentation — Draft & Publish Version Management Plan

Status: proposed (2026-05-13)
Scope: hoàn thiện hệ thống Save Draft / Publish Version cho Admin Presentation
Editor. Plan này KHÔNG đụng tới render 3D, POV, embed, scene config — chỉ tập
trung vào version lifecycle, UI quản lý version, và tính ổn định của draft state.

Repo: `T:\WEBSITE\07_Cursor\stage-visualizer-beta`

> **⚠️ Audit (2026-05-16):** Xem [2026-05-16-beta-audit-report.md](./2026-05-16-beta-audit-report.md)
> cho danh sách Critical/Major/Minor toàn branch `beta/worktree`. Các finding
> ảnh hưởng trực tiếp tới plan này:
> - **C1** (RLS mở cho anon) — phải fix trước khi ship version system.
> - **C6** `restoreVersion`/`discardDraft`/`publishVersion` không atomic → đưa vào RPC.
> - **C7** `version_token` optimistic lock bypassable → UPDATE phải có `.eq('version_token')`.
> - **M8** trigger `assign_version_number` lost-update → thêm `UNIQUE(project_id, version_number)`.
> - **M10** Director note `updatedAt` mỗi keystroke gây conflict giả → đổi onBlur.
> - **M11** `handleHistoryChanged = reload()` mất unsaved edit → thêm `isDirty` guard.

---

## 0. Bối cảnh

Hệ thống hiện tại đã có:

- Bảng `presentation_versions` (status: `draft | published | archived`).
- Bảng `client_feedback_items` với FK `presentation_version_id`.
- Helper `loadDraft`, `loadPublishedVersion`, `loadAllVersions`, `saveDraft`,
  `publishVersion` trong [src/lib/presentationVersions.js](../src/lib/presentationVersions.js).
- `PresentationEditorPage` đã wire `Save draft` + `Publish` button và một
  `PublishModal` có summary + release notes.
- `ClientPage` đã đọc snapshot từ `loadPublishedVersion`.

Vấn đề:

1. `loadAllVersions` được export nhưng **không có consumer** nào → không có UI
   list các version đã tồn tại (draft / published / archived).
2. Không có cách nào để **restore / preview / rename / delete** một version cũ.
3. Không có cách nào để **discard draft** hoặc **revert draft về published**;
   admin lỡ tay edit là kẹt, chỉ có thể can thiệp tay vào DB.
4. Top bar không phản ánh chính xác trạng thái draft (clean / dirty / saved)
   sau khi reload; `isDirty` chỉ track mutation local.
5. Nút "Save draft" trên top bar không bao giờ truyền `version_name` /
   `release_notes` (luôn `''`).
6. Số `v{N}` ở publish modal được tính từ `publishedVersion.version_number + 1`
   thay vì dựa trên `draft.version_number` (đã auto-number lúc INSERT) → có thể
   lệch số khi draft đã được tạo từ trước.
7. Trigger `assign_presentation_version_number` không filter `TG_OP = 'INSERT'`
   → về lý thuyết có thể chạy lại trên UPDATE (mặc dù `BEFORE INSERT` đã hạn
   chế phần lớn).
8. Không có optimistic locking → 2 admin overwrite draft của nhau im lặng.
9. Archived versions tích lũy vô hạn, không có UI cleanup.
10. Feedback gắn `presentation_version_id` nhưng UI admin feedback chưa filter
    theo version.
11. `created_by` luôn `''` — không track ai tạo / publish.

---

## 1. Kết quả mong muốn (definition of done)

Sau khi hoàn thành plan này, admin phải làm được:

- Nhìn thấy danh sách mọi version của một project (draft, published, archived).
- Restore một version cũ thành draft mới mà không mất published hiện tại.
- Preview bất kỳ version nào trong client view (read-only) trước khi restore.
- Rename version + edit release notes sau khi publish.
- Discard draft hiện tại (về lại trạng thái published) hoặc revert draft về
  published mà không mất history.
- Xóa archived version đã không còn cần (kèm confirm).
- Phân biệt rõ trên top bar: "no draft" vs "draft saved" vs "draft dirty".
- Save draft với release notes ngay từ top bar (không cần mở publish modal).
- Biết được feedback nào thuộc version nào.
- Không bị mất data khi 2 admin edit cùng lúc — có cảnh báo conflict.

Client (không đổi nhiều):

- Vẫn đọc snapshot từ published version mặc định.
- Hỗ trợ thêm query `?versionId=…` cho admin preview, ẩn behind auth check.

---

## 2. Kiến trúc dữ liệu (changes)

### 2.1 Migration SQL — `supabase/presentation_versions_v2.sql`

Tách thành file mới để không đụng schema v1 đã chạy production.

```sql
-- 1. Optimistic locking token
ALTER TABLE presentation_versions
  ADD COLUMN IF NOT EXISTS version_token UUID NOT NULL DEFAULT gen_random_uuid();

CREATE OR REPLACE FUNCTION rotate_version_token()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.snapshot_json IS DISTINCT FROM OLD.snapshot_json THEN
    NEW.version_token = gen_random_uuid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS presentation_versions_rotate_token ON presentation_versions;
CREATE TRIGGER presentation_versions_rotate_token
  BEFORE UPDATE ON presentation_versions
  FOR EACH ROW EXECUTE FUNCTION rotate_version_token();

-- 2. Guard auto-number — chỉ chạy lúc INSERT
DROP TRIGGER IF EXISTS presentation_versions_auto_number ON presentation_versions;
CREATE TRIGGER presentation_versions_auto_number
  BEFORE INSERT ON presentation_versions
  FOR EACH ROW EXECUTE FUNCTION assign_presentation_version_number();

-- 3. Provenance — supersedence chain (optional but cheap)
ALTER TABLE presentation_versions
  ADD COLUMN IF NOT EXISTS superseded_by UUID
    REFERENCES presentation_versions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS restored_from UUID
    REFERENCES presentation_versions(id) ON DELETE SET NULL;

-- 4. Cho phép tracking người tạo (đã có cột created_by; thêm published_by)
ALTER TABLE presentation_versions
  ADD COLUMN IF NOT EXISTS published_by TEXT NOT NULL DEFAULT '';

-- 5. Index hữu ích cho version drawer
CREATE INDEX IF NOT EXISTS presentation_versions_status_project
  ON presentation_versions (project_id, status, version_number DESC);
```

### 2.2 Quy tắc xử lý version_number

- INSERT mới (draft hoặc publish thẳng) → trigger gán `version_number = MAX + 1`
  trong scope project. **Number không reuse** kể cả khi draft bị xóa.
- UPDATE từ draft → published → giữ nguyên `version_number` của draft.
- Restore version cũ → tạo INSERT mới (number mới), không clone số cũ. Lưu
  `restored_from = source.id` để tra ngược.

---

## 3. Backend changes — `src/lib/presentationVersions.js`

### 3.1 Thêm helper

```js
// Load 1 version cụ thể (kể cả archived/draft khác)
export async function loadVersionById(id) { /* ... */ }

// Discard draft hiện tại (xóa hẳn row draft, không tạo archived)
export async function discardDraft(projectId) { /* ... */ }

// Tạo draft mới từ snapshot của version nguồn (cũ hoặc published)
// Nếu đã có draft → reject với error rõ ràng (force user discard trước)
export async function restoreVersion(projectId, sourceVersionId) { /* ... */ }

// Sugar: restoreVersion từ published hiện tại
export async function revertDraftToPublished(projectId) { /* ... */ }

// Rename / edit notes; chỉ allow trên draft + archived (không allow published?
// → quyết định: cho phép trên cả published, vì release_notes có thể typo)
export async function renameVersion(id, { versionName, releaseNotes }) { /* ... */ }

// Xóa hẳn 1 version. App layer phải chặn nếu status != 'archived'.
export async function deleteVersion(id) { /* ... */ }

// Bulk archive cleanup — xóa archived cũ hơn N tháng, giữ tối thiểu K bản
export async function pruneArchivedVersions(projectId, { keepLatest = 10, olderThanDays = 90 }) { /* ... */ }
```

### 3.2 Sửa helper hiện có

```js
// saveDraft: thêm optional versionToken → enable optimistic locking
// Nếu token mismatch → throw VersionConflictError với data hiện tại
export async function saveDraft(projectId, snapshot, opts = {}) {
  // opts = { versionName, releaseNotes, expectedToken }
}

// publishVersion: chấp nhận expectedToken tương tự; lưu published_by
export async function publishVersion(projectId, snapshot, opts = {}) {
  // opts = { versionName, releaseNotes, expectedToken, publishedBy }
}
```

### 3.3 Error class

```js
export class VersionConflictError extends Error {
  constructor(currentVersion) {
    super('Draft was updated by someone else.')
    this.currentVersion = currentVersion
  }
}
```

UI sẽ catch `VersionConflictError` → hiển thị banner "Someone updated this
draft. Reload to merge changes?" với button **Reload** / **Overwrite anyway**.

---

## 4. UI changes

### 4.1 Top bar — `PresentationEditorPage`

Hiện tại: chip "● Unsaved changes" + label "Draft from Published v{N}".

Đổi thành 3 trạng thái rõ rệt:

| Trạng thái | Điều kiện | Chip hiển thị |
|---|---|---|
| Clean (no draft) | `!draft && publishedVersion` | xám: `On v{N} · published {time}` |
| Saved draft | `draft && !isDirty` | vàng: `Draft saved · {relative time}` |
| Dirty | `isDirty` | ember: `● Unsaved changes` |

Đổi label "Draft from Published v{N}" → chỉ hiển thị khi `draft` thật sự tồn
tại.

Thêm nút **History** mở `VersionHistoryDrawer`.

Đổi nút "Save draft" → khi click có 2 mode:
- Click thường: save với `versionName` cũ.
- Click + hold (hoặc kebab menu) → "Save draft with notes…" mở mini-modal nhập
  `versionName` + `releaseNotes`.

### 4.2 VersionHistoryDrawer — component mới

File: `src/features/presentation/components/VersionHistoryDrawer.jsx`

Layout:

```
┌──────────────────────────────────────────────────────────┐
│ Version History — {projectName}                       ✕ │
├──────────────────────────────────────────────────────────┤
│ [Discard draft]  [Revert draft → published]              │
├──────────────────────────────────────────────────────────┤
│ ⏺ DRAFT                                                  │
│   v4  · Untitled draft                                   │
│        created 5m ago by alice@x                         │
│        [Preview] [Publish…] [Discard]                    │
│                                                          │
│ ● PUBLISHED                                              │
│   v3  · "Final mix"                                      │
│        published 2h ago by alice@x · 3 feedback items   │
│        [Preview] [Restore as draft] [Rename]            │
│                                                          │
│ ○ ARCHIVED (12)                            [Cleanup ▾]   │
│   v2  · "Round 2"            archived 1d ago             │
│        [Preview] [Restore as draft] [Rename] [Delete]    │
│   v1  · "Initial"             archived 3d ago            │
│   ...                                                    │
└──────────────────────────────────────────────────────────┘
```

Behavior:

- Data load: `loadAllVersions(projectId)` + count feedback per version via
  một query group-by (`select presentation_version_id, count(*) from
  client_feedback_items group by presentation_version_id`).
- Preview → navigate `/view/:projectId?versionId={id}` mở tab mới.
- Restore as draft → confirm modal. Nếu đã có draft → bắt buộc Discard
  trước (hoặc auto-overwrite kèm confirm rõ ràng).
- Rename → inline edit text field (versionName + releaseNotes).
- Delete → confirm modal, only enabled cho `archived`.
- Cleanup → mở popover chọn "Keep latest N" + "Older than X days" → gọi
  `pruneArchivedVersions`.

### 4.3 Publish flow điều chỉnh

`PublishModal` hiện tại đã tốt, chỉ sửa:

- `nextNum`: tính từ `Math.max(draft?.version_number ?? 0, published?.version_number ?? 0) + (draft ? 0 : 1)`.
  → Nếu đang publish draft đã có sẵn → hiển thị đúng số của draft. Nếu
    publish thẳng (không có draft) → published_max + 1.
- Hiển thị diff vs published hiện tại (textual): số slide thêm/xóa, số ref
  thay đổi, runtime delta. Component phụ `SnapshotDiff.jsx` tính từ 2 snapshot
  JSON.
- Sau khi publish thành công → toast "Published v{N}. Previous v{M} moved to
  Archived." kèm link "View history".

### 4.4 Conflict banner

Khi `saveDraft` / `publishVersion` throw `VersionConflictError`:

```
⚠ This draft was updated by someone else.
Your local edits are not lost. Choose:
[Reload server version]   [Overwrite with my edits]
```

Reload → load lại draft từ DB, đè state local.
Overwrite → gọi lại save không kèm `expectedToken`.

### 4.5 Admin Feedback page

`src/pages/AdminFeedbackReviewPage.jsx`:

- Thêm filter dropdown "Version" (All / v3 published / v2 archived / …).
- Mỗi feedback item hiển thị badge `v{N}` nhỏ cạnh status.
- Khi click "Jump to slide" trên feedback của version archived → cảnh báo
  "This feedback is on v{N} which is no longer published. Preview that version?"
  với link sang `?versionId=…`.

### 4.6 Client preview by versionId

`src/pages/ClientPage.jsx`:

- Đọc `useSearchParams().get('versionId')`.
- Nếu có và user authenticated (Supabase session) → gọi `loadVersionById`
  thay vì `loadPublishedVersion`.
- Hiển thị banner "Previewing v{N} ({status}) — not the live published
  version" để tránh nhầm lẫn.
- Nếu không authenticated → ignore param, fallback published như cũ.

---

## 5. Phase rollout

| Phase | Scope | Effort | Lý do ưu tiên |
|---|---|---|---|
| **G1** | Migration v2 SQL + backend helpers (`loadVersionById`, `restoreVersion`, `discardDraft`, `renameVersion`, `deleteVersion`, `revertDraftToPublished`, `pruneArchivedVersions`, `VersionConflictError`) + sửa `saveDraft`/`publishVersion` nhận `expectedToken`. | S | mở khóa toàn bộ UI |
| **G2** | `VersionHistoryDrawer` + nút History trên top bar + data load + Preview/Restore/Rename/Delete/Cleanup. | M | giải quyết đau chính |
| **G3** | Top bar 3-state (clean/saved/dirty) + "Save draft with notes…" mini-modal + sửa nhãn "Draft from Published" + sửa `nextNum` trong PublishModal. | S | UX bớt mơ hồ |
| **G4** | Feedback filter + version badge + jump-to-version warning. | S | đóng vòng review |
| **G5** | Conflict banner UX + `expectedToken` wire-up + `published_by` / `created_by` từ Supabase session. | M | tránh data loss |
| **G6** | `/view/:projectId?versionId=…` cho admin preview + banner cảnh báo. | S | hỗ trợ G2 Preview |
| **G7** | Snapshot diff trong PublishModal + toast post-publish. | S | nice-to-have |
| **G8** | Sync `docs/admin-presentation-roadmap.md` checkboxes + schemaVersion migration helper (chỉ stub, không cần triển khai cho schemaVersion=1). | XS | docs đồng bộ |

Thứ tự bắt buộc: G1 → G2 → (G3, G4, G6 song song) → G5 → G7 → G8.

---

## 6. Test plan

### 6.1 Manual (per phase)

**G1:**
- Tạo project mới → save draft → verify row `draft` xuất hiện với
  `version_token`.
- Edit lần 2 → save draft → verify `version_token` thay đổi.
- Save lần 2 với `expectedToken` cũ → expect `VersionConflictError`.
- Publish → verify draft chuyển thành `published`, version cũ → `archived`.
- `restoreVersion` từ archived → expect draft mới với snapshot copy + cột
  `restored_from` set đúng.
- `discardDraft` → draft biến mất khỏi DB.
- `deleteVersion(publishedId)` → reject ở app layer.
- `deleteVersion(archivedId)` → archived biến mất.

**G2:**
- Drawer load list đúng group draft/published/archived.
- Preview mở tab mới với `?versionId=`.
- Restore → confirm flow → editor reload với snapshot mới.
- Rename inline → reload drawer → tên persist.
- Cleanup keep=2 olderThan=0 → archived còn đúng 2 bản mới nhất.

**G3:**
- Reload editor sau save → chip vàng "Draft saved · …" (không phải "Unsaved").
- Edit slide → chip ember ngay lập tức.
- Top bar không còn hiện "Draft from Published" khi không có draft.

**G4:**
- Filter version → list feedback đúng.
- Feedback của archived → click jump → banner cảnh báo.

**G5:**
- Mở 2 tab cùng project → tab A edit + save → tab B edit + save → expect
  conflict banner ở B với 2 button.

**G6:**
- Authenticated admin mở `/view/:projectId?versionId={archivedId}` → load
  đúng snapshot archived.
- Anon hit cùng URL → fallback published.

### 6.2 Regression smoke
- Client `/view/:projectId` không có param vẫn load published như cũ.
- Feedback submit từ client vẫn gắn `presentation_version_id` đúng published
  hiện tại.
- Mobile client view-only không vỡ.

---

## 7. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Migration v2 chạy lệch giữa local / staging / prod | Tách file SQL riêng, idempotent (`IF NOT EXISTS`), log trong `docs/` |
| Restore action overwrite draft đang dở | Bắt buộc Discard trước; modal warning có copy snapshot vào clipboard JSON cho recovery |
| Delete archived làm orphan feedback | FK đã `ON DELETE SET NULL`; UI cảnh báo số feedback bị tách rời trước khi xóa |
| Optimistic locking false-positive khi snapshot không đổi | Trigger `rotate_version_token` chỉ rotate khi `snapshot_json IS DISTINCT FROM` |
| `created_by` / `published_by` rỗng trên row cũ | Backfill optional bằng query 1 lần, không block phase G5 |

---

## 8. Files dự kiến touch

```
supabase/
  presentation_versions_v2.sql                    (new)

src/lib/
  presentationVersions.js                         (edit — add helpers + opts)

src/features/presentation/
  components/
    VersionHistoryDrawer.jsx                      (new)
    SnapshotDiff.jsx                              (new, phase G7)
    SaveDraftWithNotesModal.jsx                   (new, phase G3)
    VersionConflictBanner.jsx                     (new, phase G5)

src/pages/
  PresentationEditorPage.jsx                      (edit — top bar, drawer, conflict)
  AdminFeedbackReviewPage.jsx                     (edit — version filter + badge)
  ClientPage.jsx                                  (edit — ?versionId support, phase G6)

docs/
  admin-presentation-plan.md                      (this file)
  admin-presentation-roadmap.md                   (sync checkboxes, phase G8)
```

---

## 9. Open questions

1. Có cần version_name unique trong scope project không? → Hiện tại không.
   Quyết định: **không enforce unique**, người dùng tự chịu trùng tên.
2. Restore từ archived có nên auto-archive draft hiện tại thay vì bắt user
   discard? → Quyết định: **archive draft hiện tại** (an toàn hơn, không mất
   work). Cập nhật helper `restoreVersion` theo hướng đó.
3. Có nên cho phép edit `release_notes` trên published version sau khi publish?
   → Quyết định: **có**, vì notes chỉ là metadata, không ảnh hưởng client
   render.
4. Snapshot diff dạng text vs visual? → Phase G7 làm text-only (slide count,
   ref count, runtime delta, list slides thêm/xóa). Visual diff để sau.
5. Có cần audit log riêng (`presentation_version_events`)? → Không trong phase
   này, dùng `created_at` + `published_at` + `superseded_by` đủ cho support.

---

# Addendum A — Annotated Director Notes

Status: proposed (2026-05-13)
Scope: thêm khả năng vẽ annotate cho Director's Note. Một slide có nhiều note,
mỗi note có annotation riêng (circle/rect overlay trên stage). Note đồng bộ
xuống client view qua snapshot. Click note ở client → lock vào Center cam +
hiển thị annotation. Khi admin vẽ annotate → cũng lock cam như client.

## A.0 Bối cảnh & tính khả thi

Hiện trạng:

- `slide.directorNote` (string) + `slide.directorNoteVisible` (bool) — 1 note
  text duy nhất / slide, không có annotation. Render ở client:
  [ClientPage.jsx:1355](../src/pages/ClientPage.jsx:1355) (desktop overlay) và
  [ClientPage.jsx:1859](../src/pages/ClientPage.jsx:1859) (mobile).
- Annotation infrastructure đã sẵn trong
  [src/components/FeedbackDraftPanel.jsx](../src/components/FeedbackDraftPanel.jsx):
  - `AnnotationLayer` — SVG overlay, draw circle/rect, lưu bounds normalized
    `{x, y, width, height}` 0-1 + viewport size.
  - `AnnotationToolbar` — chọn tool circle/rect.
  - `FeedbackTopBar`, `FeedbackLockBanner`, `StageLockBadge` — UI lock state.
- Lock pattern hiện tại (client feedback mode):
  - Set `lockedCtx = { slideTitle, camName, clipTime, versionLabel }`.
  - Gọi `setCameraTargetPreset(ref, centerPreset)` để snap cam.
  - Tắt camera controls trong khi `lockedCtx` truthy.
  - Feedback payload include `camera_snapshot_json` + `annotation_json`.

**Tính khả thi: HIGH.** Toàn bộ rendering / draw / lock UI đã được thiết kế
generic — chỉ cần:

1. Đổi data model `directorNote: string` → `directorNotes: DirectorNote[]`.
2. Tái dùng `AnnotationLayer` ở admin editor (read-write) và client view
   (read-only).
3. Tái dùng lock pattern (lockedCtx + setCameraTargetPreset) cho 2 ngữ cảnh
   mới: (a) admin vẽ annotate, (b) client xem note có annotate.
4. Backwards-compat layer cho `directorNote` (string cũ) → auto-migrate sang
   `directorNotes: [{ id, text, annotation: null }]` khi load.

Không cần migration SQL — `slides[].directorNotes` chỉ là field mới trong
`snapshot_json` (JSONB), schema không đổi.

## A.1 Data model

### A.1.1 Schema mở rộng

Thêm vào snapshot JSON, field mới trên mỗi slide:

```js
/**
 * @typedef {Object} DirectorNote
 * @property {string}  id              UUID-ish
 * @property {string}  text            Nội dung note (markdown nhẹ, plaintext)
 * @property {boolean} visibleToClient Mặc định true; ẩn = admin-only
 * @property {Annotation|null} annotation
 * @property {string}  cameraPresetId  Preset cam khi note này được tạo (mặc định Center)
 * @property {number|null} clipTimeSeconds  Optional — pin note tới thời điểm clip
 * @property {number}  sortOrder
 * @property {string}  createdAt
 * @property {string}  updatedAt
 */

/**
 * @typedef {Object} Annotation
 * @property {'circle'|'rect'} type
 * @property {{ x: number, y: number, width: number, height: number }} bounds  Normalized 0-1
 * @property {{ width: number, height: number }} viewport  Pixel size khi vẽ (để debug, không dùng render)
 */

/**
 * @typedef {Object} Slide
 * ...existing fields...
 * @property {string}         directorNote          DEPRECATED — giữ để backwards-compat
 * @property {boolean}        directorNoteVisible   DEPRECATED
 * @property {DirectorNote[]} directorNotes         NEW — nhiều note + annotation
 */
```

### A.1.2 Migration trên buildSnapshot

Trong `buildSnapshot` (`src/lib/presentationVersions.js`):

```js
function migrateDirectorNotes(slide) {
  if (Array.isArray(slide.directorNotes)) return slide.directorNotes
  if (slide.directorNote?.trim()) {
    return [{
      id: 'legacy-' + slide.id,
      text: slide.directorNote,
      visibleToClient: !!slide.directorNoteVisible,
      annotation: null,
      cameraPresetId: slide.defaultCameraPresetId,
      clipTimeSeconds: null,
      sortOrder: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }]
  }
  return []
}
```

Apply trong `buildSnapshot` để mọi snapshot mới luôn có `directorNotes` chuẩn.
Field cũ `directorNote` + `directorNoteVisible` được giữ và sync ngược từ note
đầu tiên (cho compat với deploy cũ chưa biết schema mới).

### A.1.3 schemaVersion

Tăng `schemaVersion` từ `1` → `2`. Client phải hydrate được cả v1 và v2.
Thêm helper `hydrateSnapshot(snapshot)` (load path) — nếu `schemaVersion < 2`
→ migrate `directorNote` → `directorNotes[]` in-memory.

## A.2 Admin editor — vẽ annotation cho note

### A.2.1 UI mới: DirectorNotesEditor

Component mới:
`src/features/presentation/components/DirectorNotesEditor.jsx`

Nằm trong right panel "Context" tab của `PresentationEditorPage`, thay thế UI
director-note hiện tại (1 textarea + 1 checkbox).

Layout:

```
┌─ Director Notes ────────────────────── [+ Add note] ┐
│ ┌─ Note 1 · with annotation ────── [↑↓][👁][🗑] ┐ │
│ │ [textarea]                                       │ │
│ │ "Focus on the LED grid response when…"           │ │
│ │                                                  │ │
│ │ Annotation: ● circle    cam: Center  @ 0:14      │ │
│ │ [✎ Edit annotation]  [✕ Remove annotation]       │ │
│ │ ☑ Visible to client                              │ │
│ └──────────────────────────────────────────────────┘ │
│ ┌─ Note 2 · text only ─────────── [↑↓][👁][🗑] ┐ │
│ │ ...                                              │ │
│ └──────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

Per-note actions:
- Reorder (↑↓ hoặc drag handle)
- Visibility toggle (eye icon)
- Delete (with confirm if has annotation)
- Edit annotation → enter Annotation Mode (lock cam, mở toolbar)
- Remove annotation → set `annotation = null`, không xóa note text

### A.2.2 Admin Annotation Mode

Khi user click "✎ Edit annotation" trên 1 note:

1. Set `annotatingNoteId = note.id`.
2. Set `lockedCtx = { noteId, slideTitle, camName: 'Center', clipTime: note.clipTimeSeconds, versionLabel: 'Draft' }`.
3. `setCameraTargetPreset(cameraTargetPresetRef, centerPreset)` — snap cam.
4. Disable camera controls (`OrbitControls.enabled = false`).
5. Mount `<AnnotationLayer annotation={note.annotation} activeTool={tool} onAnnotationChange={…} />` overlay stage.
6. Mount `<AnnotationToolbar activeTool={tool} setActiveTool={setTool} />` trên top bar.
7. Optional: nếu `note.clipTimeSeconds != null` → `videoRef.current.currentTime = note.clipTimeSeconds`, pause video.
8. Hiển thị `<FeedbackLockBanner>` reuse từ client (rename component hoặc dùng nguyên).
9. Footer modal: `[Cancel] [Save annotation]`.

Khi user save:
- Update note → `annotation: { type, bounds, viewport }`, `cameraPresetId: 'Center'`, `clipTimeSeconds: currentTime`.
- Set `isDirty = true`.
- Exit annotation mode → unlock cam.

Khi user cancel:
- Discard temp annotation.
- Exit annotation mode → unlock cam.

### A.2.3 Reuse plan

- `AnnotationLayer` — dùng nguyên, không sửa.
- `AnnotationToolbar` — dùng nguyên.
- `FeedbackLockBanner` → đổi tên hoặc generic-ify thành `<StageLockBanner>` với
  prop `mode: 'feedback' | 'annotation'` để label phù hợp ("Annotation mode —
  cam locked to Center" vs "Feedback mode — …").
- `StageLockBadge` — dùng nguyên.
- Camera lock helper: tách `useCameraLock(centerPresetRef, lockedCtx)` thành
  hook chung, hiện đang inline trong `ClientPage.jsx` — refactor nhỏ.

## A.3 Client view — đọc & click note

### A.3.1 Render note list

Thay vì 1 overlay text duy nhất, render list:

- Desktop: panel trượt từ phải hoặc inline bên dưới slide title — list note
  với badge "● annotated" nếu có annotation.
- Mobile: collapsible section trong slide drawer.

Mỗi note row clickable nếu có annotation. Visible filter:
`directorNotes.filter(n => n.visibleToClient)`.

### A.3.2 Click → Note Focus Mode

Khi client click 1 note có annotation:

1. Set `lockedCtx = { mode: 'note', noteId, slideTitle, camName: note.cameraPresetId || 'Center', clipTime: note.clipTimeSeconds }`.
2. `setCameraTargetPreset(cameraTargetPresetRef, centerPreset)`.
3. Nếu `clipTimeSeconds != null` → seek video tới thời điểm đó, pause.
4. Mount `<AnnotationLayer annotation={note.annotation} activeTool={null} />`
   → read-only overlay (vì `activeTool=null` thì pointerEvents='all' chỉ khi
   có annotation, nhưng không cho draw mới).
5. Show top bar variant: "Director Note · {slideTitle} · Center @ {time}" với
   nút Exit.
6. Disable camera controls.

Note không có annotation → click chỉ scroll/highlight text, không lock.

### A.3.3 Conflict với feedback mode

- Note Focus và Feedback Mode dùng cùng `lockedCtx`. Để tránh xung đột:
  - Thêm field `lockedCtx.mode: 'feedback' | 'note' | 'annotation'`.
  - Exit Note Focus trước khi enter Feedback Mode (và ngược lại).
  - Nếu user click "Add feedback" trong khi đang Note Focus → auto-transition
    sang Feedback Mode với annotation pre-filled từ note (reference annotation).
    → **Quyết định: KHÔNG pre-fill**, để feedback có annotation riêng. Note
    Focus exit, Feedback Mode start sạch.

### A.3.4 Hide overlay cũ

Hai chỗ render note cũ
([ClientPage.jsx:1355](../src/pages/ClientPage.jsx:1355),
[ClientPage.jsx:1859](../src/pages/ClientPage.jsx:1859))
→ thay bằng list mới. Giữ fallback: nếu `directorNotes` rỗng nhưng
`directorNote` (string) có → render legacy overlay 1 lần (cho project chưa
publish lại sau migration).

## A.4 Edge cases & decisions

| Trường hợp | Xử lý |
|---|---|
| Note không có annotation | Click → không lock, chỉ highlight |
| Note có annotation nhưng Center preset bị xóa | Fallback `defaultCameraPresetId`; nếu cũng không có → show warning, vẫn render overlay với cam hiện tại |
| Annotation viewport ≠ viewport hiện tại | SVG `preserveAspectRatio="none"` đã xử lý — bounds normalized 0-1 luôn fit. Lưu viewport chỉ để debug. |
| Note bị ẩn (`visibleToClient=false`) | Vẫn lưu trong snapshot nhưng client filter ra. Admin vẫn thấy với badge "hidden". |
| Slide hidden (`hiddenFromClient`) | Note theo slide bị ẩn cùng — không render |
| 2 admin cùng edit notes trên 1 draft | Optimistic locking (Addendum chính Phase G5) bắt conflict — không cần riêng cho notes |
| Annotation lúc admin chưa có Center preset | Block "Edit annotation" với tooltip "Add a Center preset first" — giống `PublishModal` đã warn |
| Note có `clipTimeSeconds` nhưng clip đã thay đổi (publish lại) | Time vẫn được set; nếu vượt duration → clamp về duration max. Không block publish. |
| Mobile client click note có annotation | Same lock flow, annotation render full-screen overlay. Cam lock vẫn áp dụng. |

## A.5 Phase rollout (chèn vào sau G6)

| Phase | Scope | Effort |
|---|---|---|
| **G6.5a** | Data model: `DirectorNote` typedef, migrate trong `buildSnapshot`, hydrate trong load path, bump `schemaVersion` → 2 | S |
| **G6.5b** | Refactor: tách `useCameraLock` hook, generic-ify `FeedbackLockBanner` → `StageLockBanner` với `mode` prop | S |
| **G6.5c** | Admin `DirectorNotesEditor` component — list + add/remove/reorder/visibility/text edit (chưa annotation) | M |
| **G6.5d** | Admin Annotation Mode — lock cam, mount AnnotationLayer + Toolbar, save/cancel | M |
| **G6.5e** | Client render note list (desktop + mobile), giữ legacy fallback | S |
| **G6.5f** | Client Note Focus Mode — click → lock cam, render annotation overlay read-only | M |
| **G6.5g** | Polish: badge "annotated", confirm-on-delete-with-annotation, missing-Center warning, viewport mismatch graceful | S |

Thứ tự bắt buộc: G6.5a → G6.5b → (G6.5c + G6.5e song song) → (G6.5d + G6.5f song song) → G6.5g.

## A.6 Test plan

**G6.5a (data):**
- Load project có `directorNote` (string) cũ → snapshot mới có
  `directorNotes: [{...}]` đúng 1 entry với `visibleToClient` map từ
  `directorNoteVisible`.
- Save draft → reload → array preserved.

**G6.5c (text editor):**
- Add 3 notes, reorder, delete giữa → sortOrder cập nhật đúng.
- Toggle visibility — published snapshot không leak ẩn note text qua client?
  → Quyết định: vẫn lưu trong snapshot, client filter ra (đỡ phải tách 2
  snapshot). Trade-off: text ẩn vẫn tải về client qua network. Nếu sensitive
  → admin nên xóa hẳn note.

**G6.5d (admin annotation):**
- Click "Edit annotation" → cam snap về Center, controls disabled, toolbar
  hiển thị.
- Vẽ circle → save → note có `annotation: { type: 'circle', bounds: {…} }`.
- Cancel → annotation không lưu.
- Không có Center preset → button disabled với tooltip.

**G6.5e + G6.5f (client):**
- Render list note đúng order, ẩn note có `visibleToClient=false`.
- Click note có annotation → cam Center, overlay annotation hiển thị
  read-only, không cho vẽ thêm.
- Click note không annotation → chỉ highlight, không lock.
- Click feedback while Note Focus → exit Note Focus, enter Feedback Mode
  sạch.
- Mobile: same behavior, overlay full-screen.

**Regression:**
- Project có `directorNote` (string) cũ chưa publish lại — desktop client vẫn
  thấy text qua legacy fallback.
- Feedback mode (cũ) không bị ảnh hưởng — annotation feedback vẫn hoạt động.
- Publish flow không vỡ — snapshot có cả `directorNote` (string legacy) +
  `directorNotes` (array) cùng lúc.

## A.7 Files dự kiến touch

```
src/lib/
  presentationVersions.js                         (edit — buildSnapshot, hydrate, typedef)

src/hooks/
  useCameraLock.js                                (new — refactor lock pattern)

src/components/
  FeedbackDraftPanel.jsx                          (edit — rename FeedbackLockBanner → StageLockBanner with mode prop)

src/features/presentation/
  components/
    DirectorNotesEditor.jsx                       (new — admin notes list + edit)
    DirectorNoteRow.jsx                           (new — single note row)
    AnnotationModeOverlay.jsx                     (new — admin annotation lock overlay)

src/pages/
  PresentationEditorPage.jsx                      (edit — swap Context tab note UI, wire annotation mode)
  ClientPage.jsx                                  (edit — render notes list, click → Note Focus, replace legacy overlays at :1355 + :1859)
```

## A.8 Open questions

1. Note có gắn `clipTimeSeconds` thì khi click ở client có nên auto-pause
   video? → **Có**, pause để giống Feedback Mode đang làm.
2. Note có nên hỗ trợ multiple annotations / note (vẽ 2 circles cùng lúc)?
   → Phase này **không**; 1 annotation / note. Nếu cần nhiều vùng → tạo
   nhiều note.
3. Có cần tooltip preview annotation khi hover note row (không cần click)?
   → Nice-to-have, gộp vào G6.5g polish nếu còn thời gian.
4. Note có nên có color tag (info/warning/highlight)? → Không trong phase này.
5. Lưu lịch sử edit note (audit) → không, dùng version snapshot là đủ — note
   nằm trong snapshot, mỗi publish là 1 frozen state.
