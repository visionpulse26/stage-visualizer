# Guest Identity Gate — Implementation Plan

> **Prerequisite:** C1–C5 audit fixes must be merged first (RLS hardened, embed_token restricted,
> ClientPage select limited, R2 upload capped, VITE_UPLOAD_SECRET removed from bundle).
> This feature sits on top of a hardened DB layer.

---

## Why this exists

`ClientPage` currently has zero identity for anonymous viewers. Feedback rows have no owner.
Anyone with the embed link can read, insert, or (via the C1 bug) delete any row.
The Guest Identity Gate solves this by assigning a **soft identity** (name + email → `guest_token`)
before rendering any content. Every subsequent write is scoped to that identity.

This is **not** a full auth system — it's a session-level identity soft-lock suitable for
trusted client review links. The threat model accepted: someone who knows another person's
email can claim that identity. Acceptable for stage-design previews; unacceptable for financial
data (out of scope).

---

## Architecture overview

```
/view/:projectId
    └── <GuestGate presentationId={projectId}>
            ├── mount → check localStorage["sv_guest_{id}"]
            │       ├── token valid + not expired  →  phase = 'confirmed' (silent pass)
            │       └── missing or expired          →  phase = 'gate' (show modal)
            │
            ├── 'gate' phase  →  Name + Email form
            │       └── submit → RPC upsert_guest()
            │               ├── is_new: true   →  save localStorage → 'confirmed'
            │               └── is_new: false  →  phase = 'welcome-back' (show stored name)
            │
            ├── 'welcome-back' phase
            │       ├── [Confirm]   →  save localStorage → 'confirmed'
            │       └── [Not me]    →  clear form → phase = 'gate'
            │
            └── 'confirmed' phase  →  render children (ClientPage content)
```

---

## Database changes

### New table: `presentation_guests`

```sql
CREATE TABLE presentation_guests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  presentation_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  email            TEXT NOT NULL,
  name             TEXT NOT NULL,
  guest_token      UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  token_expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 days',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(presentation_id, email)
);
```

**RLS policy:** no direct anon access. All reads/writes go through SECURITY DEFINER RPCs only.

### New RPC: `upsert_guest(presentation_id, email, name)`

- Normalizes email to lowercase + trim
- Validates email regex + name length
- Checks presentation exists in `projects_public`
- INSERT or UPDATE `last_seen_at`
- Returns: `{ is_new, id, name, email, guest_token, token_expires_at }`

Returns `guest_token` on both new and returning — security note above applies.

### `feedback` table update

Add `guest_id UUID REFERENCES presentation_guests(id)` column (nullable for backward compat).
RLS update: anon INSERT requires `guest_id` to match a valid active `guest_token` from request context.

---

## Component tree

```
GuestGate.jsx          ← new, wraps ClientPage
  GuestGateBackground  ← SVG hex geometry + orange gradient (inline, no deps)
  GuestGateModal       ← dark glass card, 3 inner states
    LogoSlot           ← circular placeholder, swap with real logo prop
    FormState          ← name + email inputs + CTA
    WelcomeBackState   ← confirm banner + confirm/reject buttons
    LoadingOverlay     ← spinner replaces CTA during RPC call
```

All in a single `GuestGate.jsx` file — no sub-files needed at this scale.

---

## localStorage schema

Key: `sv_guest_${presentationId}`

```json
{
  "id": "uuid",
  "name": "Display Name",
  "email": "user@example.com",
  "guest_token": "uuid",
  "expires_at": "2026-06-15T00:00:00Z"
}
```

On mount: parse → check `expires_at > Date.now()` → if valid, skip gate entirely.
On confirm: write. On token expiry: delete + show gate again.

---

## State machine

| Phase | Trigger | Next phase |
|---|---|---|
| `checking` | mount | `confirmed` (localStorage valid) or `gate` |
| `gate` | — | `loading` on submit |
| `loading` | RPC call | `welcome-back` (existing) or `confirmed` (new) |
| `welcome-back` | — | `confirmed` (confirm btn) or `gate` (not-me btn) |
| `confirmed` | — | renders children |

Error state: `loading` → `gate` with `error` string displayed under form.

---

## Integration points in ClientPage

```jsx
// ClientPage.jsx — wrap the entire return, after all hooks/state are set up
return (
  <GuestGate presentationId={projectId}>
    {/* existing ClientPage JSX */}
  </GuestGate>
)
```

**Admin bypass:** check `useAuth()` session before showing gate. Authenticated users skip entirely.
**Client-locked projects:** gate shows before the existing `clientLocked` check — same wrapper position.

---

## Visual spec (matches standalone HTML)

| Token | Value |
|---|---|
| Background | `linear-gradient(135deg, #FF4500, #FF6A00)` |
| Hex wireframe | SVG `stroke="#CC3300"` `stroke-opacity="0.08"` |
| Modal bg | `rgba(8,6,6,0.75)` + `backdrop-filter: blur(24px)` |
| Modal border | `1px solid rgba(255,255,255,0.08)` |
| Modal glow | `box-shadow: 0 0 60px rgba(255,80,0,0.25), 0 24px 48px rgba(0,0,0,0.5)` |
| Brand orange | `#FF5500` |
| CTA gradient | `linear-gradient(135deg, #FF5500, #FF3300)` |
| Font | `'Chakra Petch', sans-serif` (already in index.html) |

Mobile: card slides up as bottom sheet (`border-radius: 20px 20px 0 0`, pinned to bottom).

---

## Sprint breakdown

### G1 — DB (30 min)
- [ ] Write + run `supabase/presentation_guests_migration.sql`
- [ ] Verify RPC callable from anon client

### G2 — Component (2–3 hr)
- [ ] `src/components/GuestGate.jsx` — all 3 phases + error + mobile
- [ ] Smoke test: new user flow, welcome-back flow, localStorage fast-pass

### G3 — ClientPage integration (30 min)
- [ ] Wrap return in `<GuestGate>`
- [ ] Add admin bypass (`useAuth` check)
- [ ] Pass `guest_id` to feedback submit calls

### G4 — Mobile (1 hr)
- [ ] Verify bottom-sheet layout on 375px / 414px
- [ ] Test landscape mode (modal stays centered, not bottom-sheet)

### G5 — Feedback RLS wiring (1 hr)
- [ ] Add `guest_id` column to feedback table
- [ ] Update RLS: require valid `guest_token` for INSERT/UPDATE/DELETE
- [ ] Update feedback submit in ClientPage to include `guest_id`

---

## Verification checklist before merge

- [ ] New user: fills form → enters → feedback submits with `guest_id` in DB
- [ ] Returning user: same browser → auto-pass (no gate shown)
- [ ] Returning user: new browser, same email → welcome-back state shown
- [ ] "Not me": clears form, can enter different email
- [ ] Token expiry: set `expires_at` to past in localStorage → gate appears
- [ ] Admin user: skips gate entirely, no modal shown
- [ ] Mobile 375px: bottom-sheet layout correct
- [ ] Invalid email: error shown, no DB call made
- [ ] Network error: error message shown, form re-enabled
- [ ] No `guest_token` in URL params or console logs
