-- Audit m5: archive retention cron.
--
-- Periodically prune archived presentation_versions older than a global window
-- while keeping a minimum number of recent archives per project. Drafts and
-- published versions are never touched.
--
-- Requires pg_cron (Supabase: enable Database → Extensions → pg_cron).
-- Run after `presentation_version_lifecycle_rpc.sql`.

CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.prune_archived_presentation_versions(
  p_keep_latest      INTEGER DEFAULT 20,
  p_older_than_days  INTEGER DEFAULT 180
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_keep INTEGER := GREATEST(COALESCE(p_keep_latest, 0), 1);
  v_days INTEGER := GREATEST(COALESCE(p_older_than_days, 0), 1);
  v_deleted INTEGER := 0;
BEGIN
  WITH ranked AS (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY project_id
        ORDER BY COALESCE(archived_at, updated_at, created_at) DESC
      ) AS rn,
      COALESCE(archived_at, updated_at, created_at) AS effective_at
    FROM public.presentation_versions
    WHERE status = 'archived'
  )
  DELETE FROM public.presentation_versions pv
  USING ranked r
  WHERE pv.id = r.id
    AND r.rn > v_keep
    AND r.effective_at < NOW() - make_interval(days => v_days);

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- Schedule weekly. Adjust schedule/args as needed.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'prune_archived_presentation_versions_weekly'
  ) THEN
    PERFORM cron.schedule(
      'prune_archived_presentation_versions_weekly',
      '0 3 * * 0',  -- Sundays 03:00 UTC
      $cron$SELECT public.prune_archived_presentation_versions(20, 180);$cron$
    );
  END IF;
END;
$$;
