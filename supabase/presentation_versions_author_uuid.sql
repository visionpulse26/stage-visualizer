-- Audit M5 + M6 hardening
--
-- M5: Move admin attribution (`created_by` / `published_by` / `resolved_by`) off
--     plaintext email columns onto UUID references to `auth.users`. Email
--     columns are kept around for one release as fallback during rollout; a
--     follow-up migration should drop them.
-- M6: Provide author-aware admin views that expose `admin_note` / author email
--     only to the `authenticated` role. The `client_feedback_public` view in
--     `presentation_versions_rls_v3.sql` already excludes `admin_note` for anon.
--
-- Run AFTER `presentation_versions_rls_v3.sql`.

BEGIN;

-- ── New UUID columns ──────────────────────────────────────────────────────────
ALTER TABLE public.presentation_versions
  ADD COLUMN IF NOT EXISTS created_by_user_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS published_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.client_feedback_items
  ADD COLUMN IF NOT EXISTS resolved_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS presentation_versions_created_by_user_idx
  ON public.presentation_versions (created_by_user_id);
CREATE INDEX IF NOT EXISTS presentation_versions_published_by_user_idx
  ON public.presentation_versions (published_by_user_id);
CREATE INDEX IF NOT EXISTS client_feedback_items_resolved_by_user_idx
  ON public.client_feedback_items (resolved_by_user_id);

-- ── Best-effort backfill from email columns ──────────────────────────────────
-- Maps existing legacy email values onto auth.users.id when an account exists.
UPDATE public.presentation_versions pv
SET created_by_user_id = u.id
FROM auth.users u
WHERE pv.created_by_user_id IS NULL
  AND length(pv.created_by) > 0
  AND lower(u.email) = lower(pv.created_by);

UPDATE public.presentation_versions pv
SET published_by_user_id = u.id
FROM auth.users u
WHERE pv.published_by_user_id IS NULL
  AND length(pv.published_by) > 0
  AND lower(u.email) = lower(pv.published_by);

UPDATE public.client_feedback_items cfi
SET resolved_by_user_id = u.id
FROM auth.users u
WHERE cfi.resolved_by_user_id IS NULL
  AND length(cfi.resolved_by) > 0
  AND lower(u.email) = lower(cfi.resolved_by);

-- ── RPC signatures: accept new UUID parameters ───────────────────────────────
-- The existing RPCs (`save_draft_version`, `publish_presentation_version`,
-- `restore_presentation_version`) currently take a TEXT `p_created_by`. We add
-- overloads that also persist `*_user_id`. Older callers fall through to the
-- legacy signature so deploys are forward-compatible.

CREATE OR REPLACE FUNCTION public.save_draft_version_v2(
  p_project_id    UUID,
  p_snapshot      JSONB,
  p_version_name  TEXT,
  p_release_notes TEXT,
  p_expected_token UUID,
  p_created_by    TEXT,
  p_created_by_user_id UUID
) RETURNS public.presentation_versions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.presentation_versions;
BEGIN
  v_row := public.save_draft_version(
    p_project_id,
    p_snapshot,
    p_version_name,
    p_release_notes,
    p_expected_token,
    p_created_by
  );

  IF p_created_by_user_id IS NOT NULL THEN
    UPDATE public.presentation_versions
    SET created_by_user_id = p_created_by_user_id
    WHERE id = v_row.id
    RETURNING * INTO v_row;
  END IF;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_presentation_version_v2(
  p_project_id    UUID,
  p_snapshot      JSONB,
  p_version_name  TEXT,
  p_release_notes TEXT,
  p_expected_token UUID,
  p_published_by  TEXT,
  p_created_by    TEXT,
  p_published_by_user_id UUID,
  p_created_by_user_id   UUID
) RETURNS public.presentation_versions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.presentation_versions;
BEGIN
  v_row := public.publish_presentation_version(
    p_project_id,
    p_snapshot,
    p_version_name,
    p_release_notes,
    p_expected_token,
    p_published_by,
    p_created_by
  );

  UPDATE public.presentation_versions
  SET published_by_user_id = COALESCE(p_published_by_user_id, published_by_user_id),
      created_by_user_id   = COALESCE(p_created_by_user_id, created_by_user_id)
  WHERE id = v_row.id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_presentation_version_v2(
  p_project_id        UUID,
  p_source_version_id UUID,
  p_created_by        TEXT,
  p_created_by_user_id UUID
) RETURNS public.presentation_versions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.presentation_versions;
BEGIN
  v_row := public.restore_presentation_version(
    p_project_id,
    p_source_version_id,
    p_created_by
  );

  IF p_created_by_user_id IS NOT NULL THEN
    UPDATE public.presentation_versions
    SET created_by_user_id = p_created_by_user_id
    WHERE id = v_row.id
    RETURNING * INTO v_row;
  END IF;

  RETURN v_row;
END;
$$;

-- ── Admin-facing views: expose display_name without leaking auth.users rows ──
DROP VIEW IF EXISTS public.presentation_versions_with_author;
CREATE VIEW public.presentation_versions_with_author AS
SELECT
  pv.*,
  cu.email           AS created_by_email_resolved,
  cu.raw_user_meta_data->>'full_name' AS created_by_name,
  pu.email           AS published_by_email_resolved,
  pu.raw_user_meta_data->>'full_name' AS published_by_name
FROM public.presentation_versions pv
LEFT JOIN auth.users cu ON cu.id = pv.created_by_user_id
LEFT JOIN auth.users pu ON pu.id = pv.published_by_user_id;

REVOKE ALL ON public.presentation_versions_with_author FROM anon;
GRANT SELECT ON public.presentation_versions_with_author TO authenticated;

DROP VIEW IF EXISTS public.client_feedback_with_resolver;
CREATE VIEW public.client_feedback_with_resolver AS
SELECT
  cfi.*,
  ru.email                            AS resolved_by_email_resolved,
  ru.raw_user_meta_data->>'full_name' AS resolved_by_name
FROM public.client_feedback_items cfi
LEFT JOIN auth.users ru ON ru.id = cfi.resolved_by_user_id;

REVOKE ALL ON public.client_feedback_with_resolver FROM anon;
GRANT SELECT ON public.client_feedback_with_resolver TO authenticated;

COMMIT;

-- Follow-up migration after one release with no email writes:
--
--   ALTER TABLE public.presentation_versions
--     DROP COLUMN created_by, DROP COLUMN published_by;
--   ALTER TABLE public.client_feedback_items
--     DROP COLUMN resolved_by;
--   DROP FUNCTION save_draft_version(...);
--   DROP FUNCTION publish_presentation_version(...);
--   DROP FUNCTION restore_presentation_version(...);
--
-- At that point also drop the v2 functions' `p_created_by TEXT` / `p_published_by
-- TEXT` parameters.
