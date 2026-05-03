-- Epic 1 POV — eye height per project (run in Supabase SQL Editor)
-- Table is `projects` (each row is a "round" in product language).

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS pov_height_offset DOUBLE PRECISION NOT NULL DEFAULT 1.7;

-- Keep clone RPC in sync (see project_stacking_and_lock_schema.sql for full function body).
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
  gid TEXT;
BEGIN
  src_id_text := p_source_id::TEXT;
  SELECT id, stage_url, video_url, camera_presets, grid_cell_size, scene_config, name, group_id,
         pov_height_offset
  INTO src FROM projects WHERE id::TEXT = src_id_text LIMIT 1;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  gid := COALESCE(src.group_id, src.id);
  new_id := gen_random_uuid();

  INSERT INTO projects (
    id, name, stage_url, video_url, media_playlist, camera_presets, grid_cell_size, scene_config,
    group_id, is_client_locked, pov_height_offset,
    total_views, total_screenshots, total_camera_changes, total_clip_clicks,
    clip_popularity, camera_popularity, screenshot_hotspots
  ) VALUES (
    new_id::TEXT,
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
    COALESCE(src.pov_height_offset, 1.7),
    0, 0, 0, 0,
    '{}'::jsonb, '{}'::jsonb, '{}'::jsonb
  );

  RETURN new_id;
END;
$$;
