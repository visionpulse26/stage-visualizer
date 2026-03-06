-- ═══════════════════════════════════════════════════════════════════════════════
-- SAFE DELETE: Reference-aware storage deletion for Multi-Round Versioning
-- Run in Supabase SQL Editor. Prevents purging NAS/storage files that cloned
-- projects (Round 2+) still reference.
-- ═══════════════════════════════════════════════════════════════════════════════

-- RPC: Check if any other project references this project's storage folder.
-- Storage path convention: projects/{project_id}/stage.glb, projects/{project_id}/environment.*
-- Returns TRUE if storage can be safely deleted (no other project references it).
CREATE OR REPLACE FUNCTION can_safely_delete_storage(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ref_count INTEGER;
  pid TEXT;
BEGIN
  pid := p_project_id::TEXT;

  -- Count other projects whose stage_url or customHdriUrl points into this project's folder
  -- Use pid (text) so comparison works whether projects.id is UUID or TEXT
  SELECT COUNT(*)::INTEGER INTO ref_count
  FROM projects
  WHERE COALESCE(id::TEXT, '') <> pid
    AND (
      (stage_url IS NOT NULL AND stage_url LIKE '%' || pid || '%')
      OR ((scene_config->>'customHdriUrl') IS NOT NULL
          AND (scene_config->>'customHdriUrl') <> ''
          AND (scene_config->>'customHdriUrl') LIKE '%' || pid || '%')
    );

  RETURN (ref_count = 0);
END;
$$;

-- Optional: Add soft-delete column for future cron-based orphan cleanup
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Grant
GRANT EXECUTE ON FUNCTION can_safely_delete_storage(UUID) TO authenticated;
