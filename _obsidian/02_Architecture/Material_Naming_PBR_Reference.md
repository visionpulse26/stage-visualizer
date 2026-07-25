---
title: Material Naming & PBR Reference — C4D → GLB
type: reference
status: authoritative
created: 2026-07-25
tags: [reference, material, naming, pbr, c4d, glb, led, mapled, projection]
related: ["[[05_AI_Rules/AI_Rules]]", "[[06_Tasks/multi_mapled_execution_plan]]", "[[06_Tasks/projection_mapping_execution_plan]]"]
---

# Material Naming & PBR Reference

> **Nguồn:** tổng hợp trực tiếp từ `src/utils/ledMaterialTargets.js`, `src/utils/stageMaterialPresets.js`, `src/components/Scene.jsx` (đã verify bằng chạy code, không suy luận). Cập nhật sau fix `stage-material-preset-underscore` (2026-07-25).

## 0. Nguyên tắc số 1 — phân loại CHỈ theo tên MATERIAL

App **không** nhìn tên mesh để quyết định LED / sàn / mask. Chỉ nhìn **tên material**. Đặt tên mesh tuỳ ý — nhưng **material phải chuẩn**. (Ngoại lệ duy nhất: gợi ý POV collider trong `scanStageMeshes` có đọc tên mesh, nhưng đó chỉ là *hint* prefill, không ảnh hưởng render.)

Một mesh có thể mang nhiều material (multi-material) — mỗi material được xử lý riêng theo bảng dưới.

---

## 1. BỀ MẶT HIỂN THỊ NỘI DUNG (ra "target", nhận file upload)

Đây là các màn nhận video/ảnh. Tên material quyết định nó là target nào.

| Material name | → `targetId` | Label tự sinh | surfaceType | Ghi chú |
|---|---|---|---|---|
| `LED_MAPLED_MAIN` | `main` | Main | solid | LED chính / cổng |
| `LED_MAPLED_SIDE` | `side` | Side | solid | LED cánh (nhiều mesh cùng tên → chung 1 nội dung) |
| `LED_MAPLED_LEFT` / `_RIGHT` | `left` / `right` | Left / Right | solid | cánh trái/phải **khác** nội dung |
| `LED_MAPLED_CENTER` | `center` | Center | solid | |
| `LED_MAPLED_FLOOR` | `floor` | Floor | solid | **Sàn projection mapping** — sàn + cầu thang + mặt dựng bàn nâng, tất cả cùng tên này |
| `LED_MAPLED_<TOKEN>` | `<token>` | (title-case) | solid | token bất kỳ `[A-Z0-9]`; 1 ký tự → label "Mapled X" |
| `MAPLED_<TOKEN>` | `<token>` | | solid | tiền tố `LED_` không bắt buộc |
| `LED_MASTER_MAT` | `master` | Master LED | solid | **legacy 1-màn** — dùng khi sân khấu chỉ có 1 LED |
| `LED_TRANSPARENT_MAT` | `master` | Master LED | solid | legacy, gộp về master |
| `LED_GRID_*` | `master` | Master LED | **transparent-grid** | LED lưới trong suốt (có hệ grid trong admin) |

**Hậu tố cho phép:** `_MAT` / `_MESH` / `_PANEL` / `_SURFACE` (vd `LED_MAPLED_MAIN_MAT` vẫn ra `main`).

### File sân khấu đầy đủ trông thế nào
7 mesh: cổng (`LED_MAPLED_MAIN`) + 2 cánh (`LED_MAPLED_SIDE`) + sàn + 2 cầu thang + mặt dựng bàn nâng (cả 3 cùng `LED_MAPLED_FLOOR`)
→ ra đúng **3 target**: `main`, `side`, `floor`.
→ Upload 1 visual = 3 file `TênBài_MAIN` / `_SIDE` / `_FLOOR` → 1 clip chạy sync.

---

## 2. BỀ MẶT VẬT LÝ (không ra target — chỉ ăn preset PBR theo tên)

| Material name (ví dụ) | Preset | Màu | Rough | Metal | Đặc điểm |
|---|---|---|---|---|---|
| `MAT_TRUSS_RUST` / `_STEEL` / `_IRON`, `*_OXIDE`, `*_CORRODED` | truss-weathered | `#74675d` | .74 | .52 | sắt gỉ, clearcoat nhẹ |
| `MAT_TRUSS_ALU`, `*ALUMINUM`, `*RIGGING`, `*PIPE`, `*TUBE` | truss-aluminum | `#949aa1` | .34 | **.96** | nhôm bóng |
| `MAT_STAGE_FLOOR_BLACK`, `*_FLOOR_BLACK`, `*_DECK`, `*_STAIR`, `*_STEP`, `*_PLATFORM`, `*_RUNWAY`, `*_CATWALK` | stage-floor-black | `#0b0c0f` | **.96** | .02 | sàn đen sâu, gần như không phản xạ HDRI |
| `MAT_FORMAT_BLACK`, `*_MASK`, `*_FASCIA`, `*_COVER`, `*_CLADDING`, `*_SKIRT`, `*_PANEL_BLACK`, `*_TRIM_BLACK` | mask-panel-black | `#151619` | .8 | .03 | mask/che đen mờ |
| `MAT_FRAME`, `*_BRACKET`, `*_SUPPORT`, `*_BEAM`, `*_BAR`, `*_RAIL`, `*_STRUCT` | frame-black | `#2d3136` | .58 | .78 | khung tối, hơi kim loại |
| *(không khớp gì)* | **default** | `#5a5d62` | .72 | .08 | xám trung tính |

**Cách khớp:** tên material được "làm phẳng" (mọi ký tự không phải chữ/số → dấu cách, viết HOA) rồi so **chứa** một trong các pattern. Pattern kiểm theo **thứ tự bảng** (weathered trước aluminum → `TRUSS_RUST` không bị nuốt thành nhôm). Khớp cái đầu tiên là dừng.

> **Đây chính là bug vừa fix.** Trước 2026-07-25, các pattern có `_` (`STAGE_FLOOR`, `PANEL_BLACK`, `TRUSS_RUST`…) không bao giờ khớp → `MAT_STAGE_FLOOR_BLACK` ra **xám** thay vì đen. Nay đã đúng.

---

## 3. ⭐ PBR TỪ C4D — sự thật quan trọng: phần lớn bị BỎ QUA

**Đừng tốn thời gian tinh chỉnh giá trị PBR trong C4D cho bề mặt sân khấu.** Khi load, `Scene.jsx` **thay/ép** vật liệu theo preset ở §2. Roughness/metalness/màu/reflection bạn set trong C4D **bị ghi đè**.

### Cái app THỰC SỰ đọc từ material nguồn

| Thuộc tính C4D | Bề mặt vật lý (§2) | LED (§1) |
|---|---|---|
| **Tên material** | ✅ quyết định preset | ✅ quyết định target |
| **UV** | ✅ giữ (cho texture map) | ✅ **bắt buộc** — quyết định nội dung nằm đâu |
| **Diffuse/Color map** (texture) | ✅ giữ; có map → color ép về trắng để map hiện | ❌ thay bằng video/ảnh upload |
| **Roughness map** | ✅ giữ (roughness ép = 1, để map điều tiết) | ❌ |
| **Metalness map** | ✅ giữ | ❌ |
| `side` (1 mặt / 2 mặt) | ✅ giữ (trừ sàn đen → ép FrontSide) | ❌ ép DoubleSide |
| Giá trị roughness/metalness số | ❌ ép theo preset | ❌ |
| Màu số (không map) | ❌ ép theo preset | ❌ |
| Emissive, transparency, transmission, IOR, clearcoat… | ❌ ép về mặc định ổn định | ❌ |

**Ngoại lệ — 2 preset "preserve" giữ nhiều hơn:** `stage-floor-black` và `mask-panel-black` clone gần nguyên material nguồn rồi chỉ hiệu chỉnh tối lại (giữ map/normal của bạn). Các preset còn lại dựng mới hoàn toàn từ preset + map.

### Kết luận thực hành
Muốn sân khấu đẹp, việc của bạn trong C4D **không phải** chỉnh shader, mà là:
1. **Đặt tên material đúng** (§1, §2) — đây là 90% công việc.
2. **UV cho đúng** — đặc biệt cho LED và sàn mapping (§4).
3. *(tuỳ chọn)* Bake **texture map** (diffuse/roughness/metalness) nếu muốn chi tiết bề mặt — app giữ map, bỏ số.

---

## 4. UV — yêu cầu bắt buộc cho bề mặt hiển thị

- **LED & sàn mapping:** UV **quyết định nội dung nằm ở đâu**. Sàn projection phải được **unwrap sẵn trong 3D** khớp layout canvas (vd 1920×522) — cái skew/nghiêng của map là kết quả unwrap, app chỉ dán lại. App **không** tự tính góc chiếu.
- **Quy ước V:** app set `flipY = false` (chuẩn glTF). Nếu ảnh lên bị **lộn dọc** → UV xuất ngược quy ước; **sửa ở 3D**, không patch code.
- **Verify:** upload thẳng input map màu (xanh/magenta/đỏ) làm ảnh test — đúng vùng đúng màu = UV chuẩn. Map màu này chính là alignment map.
- Sàn thiếu UV → hiện màu bệt. Sửa ở 3D.

---

## 5. Cạm bẫy đặt tên (đã verify bằng test)

1. **Token = MỘT từ, không underscore.** `LED_MAPLED_SIDE_LEFT` → ra `side`, chữ `LEFT` **bị nuốt**, gộp luôn với `LED_MAPLED_SIDE`. Muốn tách: viết liền `LED_MAPLED_SIDELEFT` hoặc dùng `LED_MAPLED_LEFT`.
2. **LED lưới không kèm target riêng.** `LED_GRID_*` luôn về `master`. `LED_GRID_MAPLED_SIDE` ra target `side` nhưng **mất hiệu ứng lưới** (thành solid). Hiện LED lưới chỉ có 1 map.
3. **Tên không convention → heuristic.** `LED Main` vẫn nhận là LED (key `led_main`) nhưng label xấu và **chưa sửa tên được** (`ledTargetMap` chưa persist — xem [[06_Tasks/projection_mapping_execution_plan]] §4). Cứ đặt đúng convention `LED_MAPLED_*` cho chắc.
4. **Nhiều mesh cùng tên material = cùng 1 target/preset.** Đây là **đúng ý đồ** (2 cánh LED, 3 mảnh sàn), không phải lỗi.

---

## 6. Bảng tra nhanh khi đặt tên trong C4D

```
Màn LED nhận video riêng      → LED_MAPLED_<TÊN>      (MAIN, SIDE, LEFT, RIGHT, CENTER, FLOOR…)
LED lưới trong suốt           → LED_GRID_<gì đó>
Chỉ có 1 màn LED duy nhất     → LED_MASTER_MAT
Sàn đen sân khấu / cầu thang  → MAT_..._DECK / _STAIR / _PLATFORM   (một-từ cho chắc)
Mask / tấm che đen            → MAT_..._MASK / _FORMAT / _COVER
Truss nhôm                    → MAT_TRUSS_ALU
Truss sắt gỉ                  → MAT_TRUSS_RUST
Khung / support kim loại tối  → MAT_..._FRAME / _SUPPORT / _RAIL
Còn lại (xám trung tính)      → đặt gì cũng được, rơi về default
```

> Sàn projection mapping thì dùng `LED_MAPLED_FLOOR` (mục §1) — **không** phải `MAT_..._FLOOR` (mục §2). Cái đầu nhận nội dung chiếu, cái sau là sàn vật lý đen.

---

## 7. UPLOAD & ĐẶT TÊN FILE Ở PRESENTATION EDITOR

> Nguồn: `PresentationEditorPage.jsx` (`onClipFilesSelected`, ~L2108) + `mapledUpload.js` (đã verify bằng chạy code).

### Luồng tự động — app tự quyết single hay multi-mapled

Ở editor, nút upload cho **chọn nhiều file cùng lúc**. Khi chọn:

```
Chọn file
  ├─ Sân khấu chỉ 1 màn (1 target)         → luôn clip đơn, mỗi file 1 clip
  └─ Sân khấu nhiều target (multi-mapled)
        ├─ Chọn ≥2 file cùng base name      → mở modal "Assign LED maps" (gán tay được)
        └─ Chọn 1 file                       → clip đơn (chiếu master lên mọi map)
```

Bạn **không phải bấm chế độ gì** — cứ chọn đủ file của một visual, app tự gom.

### Quy tắc đặt tên file — `<TênVisual>_<SUFFIX>.<ext>`

App tách **token cuối** (sau dấu `_`, `-`, `.`, hoặc space) làm suffix để định tuyến; phần còn lại là **base name** dùng để gom nhóm.

```
Opening_MAIN.mp4  ┐
Opening_SIDE.mp4  ├─ cùng base "Opening" → gom thành 1 clip multi-mapled
Opening_FLOOR.mp4 ┘   → chạy sync như một
```

**Base name phải GIỐNG HỆT nhau** thì mới gom chung 1 clip. `Opening_MAIN.mp4` + `Intro_SIDE.mp4` → 2 clip khác nhau.

### Bảng suffix → target (đã verify)

| Suffix file | → target | Ghi chú |
|---|---|---|
| `_MAIN` `_M` `_CHINH` `_CONG` `_MASTER` | `main` | LED chính |
| `_MAPPING` `_P` | `floor` | **Sàn projection mapping** — song song với `_M`/`_MAIN` |
| `_FLOOR` | `floor` | cũng khớp sàn (trùng tên target) |
| `_SIDE` `_CANH` `_PHU` `_WING` `_S` | `side` | |
| `_LEFT` `_TRAI` `_L` | `left` | |
| `_RIGHT` `_PHAI` `_R` | `right` | |
| `_CENTER` `_GIUA` `_TRUNG` `_C` | `center` | |
| `_<TÊN TARGET>` | target trùng tên | mọi targetId đều tự khớp bằng chính tên nó |
| `_1` `_2` `_3` … | theo **thứ tự** target | ⚠️ thứ tự khó đoán — xem cảnh báo dưới |

> **Cặp convention của chương trình:** `_M` / `_MAIN` cho LED chính, `_P` / `_MAPPING` cho sàn mapping. `_P` (không phải `_M`) là dạng ngắn của mapping vì `_M` đã thuộc về `main`.

### ⚠️ Lưu ý đặt tên file

1. **Sàn dùng `_P`, `_MAPPING`, hoặc `_FLOOR`.** (`_MAP` / `_SAN` **không** chạy — không nằm trong alias.)
2. **Tránh suffix số `_1/_2`.** Nó map theo *thứ tự* target, mà thứ tự phụ thuộc `order` nội bộ — ví dụ thực tế: `_1`→floor, `_2`→main, `_3`→side (không phải thứ tự trực giác). Dùng suffix có tên (`_MAIN`/`_MAPPING`) cho chắc.
3. **Suffix sai / thiếu vẫn không sao.** File không match được sẽ được **điền vào target còn trống theo thứ tự**, và **modal luôn cho sửa tay** trước khi upload — nên tên file chỉ là *gợi ý auto*, không phải ràng buộc cứng.
4. **Không phân biệt hoa/thường, không phân biệt dấu phân cách:** `Opening_MAIN`, `opening-main`, `Opening.MAIN`, `Opening main` đều như nhau.

### Trong modal "Assign LED maps"
- Mỗi file 1 dòng + dropdown chọn target; cái nào auto-khớp có nhãn "auto".
- **Conflict** (2 file cùng 1 target) → chặn Upload, phải sửa.
- **Missing** (target không có file) → cảnh báo "map đó sẽ tối", vẫn upload được.

### Định dạng nhận
Video: `.mp4 .webm .mov .mkv .avi .hevc .m4v .ts .wmv .flv` · Ảnh: `.webp .png .jpg .jpeg .gif`
(File codec/độ phân giải trình duyệt không giải mã được sẽ tự transcode; ảnh LED quá lớn tự hạ ~2K khi lên GPU — file gốc trên R2 giữ nguyên.)

### Ví dụ đặt tên cho sân khấu LED + sàn mapping
```
BaiHat1_M.mp4        → LED chính (Center + LED Floor + Raised floor)
BaiHat1_P.mp4        → sàn mapping (+ 2 cầu thang + mặt dựng bàn nâng)
```
hoặc dạng dài:
```
BaiHat1_MAIN.mp4     → LED chính
BaiHat1_MAPPING.mp4  → sàn mapping
```
Chọn cả 2 cùng lúc → 1 clip "BaiHat1" chạy sync. Bài khác thì đổi base: `BaiHat2_M` / `_P`.
