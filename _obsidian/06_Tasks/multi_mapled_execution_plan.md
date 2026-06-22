---
title: Multi-Mapled Visualizer — Execution Plan
type: task-management
status: planning
created: 2026-06-22
tags: [tasks, feature, multi-mapled, led, uv-mapping, render, playback]
related: ["[[01_Product/Core_Concept]]", "[[02_Architecture/System_Architecture]]", "[[03_Protocol/System_Protocols]]", "[[04_UI_system/System_UI]]", "[[05_AI_rules/AI_Rules]]", "[[06_Tasks/current_sprint]]"]
---

# Multi-Mapled Visualizer — Execution Plan

> **Raw idea:** 1 sân khấu Visualizer có **2 (hoặc N) màn LED khác nhau** ("mapled"), đã được UV-map hoàn chỉnh trên Cinema 4D. Website phải:
> 1. **Detect tốt cả 2 UV map khác nhau** từ GLB.
> 2. Bên **Presentation editor**: upload 1 "visual" (1 bài / 1 loop) gồm 2 file cho 2 mapled, **sync với nhau theo tên file**.
> 3. Bên **Client view**: chọn 1 visual → **chạy cả 2 mapled cùng lúc, đồng bộ**.
>
> Mục tiêu của file này: biến raw idea thành execution chuẩn, logic hóa, không lỗi — nối đúng các đầu dây còn hở mà **không phá phần đã chạy**.

**Quyết định thiết kế đã chốt (2026-06-22):**
- **Upload UX:** Hybrid — auto suy `targetId` theo hậu tố tên file + gom theo base name, **nhưng vẫn có UI selector cho sửa tay**.
- **Nguồn target:** Scan từ GLB đang load **+ UI selector** để admin chỉ định LED nào là Main, LED nào là Side.

---

## 1. Hiện trạng — "làm dở" tới đâu

Phần **nền móng (data model + detection) đã xong và có test**, nhưng **chưa nối vào render / upload / playback**.

| Tầng | File | Trạng thái |
|---|---|---|
| Data model multi-mapled clip | `src/utils/mapledMedia.js` + `.test.js` | ✅ **Xong.** Clip có `playbackMode: 'multi-mapled'` + `sources[]`, mỗi phần tử `{ targetId, targetLabel, url, type, external }` |
| Detect LED target từ tên material/mesh | `src/utils/ledMaterialTargets.js` + `.test.js` | ✅ **Xong.** `detectLedSurfaceTarget()` trả `targetId` qua regex `LED_MAPLED_<TOKEN>` / `MAPLED_<TOKEN>`; có `upsertLedTarget()` để gom danh sách |
| Render LED | `src/components/Scene.jsx` (~L733–870) | ⚠️ **Chỉ dùng 1 `activeTexture` cho TẤT CẢ LED surface.** `detectLedSurfaceTarget` ở đây mới dùng để phân biệt `surfaceType` (solid / transparent-grid), **chưa route theo `targetId`** |
| Upload clip (editor) | `src/pages/PresentationEditorPage.jsx` | ❌ Upload 1 file → 1 clip 1 source. Chưa có UI gom nhiều file vào nhiều map |
| Playback / sync (client) | `src/pages/ClientPage.jsx` (~L382–465 `activateVideo` / `activateClip`) | ❌ Tạo **1** `<video>` → set `videoElement` đơn. Chưa play N video sync theo targetId |
| Serialize khi publish | `serializeClipForPlaylist` (trong `mapledMedia.js`) | ✅ Có sẵn nhưng ❌ **chưa được gọi** ở save/publish path |
| Restore playlist (client) | `ClientPage.jsx` `restoreMediaPlaylist` (~L572) | ✅ Spread `...item` → **đã giữ được `sources` / `playbackMode`** khi load |

**Kết luận:** Kiến trúc đã chọn rất đúng hướng — *"1 clip = 1 bài/loop = N sources keyed by `targetId`"* chính là cách đồng bộ chuẩn. Việc còn lại là **nối 3 đầu dây: Upload UI → Render đa-texture → Playback đa-video sync**, cộng wiring persist (publish + version snapshot).

### Pipeline render LED hiện tại (để biết chỗ sửa)
- `ModelContent` (`Scene.jsx` ~L495) nhận prop `videoElement` (đơn) + `activeImageUrl` (đơn) → tạo **1** `videoTexture` / `imageTexture` = `activeTexture`.
- Loop `clonedScene.traverse` (~L688) thu `meshEntries`, mỗi entry có `ledSurfaceType` từ `getLedSurfaceType(...)` → `detectLedSurfaceTarget`.
- Loop apply (~L754–870): mọi mesh có `ledSurfaceType` đều gán **cùng** `activeTexture` (qua `MeshBasicMaterial` / `MeshStandardMaterial` emissive / transparent-grid material). **Đây là điểm phải tách theo `targetId`.**

### Pipeline playback hiện tại (client)
- `activateVideo(id, url)` (`ClientPage.jsx` ~L382): tạo **1** `document.createElement('video')`, set `videoElement` qua `setVideoElement`. play/pause/seekbar/duration đều bám vào 1 video này.
- `activateClip(clip)` (~L430): resolve blob URL → nếu `image` set `activeImageUrl`, nếu không gọi `activateVideo`. **Không có nhánh multi-mapled.**

---

## 2. ⚠️ Khế ước đặt tên (Naming Contract) — rủi ro #1, đọc kỹ

Detection chỉ nhận diện **target riêng biệt** khi tên material/mesh khớp regex trong `ledMaterialTargets.js`:

```
TARGETED_LED_RE        = /(?:^|_)LED_MAPLED_([A-Z0-9]+)(?:_MAT|_MESH|_PANEL|_SURFACE)?(?:_|$)/
LOOSE_TARGETED_LED_RE  = /(?:^|_)MAPLED_([A-Z0-9]+)(?:_MAT|_MESH|_PANEL|_SURFACE)?(?:_|$)/
```

Mọi tên **không khớp** → rơi về legacy → gộp chung `master` → **2 map collapse làm một, không route riêng được.**

> **Phát hiện từ file C4D thực tế:** material/object đang tên kiểu **"LED Main", "Led Side", "LED CỔNG THIÊN KIỀU", "LED CÁNH TRÁI / PHẢI / CENTER"** — **KHÔNG khớp convention**. Nếu export nguyên trạng, website sẽ gộp 2 map. Đây là blocker thật, không phải giả định.

### ✅ Contract bắt buộc khi export C4D → GLB

Đặt tên **material** của mỗi màn LED theo dạng `LED_MAPLED_<TOKEN>`:

| Màn LED (theo file C4D) | Tên material chuẩn | `targetId` detect ra | Role gợi ý |
|---|---|---|---|
| Cổng chính / Thiên Kiều | `LED_MAPLED_MAIN` | `main` | Main |
| Cánh / tách trái-phải | `LED_MAPLED_SIDE` | `side` | Side |
| (mở rộng) Cánh trái | `LED_MAPLED_LEFT` | `left` | Left |
| (mở rộng) Cánh phải | `LED_MAPLED_RIGHT` | `right` | Right |
| (mở rộng) Trung tâm | `LED_MAPLED_CENTER` | `center` | Center |

**Quy tắc:**
- `<TOKEN>` chỉ gồm `[A-Z0-9]`, viết HOA, không dấu, không khoảng trắng.
- Có thể có hậu tố `_MAT` / `_MESH` / `_PANEL` / `_SURFACE` (regex đã chấp nhận).
- **Một** material chuẩn cho mỗi map là đủ; mesh không cần đổi tên nếu material đã chuẩn (material được ưu tiên hơn mesh trong `detectLedSurfaceTarget`).
- Map LED trong suốt (grid) giữ quy ước cũ `LED_GRID_*` cho `surfaceType: transparent-grid`; có thể kết hợp `LED_MAPLED_<TOKEN>` để vừa có target vừa có grid (cần verify ở Phase B).

### 🛟 Discovery fallback (chống naming sai)
Quyết định #2 (scan + selector) cho phép admin gán role kể cả khi naming không chuẩn. Vì vậy Phase A sẽ thêm **discovery mode**: liệt kê **mọi** surface LED phân biệt (group theo material name, kể cả không khớp `LED_MAPLED_*`) để UI selector cho admin map tay raw surface → role. **Tuy nhiên** convention chuẩn vẫn là đường an toàn nhất; discovery chỉ là lưới đỡ.

---

## 3. Kiến trúc đích

```
┌─ C4D export (LED_MAPLED_MAIN / _SIDE) ─────────────────────────┐
│                                                                │
│  GLB load → scan surfaces → [raw targets]                      │
│       │                                                        │
│  ledTargetMap config (scene_config) ── UI selector gán role ──→│  Main / Side
│       │                                                        │
└───────┼────────────────────────────────────────────────────────┘
        │
   ┌────▼─────────────┐     ┌──────────────────────┐     ┌─────────────────────────┐
   │ EDITOR upload    │     │ RENDER (Scene)       │     │ PLAYBACK (Client)       │
   │ multi-file →     │     │ texturesByTarget Map │     │ N <video> sync group    │
   │ group by base    │ →   │ mesh.targetId →      │ ←   │ videoElementsByTarget   │
   │ name, suffix→map │     │ pick texture/target  │     │ master-driven lockstep  │
   │ buildMultiMapled │     │ fallback = master    │     │ play/pause/seek fan-out │
   └──────────────────┘     └──────────────────────┘     └─────────────────────────┘
        │                                                          │
        └── serializeClipForPlaylist → media_playlist (sources[]) ─┘
                         ↑ phải survive publish + version snapshot
```

### Các khái niệm
- **Raw surface:** một LED surface phát hiện từ GLB (theo material/mesh name).
- **Target / role:** vai trò logic (Main / Side / Left…) mà admin gán cho raw surface, lưu trong `ledTargetMap`.
- **Multi-mapled clip:** 1 "bài/loop" = 1 clip có `sources[]`, mỗi source trỏ 1 file vào 1 `targetId`.
- **Sync group:** nhóm N `<video>` của 1 multi-mapled clip, chạy lockstep theo 1 master.

---

## 4. Kế hoạch theo phase

> Thứ tự cố ý để **de-risk**: chứng minh được routing đúng (bằng ảnh test) **trước khi** đầu tư UI upload/playback → tránh xây nhầm.

### Phase A — Target resolution + role mapping (read-only, không đụng playback)
**Mục tiêu:** từ GLB ra danh sách map đúng + cho admin gán role.

- [x] Mở rộng `src/utils/ledMaterialTargets.js`: thêm `getLedSurfaceKey` (primitive dùng chung), `discoverLedSurfaces(meshScan)` (gồm heuristic token "LED" cho tên không-convention), `resolveLedTargetId` (router cho Phase B) + `resolveLedTargets` (target list cho editor).
- [x] Hook mới `src/hooks/useLedTargets.js`: nhận `meshScan` + `ledTargetMap` → `{ surfaces, targets, isMultiMapled, hasUnassignedHeuristic }`. Default = identity (convention GLB cần zero config).
- [x] **Test:** 11 test mới trong `ledMaterialTargets.test.js` (convention/legacy/heuristic key, group, resolve role-map, override, back-compat, garbage input). 15/15 pass.
- [ ] *(Phase C — UI-coupled)* Consume `onMeshScan` (đã wire `setMeshMetadata` ở AdminPage/CollabPage) + persist `ledTargetMap` trong `scene_config` qua UI selector.

**Done khi:** load 1 GLB 2-map → ra đúng 2 target với label do admin đặt; load GLB 1-map cũ → vẫn ra 1 target `master` (back-compat). → **Logic layer ✅ verified bằng test; phần persist/selector chuyển sang Phase C vì coupled với UI.**

---

### Phase B — Render đa-texture (chứng minh routing trước khi có upload)
**File:** `src/components/Scene.jsx` (`ModelContent`, ~L495–870), `src/components/StageCanvas.jsx`.

- [x] Đổi prop: thêm `mediaByTarget: Map<targetId, { videoElement?, imageUrl? }>` + `ledTargetMap`; **giữ** `videoElement` / `activeImageUrl` cũ làm **master fallback** (back-compat 100%). Forward qua `StageCanvas → Scene → ModelContent`.
- [x] Hook `useTexturesByTarget(mediaByTarget)` trong `Scene.jsx`: mỗi target 1 `VideoTexture`/`Texture` (image async), **dispose đúng** (drop khi target biến mất + dispose toàn bộ on unmount), trả `[map, version]`. Master texture vẫn là fallback.
- [x] Loop apply: per-mat `resolveLedTargetId([mat.name], child.name, ledTargetMap)` → `texturesByTarget.get(targetId) ?? activeTexture`. **Giữ nguyên** logic vật liệu (protectLed / transparent-grid / emissive / polygonOffset), chỉ thay nguồn texture. `texturesByTarget.size===0` → zero overhead cho clip đơn.
- [x] `useFrame` refresh `needsUpdate` cho mọi per-target video texture; `LedLights` active khi có master **hoặc** per-target texture.
- [x] Mở rộng log `[StageViz LED debug]` in `targetId` + `targetTextureSupplied` per mesh.
- [x] Compile sạch (esbuild) cho Scene.jsx / StageCanvas.jsx / useLedTargets.js / ledMaterialTargets.js. Util test 15/15 vẫn pass.
- [ ] **Verify thủ công bằng app** (cần Phase C/D feed `mediaByTarget`, hoặc test-hook tạm) — chưa chạy mắt thường.

**Done khi:** 2 map hiện 2 nội dung khác nhau đúng vị trí; model 1-map vẫn chạy như cũ. → **Routing code ✅; verify-bằng-mắt dời tới khi có nguồn media (Phase C/D) hoặc 1 test-feed tạm.**

> ⚠️ **Lưu ý wiring (Phase C):** `ledTargetMap` phải truyền **stable reference** (memoize) xuống StageCanvas, nếu không material pass (nặng) sẽ chạy lại mỗi render.

---

### Phase C — Editor upload UX (hybrid: auto theo tên + sửa tay)
**File:** `src/pages/PresentationEditorPage.jsx`, `src/utils/r2Upload.js`, `src/utils/clipThumbnails.js`.

- [x] `src/utils/mapledUpload.js` (mới, +8 test): `parseMapledFilename` (base+suffix), `matchSuffixToTarget` (role token/alias/số), `groupFilesIntoMapledClips` (gom theo base, auto-gán target, cờ missing/conflict).
- [x] Fuzzy-match suffix → targetId (MAIN/SIDE/LEFT/RIGHT/CENTER + alias TRAI/PHAI/CHINH/CANH + số theo order).
- [x] **Bảng gán editable** — component `MapledAssignModal`: mỗi file 1 dòng + dropdown target, cảnh báo conflict (2 file 1 map → chặn Upload) / missing (map không có file → "stays dark").
- [x] `uploadMediaFile` (transcode+presign+upload dùng chung) → `handleUploadMapledGroups` build clip qua `buildMultiMapledClip` → `appendUploadedClip`.
- [x] `onClipFilesSelected` route: stage multi-map + nhóm ≥2 file → modal; ngược lại → `handleUploadClips` cũ (**không phá path đơn**).
- [x] Wire `meshScan`+`useLedTargets`+`ledTargetMap` (từ scene_config) vào editor; pass `onMeshScanChange`/`ledTargetMap` xuống StageCanvas.
- [x] **Fix persistence:** `serializeMediaPlaylistForDb` delegate `serializeClipForPlaylist` → giữ `playbackMode`+`sources[]` (Phase E sớm 1 phần). Editor + ClientPage restore spread `...item` → giữ sources.
- [x] Compile sạch; 9/9 editor test + 67 util/lib test pass.

**Done khi:** kéo 2 file vào → ra 1 clip multi-mapled gán đúng map, sửa tay được; kéo 1 file → clip đơn như cũ. → **Luồng upload/assign + lưu data ✅. Nhìn-thấy-2-map-khác-nhau cần Phase D** (cả editor preview lẫn client hiện vẫn chiếu master lên mọi map vì `mediaByTarget` chưa được set lúc playback).

> ⚠️ **Publish path (AdminPage) chưa fix** — nếu publish 1 project có clip multi-mapled, cần verify AdminPage không strip `sources` (Phase E). Editor ghi thẳng `projects.media_playlist` nên test raw playlist (không qua publish) sẽ giữ sources.

---

### Phase D — Playback sync controller (trái tim của "chạy cùng lúc")
**File:** tách hook mới `src/hooks/useMultiMapledPlayback.js` (giảm rủi ro với `ClientPage.jsx` ~L382–465).

- [ ] Clip multi-mapled → tạo **N `<video>`** (1 / `source.targetId`), preload tất cả, expose `videoElementsByTarget`.
- [ ] **Lockstep:** chọn master = source đầu (theo `order`). Trên master `timeupdate`, nếu `|follower.currentTime − master.currentTime| > 0.08s` → seek follower. Khi master loop (`ended` → 0) → **force-seek tất cả về 0**. play/pause/seek từ UI **fan-out** tới cả nhóm.
- [ ] Render duration / seekbar / currentTime theo **master**.
- [ ] Single clip → đường `activateVideo` cũ **nguyên vẹn**.
- [ ] **Constraint (xem §6):** video trong 1 nhóm **nên cùng độ dài**. Xử lý lệch độ dài: mỗi follower tự `loop` độc lập, master vẫn cầm timeline (sync "mềm", chấp nhận lệch ở biên).

**Done khi:** clip multi chạy đồng bộ ~khung hình; pause/seek áp cho cả nhóm; clip đơn không đổi hành vi.

---

### Phase E — Persist: publish + version snapshot round-trip
**File:** `src/pages/AdminPage.jsx`, `src/pages/PresentationEditorPage.jsx`, `src/lib/presentationVersions.js`.

- [ ] Wire `serializeClipForPlaylist` (đã có, **chưa gọi**) vào **save & publish path** → `sources[]` vào `media_playlist`.
- [ ] Kiểm tra `presentationVersions.js` snapshot/restore **không drop `sources` / `playbackMode`** (file đang có dirty changes — đọc kỹ trước khi sửa).
- [ ] **Bảo vệ regression Media Playlist Wipe** ([[06_Tasks/current_sprint]] + memory `project_media_playlist_wipe_fix`): đảm bảo AdminPage publish **không upsert đè mất** clip multi-mapled.

**Done khi:** publish → reload → `sources` còn nguyên trong DB; version restore giữ đúng multi-mapled.

---

### Phase F — Client end-to-end + back-compat + test
**File:** `src/pages/ClientPage.jsx`, `src/components/StageCanvas.jsx`.

- [ ] `StageCanvas` forward `videoElementsByTarget` / `mediaByTarget` xuống `Scene`.
- [ ] `ClientPage.activateClip`: nhánh multi-mapled → dùng `useMultiMapledPlayback` → set `mediaByTarget`.
- [ ] Verify: chọn 1 visual ở client → **cả 2 map chạy sync**; clip đơn cũ vẫn chạy.
- [ ] **Test matrix:** {model 1-map, model 2-map} × {clip đơn, clip multi} × {publish → client round-trip}.

**Done khi:** toàn luồng C4D → upload → publish → client chạy 2 map đồng bộ, không regression clip đơn.

---

## 5. Rủi ro & cách chặn

| Rủi ro | Mức | Cách chặn |
|---|---|---|
| C4D naming sai → gộp 2 map | 🔴 Cao | Naming Contract §2 + discovery fallback + UI selector (Phase A/C) |
| Video drift, không sync khung hình | 🟠 | Master-driven correction + force-seek tại loop boundary (Phase D); chấp nhận sai số ~80ms cho stage loop |
| Khác độ dài 2 clip trong 1 bài | 🟠 | Khuyến nghị cùng length (§6); UI cảnh báo; follower tự loop |
| Tải nặng (N video 4K cùng lúc) | 🟠 | Preload tuần tự, reuse blob cache (`useBlobUrlCache`); cân nhắc giới hạn 2–3 map |
| Mất clip khi publish (regression cũ) | 🔴 | Phase E điểm 3 (memory `project_media_playlist_wipe_fix`) |
| Version snapshot drop `sources` | 🟠 | Phase E điểm 2 |
| Texture leak (N texture không dispose) | 🟠 | Theo pattern dispose có sẵn ở `Scene.jsx`; test mount/unmount |

---

## 6. Câu hỏi mở / cần xác nhận

- [ ] **Độ dài 2 video trong 1 bài có luôn bằng nhau không?** Nếu **có** → sync chặt, đơn giản. Nếu **không** → phải thiết kế xử lý lệch ngay từ Phase D (follower loop độc lập). *Mặc định plan: khuyến nghị bằng nhau, vẫn chịu được lệch ở mức "mềm".*
- [ ] Tối đa bao nhiêu mapled / sân khấu? (ảnh hưởng giới hạn tải video — đề xuất cap 2–3.)
- [ ] Convention hậu tố tên file chuẩn hóa là gì? (`_MAIN`/`_SIDE` hay `_main`/`_side` hay số `_1`/`_2`?) → định parser Phase C.
- [ ] Có cần audio không, hay tất cả `muted` (hiện client đang `muted`)? Nếu cần audio → chỉ master phát tiếng.

---

## 7. Files sẽ đụng (tổng hợp)

**Sửa:**
- `src/utils/ledMaterialTargets.js` — thêm `discoverLedSurfaces`
- `src/components/Scene.jsx` — render đa-texture theo `targetId`
- `src/components/StageCanvas.jsx` — forward `mediaByTarget`
- `src/pages/PresentationEditorPage.jsx` — upload UX hybrid + bảng gán
- `src/pages/ClientPage.jsx` — nhánh playback multi-mapled
- `src/pages/AdminPage.jsx` — wire `serializeClipForPlaylist` vào publish
- `src/lib/presentationVersions.js` — đảm bảo snapshot giữ `sources`

**Tạo mới:**
- `src/hooks/useLedTargets.js`
- `src/hooks/useMultiMapledPlayback.js`
- (test kèm cho 2 hook + mở rộng `ledMaterialTargets.test.js`)

**Đã xong, chỉ wire vào:**
- `src/utils/mapledMedia.js` (`buildMultiMapledClip`, `serializeClipForPlaylist`, `getClipSources`, `isMultiMapledClip`)
- `src/utils/ledMaterialTargets.js` (`detectLedSurfaceTarget`, `upsertLedTarget`)

---

## 8. Definition of Done (feature)
- Naming Contract §2 được áp khi export C4D; GLB 2-map detect ra đúng 2 target.
- Editor upload 2 file → 1 clip multi-mapled, gán map auto + sửa tay được.
- Publish giữ `sources[]`; version restore không mất.
- Client chọn 1 visual → 2 map chạy **đồng bộ**, play/pause/seek áp cả nhóm.
- **Zero regression:** model 1-map + clip đơn chạy y như trước.
- Test xanh cho toàn test matrix Phase F.
