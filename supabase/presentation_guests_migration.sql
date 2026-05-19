-- Migration: presentation_guests
-- Purpose: Guest identity gate — soft identity for anonymous client view users.
-- Run after: presentation_versions_rls_v3.sql
-- Prereq: C1–C5 audit fixes must be deployed first.

-- ── 1. Table ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS presentation_guests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  presentation_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  email            TEXT NOT NULL,
  name             TEXT NOT NULL,
  guest_token      UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  token_expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 days',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(presentation_id, email)
);

-- No direct anon access — all ops go through SECURITY DEFINER RPCs below.
ALTER TABLE presentation_guests ENABLE ROW LEVEL SECURITY;

-- Service role can do anything (admin dashboard reads).
DROP POLICY IF EXISTS guests_service_all ON presentation_guests;
CREATE POLICY guests_service_all ON presentation_guests
  TO service_role USING (true) WITH CHECK (true);

-- Authenticated users (admins) can read guests for their own projects.
DROP POLICY IF EXISTS guests_owner_read ON presentation_guests;
CREATE POLICY guests_owner_read ON presentation_guests
  FOR SELECT TO authenticated
  USING (
    presentation_id IN (
      SELECT id FROM projects WHERE owner_id = auth.uid()
    )
  );

-- ── 2. RPC: upsert_guest ──────────────────────────────────────────────────────
-- Called by anon client on gate form submit.
-- Returns JSON: { is_new, id, name, email, guest_token, token_expires_at }

CREATE OR REPLACE FUNCTION upsert_guest(
  p_presentation_id TEXT,
  p_email           TEXT,
  p_name            TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT;
  v_name  TEXT;
  v_guest presentation_guests%ROWTYPE;
  v_is_new BOOLEAN;
BEGIN
  -- Normalize
  v_email := lower(trim(p_email));
  v_name  := trim(p_name);

  -- Validate email (basic RFC pattern)
  IF v_email !~ '^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$' THEN
    RAISE EXCEPTION 'invalid_email' USING ERRCODE = 'P0001';
  END IF;

  -- Validate name
  IF length(v_name) < 1 OR length(v_name) > 100 THEN
    RAISE EXCEPTION 'invalid_name' USING ERRCODE = 'P0002';
  END IF;

  -- Ensure presentation exists. /view/:projectId is protected by GuestGate and
  -- must not depend on embed_enabled; embed gating remains separate.
  IF NOT EXISTS (
    SELECT 1 FROM projects WHERE id = p_presentation_id
  ) THEN
    RAISE EXCEPTION 'presentation_not_found' USING ERRCODE = 'P0003';
  END IF;

  -- Attempt lookup
  SELECT * INTO v_guest
  FROM presentation_guests
  WHERE presentation_id = p_presentation_id AND email = v_email;

  IF NOT FOUND THEN
    -- New guest
    v_is_new := true;
    INSERT INTO presentation_guests (presentation_id, email, name)
    VALUES (p_presentation_id, v_email, v_name)
    RETURNING * INTO v_guest;
  ELSE
    -- Returning guest — update activity timestamp, allow name update
    v_is_new := false;
    UPDATE presentation_guests
    SET last_seen_at = NOW(),
        name         = CASE WHEN length(v_name) > 0 THEN v_name ELSE name END,
        token_expires_at = NOW() + INTERVAL '30 days'
    WHERE id = v_guest.id
    RETURNING * INTO v_guest;
  END IF;

  RETURN jsonb_build_object(
    'is_new',          v_is_new,
    'id',              v_guest.id,
    'name',            v_guest.name,
    'email',           v_guest.email,
    'guest_token',     v_guest.guest_token,
    'token_expires_at', v_guest.token_expires_at
  );
END;
$$;

-- Revoke direct execution from anon (only callable via supabase client RPC which
-- goes through the PostgREST layer — that's intentional for this app).
GRANT EXECUTE ON FUNCTION upsert_guest(TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION upsert_guest(TEXT, TEXT, TEXT) TO authenticated;

-- Guest-scoped feedback RPCs. Anonymous users never get direct UPDATE/DELETE on
-- feedback tables; they mutate only rows linked to their active guest token.
CREATE OR REPLACE FUNCTION submit_guest_feedback(
  p_guest_token UUID,
  p_presentation_version_id UUID,
  p_slide_id TEXT,
  p_clip_id TEXT,
  p_clip_time_seconds DOUBLE PRECISION,
  p_camera_snapshot_json JSONB,
  p_annotation_json JSONB,
  p_reviewer_name TEXT,
  p_comment TEXT
)
RETURNS client_feedback_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_guest presentation_guests%ROWTYPE;
  v_feedback client_feedback_items%ROWTYPE;
BEGIN
  SELECT * INTO v_guest
  FROM presentation_guests
  WHERE guest_token = p_guest_token
    AND token_expires_at > NOW();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'guest_token_invalid';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM presentation_versions pv
    WHERE pv.id = p_presentation_version_id
      AND pv.project_id::TEXT = v_guest.presentation_id::TEXT
      AND pv.status = 'published'
  ) THEN
    RAISE EXCEPTION 'presentation_version_not_available';
  END IF;

  INSERT INTO client_feedback_items (
    project_id,
    presentation_version_id,
    guest_id,
    slide_id,
    clip_id,
    clip_time_seconds,
    camera_snapshot_json,
    annotation_json,
    reviewer_name,
    comment,
    status
  ) VALUES (
    v_guest.presentation_id::TEXT,
    p_presentation_version_id,
    v_guest.id,
    COALESCE(p_slide_id, ''),
    COALESCE(p_clip_id, ''),
    p_clip_time_seconds,
    p_camera_snapshot_json,
    p_annotation_json,
    COALESCE(NULLIF(trim(p_reviewer_name), ''), v_guest.name),
    trim(p_comment),
    'pending'
  )
  RETURNING * INTO v_feedback;

  UPDATE presentation_guests
  SET last_seen_at = NOW()
  WHERE id = v_guest.id;

  RETURN v_feedback;
END;
$$;

CREATE OR REPLACE FUNCTION update_guest_feedback(
  p_guest_token UUID,
  p_feedback_id UUID,
  p_comment TEXT
)
RETURNS client_feedback_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_guest presentation_guests%ROWTYPE;
  v_feedback client_feedback_items%ROWTYPE;
BEGIN
  SELECT * INTO v_guest
  FROM presentation_guests
  WHERE guest_token = p_guest_token
    AND token_expires_at > NOW();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'guest_token_invalid';
  END IF;

  UPDATE client_feedback_items
  SET comment = trim(p_comment)
  WHERE id = p_feedback_id
    AND guest_id = v_guest.id
  RETURNING * INTO v_feedback;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'feedback_not_found';
  END IF;

  RETURN v_feedback;
END;
$$;

CREATE OR REPLACE FUNCTION delete_guest_feedback(
  p_guest_token UUID,
  p_feedback_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_guest presentation_guests%ROWTYPE;
BEGIN
  SELECT * INTO v_guest
  FROM presentation_guests
  WHERE guest_token = p_guest_token
    AND token_expires_at > NOW();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'guest_token_invalid';
  END IF;

  DELETE FROM client_feedback_items
  WHERE id = p_feedback_id
    AND guest_id = v_guest.id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'feedback_not_found';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION submit_guest_feedback(UUID, UUID, TEXT, TEXT, DOUBLE PRECISION, JSONB, JSONB, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION submit_guest_feedback(UUID, UUID, TEXT, TEXT, DOUBLE PRECISION, JSONB, JSONB, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION update_guest_feedback(UUID, UUID, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION update_guest_feedback(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_guest_feedback(UUID, UUID) TO anon;
GRANT EXECUTE ON FUNCTION delete_guest_feedback(UUID, UUID) TO authenticated;

-- ── 3. feedback table: add guest_id ──────────────────────────────────────────
-- Nullable for backward compat with existing anonymous feedback rows.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'client_feedback_items' AND column_name = 'guest_id'
  ) THEN
    ALTER TABLE client_feedback_items
      ADD COLUMN guest_id UUID REFERENCES presentation_guests(id) ON DELETE SET NULL;
  END IF;
END;
$$;

-- Index for fast per-guest feedback queries
CREATE INDEX IF NOT EXISTS idx_client_feedback_items_guest_id
  ON client_feedback_items(guest_id)
  WHERE guest_id IS NOT NULL;

DROP VIEW IF EXISTS client_feedback_public;
CREATE VIEW client_feedback_public AS
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
FROM client_feedback_items
WHERE EXISTS (
  SELECT 1
  FROM presentation_versions pv
  WHERE pv.id = client_feedback_items.presentation_version_id
    AND pv.project_id::TEXT = client_feedback_items.project_id::TEXT
    AND pv.status = 'published'
);

GRANT SELECT ON client_feedback_public TO anon;
GRANT SELECT ON client_feedback_public TO authenticated;

DROP FUNCTION IF EXISTS load_guest_feedback(UUID, TEXT, TEXT, TEXT, UUID);
CREATE OR REPLACE FUNCTION load_guest_feedback(
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
  v_guest presentation_guests%ROWTYPE;
BEGIN
  SELECT * INTO v_guest
  FROM presentation_guests
  WHERE guest_token = p_guest_token
    AND token_expires_at > NOW();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'guest_token_invalid';
  END IF;

  IF v_guest.presentation_id::TEXT <> p_project_id::TEXT THEN
    RAISE EXCEPTION 'guest_project_mismatch';
  END IF;

  UPDATE presentation_guests
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
  FROM client_feedback_items cfi
  WHERE cfi.project_id::TEXT = p_project_id::TEXT
    AND (p_slide_id IS NULL OR cfi.slide_id = p_slide_id)
    AND (p_status IS NULL OR cfi.status = p_status)
    AND (p_presentation_version_id IS NULL OR cfi.presentation_version_id = p_presentation_version_id)
    AND EXISTS (
      SELECT 1
      FROM presentation_versions pv
      WHERE pv.id = cfi.presentation_version_id
        AND pv.project_id::TEXT = cfi.project_id::TEXT
        AND pv.status = 'published'
    )
  ORDER BY cfi.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION load_guest_feedback(UUID, TEXT, TEXT, TEXT, UUID) TO anon;
GRANT EXECUTE ON FUNCTION load_guest_feedback(UUID, TEXT, TEXT, TEXT, UUID) TO authenticated;

-- ── 4. Verify ─────────────────────────────────────────────────────────────────
-- After running, confirm:
--   SELECT * FROM presentation_guests LIMIT 1;               -- table exists
--   SELECT upsert_guest('<project-uuid>', 'test@x.com', 'Test'); -- returns JSON
--   \d client_feedback_items                                  -- guest_id column present

NOTIFY pgrst, 'reload schema';
