# Stage Visualizer Beta — Audit Report

Date: 2026-05-16
Scope: `origin/main..beta/worktree` (43 commits, ~15.4k LOC, 54 files)
Auditor: Senior Full-Stack review (4 specialist passes synthesized)
Verdict: ⛔ **KHÔNG ship production** đến khi xử lý xong nhóm Critical (đặc biệt nhóm RLS + Upload).

Related: [admin-presentation-plan.md](./admin-presentation-plan.md) — version lifecycle plan này tham chiếu nhiều finding C6/C7/M8–M12 bên dưới.

---

## 0. Tổng quan

4 feature block lớn trên branch `beta/worktree`:

1. **POV / FPS system** — Rapier physics, kinematic capsule, colliders, pointer-lock.
2. **Presentation Editor + Director Notes + Versioning** — draft/publish/archive, annotation, optimistic locking.
3. **Mobile Client View + Feedback** — `/view/:projectId` route, mobile portrait/landscape shell, snapshot upload.
4. **Embed widget + Infra** — opaque token route, oEmbed, CSP, R2 upload pipeline.

**Counts:** 10 Critical · 20 Major · 18 Minor.

## Fix status tracker

> Updated from implementation session after audit. Use this table to skip findings already handled.

| Finding | Status | Notes |
|---|---|---|
| C1 | DONE (code/migration), LIVE PARTIAL | Local RLS v3 exists; live DB only has narrow guest/view feedback fixes because production still needs `projects.owner_id` backfill before full owner-scoped RLS. |
| C2 | DONE (code/migration), LIVE PARTIAL | Sanitized public views/RPC added locally; live has narrow public views needed for `/view` and guest feedback. |
| C3 | DONE | `/view/:projectId` no longer uses public `select('*')`; uses sanitized view/fallback whitelist. |
| C4 | DONE | Upload API now requires Supabase bearer token, allow-lists MIME/extensions, size cap, content length, 300s TTL. |
| C5 | DONE | Removed `VITE_UPLOAD_SECRET` / `UPLOAD_SECRET` / `x-upload-token` client-secret path. |
| C6 | DONE | Version lifecycle moved to atomic Postgres RPCs. |
| C7 | DONE | Optimistic-lock fallback updates bind `version_token`; RPC enforces token. |
| C8 | DONE | Feedback submit stores pending local draft before network call and restores on retry. |
| C9 | DONE, HAND TEST PASS | Canvas-bound pointer lock with rejection handling/warning. |
| C10 | DONE, HAND TEST PASS | POV physics stays mounted and pauses instead of remounting. |
| M1 | DONE | oEmbed validates slug, avoids double decode, escapes iframe HTML. |
| M2 | DONE | `/embed` now uses `Referrer-Policy: no-referrer`. |
| M3 | DONE | Embed CSP removed `script-src 'unsafe-inline'`. |
| M4 | DONE | Removed legacy UUID fallback for `/embed/:slug`. |
| M7 | DONE | Regenerate embed token now round-trips DB returned token. |
| M8 | DONE | Added unique project/version number constraint and advisory lock path. |
| M9 | DONE | Covered by atomic `publish_presentation_version` RPC. |
| M10 | DONE | Director note `updatedAt` updates on blur instead of every keystroke. |
| M11 | DONE | Version history reload actions guard against unsaved editor changes. |
| M12 | DONE | Thumbnail queue dedup uses `Map<slide+clipUrl, Promise>`. |
| M13 | DONE, HAND TEST PASS | Mobile viewport uses `visualViewport`; responsive shell no longer remounts on rotation. |
| M14 | DONE, HAND TEST PASS | Mobile feedback sheet uses dynamic viewport height so submit remains reachable. |
| M15 | DONE | Annotation layer uses pointer events instead of mouse-only handlers. |
| M16 | DONE | Annotation draft cancels if viewport changes mid-draw. |
| M17 | DONE | Guest feedback edit/delete is restricted to own feedback via `can_edit`; mobile history respects edit permissions. |
| M18 | DONE | Note-focus gesture exit threshold increased to avoid tap jitter dismissal. |
| M19 | DONE, HAND TEST PASS | POV controller clears held keys on blur/pointer-lock change. |
| M20 | DONE, HAND TEST PASS | POV camera near plane and camera/fog restore fixed. |
| m11 | DONE | POV camera rest wait now supports `AbortSignal`. |
| m13 | DONE | Client localStorage reads/writes use safe wrappers. |
| m14 | DONE | Feedback name/comment inputs have max length. |
| m17 | DONE | Archive prune rejects dangerous `keepLatest < 1` / `olderThanDays <= 0`. |
| m18 | DONE | Upload UI now shows generic errors; raw diagnostic logs only in dev. |
| M5 | DONE (code + migration), MANUAL STEP | `presentation_versions_author_uuid.sql` adds `*_user_id` columns, backfills from `auth.users.email`, and provides `*_with_author` views for admin reads. Client now writes uuid alongside email. Drop legacy email columns in a follow-up after one release. |
| M6 | DONE | `client_feedback_public` view in `presentation_versions_rls_v3.sql` already excludes `admin_note`. `client_feedback_with_resolver` (auth-only) added for admin paths. |
| m1 | DONE | Added `useAnalyticsConsent` hook + `ConsentBanner` on `/view`. `recordClientPageView` and reviewer-name localStorage writes gated on consent. |
| m2 | DONE | Snapshot R2 keys now include a 16-char random suffix (`crypto.randomUUID`) so they cannot be enumerated by project id. |
| m3 | DONE (code), MANUAL STEP | Optional `R2_PRIVATE_BUCKET` env switches snapshot uploads to a private bucket. New `/api/get-snapshot-url` issues 5-min signed GET URLs with admin/owner check. Requires creating the bucket + setting env var. |
| m4 | DONE | Admin embed URL is masked behind a `Show/Hide` toggle with screen-share warning. |
| m5 | DONE (code + migration), MANUAL STEP | `presentation_versions_retention_cron.sql` adds `prune_archived_presentation_versions(keep_latest, older_than_days)` and pg_cron weekly schedule (20/180 defaults). Requires enabling `pg_cron`. |
| m8 | DONE | Each `exhaustive-deps` suppression now has a short comment explaining why the missing deps would cause regressions. |
| m9 | DONE | `usePovController.tick()` split into `readMoveDirection`, `applyVelocityToRigidBody`, `clampToGeofence`, `resetMotionState`. |
| m10 | DONE | Added `scanStageMeshesAsync` (idle-chunked) and call it from `Scene.jsx`; sync version kept as fallback. |
| m12 | DONE | Removed `__SB_EK` base64 obfuscation. Supabase anon key now reads plain from env per docs (RLS is the actual protection). |
| m15 | DONE | `MobileFeedbackSheet` now owns its own name/comment state — parent re-renders no longer fire on every keystroke. Parent still seeds initial values from restored localStorage draft. |
| m16 | DONE | `restoreVersion` fallback path retries without `restored_from` if the column is missing in target env. |
| m6, m7 | DEFERRED (sprint-level refactor) | `ClientPage.jsx` (3107 LOC) and `PresentationEditorPage.jsx` (2168 LOC) splits — not safe inside this hardening pass. Track separately. |

| Severity | Action window | Khái niệm |
|---|---|---|
| 🔴 Critical | Trước khi merge `beta → main` | Bảo mật, mất dữ liệu, crash blocker |
| 🟠 Major | Sprint kế tiếp | UX/correctness, race, refactor cần thiết |
| 🟡 Minor | Backlog | Cleanup, tech debt, hardening |

Mỗi finding bên dưới có:
- **Triệu chứng** (impact + tại sao quan trọng)
- **Vị trí** (file:line)
- **Hướng fix** (cụ thể, không generic)

---

## 1. 🔴 CRITICAL (10)

### C1 — RLS mở toang cho anon trên `presentation_versions` + `client_feedback_items`

**Triệu chứng**
Bất kỳ ai truy cập internet đều có thể `SELECT/INSERT/UPDATE/DELETE` toàn bộ feedback và version snapshot của mọi project. Bao gồm:
- Xoá hoặc sửa tên/comment của reviewer bất kỳ.
- Đọc mọi draft (kể cả slide có `hiddenFromClient: true`).
- Enumerate email admin (`created_by`, `published_by`, `resolved_by`).
- Đọc trường `admin_note` được code mô tả là "admin-internal".

**Vị trí**
[supabase/presentation_versions_schema.sql:117-139](../supabase/presentation_versions_schema.sql)

```sql
-- Hiện tại
grant select, insert, update, delete on presentation_versions to anon;
create policy "anon all" on presentation_versions for all using (true) with check (true);
```

**Hướng fix**
1. Bỏ hoàn toàn `update/delete` cho `anon` trên cả 2 bảng.
2. Cho `anon` `SELECT` chỉ những row có `status = 'published'` AND `project_id` thuộc project có `embed_enabled = true` (hoặc public mode).
3. `INSERT` (cho feedback) phải có `WITH CHECK` join sang project + giới hạn chỉ ghi vào `version_id` mới nhất đã publish.
4. Mọi mutation admin (`saveDraft`, `publishVersion`, `restoreVersion`, `setFeedbackStatus`, `deleteFeedback`, `saveAdminNote`) phải qua `authenticated` role + có policy join `projects.owner_id = auth.uid()`.
5. Migration mới `supabase/presentation_versions_rls_v3.sql` — viết policy mới, drop policy cũ trong cùng transaction.

```sql
-- Mẫu rút gọn
create policy "anon read published" on presentation_versions
  for select to anon
  using (
    status = 'published'
    and exists (
      select 1 from projects p
      where p.id = presentation_versions.project_id
        and p.embed_enabled = true
    )
  );

create policy "auth owner write" on presentation_versions
  for all to authenticated
  using (
    exists (select 1 from projects p
            where p.id = project_id and p.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from projects p
            where p.id = project_id and p.owner_id = auth.uid())
  );
```

**Test plan**
- Anon JWT thử `delete from client_feedback_items` → fail.
- Anon thử `select admin_note from client_feedback_items` → cột không trả về (dùng view).
- Admin A của project X thử mutate project Y → fail.

---

### C2 — `projects.embed_token` enumerate được bởi anon

**Triệu chứng**
Token opaque được thiết kế làm authorization secret cho `/embed/:token`, nhưng RLS hiện cho `anon` `SELECT` toàn bảng `projects` → `select embed_token from projects` trả về mọi token, kể cả project có `embed_enabled = false`.

**Vị trí**
[supabase/rls_policies.sql:10-12](../supabase/rls_policies.sql)

**Hướng fix**
Hai lựa chọn (chọn 1):

**Option A — Restrict SELECT + sanitized view (khuyến nghị):**
```sql
revoke select on projects from anon;

create view projects_public as
  select id, name, description, scene_config, media_playlist
  from projects
  where embed_enabled = true;

grant select on projects_public to anon;
```
Code phải đổi `select('*').from('projects')` → `from('projects_public')` ở mọi public route.

**Option B — RPC resolve token:**
```sql
create function resolve_embed(p_token text)
returns projects
language sql security definer as $$
  select * from projects where embed_token = p_token and embed_enabled = true limit 1;
$$;
```
Code embed page gọi `supabase.rpc('resolve_embed', { p_token: slug })`.

**Test plan**
Anon `select embed_token from projects` → 0 rows hoặc error.

---

### C3 — `/view/:projectId` `select('*')` rò rỉ toàn bộ row project

**Triệu chứng**
`ClientPage` fetch project public với `select('*')` → ship `embed_token`, `scene_config` (gồm URLs HDRI nội bộ, có thể là R2 private URL), email, internal flags… xuống browser anon. Bất kỳ ai xem source/devtools đều thấy.

**Vị trí**
[src/pages/ClientPage.jsx:371-389](../src/pages/ClientPage.jsx)

**Hướng fix**
1. Đổi sang `select` whitelist cột: `select('id, name, scene_config, media_playlist, presentation_mode, ...')` (loại `embed_token`, `owner_id`, `admin_note`, `embed_enabled`, etc.).
2. Tốt hơn: dùng `projects_public` view ở C2.
3. `scene_config` cần được sanitize server-side trước khi expose: loại bỏ key bắt đầu bằng `_private` hoặc dùng `jsonb` projection.
4. Check `lockCheck` (L381) phải so `owner_id = auth.uid()` chứ không phải "có session bất kỳ".

**Test plan**
Anon `fetch('/view/<id>')` xem response → không có `embed_token`, không có internal URL.

---

### C4 — Presigned R2 PUT URL không có giới hạn MIME / size / TTL hợp lý

**Triệu chứng**
- `contentType` lấy thẳng từ client → admin (hoặc ai có `VITE_UPLOAD_SECRET` ở C5) có thể upload `text/html`, `application/x-msdownload`, v.v.
- Không có `ContentLength` cap → upload file 10GB cũng pass.
- TTL 3600s → URL share/replay được trong 1h.
- R2 bucket public → URL trả về readable bởi cả internet → biến thành free file-host / phishing dưới domain của bạn.

**Vị trí**
[api/get-upload-url.js:89-119](../api/get-upload-url.js)

**Hướng fix**
```js
const ALLOWED_MIME = {
  glb: ['model/gltf-binary'],
  hdri: ['image/x-hdr', 'image/vnd.radiance', 'application/octet-stream'],
  poster: ['image/png', 'image/jpeg', 'image/webp'],
  clip: ['video/mp4', 'video/webm', 'video/quicktime'],
  snapshot: ['image/webp', 'image/png'],
};
const MAX_BYTES = {
  glb: 200 * 1024 * 1024,
  hdri: 80 * 1024 * 1024,
  poster: 8 * 1024 * 1024,
  clip: 500 * 1024 * 1024,
  snapshot: 4 * 1024 * 1024,
};

if (!ALLOWED_MIME[type]?.includes(contentType)) return res.status(400).json({...});
if (contentLength > MAX_BYTES[type]) return res.status(400).json({...});

const cmd = new PutObjectCommand({
  Bucket,
  Key,
  ContentType: contentType,
  ContentLength: contentLength, // ký vào signature → client không gửi quá
});
const url = await getSignedUrl(s3, cmd, { expiresIn: 300 }); // 5 phút
```

Đồng thời tách bucket `snapshots` thành **private bucket** với signed-URL GET (xem m2, m3).

---

### C5 — `VITE_UPLOAD_SECRET` ship trong client bundle

**Triệu chứng**
`import.meta.env.VITE_*` được Vite inline vào JS bundle. Bất kỳ ai mở DevTools → Sources đều xem được secret. API endpoint accept nó như bearer → mint upload URL vô thời hạn.

**Vị trí**
[src/utils/r2Upload.js:18-20](../src/utils/r2Upload.js), [api/get-upload-url.js:42-43](../api/get-upload-url.js)

**Hướng fix**
1. **Bỏ hẳn** path `x-upload-token` ở server.
2. Bắt buộc Supabase JWT (`Authorization: Bearer <access_token>`) — code đã có fallback ở L45-57.
3. Trong client, lấy token: `const { data: { session } } = await supabase.auth.getSession(); fetch(url, { headers: { Authorization: \`Bearer ${session.access_token}\` } })`.
4. Server verify JWT bằng Supabase JWT secret + check `app_metadata.role === 'admin'` hoặc join `projects.owner_id`.
5. Xoá biến `VITE_UPLOAD_SECRET` khỏi `.env.example`, viết note migration trong [docs/LOCAL_DEV.md](./LOCAL_DEV.md).

**Test plan**
Bundle build production rồi grep `UPLOAD_SECRET` trong `dist/assets/*.js` → 0 hits.

---

### C6 — `restoreVersion` / `discardDraft` / `publishVersion` không atomic

**Triệu chứng**
Các thao tác này thực hiện multi-statement ở client (load → archive → insert / update). Concurrent admin click cùng lúc → 2 row `draft` cùng tồn tại, lost write, hoặc project về 0 published version nếu statement 2 fail.

**Vị trí**
[src/lib/presentationVersions.js:362-394](../src/lib/presentationVersions.js) (restoreVersion), [:348-356](../src/lib/presentationVersions.js) (discardDraft), [:283-338](../src/lib/presentationVersions.js) (publishVersion)

**Hướng fix**
Đưa cả 3 vào **Postgres RPC** chạy trong 1 transaction:

```sql
create or replace function restore_presentation_version(
  p_project_id uuid,
  p_source_version_id uuid,
  p_admin_id uuid
) returns presentation_versions
language plpgsql security definer as $$
declare
  v_source presentation_versions;
  v_new presentation_versions;
begin
  -- ownership check
  if not exists (select 1 from projects where id = p_project_id and owner_id = p_admin_id) then
    raise exception 'forbidden';
  end if;

  select * into v_source from presentation_versions
    where id = p_source_version_id and project_id = p_project_id;
  if not found then raise exception 'source not found'; end if;

  -- archive existing draft
  update presentation_versions set status = 'archived', archived_at = now()
    where project_id = p_project_id and status = 'draft';

  -- insert new draft from source
  insert into presentation_versions (project_id, status, snapshot_json, restored_from, created_by)
    values (p_project_id, 'draft', v_source.snapshot_json, v_source.id, p_admin_id)
    returning * into v_new;

  return v_new;
end $$;
```

Client gọi: `supabase.rpc('restore_presentation_version', {...})`.

Tương tự cho `publish_presentation_version` (archive published → update draft → status published) và `discard_draft_version` (update draft → archived).

**Bonus**: Thêm `select pg_advisory_xact_lock(hashtext(p_project_id::text))` đầu hàm để serialize per-project, tránh M8.

---

### C7 — `version_token` optimistic lock bypassable

**Triệu chứng**
`assertExpectedToken` check ở client trước UPDATE, nhưng UPDATE không có `.eq('version_token', expected)` → 2 writer cùng pass → last-write-wins, trigger rotate token, không bên nào thấy conflict.

**Vị trí**
[src/lib/presentationVersions.js:63-67, 232-272](../src/lib/presentationVersions.js)

**Hướng fix**
```js
const { data, error } = await supabase
  .from('presentation_versions')
  .update({ snapshot_json: snapshot, /* ... */ })
  .eq('id', existing.id)
  .eq('version_token', expectedToken) // <-- thêm
  .select()
  .single();

if (!data) {
  // 0 rows affected → token đã đổi → conflict
  throw new VersionConflictError({ expected: expectedToken, actual: 'unknown' });
}
```

Khi đưa vào RPC (C6), check trong PL/pgSQL:
```sql
update presentation_versions
  set snapshot_json = p_snapshot, version_token = gen_random_uuid()
  where id = p_id and version_token = p_expected_token;
if not found then raise exception 'version_conflict'; end if;
```

**Bonus**: Strip `updatedAt` key trước khi snapshot diff để giảm false conflict (xem M10).

---

### C8 — Submit feedback race với navigate-away → mất comment

**Triệu chứng**
`handleSubmitFeedback*` là async, không cancel khi unmount / đổi `projectId`. Nếu user submit rồi navigate ngay:
- Network fail → comment biến mất khỏi local state, không retry.
- Network success → `refreshSlideFeedback(slideId)` chạy với slide cũ, đè list của project mới.

**Vị trí**
[src/pages/ClientPage.jsx:684-720](../src/pages/ClientPage.jsx) (mobile), [:777-818](../src/pages/ClientPage.jsx) (desktop)

**Hướng fix**
1. **Pessimistic draft persistence**: Trước khi `await supabase.insert(...)`, lưu draft vào localStorage:
   ```js
   const DRAFT_KEY = `feedback_pending_${projectId}_${slideId}`;
   localStorage.setItem(DRAFT_KEY, JSON.stringify({ comment, name, ts: Date.now() }));
   try {
     await supabase.from('client_feedback_items').insert(payload);
     localStorage.removeItem(DRAFT_KEY);
   } catch (e) { /* giữ draft, hiện banner "Pending — retry" */ }
   ```
2. **Cancel pattern**:
   ```js
   const abortRef = useRef(null);
   useEffect(() => () => abortRef.current?.abort(), []);
   useEffect(() => () => abortRef.current?.abort(), [projectId]);
   ```
3. **Mount-time check pending drafts**: khi mount `ClientPage`, scan localStorage prefix `feedback_pending_${projectId}_*` → hiện toast "Có N feedback chưa gửi — Retry/Discard".
4. Refactor: extract `useFeedbackDraft(projectId, slideId)` hook dùng chung desktop + mobile (xem m6).

---

### C9 — Pointer-lock fail trên Safari/Firefox, unhandled rejection

**Triệu chứng**
`requestPointerLock` phải invoke từ user gesture handler **trên chính element sắp lock**. Hiện click ở `<button>` trong drei `<Html fullscreen>`, lock target là `gl.domElement` (canvas khác element) → Safari throw `SecurityError`, Firefox cũng strict.
`requestPointerLock?.()` không `.catch()` → unhandled promise rejection. POV không vào được trên 2 browser này.

**Vị trí**
[src/components/PovFpsRig.jsx:62-71](../src/components/PovFpsRig.jsx)

**Hướng fix**
```jsx
// Trong Scene.jsx hoặc StageCanvas.jsx — gắn handler thẳng vào canvas
useEffect(() => {
  if (!povMode) return;
  const canvas = gl.domElement;
  const onClick = () => {
    const p = canvas.requestPointerLock();
    if (p?.catch) {
      p.catch((err) => {
        console.warn('[POV] pointer lock denied', err);
        setPovToast({ kind: 'warn', text: 'Trình duyệt từ chối khoá chuột. Thử click lại hoặc dùng Chrome.' });
      });
    }
  };
  canvas.addEventListener('click', onClick);
  return () => canvas.removeEventListener('click', onClick);
}, [povMode, gl]);
```

Loại bỏ overlay `<button>` trong `<Html>`; thay bằng overlay HTML thường ngoài Canvas (cùng DOM tree với canvas) hoặc instruction "Click vào màn hình để bắt đầu".

Đồng thời lắng `pointerlockerror` event để hiện fallback message.

---

### C10 — `<Physics>` unmount mỗi lần toggle POV → destroy Rapier world

**Triệu chứng**
Toggle POV nhanh: WASM re-init ~200ms+, useFrame in-flight reference body đã bị destroy → throw. Có thể gây crash nếu user spam toggle.

**Vị trí**
[src/components/StageCanvas.jsx:813-826](../src/components/StageCanvas.jsx), [src/components/PovFpsRig.jsx:21-26](../src/components/PovFpsRig.jsx)

**Hướng fix**
1. Mount `<Physics>` **luôn luôn** khi user có quyền POV (admin/collab) thay vì lazy-mount theo `povMode`. Pass `paused={!povMode}` để pause sim khi tắt.
2. Wrap body access trong useFrame:
   ```js
   useFrame(() => {
     const rb = rigidBodyRef.current;
     if (!rb || rb.isInvalid?.()) return; // hoặc try/catch
     // ...
   });
   ```
3. Khi unmount POV thật sự (đổi project), gọi `world.free()` tường minh sau khi tất cả useFrame đã dừng (đặt cleanup trong `useEffect` cao hơn `<Physics>`).

---

## 2. 🟠 MAJOR (20)

### Bảo mật / Data exposure

#### M1 — oEmbed double-decode + interpolate raw vào HTML

**Triệu chứng**: `decodeURIComponent` trên `url` đã được Vercel decode → double decode. Slug interpolate raw vào `<iframe src="...">` HTML response → XSS qua URL nếu slug có ký tự lạ.

**Vị trí**: [api/oembed.js:26, 69](../api/oembed.js)

**Hướng fix**:
```js
const raw = req.query.url; // đã decode
const u = new URL(raw); // không decode lại
if (u.hostname !== 'stage.tooawake.mov') return res.status(400)...;
const m = u.pathname.match(/^\/embed\/([A-Za-z0-9_-]+)$/);
if (!m) return res.status(400)...;
const slug = m[1];
const safeSrc = escapeHtml(`https://stage.tooawake.mov/embed/${slug}`);
// dùng safeSrc trong HTML
```

---

#### M2 — Embed token rò rỉ qua `Referer` + browser history sync

**Triệu chứng**: Token nằm trong URL path → mọi sub-request (R2, Supabase, fonts) gửi `Referer` full path → token vào server log của bên thứ 3. Chrome account sync replicate token sang devices khác.

**Vị trí**: [vercel.json:22-24](../vercel.json)

**Hướng fix**:
```json
{
  "source": "/embed/(.*)",
  "headers": [
    { "key": "Referrer-Policy", "value": "no-referrer" }
  ]
}
```
Long-term: chuyển token thành signed cookie set bởi 1 server route trung gian (`/embed/:token` → set cookie → 302 sang `/embed/render`).

---

#### M3 — CSP `/embed/*` có `frame-ancestors *` + `'unsafe-inline'` script

**Triệu chứng**: Combination này biến bất kỳ XSS tương lai nào trong embed page thành full-exploit xuyên iframe (Canva, Notion, etc.).

**Vị trí**: [vercel.json:35](../vercel.json)

**Hướng fix**:
1. Drop `'unsafe-inline'` khỏi `script-src` của embed.
2. Vite build với CSP nonce; inject nonce vào script tag.
3. Nếu cần inline cho perf, dùng `'strict-dynamic'` + nonce.
4. Audit toàn page có còn `<script>inline</script>` nào không (CSP report-only mode trước).

---

#### M4 — `looksLikeUuid` fallback giữ exposure URL UUID legacy

**Triệu chứng**: Sau khi P9 chuyển sang token, code vẫn fallback `eq('id', slug)` → URL UUID cũ (đã leak qua Slack/Canva) vẫn hoạt động vô thời hạn.

**Vị trí**: [src/pages/EmbedPage.jsx:179-187](../src/pages/EmbedPage.jsx)

**Hướng fix**:
1. Thêm log Supabase: mỗi lần fallback fire, insert row `embed_legacy_access(project_id, ts, ua)`.
2. Đặt sunset date (vd: 2026-08-01) trong code comment.
3. Sau sunset: xoá branch, return 404 cho UUID URL.
4. Thông báo customer qua release notes.

---

#### M5 — Admin email lưu plaintext vào `created_by/published_by/resolved_by`

**Triệu chứng**: Kết hợp C1, mọi anon enumerate email admin. GDPR PII exposure.

**Vị trí**: [src/pages/PresentationEditorPage.jsx:1078-1087](../src/pages/PresentationEditorPage.jsx)

**Hướng fix**:
1. Đổi cột thành `created_by uuid references auth.users(id)`.
2. Tạo view `presentation_versions_with_author` join `auth.users` chỉ trả `display_name` cho `authenticated` role.
3. Migration: backfill email → uuid, drop email column.

---

#### M6 — `admin_note` đọc được bởi anon

**Triệu chứng**: Code mô tả "not visible to client" nhưng RLS C1 cho anon SELECT.

**Vị trí**: [src/lib/presentationVersions.js:536-563](../src/lib/presentationVersions.js)

**Hướng fix**: Sửa cùng C1. Trong view public, không expose cột `admin_note`. Code admin đọc qua RPC `get_feedback_for_admin(project_id)`.

---

#### M7 — `regenerate token` không round-trip DB, race 2 tab

**Triệu chứng**: 2 tab admin click cùng lúc → cả 2 UPDATE thành công, mỗi tab show token cục bộ → loser copy iframe sai.

**Vị trí**: [src/pages/AdminPage.jsx:912-924](../src/pages/AdminPage.jsx)

**Hướng fix**:
```js
const { data, error } = await supabase
  .from('projects')
  .update({ embed_token: crypto.randomUUID(), embed_token_rotated_at: new Date().toISOString() })
  .eq('id', projectId)
  .select('embed_token, embed_token_rotated_at')
  .single();
setEmbedToken(data.embed_token); // dùng giá trị server trả về
```

Bonus: Thêm cột `embed_token_rotated_at` audit.

---

### Concurrency / Data integrity

#### M8 — `assign_presentation_version_number` lost-update

**Triệu chứng**: Trigger `SELECT MAX+1` không có `UNIQUE(project_id, version_number)` → 2 insert đồng thời cùng version_number = N+1.

**Vị trí**: [supabase/presentation_versions_schema.sql:90-108](../supabase/presentation_versions_schema.sql)

**Hướng fix**:
```sql
alter table presentation_versions
  add constraint uq_project_version unique (project_id, version_number);

-- Trong trigger
begin
  perform pg_advisory_xact_lock(hashtext(new.project_id::text));
  select coalesce(max(version_number), 0) + 1 into new.version_number
    from presentation_versions where project_id = new.project_id;
  return new;
end;
```

Hoặc dùng sequence per project (phức tạp hơn).

---

#### M9 — `publishVersion` không atomic → có thể 0 published

**Triệu chứng**: Statement 1 archive published xong, statement 2 update draft fail → project có 0 published. Unique partial index không rollback statement 1.

**Vị trí**: [src/lib/presentationVersions.js:283-338](../src/lib/presentationVersions.js)

**Hướng fix**: Gộp vào RPC `publish_presentation_version` (xem C6).

---

#### M10 — Director note `updatedAt` mỗi keystroke → version_token rotation churn

**Triệu chứng**: Mỗi phím gõ → `updatedAt: new Date()` → snapshot diff → trigger rotate token → save kế tiếp throw `VersionConflictError` giả.

**Vị trí**: [src/features/presentation/components/DirectorNoteRow.jsx:137](../src/features/presentation/components/DirectorNoteRow.jsx)

**Hướng fix**:
```jsx
// Trong DirectorNoteRow
const handleBlur = () => onChange({ text, updatedAt: new Date().toISOString() });
const handleChange = (e) => setLocalText(e.target.value); // chỉ local state
<textarea value={localText} onChange={handleChange} onBlur={handleBlur} />
```

Bonus: Hàm `computeSnapshotDigest()` strip các key `updatedAt/_timestamp` trước khi hash để diff stable.

---

#### M11 — `handleHistoryChanged = window.location.reload()` mất unsaved edit

**Triệu chứng**: Restore/revert trong drawer → hard reload, không check `isDirty`, không có `beforeunload`.

**Vị trí**: [src/pages/PresentationEditorPage.jsx:1600-1602](../src/pages/PresentationEditorPage.jsx)

**Hướng fix**:
```js
const handleHistoryChanged = () => {
  if (isDirty) {
    const ok = window.confirm('Bạn có thay đổi chưa lưu. Reload sẽ mất. Tiếp tục?');
    if (!ok) return;
  }
  window.location.reload();
};

// Bonus
useEffect(() => {
  if (!isDirty) return;
  const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
  window.addEventListener('beforeunload', handler);
  return () => window.removeEventListener('beforeunload', handler);
}, [isDirty]);
```

Tốt hơn: thay vì reload, fetch lại data + reset local state in-place.

---

#### M12 — Thumbnail queue race → double upload

**Triệu chứng**: `thumbnailQueueRef` Set là dedup duy nhất, xoá trong `finally`. Effect re-run với stale `slides` closure → 2 task cùng `slide.id` chạy song song trước khi `finally` đầu fire.

**Vị trí**: [src/pages/PresentationEditorPage.jsx:1256-1305](../src/pages/PresentationEditorPage.jsx)

**Hướng fix**:
1. Đổi dedup từ Set sang Map<slideId, Promise>:
   ```js
   const inflight = thumbnailQueueRef.current.get(slide.id);
   if (inflight) return inflight;
   const promise = generateThumbnail(slide).finally(() => thumbnailQueueRef.current.delete(slide.id));
   thumbnailQueueRef.current.set(slide.id, promise);
   return promise;
   ```
2. Thêm DB-level check: `media_playlist` upsert với `onConflict` thay vì insert.
3. Cap timeout per clip 3s thay vì 10s.

---

### Mobile / UX

#### M13 — Resize listener không dùng `visualViewport`

**Triệu chứng**: iOS Safari URL-bar slide → fire `resize` ở height trung gian không ổn định → flip layout mid-typing. Rotation re-mount khác component tree → mất state trong children.

**Vị trí**: [src/pages/ClientPage.jsx:169-179](../src/pages/ClientPage.jsx)

**Hướng fix**:
```js
useEffect(() => {
  const vv = window.visualViewport;
  const handler = debounce(() => {
    setViewport({ width: window.innerWidth, height: vv?.height ?? window.innerHeight });
  }, 150);
  vv?.addEventListener('resize', handler);
  window.addEventListener('orientationchange', handler);
  return () => {
    vv?.removeEventListener('resize', handler);
    window.removeEventListener('orientationchange', handler);
  };
}, []);
```

Đồng thời: lift state quan trọng (như edit-mode draft của `FeedbackHistoryItem`) lên parent để survive shell swap.

---

#### M14 — Mobile sheet `72svh` ẩn submit dưới keyboard

**Triệu chứng**: iOS keyboard mở, `svh` (small viewport) không co lại → sheet vẫn 72% screen → button submit nằm dưới fold.

**Vị trí**: [src/pages/ClientPage.jsx:2529-2545](../src/pages/ClientPage.jsx)

**Hướng fix**:
```css
.mobile-sheet {
  max-height: 72dvh; /* dynamic viewport — co theo keyboard */
}
```
Kèm:
```js
useEffect(() => {
  const vv = window.visualViewport;
  if (!vv) return;
  const onResize = () => sheetRef.current?.style.setProperty('--vv-h', `${vv.height}px`);
  vv.addEventListener('resize', onResize);
  return () => vv.removeEventListener('resize', onResize);
}, []);
```

---

#### M15 — AnnotationLayer chỉ mouse, không pointer/touch

**Triệu chứng**: `onMouse*` only → iPad/touchscreen không vẽ được nếu sau này bật. Hiện tại mobile shell render `readOnly` nên chưa lộ, nhưng là landmine.

**Vị trí**: [src/components/FeedbackDraftPanel.jsx:487-490](../src/components/FeedbackDraftPanel.jsx)

**Hướng fix**:
```jsx
<svg
  onPointerDown={handleDown}
  onPointerMove={handleMove}
  onPointerUp={handleUp}
  onPointerCancel={handleUp}
  style={{ touchAction: 'none' }}
/>
```
Loại bỏ handler `onMouse*`. Pointer events normalize mouse + touch + pen.

---

#### M16 — Annotation coords mất anchor khi rotate giữa lúc vẽ

**Triệu chứng**: Start point normalize theo rect cũ, end point theo rect mới → vùng vẽ lệch. `preserveAspectRatio="none"` → circle thành ellipse.

**Vị trí**: [src/components/FeedbackDraftPanel.jsx:402-439](../src/components/FeedbackDraftPanel.jsx)

**Hướng fix**:
1. Cancel drawing khi `viewport` thay đổi mid-draw:
   ```js
   useEffect(() => { if (drawing) cancelDrawing(); }, [viewport.width, viewport.height]);
   ```
2. Đổi `preserveAspectRatio="xMidYMid meet"` + lưu thêm `aspectRatio` lúc vẽ; khi render so sánh, scale lại.

---

#### M17 — Mobile reviewer không edit/delete feedback

**Triệu chứng**: `MobileContextContent` truyền `<FeedbackHistoryList items={feedbackItems} />` không có callback update/delete → người dùng mobile không sửa được typo.

**Vị trí**: [src/pages/ClientPage.jsx:2952](../src/pages/ClientPage.jsx)

**Hướng fix**: Truyền props `onUpdate`, `onDelete` xuống `FeedbackHistoryList` ở cả mobile + desktop, dùng cùng handler. Trên mobile dùng bottom-sheet confirm thay vì `window.confirm` (xem m8).

---

#### M18 — Gesture-exit note focus 6px threshold quá nhạy

**Triệu chứng**: Tap iOS jitter thường ~5-10px → single tap dismiss note focus.

**Vị trí**: [src/pages/ClientPage.jsx:756-775](../src/pages/ClientPage.jsx)

**Hướng fix**:
```js
const EXIT_THRESHOLD_PX = 24;
const EXIT_MIN_DURATION_MS = 120;
// chỉ exit khi cả 2 điều kiện đúng
if (deltaPx >= EXIT_THRESHOLD_PX && elapsed >= EXIT_MIN_DURATION_MS) exitNoteFocusMode();
```

---

### POV / 3D

#### M19 — `usePovController` thiếu blur listener clear keys

**Triệu chứng**: Alt-Tab khi đang giữ W → keyup không fire → `keysRef.current.KeyW = true` mãi → khi quay lại pointer-lock, capsule tự tiến.

**Vị trí**: [src/hooks/usePovController.js:85-95](../src/hooks/usePovController.js)

**Hướng fix**:
```js
useEffect(() => {
  if (!enabled) return;
  const clear = () => { keysRef.current = {}; };
  window.addEventListener('blur', clear);
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement !== canvas) clear();
  });
  return () => { window.removeEventListener('blur', clear); };
}, [enabled]);
```

---

#### M20 — `PovClipGuard` đặt `camera.near=0.02` gây z-fighting

**Triệu chứng**: Tỉ lệ near/far 0.02/5000 = 250k → depth buffer precision không đủ cho LED panel song song xa → z-fighting nhấp nháy. `prevFogNear` capture sai khi fog được add bởi effect khác sau khi POV mount.

**Vị trí**: [src/components/StageCanvas.jsx:163-194](../src/components/StageCanvas.jsx)

**Hướng fix**:
1. Đổi `camera.near=0.1` (đã đủ cho FPS gần) hoặc dùng **logarithmic depth buffer** ở Canvas: `<Canvas gl={{ logarithmicDepthBuffer: true }}>`.
2. Snapshot full camera state object lúc enter, restore wholesale lúc exit:
   ```js
   const snapshotRef = useRef(null);
   useEffect(() => {
     snapshotRef.current = { near: camera.near, far: camera.far, fog: scene.fog ? { ...scene.fog } : null };
     return () => {
       Object.assign(camera, { near: snapshotRef.current.near, far: snapshotRef.current.far });
       scene.fog = snapshotRef.current.fog;
       camera.updateProjectionMatrix();
     };
   }, []);
   ```

---

## 3. 🟡 MINOR (18)

### Privacy / Compliance

#### m1 — `localStorage` reviewer name + analytics không consent banner

**Triệu chứng**: Route `/view/:id` public, lưu tên reviewer vào localStorage + `recordClientPageView` gửi UA + IP về Supabase. GDPR/ePR risk ở EU.

**Vị trí**: [src/pages/ClientPage.jsx:160-167, 386](../src/pages/ClientPage.jsx), [src/lib/analyticsTracker.js:29](../src/lib/analyticsTracker.js)

**Hướng fix**:
1. Thêm consent banner (vd: cookieconsent.js) chặn `analyticsTracker` đến khi user click "Accept".
2. localStorage cho tên reviewer: hỏi opt-in trước lần đầu lưu ("Remember my name?").
3. Server-side anonymize IP (Supabase Edge Function strip last octet).

---

#### m2 — Feedback snapshot R2 key đoán được

**Triệu chứng**: Key `projectId/timestamp_slideId` enumerate được. Snapshot có thể chứa frame riêng tư.

**Vị trí**: [docs/FEEDBACK_SNAPSHOTS.md](./FEEDBACK_SNAPSHOTS.md)

**Hướng fix**: Append `crypto.randomUUID()` vào key: `${projectId}/${ts}_${slideId}_${uuid}.webp`. Lưu URL đầy đủ vào DB.

---

#### m3 — Tách private bucket cho snapshot

**Triệu chứng**: R2 public bucket → snapshot world-readable.

**Vị trí**: [api/get-upload-url.js:121-123](../api/get-upload-url.js)

**Hướng fix**: Tạo bucket `stage-snapshots-private`, không public domain. Server route `/api/snapshot-url?key=...` verify admin/owner rồi trả signed GET URL (TTL 5 phút).

---

#### m4 — Embed token hiện trong DOM admin UI

**Vị trí**: [src/pages/EmbedPage.jsx:509](../src/pages/EmbedPage.jsx)

**Hướng fix**: Thêm nút "Show/Hide" toggle, mặc định mask `••••••••-abc`. Warning khi screen-share.

---

#### m5 — Retention indefinite cho version snapshot

**Hướng fix**: Cron job (Supabase pg_cron hoặc Vercel cron) chạy `pruneArchivedVersions(projectId, { keepLatest: 20, olderThanDays: 180 })` cho mọi project hàng tuần. Cấu hình per-project nếu cần.

---

### Code quality / Refactor

#### m6 — `ClientPage.jsx` 3107 LOC god-component

**Hướng fix** (extract theo thứ tự):
1. `useFeedbackDraft(projectId, slideId)` — gộp 2 flow desktop + mobile.
2. `src/pages/client/MobilePortraitShell.jsx`, `MobileLandscapeShell.jsx`, `DesktopShell.jsx`.
3. `src/pages/client/ClientStage.jsx` — wrapper StageCanvas + transport bar.
4. `src/pages/client/FeedbackHistoryList.jsx` (đã có file riêng cho row, gộp list).
5. `src/pages/client/hooks/useClientProject.js` — load project + version logic.

Target: `ClientPage.jsx` ≤ 500 LOC.

---

#### m7 — `PresentationEditorPage.jsx` 2168 LOC, dead code

**Hướng fix**:
1. Xoá `LegacyFeedbackPanel` (515-797) — dead code.
2. Extract `src/features/presentation/components/PublishModal.jsx` (844-984).
3. Extract `ContextPanel.jsx` (290-512).
4. Extract `useSlideThumbnailQueue.js` hook.

---

#### m8 — ESLint `exhaustive-deps` disable

**Vị trí**: PresentationEditorPage.jsx line 1229, 1253, 1634

**Hướng fix**: Audit từng case. Nếu cần freeze ref thực sự → dùng `useRef` rõ ràng + comment WHY. Nếu chỉ là quên dep → thêm dep.

---

#### m9 — `usePovController.tick()` mixed concerns

**Hướng fix**: Split thành `readInput()`, `applyVelocity(dt)`, `tryJump()`, `clampToGeofence()`. Mỗi hàm pure.

---

#### m10 — `scanStageMeshes` sync 5000+ raycasts

**Vị trí**: [src/components/pov/scanStageMeshes.js:104-138](../src/components/pov/scanStageMeshes.js)

**Hướng fix**:
1. Chuyển sang Web Worker (`comlink` hoặc native worker).
2. Chunk loop với `requestIdleCallback`:
   ```js
   async function scanInChunks(meshes, chunkSize = 8) {
     for (let i = 0; i < meshes.length; i += chunkSize) {
       await new Promise(r => requestIdleCallback(r));
       processChunk(meshes.slice(i, i + chunkSize));
     }
   }
   ```

---

#### m11 — `waitForControlsRest` không có AbortSignal

**Vị trí**: [src/utils/povCamera.js:21-32](../src/utils/povCamera.js)

**Hướng fix**:
```js
export function enterPovMode(controls, target, { signal } = {}) {
  return new Promise((resolve, reject) => {
    const cleanup = () => { controls.removeEventListener('rest', onRest); clearTimeout(t); };
    const onRest = () => { cleanup(); resolve(); };
    const t = setTimeout(() => { cleanup(); resolve(); }, 2000);
    signal?.addEventListener('abort', () => { cleanup(); reject(new DOMException('aborted', 'AbortError')); });
    controls.addEventListener('rest', onRest);
    controls.setLookAt(...target);
  });
}
```

---

#### m12 — Anon-key base64 obfuscation `__SB_EK`

**Vị trí**: [vite.config.js:13-22](../vite.config.js), [src/lib/supabaseClient.js:10-17](../src/lib/supabaseClient.js)

**Hướng fix**: Xoá hoàn toàn. Supabase anon key là public by design — RLS mới là thứ bảo vệ. Để key plain trong env var như mặc định.

---

### Bug nhẹ

#### m13 — `localStorage.setItem` không try/catch

**Vị trí**: [src/pages/ClientPage.jsx:706, 803](../src/pages/ClientPage.jsx)

**Hướng fix**:
```js
try { localStorage.setItem(KEY, value); }
catch (e) { console.warn('storage write failed', e); /* không hiện error cho user */ }
```

---

#### m14 — Không `maxLength` cho input feedback

**Hướng fix**:
```jsx
<input maxLength={100} ... />
<textarea maxLength={4000} ... />
```
+ Server validate trong RPC.

---

#### m15 — `MobileFeedbackSheet` re-render toàn page mỗi keystroke

**Vị trí**: [src/pages/ClientPage.jsx:869, 2566](../src/pages/ClientPage.jsx)

**Hướng fix**:
```js
const stageProps = useMemo(() => ({...}), [stableDeps]);
const commonMobileProps = useMemo(() => ({...}), [stableDeps]);
```
Hoặc: di chuyển state `mobileFeedbackComment` xuống `MobileFeedbackSheet` (uncontrolled từ parent perspective), parent chỉ giữ `isOpen`.

---

#### m16 — `restoreVersion` ghi `restored_from` chưa có trong v1 schema

**Vị trí**: [src/lib/presentationVersions.js:386](../src/lib/presentationVersions.js)

**Hướng fix**:
1. Verify migration `presentation_versions_v2.sql` đã apply trên mọi env (dev/staging/prod) trước khi deploy code.
2. Thêm runtime check: `if (existingColumns.has('restored_from')) payload.restored_from = ...`.
3. Tốt hơn: dùng RPC C6 — schema mismatch lộ ở deploy DB, không ở runtime.

---

#### m17 — `pruneArchivedVersions(0)` xoá tuốt

**Vị trí**: [src/lib/presentationVersions.js:438-466](../src/lib/presentationVersions.js)

**Hướng fix**:
```js
if (olderThanDays <= 0 || keepLatest < 1) {
  throw new Error('Invalid prune params');
}
```
Đồng thời confirm dialog phải hiện rõ số rows sẽ xoá: "Will delete N versions older than X days, keeping latest M. Continue?"

---

#### m18 — `getUploadErrorMessage` leak diagnostic

**Vị trí**: [src/utils/r2Upload.js:101-104](../src/utils/r2Upload.js)

**Hướng fix**: User-facing message generic ("Upload thất bại, vui lòng thử lại"). Chi tiết log vào `console.error` chỉ khi `import.meta.env.DEV`.

---

## 4. Critical Functions cần refactor (priority order)

| # | Function | File:Line | Refactor approach |
|---|---|---|---|
| 1 | `restoreVersion` / `publishVersion` / `discardDraft` | [presentationVersions.js:283-394](../src/lib/presentationVersions.js) | Đưa vào Postgres RPC transactional (C6) |
| 2 | `handleSubmitFeedback*` (desktop + mobile) | [ClientPage.jsx:684-818](../src/pages/ClientPage.jsx) | Extract `useFeedbackDraft` hook + AbortController + pessimistic draft (C8, m6) |
| 3 | `assertExpectedToken` + UPDATE | [presentationVersions.js:63-272](../src/lib/presentationVersions.js) | Include `.eq('version_token')` trong UPDATE (C7) |
| 4 | `ClientPage.jsx` toàn file | [ClientPage.jsx](../src/pages/ClientPage.jsx) | Tách thành 5 file theo m6 |
| 5 | `PresentationEditorPage.jsx` toàn file | [PresentationEditorPage.jsx](../src/pages/PresentationEditorPage.jsx) | Xoá dead code + extract per m7 |
| 6 | `usePovController.tick()` | [usePovController.js:130-185](../src/hooks/usePovController.js) | Split concerns + blur listener (m9, M19) |
| 7 | `scanStageMeshes` | [scanStageMeshes.js:104-138](../src/components/pov/scanStageMeshes.js) | Worker hoặc idle-chunk (m10) |
| 8 | `assign_presentation_version_number` trigger | [presentation_versions_schema.sql:90-108](../supabase/presentation_versions_schema.sql) | Advisory lock + UNIQUE constraint (M8) |

---

## 5. Privacy & Compliance Summary

**Trạng thái: KHÔNG đạt baseline.**

| Hạng mục | Trạng thái | Finding |
|---|---|---|
| Tenant isolation | ❌ Không có | C1, C2, C3 |
| Admin PII (email) | ❌ Public | C1 + M5 |
| Reviewer PII (tên) | ⚠️ Public + no consent | C1 + m1 |
| Embed token secrecy | ❌ Enumerate được | C2 + M2 |
| Upload security | ❌ Free file-host | C4, C5 |
| Right-to-erasure | ⚠️ Một phần | m5 |
| Retention policy | ❌ Indefinite | m5 |
| XSS surface | ⚠️ Hiện safe, có nợ | M1, M3 |

---

## 6. Khuyến nghị thứ tự thực thi

### Tuần này (block ship)

1. **DB hardening**: Viết migration `supabase/rls_v3.sql` xử C1, C2, C3, M5, M6 trong 1 lần.
2. **Upload hardening**: MIME allow-list + size cap + TTL 300s + drop `VITE_UPLOAD_SECRET` (C4, C5).
3. **Versioning RPC**: Move `restore/publish/discard/saveDraft` vào Postgres functions transactional + `UNIQUE(project_id, version_number)` (C6, C7, M8, M9).
4. **Feedback durability**: AbortController + localStorage pessimistic draft (C8).
5. **POV stability**: Pointer-lock `.catch()` + canvas-bound handler (C9); `<Physics paused>` thay vì unmount (C10).

### Sprint kế tiếp

6. **Embed hardening**: `Referrer-Policy: no-referrer`, drop CSP `unsafe-inline`, escape oEmbed output, sunset legacy UUID (M1, M2, M3, M4).
7. **Mobile UX**: `visualViewport` + `dvh` units (M13, M14); pointer events cho annotation (M15); gesture threshold (M18).
8. **Version UX**: `updatedAt` onBlur, `isDirty` guard cho reload (M10, M11).
9. **Privacy baseline**: Consent banner, IP anonymize, private snapshot bucket (m1, m2, m3).

### Tech debt (sprint sau)

10. **God-component split**: `ClientPage` + `PresentationEditorPage` (m6, m7).
11. **Worker hóa scanStageMeshes** (m10).
12. **Camera-controls Abort signal** (m11).
13. **Bỏ anon-key obfuscation** (m12).

---

## 7. Verification checklist trước merge

- [ ] Anon JWT thử `delete from client_feedback_items` → fail.
- [ ] Anon thử `select embed_token from projects` → 0 rows.
- [ ] Bundle production grep `UPLOAD_SECRET` → 0 hits.
- [ ] Restore version song song 2 tab → đúng 1 draft, không lost data.
- [ ] Pointer-lock trên Safari → vào được POV (hoặc hiện toast fallback).
- [ ] Mobile iOS Safari mở keyboard → submit button vẫn click được.
- [ ] Feedback submit → tắt wifi → comment vẫn nằm trong "Pending" + retry được.
- [ ] CSP report-only mode chạy 1 tuần → 0 violation.

---

**Tham khảo chéo:** [admin-presentation-plan.md](./admin-presentation-plan.md) section 3-5 (version lifecycle) ↔ Audit C6, C7, M8–M12.
