-- Harden public read/write access for projects, presentation versions, and feedback.
-- Run after presentation_versions_schema.sql and embed_token_migration.sql.

BEGIN;

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.presentation_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_feedback_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.projects
  ALTER COLUMN owner_id SET DEFAULT auth.uid();

-- Before applying to an environment with existing projects, backfill owner_id
-- for those rows to the correct auth.users.id. Rows left NULL become inaccessible
-- to authenticated project-level mutations under the owner-scoped policies below.

CREATE INDEX IF NOT EXISTS projects_owner_id_idx
  ON public.projects (owner_id);

DROP POLICY IF EXISTS "projects_select_public" ON public.projects;
DROP POLICY IF EXISTS "projects_insert_authenticated" ON public.projects;
DROP POLICY IF EXISTS "projects_update_authenticated" ON public.projects;
DROP POLICY IF EXISTS "projects_delete_authenticated" ON public.projects;

DROP POLICY IF EXISTS "anon read presentation_versions" ON public.presentation_versions;
DROP POLICY IF EXISTS "anon read client_feedback_items" ON public.client_feedback_items;
DROP POLICY IF EXISTS "anon insert client_feedback_items" ON public.client_feedback_items;
DROP POLICY IF EXISTS "anon update client_feedback_items" ON public.client_feedback_items;
DROP POLICY IF EXISTS "anon delete client_feedback_items" ON public.client_feedback_items;
DROP POLICY IF EXISTS "auth all presentation_versions" ON public.presentation_versions;
DROP POLICY IF EXISTS "auth all client_feedback_items" ON public.client_feedback_items;

REVOKE ALL ON public.projects FROM anon;
REVOKE ALL ON public.presentation_versions FROM anon;
REVOKE ALL ON public.client_feedback_items FROM anon;

CREATE OR REPLACE FUNCTION public.sanitize_public_scene_config(config JSONB)
RETURNS JSONB
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT COALESCE(
    jsonb_object_agg(key, value) FILTER (WHERE key !~ '^_private'),
    '{}'::jsonb
  )
  FROM jsonb_each(COALESCE(config, '{}'::jsonb));
$$;

DROP FUNCTION IF EXISTS public.resolve_embed_project(TEXT);
DROP FUNCTION IF EXISTS public.submit_guest_feedback(UUID, UUID, TEXT, TEXT, DOUBLE PRECISION, JSONB, JSONB, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.update_guest_feedback(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.delete_guest_feedback(UUID, UUID);
DROP FUNCTION IF EXISTS public.load_guest_feedback(UUID, TEXT, TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS public.upsert_guest(TEXT, TEXT, TEXT);
DROP VIEW IF EXISTS public.projects_client_public;
DROP VIEW IF EXISTS public.projects_public;
CREATE VIEW public.projects_public AS
SELECT
  id,
  name,
  stage_url,
  video_url,
  media_playlist,
  camera_presets,
  grid_cell_size,
  public.sanitize_public_scene_config(scene_config) AS scene_config,
  group_id,
  is_client_locked
FROM public.projects
WHERE embed_enabled = true;

CREATE VIEW public.projects_client_public AS
SELECT
  id,
  name,
  stage_url,
  video_url,
  media_playlist,
  camera_presets,
  grid_cell_size,
  public.sanitize_public_scene_config(scene_config) AS scene_config,
  group_id,
  is_client_locked
FROM public.projects;

CREATE TABLE IF NOT EXISTS public.presentation_guests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  presentation_id  TEXT NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  email            TEXT NOT NULL,
  name             TEXT NOT NULL,
  guest_token      UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  token_expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 days',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(presentation_id, email)
);

ALTER TABLE public.presentation_guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_feedback_items
  ADD COLUMN IF NOT EXISTS guest_id UUID REFERENCES public.presentation_guests(id) ON DELETE SET NULL;

REVOKE ALL ON public.presentation_guests FROM anon;
REVOKE ALL ON public.presentation_guests FROM authenticated;

CREATE INDEX IF NOT EXISTS presentation_guests_presentation_email_idx
  ON public.presentation_guests (presentation_id, email);

CREATE INDEX IF NOT EXISTS client_feedback_items_guest_id_idx
  ON public.client_feedback_items (guest_id);

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
  JOIN public.projects p ON p.id = pv.project_id
  WHERE pv.id = client_feedback_items.presentation_version_id
    AND pv.project_id::TEXT = client_feedback_items.project_id::TEXT
    AND pv.status = 'published'
);

CREATE OR REPLACE FUNCTION public.resolve_embed_project(p_token TEXT)
RETURNS SETOF public.projects_public
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pp.*
  FROM public.projects_public pp
  JOIN public.projects p ON p.id = pp.id
  WHERE p.embed_token::text = p_token
    AND p.embed_enabled = true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.upsert_guest(
  p_presentation_id TEXT,
  p_email TEXT,
  p_name TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT := lower(trim(p_email));
  v_name TEXT := trim(p_name);
  v_guest public.presentation_guests;
  v_inserted BOOLEAN := false;
BEGIN
  IF v_email !~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$' THEN
    RAISE EXCEPTION 'invalid_email';
  END IF;
  IF length(v_name) < 1 OR length(v_name) > 100 THEN
    RAISE EXCEPTION 'invalid_name';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.projects WHERE id = p_presentation_id) THEN
    RAISE EXCEPTION 'presentation_not_found';
  END IF;

  SELECT * INTO v_guest
  FROM public.presentation_guests
  WHERE presentation_id = p_presentation_id
    AND email = v_email;

  IF FOUND THEN
    UPDATE public.presentation_guests
    SET name = v_name,
        last_seen_at = NOW(),
        token_expires_at = NOW() + INTERVAL '30 days'
    WHERE id = v_guest.id
    RETURNING * INTO v_guest;
  ELSE
    INSERT INTO public.presentation_guests (presentation_id, email, name)
    VALUES (p_presentation_id, v_email, v_name)
    RETURNING * INTO v_guest;
    v_inserted := true;
  END IF;

  RETURN jsonb_build_object(
    'is_new', v_inserted,
    'id', v_guest.id,
    'name', v_guest.name,
    'email', v_guest.email,
    'guest_token', v_guest.guest_token,
    'token_expires_at', v_guest.token_expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_guest_feedback(
  p_guest_token UUID,
  p_presentation_version_id UUID,
  p_slide_id TEXT,
  p_clip_id TEXT,
  p_clip_time_seconds DOUBLE PRECISION,
  p_camera_snapshot_json JSONB,
  p_annotation_json JSONB,
  p_reviewer_name TEXT,
  p_comment TEXT
) RETURNS public.client_feedback_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_guest public.presentation_guests;
  v_feedback public.client_feedback_items;
BEGIN
  SELECT * INTO v_guest
  FROM public.presentation_guests
  WHERE guest_token = p_guest_token
    AND token_expires_at > NOW();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'guest_token_invalid';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.presentation_versions pv
    WHERE pv.id = p_presentation_version_id
      AND pv.project_id::TEXT = v_guest.presentation_id::TEXT
      AND pv.status = 'published'
  ) THEN
    RAISE EXCEPTION 'presentation_version_not_available';
  END IF;

  INSERT INTO public.client_feedback_items (
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

  UPDATE public.presentation_guests
  SET last_seen_at = NOW()
  WHERE id = v_guest.id;

  RETURN v_feedback;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_guest_feedback(
  p_guest_token UUID,
  p_feedback_id UUID,
  p_comment TEXT
) RETURNS public.client_feedback_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_guest public.presentation_guests;
  v_feedback public.client_feedback_items;
BEGIN
  SELECT * INTO v_guest
  FROM public.presentation_guests
  WHERE guest_token = p_guest_token
    AND token_expires_at > NOW();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'guest_token_invalid';
  END IF;

  UPDATE public.client_feedback_items
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

CREATE OR REPLACE FUNCTION public.delete_guest_feedback(
  p_guest_token UUID,
  p_feedback_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_guest public.presentation_guests;
BEGIN
  SELECT * INTO v_guest
  FROM public.presentation_guests
  WHERE guest_token = p_guest_token
    AND token_expires_at > NOW();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'guest_token_invalid';
  END IF;

  DELETE FROM public.client_feedback_items
  WHERE id = p_feedback_id
    AND guest_id = v_guest.id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'feedback_not_found';
  END IF;
END;
$$;

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

CREATE POLICY "projects_auth_owner_select"
  ON public.projects FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "projects_auth_owner_insert"
  ON public.projects FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "projects_auth_owner_update"
  ON public.projects FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "projects_auth_owner_delete"
  ON public.projects FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "anon_read_published_versions_for_public_projects"
  ON public.presentation_versions FOR SELECT TO anon
  USING (
    status = 'published'
    AND EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id::TEXT = presentation_versions.project_id::TEXT
        AND p.id IS NOT NULL
    )
  );

CREATE POLICY "auth_owner_all_presentation_versions"
  ON public.presentation_versions FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id::TEXT = presentation_versions.project_id::TEXT
        AND p.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id::TEXT = presentation_versions.project_id::TEXT
        AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "auth_owner_all_client_feedback_items"
  ON public.client_feedback_items FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id::TEXT = client_feedback_items.project_id::TEXT
        AND p.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id::TEXT = client_feedback_items.project_id::TEXT
        AND p.owner_id = auth.uid()
    )
  );

GRANT SELECT ON public.projects_public TO anon, authenticated;
GRANT SELECT ON public.projects_client_public TO anon, authenticated;
GRANT SELECT ON public.client_feedback_public TO anon, authenticated;
GRANT SELECT ON public.presentation_versions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.presentation_versions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_feedback_items TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_embed_project(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_guest(TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_guest_feedback(UUID, UUID, TEXT, TEXT, DOUBLE PRECISION, JSONB, JSONB, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_guest_feedback(UUID, UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_guest_feedback(UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.load_guest_feedback(UUID, TEXT, TEXT, TEXT, UUID) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
