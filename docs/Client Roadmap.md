# Client Review Roadmap

## Product Direction

StageViz client review should become a versioned presentation and feedback system for 3D stage visuals. The product boundary is intentionally narrow:

- Admin owns the presentation context.
- Desktop client owns feedback only.
- Mobile client is view-only.
- References, notes, and explanations live in UI panels, not on top of the 3D stage.
- Feedback annotations are temporary screen-space marks attached to comments, not 3D world objects.
- Every client feedback item attaches to a published version, clip, camera snapshot, and timestamp.

This roadmap replaces the earlier "Canva-style canvas" idea with a cleaner model:

```txt
3D Stage Viewer
  + Presentation Context Panel
  + Desktop Feedback Draft Mode
  + Admin Feedback Review Queue
```

## Visual System

The UI direction is dark glassmorphism with a production-control-room feel.

- Primary font: Chakra Petch.
- Background: near-black, dark graphite, red-black.
- Panels: translucent black glass, subtle blur, thin ember border.
- Primary accent: deep orange-red / ember.
- Secondary technical accent: blue/cyan for active camera states only.
- Status colors:
  - Pending/open feedback: amber.
  - Resolved feedback: green.
  - Published version: green.
  - Unsaved draft: amber.
  - Destructive actions: red/orange.
- Radius: compact 8-12px.
- Glows: restrained, used only for active slide, selected camera, publish CTA, locked feedback mode, and selected annotations.
- Body text must remain readable. Do not make inactive content so dim that it becomes hard to scan.

## Core Concepts

### Presentation Version

Admin edits a draft and publishes a frozen client-facing snapshot.

Each published version contains:

- visible slides/clips,
- per-slide title/subtitle/director note,
- per-slide references,
- default camera selection,
- hidden/visible state,
- ordering,
- release notes,
- published timestamp.

Client feedback attaches to the version that was live when feedback was submitted.

### Slide / Clip Context

A slide is a client-facing review unit usually backed by a media playlist clip.

Each slide can define:

- clip id,
- clip title,
- subtitle,
- director note/body,
- default camera preset,
- references,
- duration,
- hidden-from-client state,
- feedback counts.

### Feedback Snapshot

Each feedback item stores enough context to restore what the reviewer saw:

- presentation version id,
- slide id,
- clip id,
- clip timestamp,
- camera preset id/name,
- camera position,
- camera target,
- camera fov if available,
- reviewer name,
- comment text,
- optional annotation JSON,
- created timestamp,
- status.

## Data Model Draft

### `presentation_versions`

```txt
id
project_id
version_number
version_name
status: draft | published | archived
release_notes
snapshot_json
created_by
published_at
created_at
updated_at
```

`snapshot_json` should be treated as the frozen client payload.

Example:

```json
{
  "schemaVersion": 1,
  "projectName": "Coachella 2026 - Main Stage",
  "slides": [
    {
      "id": "slide_intro",
      "clipId": "clip_intro",
      "title": "Intro Logo Reveal",
      "subtitle": "Opening sequence - FOH camera",
      "directorNote": "This intro uses a timed LED reveal synced to the kick drum.",
      "directorNoteVisible": true,
      "defaultCameraPresetId": "foh",
      "hiddenFromClient": false,
      "durationSeconds": 42,
      "references": [
        {
          "id": "ref_mood",
          "type": "image",
          "url": "https://...",
          "caption": "Mood board",
          "visibleToClient": true,
          "sortOrder": 1
        }
      ],
      "sortOrder": 1
    }
  ],
  "cameraPresets": [
    {
      "id": "foh",
      "name": "FOH",
      "position": { "x": 0, "y": 0, "z": 0 },
      "target": { "x": 0, "y": 0, "z": 0 }
    }
  ]
}
```

### `client_feedback_items`

```txt
id
project_id
presentation_version_id
slide_id
clip_id
reviewer_name
comment
status: pending | resolved
clip_time_seconds
camera_snapshot_json
annotation_json
admin_note
resolved_at
resolved_by
created_at
updated_at
```

Example annotation:

```json
{
  "type": "circle",
  "space": "screen",
  "bounds": {
    "x": 0.42,
    "y": 0.31,
    "width": 0.12,
    "height": 0.08
  },
  "viewport": {
    "width": 1440,
    "height": 900
  }
}
```

### `feedback_sessions` Optional

Useful later for analytics or reviewer grouping.

```txt
id
project_id
presentation_version_id
reviewer_name
browser_id
started_at
last_seen_at
```

## Routes

Proposed routes:

```txt
/admin/:projectId
/admin/:projectId/presentation
/admin/:projectId/feedback
/client/:projectId
```

The current client route can remain the public entry, but it should load the latest published presentation version when available.

## UI State 1: Admin Presentation Editor

### Purpose

Admin builds the presentation context that client will review.

### Layout

```txt
Top Bar
Left Clip/Slide Sequence
Center 3D Stage Preview
Right Context/Feedback Panel
```

### Top Bar Functions

- StageViz logo.
- Project name.
- Draft state:
  - "Draft from Published v4"
  - "Unsaved changes"
  - "Last published 2h ago"
- Preview as client.
- Save draft.
- Publish.

### Left Clip/Slide Sequence

Functions:

- Show total clips/slides.
- Add clip/slide.
- Select slide.
- Drag to reorder slides.
- Show thumbnail.
- Show title.
- Show duration.
- Show order number.
- Show feedback count badge.
- Show hidden-from-client icon.
- Active slide gets ember border/glow.

Required actions:

- Add clip.
- Duplicate slide.
- Hide/show from client.
- Delete slide.
- Reorder slide.

### Center 3D Stage Preview

Functions:

- Render same stage as client preview.
- Keep stage clean.
- No persistent reference overlays.
- No director note overlay.
- No 3D feedback pins in MVP.
- Show selected clip title and "Clip X of N".
- Show compact camera preset pills.
- Show active camera technical badge.
- Show playback controls and progress.
- Allow previewing current clip and selected default camera.

Camera presets:

- FOH.
- Stage-L.
- Overhead.
- Aerial.
- Additional presets from project data.

### Right Context Tab

Fields and controls:

- Clip title.
- Subtitle.
- Director note/body.
- Director note visible-to-client toggle.
- Default camera selector.
- References list.
- Add reference.
- Reference caption.
- Reference type: image/gif/link if needed.
- Reference visible-to-client toggle.
- Reference reorder.
- Reference delete.
- Slide actions:
  - duplicate,
  - hide/show from client,
  - delete.

Publish checklist:

- Title set.
- Subtitle set.
- Director note written if needed.
- References added if needed.
- Default camera set.
- Hidden slides count.

### Right Feedback Tab

Purpose: review feedback for the selected clip without leaving the editor.

Functions:

- Show "Feedback for Clip X".
- Show open/resolved counts.
- Show attached published version.
- Filter:
  - All,
  - Open,
  - Resolved.
- List feedback cards for current clip.
- Each card shows:
  - reviewer,
  - status,
  - age,
  - comment preview,
  - camera/time badge,
  - optional annotation indicator.
- Actions:
  - Resolve,
  - Reopen,
  - Jump to clip,
  - Open full Feedback Review.

Jump to clip should:

- select the related slide,
- activate related clip,
- seek to captured timestamp if video supports it,
- set camera to captured snapshot or camera preset,
- show annotation preview if applicable.

## UI State 2: Admin Publish Modal

### Purpose

Publishing creates a versioned snapshot for client review.

### Fields

- Version name.
- Release notes.
- Snapshot summary:
  - clips total,
  - hidden clips,
  - references total,
  - hidden references,
  - enabled camera presets,
  - total runtime.

### Required Copy

Include a clear warning:

```txt
Client feedback will attach to this published version.
All new feedback will be linked to this published version, the camera in view, and the timestamp it was captured at. Existing feedback remains linked to its original version.
```

### Actions

- Cancel.
- Save as draft.
- Publish vN.

### Publish Behavior

On successful publish:

- create a new published version,
- archive or supersede previous published version,
- preserve old feedback links,
- update client view to latest version,
- clear unsaved changes state.

## UI State 3: Desktop Client Review

### Purpose

Client watches the published presentation and reviews context.

### Desktop Layout

```txt
Top Bar
Clip Strip
3D Stage Viewer
Collapsible Right Context Panel
Playback Controls
```

### Top Bar Functions

- StageViz logo.
- Project name.
- Published version badge.
- Released timestamp.
- Leave Feedback button.
- Reviewer initials/name if known.

### Clip Strip

Functions:

- Show published visible clips only.
- Thumbnail.
- Title.
- Active clip ember outline.
- Feedback count badge.
- Open feedback count badge if available.
- Click to switch clip.

Hidden slides must not appear.

### 3D Stage Viewer

Functions:

- Render current clip on stage.
- Show compact camera controls.
- Allow only client-safe camera orbit/zoom bounds.
- Show active camera badge.
- Playback controls.
- No persistent references over viewer.
- No director note over viewer.
- No 3D annotations in MVP.

Client camera product rule:

- Limit zoom-in so client cannot inspect pixels, model defects, or LED texture artifacts.
- Keep max distance broad enough to see the full stage.
- Clamp camera presets that are too close.

### Right Context Panel Expanded

Sections:

- Current clip title.
- Subtitle.
- Director note.
- References.
- Feedback list.
- Leave Feedback CTA.

Functions:

- Collapse panel.
- Show only client-visible note/reference data.
- Tap/click reference thumbnail to enlarge preview if implemented.
- Feedback items show:
  - author,
  - status,
  - time ago,
  - comment preview,
  - camera/time badge.
- Clicking a feedback item should jump to its captured context when feasible.

### Right Context Panel Collapsed

Functions:

- Give 3D viewer more space.
- Show slim vertical handle.
- Show current clip title.
- Show expand arrow.
- Show feedback badge/count.

## UI State 4: Desktop Feedback Draft

### Purpose

Desktop client submits structured feedback tied to current presentation context.

### Entry

Client clicks "Leave Feedback".

On entry:

- lock current clip,
- freeze or pause current video timestamp,
- snapshot camera,
- attach draft to current published version,
- show feedback mode top bar.

### Top Bar

Copy:

- "Capturing Feedback"
- "Camera & Clip Locked"
- "Clip X - Camera - 00:17 - v4"
- Cancel button.

Avoid the word "Recording" because it can sound like screen/video recording.

### Viewer State

Functions:

- Viewer appears intentionally locked/frozen.
- Camera controls disabled while drafting feedback.
- Playback controls disabled or visually locked.
- Active camera/time lock badge visible.
- Annotation mark appears only during draft/selected feedback context.

### Annotation Tools

MVP tools:

- Circle.
- Region.
- Clear.

Out of scope for MVP:

- arrow,
- freehand pen,
- text overlay,
- 3D world pins,
- collaborative cursors.

Annotation rules:

- Annotation is optional.
- Annotation is screen-space only.
- Annotation stores normalized viewport coordinates.
- Annotation links to a feedback comment.
- Annotation should never become persistent presentation content.

### Right Feedback Draft Panel

Fields:

- Reviewer name.
- Comment.
- Optional annotation preview.
- Previous feedback on this clip.

Validation:

- Submit disabled until reviewer name is provided.
- Submit disabled until comment is provided.
- Annotation alone is not enough to submit.
- Name can be stored in localStorage per project after first entry.

Actions:

- Cancel.
- Submit.
- Remove annotation.

On submit:

- save feedback item,
- attach version/slide/clip/time/camera snapshot,
- restore client normal mode,
- keep reviewer name for future feedback.

## UI State 5: Admin Full Feedback Review

### Purpose

Dedicated queue for processing all feedback across a published version or project.

### Layout

```txt
Top Bar
Left Filters
Center Feedback Queue
Right Selected Feedback Detail
```

### Top Bar

Functions:

- StageViz logo.
- Project name.
- Current version badge.
- Back to Editor.

### Left Filters

Filters:

- Status:
  - All feedback,
  - Open/Pending,
  - Resolved.
- Version:
  - current published version,
  - previous versions.
- Clip:
  - all clips,
  - specific clip.
- Reviewer:
  - all reviewers,
  - specific reviewer.

### Center Queue

Functions:

- Group feedback by clip.
- Show open/resolved counts.
- Sort newest/oldest.
- Select feedback.
- Each card shows:
  - reviewer,
  - status,
  - version,
  - comment,
  - camera/time badge,
  - timestamp,
  - annotation indicator.
- Actions:
  - Resolve,
  - Reopen,
  - Jump to clip.

### Right Detail Panel

Functions:

- Show selected feedback reviewer.
- Show status.
- Show full comment.
- Show context snapshot:
  - camera,
  - timestamp,
  - clip.
- Show annotation preview if available.
- Admin internal note.
- Save note.
- Resolve/reopen.

Admin note is internal and not visible to client in MVP.

## UI State 6: Mobile Client View-Only

### Product Rule

Mobile client is view-only for MVP.

Mobile must not include:

- Leave Feedback button.
- Feedback tab.
- Comment form.
- Annotation tools.
- Circle/region drawing.
- Camera/clip lock feedback mode.
- Admin editing tools.
- Upload/reference editing.

### Purpose

Mobile lets client watch and understand the presentation, not review in detail.

### Layout

```txt
Compact Top Bar
3D Stage Viewer
Playback Controls
Bottom Tabs: Clips / Context / References
```

### Top Bar

Functions:

- Project name.
- Subtitle or venue/stage label.
- Published version badge.
- Slide count, e.g. "2/5".

### 3D Viewer

Functions:

- Render current clip.
- Show active camera badge.
- Show minimal camera preset pills if space allows.
- If camera pills do not fit, use compact dropdown.
- Apply strict client zoom bounds.
- Keep stage clean.

### Bottom Tabs

Allowed tabs:

- Clips.
- Context.
- References.

No Feedback tab.

### Clips Tab

Functions:

- List visible published clips.
- Show active clip.
- Show duration.
- Tap to switch clip.

### Context Tab

Functions:

- Show current clip title.
- Show subtitle.
- Show director note/body.
- Body text must be readable on mobile.

### References Tab

Functions:

- Show reference thumbnails.
- Show captions.
- Tap to view larger if implemented.
- No upload/edit.

## Implementation Phases

### Phase 0: Foundations

Goals:

- Define presentation version data model.
- Define feedback item data model.
- Decide whether to store `snapshot_json` in `projects` or a new `presentation_versions` table.
- Add helper functions to load latest published version.
- Keep existing client view working during migration.

Deliverables:

- Supabase schema migration.
- Client-side data mapping utilities.
- Draft/published version types documented in code comments.

### Phase 1: Admin Presentation Editor MVP

Goals:

- Build editor shell with 3-column layout.
- Load existing media playlist as slides.
- Add right context editor fields.
- Save draft.
- Publish version snapshot.

Functions:

- slide select,
- slide reorder,
- title/subtitle/director note,
- default camera,
- references list,
- hide/show from client,
- duplicate/delete,
- save draft,
- publish modal.

Acceptance:

- Admin can create a published presentation version.
- Client can load the latest published version.
- Hidden slides do not appear in client view.

### Phase 2: Desktop Client Presentation View

Goals:

- Replace read-only client panel with published presentation UX.
- Render clip strip.
- Render collapsible right context panel.
- Apply client zoom guard.

Functions:

- switch clips,
- switch camera presets,
- read director note,
- view references,
- collapse/expand context panel,
- playback controls,
- published version badge.

Acceptance:

- Desktop client can view a clean stage and side context.
- No references or notes overlay the 3D viewer.
- Zoom limits prevent close inspection.

### Phase 3: Desktop Feedback Draft

Goals:

- Allow desktop client to submit feedback.
- Lock clip/camera/timestamp during draft.
- Store camera snapshot and optional screen-space annotation.

Functions:

- reviewer name gate,
- comment field,
- Circle annotation,
- Region annotation,
- Clear/remove annotation,
- validation,
- submit,
- cancel,
- previous feedback on clip.

Acceptance:

- Feedback cannot submit without name and comment.
- Feedback attaches to version/clip/time/camera.
- Submitted feedback appears in client feedback list and admin review.

### Phase 4: Admin Feedback Review

Goals:

- Give admin a queue to process all feedback.
- Add current-clip feedback tab inside editor.
- Add full feedback review page.

Functions:

- filter by status,
- filter by version,
- filter by clip,
- filter by reviewer,
- group by clip,
- jump to context,
- resolve/reopen,
- internal admin note.

Acceptance:

- Admin can process feedback without losing context.
- Jump to clip restores clip, timestamp, and camera snapshot where possible.

### Phase 5: Mobile View-Only Client

Goals:

- Ship simplified mobile client experience.
- Remove feedback from mobile MVP.

Functions:

- view stage,
- switch clips,
- switch camera if space allows,
- read context,
- view references.

Acceptance:

- No mobile feedback creation exists.
- Mobile UI remains simple and readable.
- Stage stays the primary visual area.

## Out of Scope for MVP

- Canva-style freeform editor.
- Persistent overlays on the 3D stage.
- 3D world feedback pins.
- Freehand drawing.
- Text annotations on viewer.
- Realtime collaborative editing.
- Client-side upload of reference images.
- Mobile feedback creation.
- Mobile admin editor.
- Public threaded replies.
- Task management integration.
- Export PDF/report, unless needed later.

## Later Enhancements

- Feedback replies visible to client.
- Email notifications.
- Shareable feedback summary.
- Export review report.
- Reference lightbox with compare mode.
- Per-feedback screenshot thumbnail.
- Admin "apply change" checklist.
- Analytics per published version.
- Tokenized public client links.
- Optional private feedback mode.
- Optional desktop drawing/arrow tools after Circle/Region are stable.

## Engineering Notes

### StageCanvas

Add optional camera distance bounds:

- Admin/Collab remain flexible by default.
- Client passes strict presentation bounds.
- Bounds scale with model radius/size when model metrics are available.
- Smooth camera fly should clamp target camera position if preset is too close.

### Feedback Snapshot Restore

`Jump to clip` should follow this order:

1. Load correct published version if available.
2. Select slide.
3. Activate clip.
4. Seek to captured clip time if video.
5. Restore camera snapshot.
6. Show annotation preview if attached.

### Asset Handling

References should use the existing secure upload/storage approach where possible.

Reference types:

- image,
- gif,
- link later if needed.

### Local Reviewer Identity

Desktop client stores reviewer name locally:

```txt
localStorage key: stageviz:reviewer-name:{projectId}
```

Do not require login for client feedback in MVP unless the project is explicitly locked.

## Success Criteria

The feature is successful when:

- Admin can build a clear client-facing presentation without touching 3D overlays.
- Client can understand each clip using the side context panel.
- Desktop client can leave feedback tied to exact visual context.
- Admin can resolve feedback from a focused review queue.
- Mobile remains simple and view-only.
- Published versions preserve feedback meaning over time.

