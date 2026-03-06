-- ═══════════════════════════════════════════════════════════════════════════════
-- AGGREGATE STATS + JSONB ANALYTICS + CLONE
-- Run in Supabase SQL Editor. Fixes metrics stuck at 0 (ensure RPC exists).
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Integer stat columns (project-level counters)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS total_views INTEGER NOT NULL DEFAULT 0;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS total_screenshots INTEGER NOT NULL DEFAULT 0;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS total_camera_changes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS total_clip_clicks INTEGER NOT NULL DEFAULT 0;

-- 2. JSONB popularity / hotspot columns
ALTER TABLE projects ADD COLUMN IF NOT EXISTS clip_popularity JSONB NOT NULL DEFAULT '{}';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS camera_popularity JSONB NOT NULL DEFAULT '{}';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS screenshot_hotspots JSONB NOT NULL DEFAULT '{}';

-- 3. RPC: Increment integer stat. SECURITY DEFINER bypasses RLS (fixes metrics stuck at 0).
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

-- 4. RPC: Increment a key inside a JSONB column (clip_popularity, camera_popularity, screenshot_hotspots)
CREATE OR REPLACE FUNCTION increment_project_jsonb_key(p_project_id UUID, p_column TEXT, p_key TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_val INTEGER;
  target_col TEXT;
BEGIN
  target_col := LOWER(TRIM(p_column));
  IF target_col NOT IN ('clip_popularity', 'camera_popularity', 'screenshot_hotspots') THEN
    RETURN;
  END IF;
  IF p_key IS NULL OR LENGTH(TRIM(p_key)) = 0 THEN
    RETURN;
  END IF;

  IF target_col = 'clip_popularity' THEN
    SELECT COALESCE((clip_popularity->>p_key)::INTEGER, 0) INTO current_val FROM projects WHERE id = p_project_id;
    UPDATE projects SET clip_popularity = jsonb_set(COALESCE(clip_popularity, '{}'::jsonb), ARRAY[p_key], to_jsonb(current_val + 1))
    WHERE id = p_project_id;
  ELSIF target_col = 'camera_popularity' THEN
    SELECT COALESCE((camera_popularity->>p_key)::INTEGER, 0) INTO current_val FROM projects WHERE id = p_project_id;
    UPDATE projects SET camera_popularity = jsonb_set(COALESCE(camera_popularity, '{}'::jsonb), ARRAY[p_key], to_jsonb(current_val + 1))
    WHERE id = p_project_id;
  ELSIF target_col = 'screenshot_hotspots' THEN
    SELECT COALESCE((screenshot_hotspots->>p_key)::INTEGER, 0) INTO current_val FROM projects WHERE id = p_project_id;
    UPDATE projects SET screenshot_hotspots = jsonb_set(COALESCE(screenshot_hotspots, '{}'::jsonb), ARRAY[p_key], to_jsonb(current_val + 1))
    WHERE id = p_project_id;
  END IF;
END;
$$;

-- 5. RPC: Clone project (reuse stage/HDRI URLs; reset playlist & stats)
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
BEGIN
  -- Compare as text so this works whether projects.id is UUID or TEXT
  src_id_text := p_source_id::TEXT;
  SELECT id, stage_url, video_url, camera_presets, grid_cell_size, scene_config, name
  INTO src FROM projects WHERE id::TEXT = src_id_text LIMIT 1;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  new_id := gen_random_uuid();

  INSERT INTO projects (
    id, name, stage_url, video_url, media_playlist, camera_presets, grid_cell_size, scene_config,
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
    0, 0, 0, 0,
    '{}'::jsonb, '{}'::jsonb, '{}'::jsonb
  );

  RETURN new_id;
END;
$$;

-- 6. RPC: Batch increment (reduces round-trips; use from TrackingService)
-- Payload: { p_project_id, p_ops: [{ type: 'stat'|'jsonb', stat_name?, column?, key? }] }
CREATE OR REPLACE FUNCTION batch_increment_project_stats(p_project_id UUID, p_ops JSONB)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  op JSONB;
  i INT;
  target_col TEXT;
  p_key TEXT;
  current_val INTEGER;
BEGIN
  IF p_ops IS NULL OR jsonb_array_length(p_ops) = 0 THEN RETURN; END IF;

  FOR i IN 0 .. jsonb_array_length(p_ops) - 1 LOOP
    op := p_ops->i;

    IF op->>'type' = 'stat' THEN
      PERFORM increment_project_stat(p_project_id, op->>'stat_name');
    ELSIF op->>'type' = 'jsonb' THEN
      target_col := LOWER(TRIM(op->>'column'));
      p_key := TRIM(op->>'key');
      IF target_col IN ('clip_popularity','camera_popularity','screenshot_hotspots') AND p_key <> '' THEN
        IF target_col = 'clip_popularity' THEN
          SELECT COALESCE((clip_popularity->>p_key)::INTEGER, 0) INTO current_val FROM projects WHERE id = p_project_id;
          UPDATE projects SET clip_popularity = jsonb_set(COALESCE(clip_popularity,'{}'::jsonb), ARRAY[p_key], to_jsonb(current_val + 1)) WHERE id = p_project_id;
        ELSIF target_col = 'camera_popularity' THEN
          SELECT COALESCE((camera_popularity->>p_key)::INTEGER, 0) INTO current_val FROM projects WHERE id = p_project_id;
          UPDATE projects SET camera_popularity = jsonb_set(COALESCE(camera_popularity,'{}'::jsonb), ARRAY[p_key], to_jsonb(current_val + 1)) WHERE id = p_project_id;
        ELSIF target_col = 'screenshot_hotspots' THEN
          SELECT COALESCE((screenshot_hotspots->>p_key)::INTEGER, 0) INTO current_val FROM projects WHERE id = p_project_id;
          UPDATE projects SET screenshot_hotspots = jsonb_set(COALESCE(screenshot_hotspots,'{}'::jsonb), ARRAY[p_key], to_jsonb(current_val + 1)) WHERE id = p_project_id;
        END IF;
      END IF;
    END IF;
  END LOOP;
END;
$$;

-- 7. Grants
GRANT EXECUTE ON FUNCTION increment_project_stat(UUID, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION increment_project_stat(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_project_jsonb_key(UUID, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION increment_project_jsonb_key(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION batch_increment_project_stats(UUID, JSONB) TO anon;
GRANT EXECUTE ON FUNCTION batch_increment_project_stats(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION clone_project(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION clone_project(UUID, TEXT) TO anon;
