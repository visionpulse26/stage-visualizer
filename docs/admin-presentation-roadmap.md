# Admin Presentation Roadmap

This document tracks the admin presentation panel separately from the current
project publish panel, POV work, and embed work.

The target is not a Canva-style editor. The target is a versioned presentation
editor for stage reviews:

```txt
Admin Presentation Editor
  -> builds a frozen published presentation snapshot
Client Presentation View
  -> reads that snapshot
Client Feedback
  -> attaches to the snapshot, slide, clip timestamp, and camera context
Admin Feedback Review
  -> processes feedback without losing visual context
```

## Current Audit

The current admin UI is still the legacy project editor:

- `src/pages/AdminPage.jsx` owns upload, media playlist, lighting, camera, POV,
  and publish state.
- `src/components/UIPanel.jsx` is a compact tabbed utility panel, not the
  planned 3-column presentation editor.
- `handlePublish` upserts directly into `projects`.
- Client view reads `projects.media_playlist`, `projects.camera_presets`, and
  `projects.scene_config` directly.
- There is no `presentation_versions` table.
- There is no `client_feedback_items` table.
- There is no `/admin/:projectId/presentation` route.
- There is no `/admin/:projectId/feedback` route.

Important: keep the current publish flow working while introducing presentation
versioning. Do not break existing `/view/:projectId`, `/collab/:projectId`, or
`/embed/:projectId` links during migration.

## Code Direction

Use the existing stack and style:

- React 18 with plain JavaScript JSX. Do not introduce TypeScript in this phase.
- Use JSDoc typedefs for presentation data shapes until the app has a deliberate
  TS migration.
- Keep Tailwind styling. Match the existing dark glass production-control style.
- Keep Supabase client usage in `src/lib` or narrowly scoped route modules.
- Prefer small pure mapping helpers for snapshot construction and hydration.
- Keep `StageCanvas` as the single stage renderer. Do not fork 3D rendering for
  presentation mode.
- Keep presentation data separate from lighting, HDRI, POV, and embed settings.
- Preserve backwards compatibility with the current `projects` payload.

Recommended folders:

```txt
src/features/presentation/
  presentationTypes.js
  presentationSnapshot.js
  presentationRepository.js
  PresentationEditorPage.jsx
  components/
    SlideSequence.jsx
    SlideContextEditor.jsx
    PublishPresentationModal.jsx
    PresentationStatusBar.jsx
    CurrentClipFeedbackTab.jsx

src/features/feedback/
  feedbackTypes.js
  feedbackRepository.js
  FeedbackReviewPage.jsx
  components/
    FeedbackFilters.jsx
    FeedbackQueue.jsx
    FeedbackDetail.jsx
```

Do not keep growing `AdminPage.jsx` and `UIPanel.jsx` for this feature. Those
files are already overloaded and should remain the legacy project/stage control
surface while the presentation editor is introduced beside them.

## Data Model Todo

- [ ] Add `supabase/presentation_versions_schema.sql`.
- [ ] Add `presentation_versions`.
- [ ] Add `client_feedback_items`.
- [ ] Add RLS policies for authenticated admin read/write.
- [ ] Allow anonymous/client read only for published presentation snapshots when
      project access rules allow it.
- [ ] Keep old `projects` fields as source data for migration and fallback.
- [ ] Add helper to fetch latest published presentation version by `project_id`.
- [ ] Add helper to fetch or create the current draft by `project_id`.
- [ ] Add helper to publish a draft as a new immutable snapshot.
- [ ] Add helper to archive/supersede the previous published version.

Suggested schema:

```sql
create table if not exists presentation_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  version_number integer not null,
  version_name text,
  status text not null check (status in ('draft', 'published', 'archived')),
  release_notes text,
  snapshot_json jsonb not null default '{}'::jsonb,
  created_by uuid,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists client_feedback_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  presentation_version_id uuid references presentation_versions(id) on delete set null,
  slide_id text not null,
  clip_id text,
  reviewer_name text not null,
  comment text not null,
  status text not null default 'pending' check (status in ('pending', 'resolved')),
  clip_time_seconds numeric,
  camera_snapshot_json jsonb,
  annotation_json jsonb,
  admin_note text,
  resolved_at timestamptz,
  resolved_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

## Snapshot Shape

Use one frozen snapshot per published presentation version. The client should be
able to render from this payload without reading mutable admin draft state.

```js
/**
 * @typedef {Object} PresentationSnapshot
 * @property {1} schemaVersion
 * @property {string} projectId
 * @property {string} projectName
 * @property {PresentationSlide[]} slides
 * @property {CameraPreset[]} cameraPresets
 * @property {Object} scene
 */
```

Slide fields:

- [ ] `id`
- [ ] `clipId`
- [ ] `title`
- [ ] `subtitle`
- [ ] `directorNote`
- [ ] `directorNoteVisible`
- [ ] `defaultCameraPresetId`
- [ ] `hiddenFromClient`
- [ ] `durationSeconds`
- [ ] `references`
- [ ] `sortOrder`

Reference fields:

- [ ] `id`
- [ ] `type`
- [ ] `url`
- [ ] `caption`
- [ ] `visibleToClient`
- [ ] `sortOrder`

## Phase A - Routing And Shell

- [ ] Add protected route `/admin/:projectId/presentation`.
- [ ] Add protected route `/admin/:projectId/feedback`.
- [ ] Keep `/admin` as dashboard/legacy editor entry.
- [ ] Add "Open Presentation" action from project dashboard.
- [ ] Create `PresentationEditorPage.jsx`.
- [ ] Layout must be 3 columns:
      left slide sequence, center stage preview, right context/feedback panel.
- [ ] Reuse `StageCanvas` for preview.
- [ ] Do not put notes/references as 3D overlays.
- [ ] Add top status bar:
      project name, draft state, last published version, preview, save, publish.

## Phase B - Draft Editor MVP

- [ ] Load project by `projectId`.
- [ ] Convert current `media_playlist` to initial slides when no draft exists.
- [ ] Select slide.
- [ ] Reorder slides.
- [ ] Rename slide title.
- [ ] Edit subtitle.
- [ ] Edit director note.
- [ ] Toggle director note visibility.
- [ ] Assign default camera preset.
- [ ] Toggle hidden from client.
- [ ] Duplicate slide.
- [ ] Delete slide.
- [ ] Add unsaved-change tracking.
- [ ] Save draft to `presentation_versions.status = 'draft'`.
- [ ] Preserve draft after refresh.

## Phase C - References

- [ ] Add reference by URL.
- [ ] Add reference caption.
- [ ] Toggle reference visible to client.
- [ ] Reorder references.
- [ ] Delete reference.
- [ ] Show reference thumbnails in editor.
- [ ] Client should only see visible references.
- [ ] Defer upload unless required. URL-only references are enough for MVP.

## Phase D - Publish Flow

- [ ] Build snapshot with pure helper `buildPresentationSnapshot(project, draft)`.
- [ ] Add publish modal.
- [ ] Modal summary:
      visible slides, hidden slides, references, hidden references, camera
      coverage, release notes.
- [ ] Require explicit confirm before publish.
- [ ] Publish creates a new `presentation_versions.status = 'published'` row.
- [ ] Previous published version becomes `archived`.
- [ ] New client feedback attaches to the new published version.
- [ ] Existing feedback remains attached to its original version.
- [ ] Show published version number and timestamp in editor.

## Phase E - Client Compatibility

- [ ] Update `/view/:projectId` to try latest published presentation first.
- [ ] Fallback to current `projects` payload when no published presentation
      exists.
- [ ] Render only visible slides.
- [ ] Hide hidden slides from client strip.
- [ ] Apply slide default camera when switching slides.
- [ ] Show title, subtitle, director note, and references in client panel.
- [ ] Show published version badge.
- [ ] Keep mobile client view-only.

## Phase F - Feedback Admin

- [ ] Add `feedbackRepository.js`.
- [ ] Add current-clip feedback tab inside presentation editor.
- [ ] Add full feedback review page.
- [ ] Filter by status.
- [ ] Filter by version.
- [ ] Filter by clip.
- [ ] Filter by reviewer.
- [ ] Group by clip.
- [ ] Select feedback.
- [ ] Jump to related slide.
- [ ] Restore clip timestamp where possible.
- [ ] Restore camera snapshot where possible.
- [ ] Resolve feedback.
- [ ] Reopen feedback.
- [ ] Add internal admin note.

## Phase G - Cleanup And Migration

- [ ] Remove placeholder/mojibake admin UI text from publish controls.
- [ ] Rename user-facing "Project Publish" wording where presentation publish is
      now the intended flow.
- [ ] Decide whether legacy `versionStatus` remains as a project notch or moves
      into presentation version metadata.
- [ ] Add a one-time migration helper to create a draft from each existing
      project.
- [ ] Keep project clone/new-round behavior separate from presentation publish.
- [ ] Document rollback: if no presentation version is available, existing client
      routes keep rendering from `projects`.

## Component Boundaries

`PresentationEditorPage.jsx` owns:

- route params,
- project load,
- draft load,
- selected slide id,
- save/publish orchestration,
- stage preview state.

`SlideSequence.jsx` owns:

- slide list display,
- active slide state display,
- reorder UI,
- duplicate/delete controls,
- hidden badge,
- feedback count badge when available.

`SlideContextEditor.jsx` owns:

- title/subtitle/note fields,
- default camera selector,
- hidden toggle,
- references editor.

`PublishPresentationModal.jsx` owns:

- release notes,
- publish summary,
- confirm/cancel,
- publish progress/error display.

Repositories own Supabase calls. Components should receive data and callbacks,
not build SQL queries directly.

## Acceptance Criteria

- [ ] Admin can open `/admin/:projectId/presentation`.
- [ ] Admin can save and reload a draft.
- [ ] Admin can publish a new immutable presentation version.
- [ ] Client loads latest published presentation when available.
- [ ] Hidden slides never appear on client.
- [ ] Client display does not read mutable draft fields.
- [ ] Feedback created later can attach to version, slide, clip timestamp, and
      camera snapshot.
- [ ] Existing project/client links continue to work before and after migration.

