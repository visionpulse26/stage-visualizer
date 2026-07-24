---
title: Projection Mapping (Sàn Mapping) — Execution Plan
type: task-management
status: planning
created: 2026-07-23
updated: 2026-07-23
tags: [tasks, feature, projection-mapping, uv, mapled, render]
related: ["[[06_Tasks/multi_mapled_execution_plan]]", "[[05_AI_Rules/AI_Rules]]", "[[06_Tasks/current_sprint]]"]
---

# Projection Mapping — Execution Plan

> **Chốt hướng (2026-07-23):** Sàn mapping đã được **UV unwrap sẵn trong 3D** — input map 1920×522 (sàn xanh lá + 2 cầu thang magenta + mặt dựng bàn nâng đỏ) đã khớp đúng hình học trên mockup SKP. Vậy **UV chính là phép tính**. Website không cần tính góc máy chiếu, không cần dựng ma trận chiếu, không cần warp. Chỉ cần: **đặt tên material → dán texture theo UV có sẵn**.
>
> Bản đầu của file này thiết kế cả tầng mô phỏng máy chiếu (frustum off-axis, occlusion, anamorphic). Đó là **over-engineering** cho nhu cầu hiện tại — đã hạ xuống [[#Phụ lục — tầng mô phỏng máy chiếu (CHƯA làm)]].

---

## 1. Vì sao không cần tính góc máy chiếu

Người dựng 3D khi unwrap UV đã **giải xong** bài toán hình học: mỗi mảnh sàn / cầu thang / mặt dựng bàn nâng được gán một vùng trên canvas 1920×522. Cái skew trong input map (hình bình hành nghiêng) chính là **kết quả** của phép tính đó, do người vận hành mapping làm bằng tay trong media server.

Website chỉ cần đọc lại kết quả: `texture` + `mesh.uv` → xong. Đây **đúng bằng** cơ chế mapled hiện tại đang chạy cho LED.

→ **Projection mapping = một mapled nữa.** Không phải hệ thống song song.

---

## 2. Bước 1 — Đặt tên material *(0 dòng code, chạy được ngay hôm nay)*

Đặt material của **tất cả** mesh nhận mapping (sàn + 2 cầu thang + mặt dựng bàn nâng) thành **cùng một tên**:

```
LED_MAPLED_FLOOR
```

Đã trace qua code, đường đi hoàn chỉnh và **không cần sửa gì**:

| Bước | File | Kết quả |
|---|---|---|
| Detect | `ledMaterialTargets.js` `TARGETED_LED_RE` | khớp → `targetId: 'floor'`, `matchKind: 'convention'` |
| Gom target | `resolveLedTargets` | `floor` xuất hiện trong danh sách target — **không cần `ledTargetMap`** (`resolveLedTargetId` fallback về surface key) |
| Auto-gán file | `mapledUpload.js` `buildTargetTokens` | file `TênBài_FLOOR.mp4` → tự vào target `floor` |
| Modal sửa tay | `MapledAssignModal.jsx` | `floor` hiện trong dropdown cạnh LED |
| Sync playback | `multiMapledPlayback.js` | video sàn chạy lockstep với video LED, **không sửa dòng nào** |
| Render | `Scene.jsx` material pass | mỗi mesh nhận 1 material riêng, **sample UV island của chính nó** → 4 mesh, 1 texture, đúng vị trí |

**Nhiều mesh dùng chung một tên material là đúng ý đồ** — chúng gom về một target, chia nhau một texture, mỗi mesh đọc UV riêng.

### Cách nghiệm thu bước 1
Upload thẳng **cái input map màu** (xanh lá / magenta / đỏ) làm ảnh test. Nếu trên web:
- xanh lá nằm trên sàn,
- magenta nằm trên 2 cầu thang,
- đỏ nằm trên mặt dựng bàn nâng,

→ UV đúng, xong. Cái map màu này **chính là alignment map**, dùng luôn để verify, không cần dựng công cụ gì thêm.

### Rủi ro duy nhất của bước 1
- **UV lật chiều V.** `Scene.jsx` set `flipY = false` (đúng chuẩn glTF). Nếu 3D xuất ra UV theo quy ước ngược, ảnh sẽ lộn dọc. Phát hiện ngay bằng alignment map; sửa ở khâu export hoặc lật V trong 3D — **không** patch bằng code.
- **Mesh thiếu UV.** SketchUp xuất mesh nhiều khi không có UV dùng được. Alignment map sẽ ra một mảng màu bệt. Sửa ở 3D.

---

## 2b. Hệ thống đặt tên đầy đủ — 1 file sân khấu có LED + projection

> Toàn bộ bảng dưới **đã chạy thật qua `getLedSurfaceKey` / `resolveLedTargets`**, không phải suy luận từ regex.

### Bề mặt hiển thị nội dung (ra target, nhận file upload)

| Material name | → `targetId` | Label tự sinh | surfaceType | Dùng cho |
|---|---|---|---|---|
| `LED_MAPLED_MAIN` | `main` | Main | solid | LED cổng chính |
| `LED_MAPLED_SIDE` | `side` | Side | solid | LED cánh (2 bên chung 1 nội dung) |
| `LED_MAPLED_LEFT` / `_RIGHT` | `left` / `right` | Left / Right | solid | LED cánh trái/phải **khác** nội dung |
| `LED_MAPLED_FLOOR` | `floor` | Floor | solid | **Sàn mapping** (sàn + cầu thang + mặt dựng bàn nâng — cùng tên) |
| `LED_MAPLED_A` | `a` | Mapled A | solid | 1 ký tự → label "Mapled A" |
| `LED_GRID_*` | `master` | Master LED | **transparent-grid** | LED lưới trong suốt |
| `LED_MASTER_MAT` | `master` | Master LED | solid | Legacy 1-màn |

### Bề mặt vật lý (không ra target — chỉ ăn preset vật liệu)

| Material name | Preset | Kết quả |
|---|---|---|
| `MAT_TRUSS_ALU` | truss-aluminum | nhôm bóng, metalness .96 |
| `MAT_FORMAT_BLACK` | mask-panel-black | đen mờ, mask sân khấu |
| `MAT_DECK_BLACK` / `MAT_STAIR` / `MAT_PLATFORM` | stage-floor-black | đen sâu #0b0c0f |
| `MAT_FRAME` / `MAT_SUPPORT` / `MAT_RAIL` | frame-black | khung tối, hơi kim loại |

### 3 cạm bẫy đã verify bằng test

1. **Token phải là MỘT từ, không có underscore.**
   `LED_MAPLED_SIDE_LEFT` → `targetId: 'side'` — chữ `LEFT` **bị nuốt mất**, và nó sẽ gộp chung với `LED_MAPLED_SIDE` thành một target. Muốn tách thì viết liền: `LED_MAPLED_SIDELEFT`, hoặc dùng token riêng `LED_MAPLED_LEFT`.

2. **Không kết hợp được LED lưới + target riêng.** `LED_GRID_*` luôn về `master`. Còn `LED_GRID_MAPLED_SIDE` thì ra `targetId: 'side'` nhưng `surfaceType: 'solid'` — **mất luôn hiệu ứng lưới**. Hiện tại LED lưới chỉ có một map duy nhất.

3. **Tên không theo convention rơi vào heuristic.** `LED Main` → key `led_main`, label "Led Main"; `LED CANH TRAI` → `led_canh_trai`. Vẫn tách được thành target riêng nhưng label xấu, và **không sửa được** vì `ledTargetMap` chưa được ghi (§4).

### Kết quả với file sân khấu đầy đủ
7 mesh (cổng + 2 cánh + sàn + 2 cầu thang + mặt dựng bàn nâng) → đúng **3 target**: `floor`, `main`, `side`. Upload 3 file `TênBài_FLOOR` / `_MAIN` / `_SIDE` → 1 clip chạy sync.

### ✅ Bug đã phát hiện và ĐÃ FIX (2026-07-23) — preset chứa dấu `_` không bao giờ khớp

`normalizeMaterialTokens` (`Scene.jsx:325`) đổi mọi ký tự không phải chữ/số thành **dấu cách**, rồi `resolveStageMaterialPreset` so bằng `tokens.includes(pattern)` với các pattern **có underscore**. Chúng không thể khớp:

`STAGE_FLOOR` · `FLOOR_BLACK` · `BLACK_FLOOR` · `PANEL_BLACK` · `TRIM_BLACK` · `TRUSS_RUST` · `RUST_TRUSS` · `TRUSS_STEEL` · `TRUSS_IRON`

Hệ quả đã verify:

| Material | Preset thực tế | Đáng lẽ phải là |
|---|---|---|
| `MAT_STAGE_FLOOR_BLACK` | ❌ `default` → **xám #5a5d62** | `stage-floor-black` → đen #0b0c0f |
| `MAT_TRUSS_RUST` | ❌ `truss-aluminum` → nhôm bóng | `truss-weathered` → sắt gỉ |
| `MAT_PANEL_BLACK` | ❌ `default` → xám | `mask-panel-black` |

- [x] **Đã fix.** Tách logic preset ra `src/utils/stageMaterialPresets.js` (thuần, test được) và normalize **cả hai phía** trước khi so — pattern được normalize một lần lúc load module, không tốn chi phí per-mesh. `Scene.jsx` import lại, hành vi khác **duy nhất** ở 9 pattern trước đây chết.
- [x] `src/utils/stageMaterialPresets.test.js` — 7 test, gồm một test **"every authored pattern is reachable"** chặn đúng lớp bug này tái phát (pattern không tên nào chạm tới được).
- **Ảnh hưởng:** sân khấu đang dùng `MAT_STAGE_FLOOR_BLACK` / `MAT_PANEL_BLACK` / `MAT_TRUSS_RUST` sẽ **đổi diện mạo** — xám → đen, nhôm bóng → sắt gỉ. Đây là ý muốn, nhưng cần xem lại các project cũ trên production sau khi deploy.

---

## 3. Bước 2 — Cho nó nhìn ra "chiếu" thay vì "LED" *(nhỏ, ~1 nhánh trong `Scene.jsx`)*

Đây là **khoảng cách thật sự duy nhất** còn lại sau bước 1. Bước 1 chạy đúng, nhưng bề mặt sẽ được render bằng đúng vật liệu LED:

```js
// Scene.jsx — nhánh LED hiện tại
new THREE.MeshStandardMaterial({
  color: black, emissive: white, emissiveMap: texture,
  emissiveIntensity: 1.5,   // ← tự phát sáng như tấm LED
  toneMapped: true, side: DoubleSide,
})
// + castShadow=false, receiveShadow=false
// + LedLights spawn một pointLight ngay giữa sàn
```

Sàn mapping **không tự phát sáng** — nó là mặt khuếch tán được ánh sáng chiếu vào. Để nguyên sẽ ra cái sàn phát quang, không giống thực tế.

### Việc cần làm
Thêm tên material `PROJ_MAPPED_<TOKEN>` đi vào **đúng đường ống target/upload/sync của mapled** (không đổi gì ở đó), chỉ rẽ nhánh ở khâu tạo material:

- [ ] `src/utils/projectionSurfaces.js` (mới, nhỏ) — nhận diện `PROJ_MAPPED_*` theo **material name**, trả cùng shape với `getLedSurfaceKey` để hai bên gộp chung được thành một danh sách target.
- [ ] `Scene.jsx` — nhánh material mới cho surface loại `projection`:
      • `emissiveIntensity` thấp hơn nhiều (~0.25–0.4, chỉnh được) thay vì 1.5
      • `receiveShadow = true` — sàn vẫn ăn bóng đổ của sân khấu
      • **black level**: vùng đen của content ra **xám nhạt**, không đen tuyệt đối — máy chiếu không chiếu được màu đen. Chi tiết này khiến preview trung thực và giúp client hiểu ngay vì sao sàn mapping không "đét" như LED
      • không spawn `LedLights` cho surface loại này
- [ ] Slider `projectionGain` + `projectionBlackLevel` trong `UIPanel` (Tailwind, mục cạnh `Transparent LED`), lưu vào `scene_config`.
- [ ] Test: GLB không có `PROJ_MAPPED_*` → **không đổi một byte hành vi cũ**.

**Ước lượng:** 1 file mới nhỏ + ~60–100 dòng trong `Scene.jsx` + 1 khối slider. Không đụng upload, không đụng playback, không đụng data model.

> **Có thể bỏ qua bước 2** nếu bạn thấy trông đã ổn ở bước 1 — nó thuần về độ trung thực hình ảnh, không phải chức năng.

---

## 4. Bước 3 — Nợ persist *(chỉ cần khi muốn đổi tên hiển thị của target)*

Khảo sát phát hiện: **`ledTargetMap` chưa bao giờ được ghi.** Nó được đọc ở `ClientPage:769`, `CollabPage:552`, `PresentationEditorPage:1533`, nhưng `AdminPage.handlePublish` (`AdminPage.jsx:1031`) build `scene_config` **không có key đó**.

Hệ quả: multi-mapled chỉ chạy được ở chế độ zero-config (đặt tên đúng convention). Cái UI selector gán role trong [[06_Tasks/multi_mapled_execution_plan]] Phase A/C **chưa từng được build**.

**Với hướng đi hiện tại, đây KHÔNG phải blocker** — đặt tên `LED_MAPLED_FLOOR` / `PROJ_MAPPED_FLOOR` là đủ, label tự sinh ra "Floor". Chỉ cần fix nếu muốn admin đổi tên hiển thị (vd "Sàn Mapping") hoặc gán role cho GLB đặt tên sai convention.

- [ ] Thêm `ledTargetMap` vào `scene_config` trong `AdminPage.handlePublish`.
- [ ] ⚠️ **Chỉ thêm key vào object `scene_config`**, không đổi shape của `record` — publish đang dính P0 RLS `owner_id` mở (AI_Rules §3, [[06_Tasks/current_sprint]]).

---

## 5. Thứ tự thực thi

```
Bước 1 (đổi tên material trong 3D, export GLB)
   └─ upload alignment map → verify UV
        ├─ ĐÚNG  → xong phần chức năng. Đánh giá xem có cần Bước 2 không.
        └─ SAI   → sửa UV ở 3D, KHÔNG patch bằng code
```

Bước 2 chỉ bắt đầu **sau khi** bước 1 verify xong bằng alignment map. Đừng viết code render khi chưa biết UV có đúng không — đúng bài học của multi-mapled: naming/UV sai phát hiện muộn là blocker thật.

---

## 6. Definition of Done

- Alignment map lên web: xanh lá đúng sàn, magenta đúng 2 cầu thang, đỏ đúng mặt dựng bàn nâng.
- Upload 1 visual gồm file LED + file sàn → **1 clip, chạy sync như một**.
- *(nếu làm bước 2)* Sàn nhìn ra chất "chiếu": không phát quang, ăn bóng đổ, đen ra xám.
- **Zero regression:** sân khấu LED-only + clip đơn chạy y hệt trước.

---

## 7. Câu hỏi mở

1. Content sàn cuối cùng có **cùng layout canvas 1920×522** với alignment map không? (Nếu media server đổi layout thì UV phải unwrap lại — đó là việc ở 3D, không phải web.)
2. Có làm bước 2 không, hay bước 1 đã đủ đẹp?

---

## Phụ lục — tầng mô phỏng máy chiếu (CHƯA làm)

Giữ lại ở đây phòng khi sau này cần **kiểm tra thi công** chứ không chỉ xem trước hình ảnh. **Không nằm trong scope hiện tại.**

Chỉ đáng làm nếu xuất hiện một trong các nhu cầu:
- Kiểm tra **vùng phủ**: máy chiếu có với tới hết sàn không, chỗ nào hở.
- Kiểm tra **bóng đổ**: truss / kết cấu / bàn nâng có chắn luồng chiếu không.
- Kiểm tra **độ mịn**: px/m ở mép xa, góc tới quá chếch.
- Kiểm tra **vùng chồng lấn** giữa nhiều máy.

Khi đó, cách làm đã khảo sát xong:

- **Nguồn dữ liệu:** mesh khối chóp beam trong SKP, material `PROJ_RIG_<ID>`. Phải là **mesh đặc** — SketchUp không export edges/guides sang GLB. Đọc **vertices**, không đọc node transform (SketchUp bake transform vào geometry, `matrixWorld` sẽ ra rác).
- **Hình học → ma trận:** dedup vertex → PCA tìm mặt phẳng lớn nhất (tứ giác đích) → đỉnh = vertex xa mặt đó nhất (chóp cụt: least-squares giao 4 đường) → dựng **off-axis projection** (Kooima) từ (đỉnh, `Pa`, `Pb`, `Pc`). Off-axis xử lý **lens shift + keystone chính xác tuyệt đối** vì tứ giác trong file 3D đã mã hoá sẵn — không cần hỏi throw ratio.
- **Suy ngược ra để đối chiếu bản vẽ:** throw distance (so với `50108 mm` trên mặt cắt), throw ratio, lens shift %, px/m, góc tới.
- **Occlusion:** bake depth từ camera máy chiếu vào `WebGLRenderTarget` + `DepthTexture` **một lần sau khi load** (sân khấu tĩnh) → chi phí runtime ≈ 0. Giới hạn: vật thể động (avatar POV) sẽ không đổ bóng.
- **Đã cân nhắc và loại `THREE.SpotLight.map`** (three r160 có sẵn cookie texture + shadow: `WebGLLights.js:306`, `lights_fragment_begin.glsl:111`; aspect chỉnh qua `shadow.mapSize`, tránh crop góc bằng `shadow.focus < 1`). Loại vì frustum spotlight luôn **đối xứng** → không diễn tả được lens shift, và không kiểm soát được blend weight vùng chồng lấn. Ghi lại để lần sau khỏi khảo sát lại.

### Về "warp góc nhìn" — vì sao không cần code
Anamorphic (khối 3D chỉ dựng đúng ở một góc) là thuộc tính **của content**, do designer vẽ, không phải của renderer. Với UV đã unwrap sẵn, hiệu ứng đó **đã nằm sẵn trong file input map** — website dán texture theo UV là tự có. Chỉ khi nào muốn website **tự warp** content cho một góc nhìn tuỳ ý (thay việc của media server) mới cần dựng frustum thứ hai. Không phải nhu cầu hiện tại.
