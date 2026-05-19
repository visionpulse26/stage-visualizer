-- Guest read RPC that marks which feedback rows belong to the active guest.
-- Mutation RPCs remain the authoritative edit/delete guard.

DROP FUNCTION IF EXISTS public.load_guest_feedback(UUID, TEXT, TEXT, TEXT, UUID);
CREATE OR REPLACE FUNCTION public.load_guest_feedback(
  p_guest_token UUID,
  p_project_id TEXT,
  p_slide_id TEXT DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_presentation_version_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  project_id TEXT,
  presentation_version_id UUID,
  slide_id TEXT,
  clip_id TEXT,
  reviewer_name TEXT,
  comment TEXT,
  status TEXT,
  clip_time_seconds DOUBLE PRECISION,
  camera_snapshot_json JSONB,
  annotation_json JSONB,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  can_edit BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_guest public.presentation_guests%ROWTYPE;
BEGIN
  SELECT * INTO v_guest
  FROM public.presentation_guests
  WHERE guest_token = p_guest_token
    AND token_expires_at > NOW();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'guest_token_invalid';
  END IF;

  IF v_guest.presentation_id::TEXT <> p_project_id::TEXT THEN
    RAISE EXCEPTION 'guest_project_mismatch';
  END IF;

  UPDATE public.presentation_guests
  SET last_seen_at = NOW()
  WHERE presentation_guests.id = v_guest.id;

  RETURN QUERY
  SELECT
    cfi.id,
    cfi.project_id,
    cfi.presentation_version_id,
    cfi.slide_id,
    cfi.clip_id,
    cfi.reviewer_name,
    cfi.comment,
    cfi.status,
    cfi.clip_time_seconds,
    cfi.camera_snapshot_json,
    cfi.annotation_json,
    cfi.resolved_at,
    cfi.created_at,
    cfi.updated_at,
    cfi.guest_id = v_guest.id AS can_edit
  FROM public.client_feedback_items cfi
  WHERE cfi.project_id::TEXT = p_project_id::TEXT
    AND (p_slide_id IS NULL OR cfi.slide_id = p_slide_id)
    AND (p_status IS NULL OR cfi.status = p_status)
    AND (p_presentation_version_id IS NULL OR cfi.presentation_version_id = p_presentation_version_id)
    AND EXISTS (
      SELECT 1
      FROM public.presentation_versions pv
      WHERE pv.id = cfi.presentation_version_id
        AND pv.project_id::TEXT = cfi.project_id::TEXT
        AND pv.status = 'published'
    )
  ORDER BY cfi.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.load_guest_feedback(UUID, TEXT, TEXT, TEXT, UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.load_guest_feedback(UUID, TEXT, TEXT, TEXT, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
