# Mobile Client Text Feedback Design

Date: 2026-05-15
Status: approved for implementation planning
Scope: redesign the mobile client presentation view to follow the handoff demo UI and add text-only feedback with a required reviewer name.

## Context

The handoff demo defines the mobile client as a phone-shaped presentation view with:

- compact top bar,
- stage viewer as the primary visual area,
- transport controls directly under the stage,
- inline bottom tabs for `Clips`, `Context`, and `References`.

The current app already has a mobile branch in `src/pages/ClientPage.jsx`, but it uses bottom tabs that open a drawer overlay. Desktop feedback mode already captures reviewer name, comment, presentation version, slide, clip time, camera context, optional annotation, and optional snapshot. Mobile feedback for this phase should be lighter: text-only, objective enough to attach to the correct review context, and easy to use on a phone.

## Goals

- Match the mobile structure from the handoff demo instead of the current drawer overlay.
- Let mobile reviewers submit text feedback.
- Require reviewer name before feedback can be submitted.
- Attach feedback to the active presentation context: version, slide, clip, timestamp, and camera name.
- Keep mobile simple: no drawing tools, no annotation mode, no snapshot upload.
- Preserve desktop feedback behavior.

## Non-Goals

- No mobile annotation drawing.
- No mobile feedback snapshot capture or R2 upload.
- No mobile admin editor.
- No persistent 3D overlays beyond existing note-focus annotation display.
- No fourth permanent `Feedback` tab in the main mobile nav for this phase.

## Recommended UX

Use the handoff demo layout as the baseline:

```txt
Mobile Top Bar
3D Stage Viewer
Transport Bar
Inline Bottom Tabs: Clips / Context / References
Active Tab Content Panel
```

The mobile tabs should render content inline below the transport bar, not inside a modal drawer. `Context` is the default tab because it gives the reviewer the most useful interpretation of the current clip.

Feedback entry should be a bottom sheet launched from the `Context` tab. This keeps the main three-tab information architecture intact while giving feedback a focused form state.

## Orientation Behavior

Mobile must support both portrait and landscape orientation. The layout should choose by viewport shape, not only device type:

- Portrait: `height >= width`, use the handoff demo layout.
- Landscape: `width > height`, prioritize the widest possible stage visualizer panel.

### Portrait Layout

Portrait keeps the demo structure:

```txt
Top Bar
Stage Viewer
Transport Bar
Tabs
Tab Content
```

The stage should receive the largest flexible height available, but the tab content remains visible enough for context reading and feedback entry. This is the normal phone-review mode.

### Landscape Layout

Landscape should favor stage inspection over reading. The target structure is:

```txt
Top Bar
Main Row:
  Stage Viewer + Transport
  Compact Side Panel
```

Landscape rules:

- Stage viewer takes the full remaining height and at least 65-72% of the width.
- Side panel is compact, right-aligned, and width-limited around 280-340px.
- If viewport height is very short, top bar and transport should be compacted before shrinking the stage.
- `Clips`, `Context`, and `References` stay available as segmented tabs inside the side panel.
- The side panel can collapse to an icon rail so the stage can occupy nearly the full screen.
- Feedback bottom sheet in landscape should become a right-side sheet or modal panel so it does not cover the central stage.
- Camera preset controls should stay over the stage but use pills only while they fit; otherwise use a compact dropdown.

Landscape is not a separate feature set. It supports the same text-only feedback flow, required reviewer name, note focus, clip switching, and references. The difference is spatial priority: stage first, supporting information second.

## Feedback Flow

1. Reviewer opens the mobile client view.
2. Reviewer watches the stage and switches clips/cameras as needed.
3. Reviewer opens the `Context` tab.
4. Reviewer taps `Leave Feedback`.
5. App records a feedback context snapshot:
   - current slide title,
   - active slide id,
   - active clip id,
   - current clip time,
   - current camera name,
   - active presentation version id and label.
6. App pauses playback while the feedback sheet is open.
7. If the reviewer name is missing, the sheet shows the name field first.
8. Reviewer enters name and comment.
9. Submit creates a `client_feedback_items` row.
10. The sheet closes, feedback history refreshes, and playback remains paused until the reviewer presses play.

Reviewer name should persist in `localStorage` using the existing project-scoped key pattern. If a name exists, the form should show it as the active reviewer and allow changing it only through an explicit edit action or secondary control.

## Data Contract

Mobile text feedback should call the existing `submitFeedback` helper with:

```js
{
  project_id,
  presentation_version_id,
  slide_id,
  clip_id,
  clip_time_seconds,
  camera_snapshot_json: { name: currentCameraName },
  annotation_json: null,
  reviewer_name,
  comment,
  status: 'pending'
}
```

If the current camera name is unknown, `camera_snapshot_json` may be `null`. The feedback must still submit as long as `reviewer_name`, `comment`, `project_id`, and the active slide context are valid.

Previewing archived or draft versions remains read-only. In version preview mode, the `Leave Feedback` action should not render.

## Mobile Components

The implementation can keep the mobile components local to `ClientPage.jsx` for this phase, matching the current file structure. If the mobile branch grows further, extract them later.

Planned component responsibilities:

- `MobileTopBar`: project name, optional subtitle/venue, version badge, slide count.
- `MobileStageSection`: stage canvas, title/camera badges, camera preset pills/dropdown, transport.
- `MobileTabBar`: `Clips`, `Context`, `References`.
- `MobileTabPanel`: fixed-height or flex content area below tabs.
- `MobileLandscapeShell`: horizontal layout with dominant stage area and compact side panel.
- `MobileContextContent`: slide title, subtitle, director notes, visible feedback history, `Leave Feedback` action.
- `MobileFeedbackSheet`: name gate, comment field, locked context summary, submit/cancel states.

Existing shared pieces should be reused where practical:

- `StageCanvas`
- `AnnotationLayer` only for read-only director note focus, not mobile feedback
- `StageLockBadge` or a smaller mobile equivalent for locked note focus
- `FeedbackHistoryList`, with mobile-safe edit/delete controls hidden unless explicitly supported
- `submitFeedback`, `loadFeedback`, and existing refresh helpers

## State Behavior

Mobile feedback should not enter the desktop `feedbackMode` because that mode assumes annotation tools and a desktop side panel. Add a separate mobile sheet state, for example:

```js
const [mobileFeedbackSheet, setMobileFeedbackSheet] = useState(null)
```

The sheet state should hold the frozen context captured at the moment the reviewer taps `Leave Feedback`. Submitting should use that frozen context, not a later clip/camera state if the user somehow changes view while the sheet is open.

When the sheet opens:

- pause the video,
- keep camera controls usable only if the sheet does not cover the stage,
- disable clip switching behind the sheet or close the sheet before switching clips.

Recommended behavior: while the sheet is open, backdrop taps do not submit or discard typed feedback accidentally. Use an explicit `Cancel` button.

## Error Handling

- Empty reviewer name: disable submit and show a compact validation state.
- Empty comment: disable submit and show a compact validation state.
- Missing feedback table: reuse the existing friendly error text.
- Network/insert failure: keep the sheet open and preserve typed content.
- Version preview: hide `Leave Feedback`.
- Missing slide id: disable `Leave Feedback` with no-op fallback.

## Accessibility And Mobile Fit

- Inputs must be large enough for touch: at least 40px high.
- The feedback sheet should respect safe-area insets and mobile keyboard height.
- Text should wrap cleanly inside tab labels, buttons, and feedback history rows.
- No viewport-width font scaling.
- The stage remains the primary visual area. The content panel should not permanently shrink it below a useful height.
- Landscape must not trap key controls offscreen on short phone heights. Stage, play/pause, active tab selector, and feedback cancel/submit controls must remain reachable.

## Testing Plan

Manual verification:

- Mobile viewport opens with demo-like layout: top bar, stage, transport, inline tabs.
- Portrait viewport uses stacked demo layout.
- Landscape viewport uses stage-dominant layout with compact side panel.
- Landscape side panel can collapse or otherwise avoid taking excessive stage width.
- `Context` tab is selected by default.
- Clip switching works from `Clips`.
- References open from `References`.
- `Leave Feedback` is hidden in version preview mode.
- First-time reviewer must enter name before submit.
- Returning reviewer sees saved name.
- Empty comment cannot submit.
- Submit creates a feedback row with `annotation_json = null`.
- Created feedback includes version, slide, clip, clip time, and camera name when available.
- Desktop feedback mode still supports annotation and snapshot behavior.

Automated coverage, where practical:

- Add focused helper tests if context payload creation is extracted.
- Smoke-test mobile render if the project has an existing browser test setup.

## Implementation Notes

The current mobile code in `ClientPage.jsx` can be refactored in place:

- replace `activeDrawerTab` with an inline active tab defaulting to `context`,
- remove `MobileDrawer` from the mobile happy path,
- add a mobile-only feedback sheet state and submit handler,
- derive a simple mobile orientation flag from viewport dimensions and render portrait or landscape shell from the same state/data,
- reuse `reviewerName`, `reviewerNameLocked`, `comment`, `isSubmitting`, and `submitError` carefully or split mobile-specific draft state to avoid conflicting with desktop feedback mode,
- keep `annotation` unset and submit `annotation_json: null` for mobile text feedback.

The main product decision is now fixed: mobile feedback is text-only for this phase.
