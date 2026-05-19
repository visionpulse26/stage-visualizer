-- Ensure guest clients can read sanitized feedback for published presentations.
-- Admin reads still use client_feedback_items directly.

DROP VIEW IF EXISTS public.client_feedback_public;
CREATE VIEW public.client_feedback_public AS
SELECT
  id,
  project_id,
  presentation_version_id,
  slide_id,
  clip_id,
  reviewer_name,
  comment,
  status,
  clip_time_seconds,
  camera_snapshot_json,
  annotation_json,
  resolved_at,
  created_at,
  updated_at
FROM public.client_feedback_items
WHERE EXISTS (
  SELECT 1
  FROM public.presentation_versions pv
  WHERE pv.id = client_feedback_items.presentation_version_id
    AND pv.project_id::TEXT = client_feedback_items.project_id::TEXT
    AND pv.status = 'published'
);

GRANT SELECT ON public.client_feedback_public TO anon;
GRANT SELECT ON public.client_feedback_public TO authenticated;

NOTIFY pgrst, 'reload schema';
