---
title: Backlog — Features, Debt & Future Infra
type: task-management
tags: [tasks, sprint, backlog, changelog]
related: ["[[01_Product/Core_Concept]]", "[[02_Architecture/System_Architecture]]", "[[03_Protocol/System_Protocols]]", "[[04_UI_system/System_UI]]", "[[05_AI_rules/AI_Rules]]"]
---

# Backlog — Features, Debt & Future Infrastructure

> Lower-priority, non-blocking work. Anything here that touches a guardrail in [[05_AI_rules/AI_Rules]] must be human-authorized before implementation.

## ✨ Features

- [ ] **Guest token expiration / revocation mechanism**
  - 30-day `guest_token`s auto-extend on every `upsert_guest`/`lookup_guest`/`submit_guest_feedback` call but have **no admin-side revoke path** and no cleanup of stale guest rows. See [[03_Protocol/System_Protocols#`presentation_guests`|presentation_guests]] and [[01_Product/Core_Concept#`presentation_guests`|guest schema]].
  - Add a `SECURITY DEFINER` revoke RPC (rotate `guest_token` / null `token_expires_at`) and an admin UI affordance; optionally a pg_cron sweep of long-expired guests.

- [ ] **Embed-link revocation UX surfacing**
  - `embed_token` regeneration exists (`handleRegenerateEmbedToken`) but the revoke-old-iframe semantics aren't exposed as a clear admin flow. Tie into [[01_Product/Core_Concept#2. Target Users|Embed Viewer]] role and `resolve_embed_project`.

## 🧹 Technical Debt

- [ ] **Unify the two segregated styling systems**
  - Tailwind utility classes (admin chrome) vs. the inline JS `T` ember-token object (client/collab/feedback) are maintained separately and the `T` object is **duplicated** across `FeedbackDraftPanel`, `PresentationEditorPage`, and `ClientPage`. See [[04_UI_system/System_UI#1. Design System & Theming|Design System]] and [[05_AI_rules/AI_Rules#2. UI & Styling Generation Rules|the styling segregation rules]].
  - Direction: at minimum extract `T` to a single shared module; longer-term, evaluate promoting the ember tokens into the Tailwind theme so both surfaces draw from one source. **Do not add `clsx`/`tailwind-merge` or an external UI lib** (banned per the dependency prohibitions).

- [ ] **Consolidate the icon system**
  - Two coexisting approaches: hand-rolled inline `<svg>` components (`UIPanel`, `ProjectsDashboard`) and `lucide-react` (`PresentationEditorPage`). See [[04_UI_system/System_UI#Icon system — two coexisting approaches|icon system]].
  - Direction: standardize on `lucide-react` (already the only icon dep) or a single structured local icon component list; remove ad-hoc inline SVG duplicates. Keep within the [[05_AI_rules/AI_Rules#2. UI & Styling Generation Rules|allowed icon patterns]].

- [ ] **Dedupe the `presentation_guests` schema/RPC definitions**
  - The guest table + feedback RPCs are defined in both `presentation_guests_migration.sql` and re-defined in `presentation_versions_rls_v3.sql`, with a behavioral divergence (one keeps the returning guest's name, the other overwrites it). See [[03_Protocol/System_Protocols#1. Database RPC & RLS Protocols|RPC & RLS]].

## 🎨 UI Consolidation

- [ ] **Full mobile / touch responsive overhaul**
  - The app is desktop-first and non-responsive: `overflow:hidden` shell, fixed-pixel panels (`UIPanel` 280px, `FeedbackDraftPanel` 320px), no `sm:`/`md:`/`lg:` prefixes; adaptation is feature-gated (`!isTouchDevice()` hides POV). See [[04_UI_system/System_UI#Responsive strategy|responsive strategy]].
  - Scope a coherent touch layout strategy for the client review surface (there is already a `docs/superpowers` mobile-client-text-feedback plan to fold in). Preserve the [[04_UI_system/System_UI#4. 3D/Canvas UI Overlays|overlay layering model]] (DOM siblings of `<Canvas>`).

## 🏗️ Future Infrastructure

- [ ] **Operationalize archived-snapshot retention pruning**
  - The mechanism largely **exists**: `prune_archived_presentation_versions(keep_latest, older_than_days)` (`SECURITY DEFINER`, pg_cron-ready in `presentation_versions_retention_cron.sql`) plus the client-side `pruneArchivedVersions` helper. Remaining work is **enabling `pg_cron` and registering/scheduling the job** on the live Supabase project and verifying it never touches `draft`/`published` rows. See [[03_Protocol/System_Protocols#1. Database RPC & RLS Protocols|version lifecycle RPCs]] and [[01_Product/Core_Concept#2. Presentation Versioning & Lifecycle (src/lib/presentationVersions.js, presentation_versions*.sql)|versioning lifecycle]].

- [ ] **Private R2 bucket rollout for feedback snapshots**
  - `R2_PRIVATE_BUCKET` + `/api/get-snapshot-url` signed-GET path is implemented but optional; provision the private bucket and flip snapshots off the public base URL. See [[03_Protocol/System_Protocols#Signed-read & admin storage routes|signed-read routes]].

- [ ] **Component splits deferred from the beta audit (m6/m7)**
  - Large-component decomposition flagged in the beta audit report as a deferred sprint; align with the `AdminPage` deflation in [[current_sprint#🟠 P1 — Architectural Stabilization|the current sprint]].
