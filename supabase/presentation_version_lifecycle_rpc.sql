-- Atomic presentation version lifecycle operations.
-- These functions serialize per project and enforce optimistic locking inside
-- the same database transaction as the write.

CREATE OR REPLACE FUNCTION public.assign_presentation_version_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  next_num INTEGER;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(NEW.project_id::TEXT));

  SELECT COALESCE(MAX(version_number), 0) + 1
    INTO next_num
    FROM public.presentation_versions
   WHERE project_id::TEXT = NEW.project_id::TEXT;

  NEW.version_number = next_num;
  RETURN NEW;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS presentation_versions_project_version_number_unique
  ON public.presentation_versions (project_id, version_number);

CREATE OR REPLACE FUNCTION public.save_draft_version(
  p_project_id TEXT,
  p_snapshot_json JSONB,
  p_version_name TEXT DEFAULT '',
  p_release_notes TEXT DEFAULT '',
  p_expected_token UUID DEFAULT NULL,
  p_created_by TEXT DEFAULT ''
) RETURNS public.presentation_versions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.presentation_versions%ROWTYPE;
  v_saved public.presentation_versions%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_project_id));

  SELECT * INTO v_existing
  FROM public.presentation_versions
  WHERE project_id::TEXT = p_project_id::TEXT
    AND status = 'draft'
  ORDER BY version_number DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    IF p_expected_token IS NOT NULL AND v_existing.version_token IS DISTINCT FROM p_expected_token THEN
      RAISE EXCEPTION 'version_conflict';
    END IF;

    UPDATE public.presentation_versions
    SET snapshot_json = p_snapshot_json,
        version_name = COALESCE(NULLIF(p_version_name, ''), v_existing.version_name),
        release_notes = COALESCE(NULLIF(p_release_notes, ''), v_existing.release_notes),
        created_by = CASE
          WHEN COALESCE(v_existing.created_by, '') = '' THEN COALESCE(p_created_by, '')
          ELSE v_existing.created_by
        END
    WHERE id = v_existing.id
    RETURNING * INTO v_saved;

    RETURN v_saved;
  END IF;

  INSERT INTO public.presentation_versions (
    project_id,
    version_name,
    release_notes,
    status,
    snapshot_json,
    created_by
  ) VALUES (
    p_project_id,
    COALESCE(p_version_name, ''),
    COALESCE(p_release_notes, ''),
    'draft',
    p_snapshot_json,
    COALESCE(p_created_by, '')
  )
  RETURNING * INTO v_saved;

  RETURN v_saved;
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_presentation_version(
  p_project_id TEXT,
  p_snapshot_json JSONB,
  p_version_name TEXT DEFAULT '',
  p_release_notes TEXT DEFAULT '',
  p_expected_token UUID DEFAULT NULL,
  p_published_by TEXT DEFAULT '',
  p_created_by TEXT DEFAULT ''
) RETURNS public.presentation_versions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_draft public.presentation_versions%ROWTYPE;
  v_published public.presentation_versions%ROWTYPE;
  v_result public.presentation_versions%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_project_id));

  SELECT * INTO v_draft
  FROM public.presentation_versions
  WHERE project_id::TEXT = p_project_id::TEXT
    AND status = 'draft'
  ORDER BY version_number DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND AND p_expected_token IS NOT NULL AND v_draft.version_token IS DISTINCT FROM p_expected_token THEN
    RAISE EXCEPTION 'version_conflict';
  END IF;

  SELECT * INTO v_published
  FROM public.presentation_versions
  WHERE project_id::TEXT = p_project_id::TEXT
    AND status = 'published'
  ORDER BY version_number DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.presentation_versions
    SET status = 'archived',
        superseded_by = CASE WHEN v_draft.id IS NOT NULL THEN v_draft.id ELSE superseded_by END
    WHERE id = v_published.id;
  END IF;

  IF v_draft.id IS NOT NULL THEN
    UPDATE public.presentation_versions
    SET status = 'published',
        version_name = COALESCE(p_version_name, ''),
        release_notes = COALESCE(p_release_notes, ''),
        snapshot_json = p_snapshot_json,
        published_by = COALESCE(p_published_by, ''),
        published_at = NOW(),
        created_by = CASE
          WHEN COALESCE(v_draft.created_by, '') = '' THEN COALESCE(p_created_by, '')
          ELSE v_draft.created_by
        END
    WHERE id = v_draft.id
    RETURNING * INTO v_result;

    RETURN v_result;
  END IF;

  INSERT INTO public.presentation_versions (
    project_id,
    version_name,
    release_notes,
    status,
    snapshot_json,
    published_by,
    created_by,
    published_at
  ) VALUES (
    p_project_id,
    COALESCE(p_version_name, ''),
    COALESCE(p_release_notes, ''),
    'published',
    p_snapshot_json,
    COALESCE(p_published_by, ''),
    COALESCE(p_created_by, ''),
    NOW()
  )
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.discard_draft_version(
  p_project_id TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_project_id));

  DELETE FROM public.presentation_versions
  WHERE project_id::TEXT = p_project_id::TEXT
    AND status = 'draft';
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_presentation_version(
  p_project_id TEXT,
  p_source_version_id UUID,
  p_created_by TEXT DEFAULT ''
) RETURNS public.presentation_versions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source public.presentation_versions%ROWTYPE;
  v_new public.presentation_versions%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_project_id));

  SELECT * INTO v_source
  FROM public.presentation_versions
  WHERE id = p_source_version_id
    AND project_id::TEXT = p_project_id::TEXT;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'source_version_not_found';
  END IF;

  UPDATE public.presentation_versions
  SET status = 'archived'
  WHERE project_id::TEXT = p_project_id::TEXT
    AND status = 'draft';

  INSERT INTO public.presentation_versions (
    project_id,
    version_name,
    release_notes,
    status,
    snapshot_json,
    restored_from,
    created_by
  ) VALUES (
    p_project_id,
    CASE
      WHEN COALESCE(v_source.version_name, '') <> '' THEN v_source.version_name || ' (restored)'
      ELSE 'Restored v' || v_source.version_number
    END,
    COALESCE(v_source.release_notes, ''),
    'draft',
    v_source.snapshot_json,
    v_source.id,
    COALESCE(p_created_by, '')
  )
  RETURNING * INTO v_new;

  RETURN v_new;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_draft_version(TEXT, JSONB, TEXT, TEXT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_presentation_version(TEXT, JSONB, TEXT, TEXT, UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.discard_draft_version(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_presentation_version(TEXT, UUID, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
