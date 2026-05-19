# Feedback Snapshots

## Current Storage

New client feedback snapshots are uploaded to Cloudflare R2 through the existing `/api/get-upload-url` presigned upload flow.

Snapshots are only captured when the reviewer draws an annotation. Text-only feedback does not capture or upload a stage snapshot.

R2 object prefix:

```text
{projectId}/feedback-snapshots/{timestamp}_{slideId}_feedback_snapshot.jpg
```

The feedback row stores only metadata in Supabase:

```text
client_feedback_items.annotation_json.snapshot
```

Expected shape for new feedback:

```json
{
  "url": "https://r2-public-base/project-id/feedback-snapshots/...",
  "key": "project-id/feedback-snapshots/...",
  "width": 2160,
  "height": 1095,
  "contentType": "image/jpeg",
  "storage": "r2"
}
```

Text-only feedback shape:

```json
{
  "annotation_json": null
}
```

Legacy or failed-upload fallback shape for annotated feedback:

```json
{
  "dataUrl": "data:image/jpeg;base64,...",
  "width": 720,
  "height": 365,
  "storage": "inline-data-url",
  "uploadFailed": true
}
```

## Why R2

Storing snapshots as base64 in `annotation_json` makes each feedback row heavy and caps practical image quality. R2 keeps Supabase rows small while allowing HD snapshots.

## Resolution

Snapshot capture currently caps width at `2160px` and keeps the source aspect ratio. This gives at least 1080px height for the current wide stage aspect when the WebGL canvas source is large enough. If the browser canvas is smaller than this, the app preserves source size rather than upscaling fake detail.

JPEG quality:

```text
R2 upload: 0.86
inline fallback: 0.78
```

## Cleanup Control

To find snapshot objects for a project, list this R2 prefix:

```text
{projectId}/feedback-snapshots/
```

Before deleting a snapshot object, check whether any non-deleted feedback row still references its key:

```sql
select id, created_at, reviewer_name, status
from client_feedback_items
where annotation_json #>> '{snapshot,key}' = '<r2-key>';
```

For project-level cleanup after a review is complete:

1. Export or list all keys under `{projectId}/feedback-snapshots/`.
2. Confirm the matching feedback rows no longer need visual review context.
3. Delete those R2 objects.
4. Optionally patch the corresponding feedback rows to remove `annotation_json.snapshot.url` and `annotation_json.snapshot.key`, or leave the metadata as a historical pointer.

## Code Touchpoints

- Client capture/upload: `src/pages/ClientPage.jsx`
- R2 presigned URL API: `api/get-upload-url.js`
- R2 upload helper: `src/utils/r2Upload.js`
- Admin preview render: `src/pages/AdminFeedbackReviewPage.jsx`
- DB column: `client_feedback_items.annotation_json`
