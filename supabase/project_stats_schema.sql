-- ═══════════════════════════════════════════════════════════════════════════════
-- AGGREGATE STATS: project-level counters (replaces granular event logging)
-- Run in Supabase SQL Editor after projects table exists.
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Add stat columns to projects (integer counters, default 0)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS total_views INTEGER NOT NULL DEFAULT 0;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS total_screenshots INTEGER NOT NULL DEFAULT 0;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS total_camera_changes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS total_clip_clicks INTEGER NOT NULL DEFAULT 0;

-- 2. RPC: Increment a stat column. SECURITY DEFINER allows anon to call it.
CREATE OR REPLACE FUNCTION increment_project_stat(p_project_id UUID, p_stat_name TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_stat_name = 'total_views' THEN
    UPDATE projects SET total_views = COALESCE(total_views, 0) + 1 WHERE id = p_project_id;
  ELSIF p_stat_name = 'total_screenshots' THEN
    UPDATE projects SET total_screenshots = COALESCE(total_screenshots, 0) + 1 WHERE id = p_project_id;
  ELSIF p_stat_name = 'total_camera_changes' THEN
    UPDATE projects SET total_camera_changes = COALESCE(total_camera_changes, 0) + 1 WHERE id = p_project_id;
  ELSIF p_stat_name = 'total_clip_clicks' THEN
    UPDATE projects SET total_clip_clicks = COALESCE(total_clip_clicks, 0) + 1 WHERE id = p_project_id;
  END IF;
END;
$$;

-- 3. Grant execute to anon (Client/Collab) and authenticated (Admin)
GRANT EXECUTE ON FUNCTION increment_project_stat(UUID, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION increment_project_stat(UUID, TEXT) TO authenticated;
