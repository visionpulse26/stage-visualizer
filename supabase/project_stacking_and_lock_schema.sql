-- ═══════════════════════════════════════════════════════════════════════════════
-- PROJECT STACKING (group_id) + CLIENT LINK LOCKING (is_client_locked)
-- Run in Supabase SQL Editor after project_stats_schema.sql
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. group_id: links rounds of the same project (clone inherits source's group)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES projects(id) ON DELETE SET NULL;
-- 2. is_client_locked: when true, /view/:id returns 403 for unauthenticated users
ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_client_locked BOOLEAN NOT NULL DEFAULT false;

-- 3. Update clone_project to set group_id (clone joins source's group)
CREATE OR REPLACE FUNCTION clone_project(p_source_id UUID, p_new_name TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  src RECORD;
  new_id UUID;
  src_id_text TEXT;
  gid UUID;
BEGIN
  src_id_text := p_source_id::TEXT;
  SELECT id, stage_url, video_url, camera_presets, grid_cell_size, scene_config, name, group_id
  INTO src FROM projects WHERE id::TEXT = src_id_text LIMIT 1;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Clone inherits source's group (or source is the root if group_id is null)
  gid := COALESCE(src.group_id, src.id);

  new_id := gen_random_uuid();

  INSERT INTO projects (
    id, name, stage_url, video_url, media_playlist, camera_presets, grid_cell_size, scene_config,
    group_id, is_client_locked,
    total_views, total_screenshots, total_camera_changes, total_clip_clicks,
    clip_popularity, camera_popularity, screenshot_hotspots
  ) VALUES (
    new_id,
    COALESCE(NULLIF(TRIM(p_new_name), ''), src.name || ' (Clone)'),
    src.stage_url,
    NULL,
    '[]'::jsonb,
    COALESCE(src.camera_presets, '[]'::jsonb),
    COALESCE(src.grid_cell_size, 1),
    jsonb_set(
      COALESCE(src.scene_config, '{}'::jsonb),
      ARRAY['versionStatus'],
      '""'::jsonb
    ),
    gid,
    false,
    0, 0, 0, 0,
    '{}'::jsonb, '{}'::jsonb, '{}'::jsonb
  );

  RETURN new_id;
END;
$$;
