# Concurrent Editing — Masterplan

**Mục tiêu:** Cho phép nhiều admin làm việc trên cùng presentation mà không mất data, không conflict ngầm, và nhìn thấy nhau real-time.

**Ngày bắt đầu:** 2026-05-25  
**Repo:** `T:\WEBSITE\07_Cursor\stage-visualizer` | branch `main`

---

## Trạng thái hiện tại (sau fix A)

| Vấn đề | Trạng thái |
|--------|-----------|
| Clip mới upload không xuất hiện trong draft của admin khác | ✅ **Fixed** — merge `media_playlist` vào `snapshot_json.slides` khi load |
| Admin không biết người kia đang làm gì | ❌ Tầng B |
| Hai admin có thể ghi đè nhau không hay biết | ⚠️ Partial — version_token phát hiện lúc save, không proactive |
| Admin B phải xin quyền trước khi edit | ❌ Tầng C |

---

## Tầng B — Real-time Presence & Conflict Notifications

**Effort:** ~3–4h  
**DB changes:** Không cần migration — chỉ bật Realtime trên table `presentation_versions` trong Supabase Dashboard.  
**Dependency:** Supabase Realtime (đã có trong project).

### Mục tiêu Tầng B

1. Admin A thấy "Admin B đang mở presentation này" ngay khi Admin B vào trang.
2. Admin A nhận được banner ngay lập tức khi Admin B save draft (không chờ đến lúc mình bấm Save mới bị lỗi conflict).
3. UX: avatar badge nhỏ ở header + banner notification — không block workflow.

### B.1 — Bật Supabase Realtime

**Thực hiện trong Supabase Dashboard:**
```
Table Editor → presentation_versions → Enable Realtime (toggle ON)
```

Hoặc qua SQL:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE presentation_versions;
```

### B.2 — Hook `usePresenceChannel`

**File:** `src/hooks/usePresenceChannel.js`

```js
// Tham gia một Supabase Realtime Presence channel cho projectId.
// Trả về danh sách tất cả user đang online cùng presentation.
//
// Usage:
//   const { presenceList } = usePresenceChannel(projectId, { userId, email, displayName })
//
// presenceList: Array<{ userId, email, displayName, joinedAt, presenceRef }>

import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export function usePresenceChannel(projectId, userInfo) {
  const [presenceList, setPresenceList] = useState([])
  const channelRef = useRef(null)

  useEffect(() => {
    if (!projectId || !userInfo?.userId) return

    const channel = supabase.channel(`presence:presentation:${projectId}`, {
      config: { presence: { key: userInfo.userId } },
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState()
        // presenceState() returns { [key]: [{ ...payload }] }
        const list = Object.values(state).flat()
        setPresenceList(list)
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            userId: userInfo.userId,
            email: userInfo.email,
            displayName: userInfo.displayName,
            joinedAt: new Date().toISOString(),
          })
        }
      })

    channelRef.current = channel

    return () => {
      channel.untrack()
      supabase.removeChannel(channel)
    }
  }, [projectId, userInfo?.userId])

  return { presenceList }
}
```

**Lưu ý:**
- `userInfo` phải stable (useMemo hoặc useRef ở caller) để tránh re-subscribe liên tục.
- `presenceState()` có thể chứa nhiều entry per key nếu cùng userId mở nhiều tab — flat() xử lý điều đó.

### B.3 — Hook `useVersionWatcher`

**File:** `src/hooks/useVersionWatcher.js`

```js
// Subscribe postgres changes trên presentation_versions cho projectId.
// Khi version_token thay đổi (admin khác save draft), gọi onRemoteSave(newRow).
//
// Usage:
//   useVersionWatcher(projectId, currentVersionToken, onRemoteSave)
//
// onRemoteSave: (newRow: { version_token, version_name, created_by, ... }) => void

import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'

export function useVersionWatcher(projectId, currentVersionToken, onRemoteSave) {
  const tokenRef = useRef(currentVersionToken)

  useEffect(() => {
    tokenRef.current = currentVersionToken
  }, [currentVersionToken])

  useEffect(() => {
    if (!projectId) return

    const channel = supabase
      .channel(`db:presentation_versions:${projectId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'presentation_versions',
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          const newRow = payload.new
          // Chỉ notify khi token thay đổi so với token mình đang giữ
          if (newRow.version_token && newRow.version_token !== tokenRef.current) {
            onRemoteSave(newRow)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [projectId]) // onRemoteSave nên là useCallback stable ở caller
}
```

**Lưu ý:**
- `filter` dạng `project_id=eq.${projectId}` cần Supabase Realtime filter — chỉ nhận events của đúng project.
- Không theo dõi INSERT (tạo draft mới) vì đó là lần đầu ai đó save — ít quan trọng hơn.
- Cần set `tokenRef` luôn sync với `currentVersionToken` để tránh stale closure.

### B.4 — Component `PresenceAvatars`

**File:** `src/components/PresenceAvatars.jsx`

```jsx
// Hiển thị avatar nhỏ của tất cả admin đang online cùng presentation.
// Chính mình (selfUserId) bị ẩn.
//
// Props:
//   presenceList: từ usePresenceChannel
//   selfUserId: string
//   style: optional

import React from 'react'

export function PresenceAvatars({ presenceList, selfUserId, style = {} }) {
  const others = presenceList.filter(p => p.userId !== selfUserId)
  if (!others.length) return null

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, ...style }}>
      {others.map((p) => (
        <div
          key={p.userId}
          title={`${p.displayName || p.email} đang xem/chỉnh sửa`}
          style={{
            width: 24, height: 24,
            borderRadius: '50%',
            background: '#E8531A',
            border: '2px solid rgba(232,83,26,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 700, color: '#fff',
            cursor: 'default',
            flexShrink: 0,
          }}
        >
          {(p.displayName || p.email || '?').charAt(0).toUpperCase()}
        </div>
      ))}
      {others.length > 0 && (
        <span style={{ fontSize: 10, color: '#C8B8A8', whiteSpace: 'nowrap' }}>
          {others.length === 1
            ? `${others[0].displayName || others[0].email} đang chỉnh`
            : `${others.length} người đang chỉnh`}
        </span>
      )}
    </div>
  )
}
```

**Vị trí render:** Ngay cạnh nút "Save draft" trong header của `PresentationEditorPage`.

### B.5 — Component `RemoteConflictBanner`

**File:** `src/components/RemoteConflictBanner.jsx`

```jsx
// Banner xuất hiện khi admin khác save draft trong khi mình đang edit.
// Cung cấp 2 action: tải lại (lấy draft mới) hoặc tiếp tục chỉnh (bỏ qua).
//
// Props:
//   remoteVersion: { version_name, created_by, ... } | null
//   onReload: () => void  — reload draft từ DB
//   onDismiss: () => void — ẩn banner, tiếp tục với state hiện tại

export function RemoteConflictBanner({ remoteVersion, onReload, onDismiss }) {
  if (!remoteVersion) return null

  return (
    <div style={{
      position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)',
      background: 'rgba(232,83,26,0.95)', color: '#fff',
      padding: '10px 20px', borderRadius: 8,
      display: 'flex', alignItems: 'center', gap: 12,
      zIndex: 9999, boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
      fontSize: 13, fontFamily: 'Chakra Petch, sans-serif',
    }}>
      <span>
        <strong>{remoteVersion.created_by || 'Admin khác'}</strong> vừa lưu draft
        {remoteVersion.version_name ? ` "${remoteVersion.version_name}"` : ''}.
      </span>
      <button
        onClick={onReload}
        style={{ background: '#fff', color: '#E8531A', border: 'none', borderRadius: 4,
                 padding: '4px 12px', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}
      >
        Tải lại
      </button>
      <button
        onClick={onDismiss}
        style={{ background: 'transparent', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.3)',
                 borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: 12 }}
      >
        Bỏ qua
      </button>
    </div>
  )
}
```

### B.6 — Wiring vào `PresentationEditorPage`

**Thêm vào phần import và state (khoảng line 1–40):**
```js
import { usePresenceChannel } from '../hooks/usePresenceChannel'
import { useVersionWatcher } from '../hooks/useVersionWatcher'
import { PresenceAvatars } from '../components/PresenceAvatars'
import { RemoteConflictBanner } from '../components/RemoteConflictBanner'
```

**Trong component body, sau khi có `projectId` và `currentUser`:**
```js
// Presence
const presenceUserInfo = useMemo(() => ({
  userId: currentUser?.id,
  email: currentUser?.email,
  displayName: currentUser?.user_metadata?.full_name || currentUser?.email,
}), [currentUser?.id])

const { presenceList } = usePresenceChannel(projectId, presenceUserInfo)

// Remote draft watcher
const [remoteSavedVersion, setRemoteSavedVersion] = useState(null)
const currentToken = draftVersion?.version_token ?? null

const handleRemoteSave = useCallback((newRow) => {
  setRemoteSavedVersion(newRow)
}, [])

useVersionWatcher(projectId, currentToken, handleRemoteSave)

const handleReloadRemote = useCallback(async () => {
  setRemoteSavedVersion(null)
  // Re-trigger load effect bằng cách thay đổi key hoặc gọi thẳng loadDraft
  const draft = await loadDraft(projectId)
  if (draft?.snapshot_json?.slides) {
    const freshSlides = draft.snapshot_json.slides.filter(s => !isDefaultStagePreviewClip({ id: s.clipId }))
    setSlides(freshSlides)
    setDraftVersion(draft)
    setIsDirty(false)
  }
}, [projectId])
```

**Trong JSX header, cạnh Save Draft button:**
```jsx
<PresenceAvatars
  presenceList={presenceList}
  selfUserId={currentUser?.id}
  style={{ marginRight: 8 }}
/>
```

**Cuối JSX (trước closing tag):**
```jsx
<RemoteConflictBanner
  remoteVersion={remoteSavedVersion}
  onReload={handleReloadRemote}
  onDismiss={() => setRemoteSavedVersion(null)}
/>
```

### B.7 — Checklist trước khi deploy Tầng B

- [ ] Bật Realtime trên `presentation_versions` table trong Supabase Dashboard
- [ ] Kiểm tra `currentUser` được lấy từ `supabase.auth.getUser()` — đã có trong `AdminPage`, cần verify trong `PresentationEditorPage`
- [ ] Test: mở 2 tab cùng một presentation → cả hai thấy avatar của nhau
- [ ] Test: tab 1 save draft → tab 2 thấy banner ngay (không cần F5)
- [ ] Test: tab 2 bấm "Tải lại" → slides reload đúng, không mất data

---

## Tầng C — Soft Advisory Lock

**Effort:** ~5–6h  
**DB changes:** Không cần table mới — dùng Supabase Realtime Presence làm ephemeral lock.  
**Prerequisite:** Tầng B phải xong trước (dùng lại presence channel).

### Mục tiêu Tầng C

1. Tại một thời điểm, chỉ **một** admin có quyền `write` — người còn lại ở chế độ `read-only`.
2. Read-only admin vẫn thấy stage, xem slides, không thể save/publish/edit.
3. Admin đang read-only có thể **"lấy lại quyền edit"** với confirm — admin kia nhận được thông báo và bị chuyển sang read-only.
4. Lock tự expire khi tab đóng / idle > 10 phút.

### C.1 — Presence payload mở rộng

Thay vì chỉ track `{ userId, email }`, track thêm `editMode`:

```js
await channel.track({
  userId: userInfo.userId,
  email: userInfo.email,
  displayName: userInfo.displayName,
  editMode: 'write',   // 'write' | 'read'
  joinedAt: new Date().toISOString(),
  lockedAt: new Date().toISOString(),
})
```

**Quy tắc lock:** Người **join sớm nhất** (nhỏ nhất `lockedAt`) được `write`. Người sau vào tự nhận `read`.

### C.2 — Hook `useSoftLock`

**File:** `src/hooks/useSoftLock.js`

```js
// Quản lý soft advisory lock dựa trên Supabase Realtime Presence.
// Trả về: isReadOnly, lockHolder, requestWriteAccess, releaseWriteAccess
//
// Cơ chế:
//   - Khi mount: track presence với editMode='write' nếu chưa có ai
//   - Nếu đã có write lock: track với editMode='read', isReadOnly=true
//   - requestWriteAccess(): broadcast 'lock_takeover', cập nhật presence thành 'write'
//   - lockHolder: { userId, displayName, email, lockedAt } của người đang hold write

import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'

export function useSoftLock(projectId, userInfo) {
  const [isReadOnly, setIsReadOnly] = useState(false)
  const [lockHolder, setLockHolder] = useState(null)
  const channelRef = useRef(null)

  const updateLockState = useCallback((state) => {
    const all = Object.values(state).flat()
    const writers = all
      .filter(p => p.editMode === 'write')
      .sort((a, b) => new Date(a.lockedAt) - new Date(b.lockedAt))

    if (writers.length === 0) return  // không ai giữ lock — sẽ re-track

    const holder = writers[0]
    setLockHolder(holder)
    setIsReadOnly(holder.userId !== userInfo.userId)
  }, [userInfo?.userId])

  useEffect(() => {
    if (!projectId || !userInfo?.userId) return

    const channel = supabase.channel(`lock:presentation:${projectId}`, {
      config: { presence: { key: userInfo.userId } },
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        updateLockState(channel.presenceState())
      })
      .on('broadcast', { event: 'lock_takeover' }, ({ payload }) => {
        // Ai đó lấy quyền write
        if (payload.takenFrom === userInfo.userId) {
          // Mình bị lấy lock — chuyển về read
          channel.track({ ...userInfo, editMode: 'read', lockedAt: new Date().toISOString() })
          setIsReadOnly(true)
        }
      })
      .subscribe(async (status) => {
        if (status !== 'SUBSCRIBED') return

        const state = channel.presenceState()
        const all = Object.values(state).flat()
        const hasWriter = all.some(p => p.editMode === 'write' && p.userId !== userInfo.userId)

        await channel.track({
          userId: userInfo.userId,
          email: userInfo.email,
          displayName: userInfo.displayName,
          editMode: hasWriter ? 'read' : 'write',
          lockedAt: new Date().toISOString(),
        })
      })

    channelRef.current = channel

    return () => {
      channel.untrack()
      supabase.removeChannel(channel)
    }
  }, [projectId, userInfo?.userId])

  const requestWriteAccess = useCallback(async () => {
    const channel = channelRef.current
    if (!channel || !lockHolder) return

    // Broadcast tới holder hiện tại
    await channel.send({
      type: 'broadcast',
      event: 'lock_takeover',
      payload: { takenFrom: lockHolder.userId, takenBy: userInfo.userId },
    })

    // Cập nhật presence của mình thành write
    await channel.track({
      userId: userInfo.userId,
      email: userInfo.email,
      displayName: userInfo.displayName,
      editMode: 'write',
      lockedAt: new Date().toISOString(),
    })

    setIsReadOnly(false)
  }, [lockHolder, userInfo])

  const releaseWriteAccess = useCallback(async () => {
    const channel = channelRef.current
    if (!channel) return
    await channel.track({
      userId: userInfo.userId,
      email: userInfo.email,
      displayName: userInfo.displayName,
      editMode: 'read',
      lockedAt: new Date().toISOString(),
    })
    setIsReadOnly(true)
    setLockHolder(null)
  }, [userInfo])

  return { isReadOnly, lockHolder, requestWriteAccess, releaseWriteAccess }
}
```

### C.3 — Component `SoftLockModal`

**File:** `src/components/SoftLockModal.jsx`

```jsx
// Modal hiện khi admin vào trang và người khác đang giữ write lock.
// Props:
//   lockHolder: { displayName, email, lockedAt }
//   onViewReadOnly: () => void  — đóng modal, vào chế độ xem
//   onTakeOver: () => void      — lấy quyền edit (confirm trước)

export function SoftLockModal({ lockHolder, onViewReadOnly, onTakeOver }) {
  if (!lockHolder) return null

  const name = lockHolder.displayName || lockHolder.email
  const since = lockHolder.lockedAt
    ? new Date(lockHolder.lockedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    : ''

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(8,6,4,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 10000,
    }}>
      <div style={{
        background: '#1A1510', border: '1px solid rgba(220,100,30,0.3)',
        borderRadius: 12, padding: 32, maxWidth: 420, width: '90%',
        boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
      }}>
        <h3 style={{ color: '#F4ECE2', margin: '0 0 8px', fontSize: 16 }}>
          Presentation đang được chỉnh sửa
        </h3>
        <p style={{ color: '#C8B8A8', fontSize: 13, margin: '0 0 24px', lineHeight: 1.6 }}>
          <strong style={{ color: '#E8531A' }}>{name}</strong> đang giữ quyền edit
          {since ? ` từ ${since}` : ''}.
          Bạn có thể xem ở chế độ read-only hoặc lấy lại quyền chỉnh sửa
          (sẽ notify {name}).
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onViewReadOnly}
            style={{ background: 'rgba(255,255,255,0.07)', color: '#C8B8A8',
                     border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6,
                     padding: '8px 16px', cursor: 'pointer', fontSize: 13 }}
          >
            Xem read-only
          </button>
          <button
            onClick={onTakeOver}
            style={{ background: '#E8531A', color: '#fff', border: 'none',
                     borderRadius: 6, padding: '8px 16px', cursor: 'pointer',
                     fontWeight: 700, fontSize: 13 }}
          >
            Lấy quyền edit
          </button>
        </div>
      </div>
    </div>
  )
}
```

### C.4 — Component `ReadOnlyBanner`

**File:** `src/components/ReadOnlyBanner.jsx`

```jsx
// Banner cố định ở top khi đang ở chế độ read-only.
// Props:
//   lockHolder: người đang giữ write
//   onRequestEdit: () => void

export function ReadOnlyBanner({ lockHolder, onRequestEdit }) {
  const name = lockHolder?.displayName || lockHolder?.email || 'Admin khác'
  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 9000,
      background: 'rgba(30,20,8,0.97)',
      borderBottom: '1px solid rgba(220,100,30,0.35)',
      padding: '8px 20px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      fontSize: 12, color: '#C8B8A8',
    }}>
      <span>
        Chế độ <strong style={{ color: '#E8531A' }}>READ-ONLY</strong> — {name} đang chỉnh sửa
      </span>
      <button
        onClick={onRequestEdit}
        style={{ background: 'transparent', color: '#E8531A',
                 border: '1px solid rgba(232,83,26,0.4)', borderRadius: 4,
                 padding: '4px 12px', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}
      >
        Lấy lại quyền edit
      </button>
    </div>
  )
}
```

### C.5 — Wiring vào `PresentationEditorPage`

**Import thêm:**
```js
import { useSoftLock } from '../hooks/useSoftLock'
import { SoftLockModal } from '../components/SoftLockModal'
import { ReadOnlyBanner } from '../components/ReadOnlyBanner'
```

**Trong component body:**
```js
const { isReadOnly, lockHolder, requestWriteAccess, releaseWriteAccess } = useSoftLock(projectId, presenceUserInfo)
const [showLockModal, setShowLockModal] = useState(false)

// Khi isReadOnly thay đổi thành true lần đầu → hiện modal
useEffect(() => {
  if (isReadOnly && lockHolder?.userId !== presenceUserInfo?.userId) {
    setShowLockModal(true)
  }
}, [isReadOnly])
```

**Disable save/publish khi read-only:**
```js
// Truyền isReadOnly vào các nút Save Draft, Publish
<button onClick={handleSaveDraft} disabled={isReadOnly || isSaving}>
  Save Draft
</button>
```

**JSX:**
```jsx
{isReadOnly && !showLockModal && (
  <ReadOnlyBanner
    lockHolder={lockHolder}
    onRequestEdit={requestWriteAccess}
  />
)}

<SoftLockModal
  lockHolder={showLockModal ? lockHolder : null}
  onViewReadOnly={() => setShowLockModal(false)}
  onTakeOver={async () => {
    setShowLockModal(false)
    await requestWriteAccess()
  }}
/>
```

### C.6 — Edge cases cần handle

| Tình huống | Xử lý |
|-----------|-------|
| Admin A đóng tab đột ngột (crash) | Supabase Presence tự untrack sau ~30s — lock tự release, Admin B nhận `presence sync` event |
| Admin B lấy lock khi A đang save | Save của A vẫn chạy (network request đã gửi) — version_token conflict detect ở lần save tiếp theo. Không race condition vì save là atomic. |
| Cả 2 admin cùng vào lúc exact same time | Người có `lockedAt` nhỏ hơn giữ write. Nếu bằng nhau (cực hiếm), sort theo `userId` alphabetically để deterministic. |
| Admin vào read-only → Admin A logout | Presence của A expire → B nhận sync → B tự upgrade lên write mode. |
| Admin A idle 10 phút | Cần heartbeat: mỗi 9 phút update `lockedAt` trong presence. Nếu không track lại → Presence expire tự nhiên. |

### C.7 — Idle heartbeat

Thêm vào `useSoftLock`:
```js
// Heartbeat giữ lock alive khi admin idle (Supabase Presence timeout ~60s default)
useEffect(() => {
  if (isReadOnly) return
  const interval = setInterval(() => {
    channelRef.current?.track({
      userId: userInfo.userId,
      email: userInfo.email,
      displayName: userInfo.displayName,
      editMode: 'write',
      lockedAt: new Date().toISOString(),  // update timestamp
    })
  }, 30_000)  // every 30s
  return () => clearInterval(interval)
}, [isReadOnly, userInfo])
```

### C.8 — Checklist trước khi deploy Tầng C

- [ ] Tầng B đã deploy và ổn định
- [ ] Test: Admin A vào trước → giữ write. Admin B vào sau → thấy modal SoftLockModal
- [ ] Test: Admin B chọn "Xem read-only" → thấy ReadOnlyBanner, nút Save disabled
- [ ] Test: Admin B "Lấy quyền edit" → Admin A nhận notification (banner hoặc toast), bị chuyển read-only
- [ ] Test: Admin A đóng tab → 30s sau Admin B tự chuyển sang write mode (không cần action)
- [ ] Test: Admin A idle 10 phút không có heartbeat → lock expire, Admin B lên write
- [ ] Regression: Save draft, Publish vẫn hoạt động bình thường khi chỉ 1 admin online

---

## Thứ tự triển khai tổng

```
[✅] Tầng A — Data drift fix (done 2026-05-25)
[ ]  Tầng B.1 — Bật Realtime trên presentation_versions (Supabase Dashboard, 5 phút)
[ ]  Tầng B.2 — usePresenceChannel hook
[ ]  Tầng B.3 — useVersionWatcher hook
[ ]  Tầng B.4 — PresenceAvatars component
[ ]  Tầng B.5 — RemoteConflictBanner component
[ ]  Tầng B.6 — Wire B vào PresentationEditorPage + test
[ ]  Tầng C.1 — useSoftLock hook (kế thừa channel từ B)
[ ]  Tầng C.2 — SoftLockModal component
[ ]  Tầng C.3 — ReadOnlyBanner component
[ ]  Tầng C.4 — Wire C vào PresentationEditorPage + test
[ ]  Tầng C.5 — Idle heartbeat + edge case tests
```

**Tổng effort ước tính:** B ≈ 3–4h, C ≈ 5–6h, cộng buffer test ≈ 12h full.

---

## Ghi chú kỹ thuật

- **Không dùng DB table riêng cho lock** — Supabase Realtime Presence là in-memory, tự cleanup, zero migration.
- **Supabase Presence key** nên là `userId` (không phải email) để support cùng user mở nhiều tab.
- **Channel naming convention:** `presence:presentation:${projectId}` và `lock:presentation:${projectId}` là 2 channel riêng để tầng B và C độc lập. Có thể merge thành 1 channel nếu muốn tối ưu.
- **Tầng B và C có thể song song** nếu 2 dev làm cùng lúc — không block nhau về code.
