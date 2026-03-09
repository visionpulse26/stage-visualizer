-- ═══════════════════════════════════════════════════════════════════════════════
-- SESSION STATS RPC — Min, Max, Avg with outlier cap (e.g. 4 hours)
-- Run after client_analytics_extended_schema.sql. project_id is TEXT.
-- ═══════════════════════════════════════════════════════════════════════════════

-- Cap at 4 hours (14400 seconds) to exclude overnight / abandoned tabs
CREATE OR REPLACE FUNCTION get_project_session_stats(
  p_project_id TEXT,
  p_max_seconds INTEGER DEFAULT 14400
)
RETURNS TABLE (
  min_seconds INTEGER,
  max_seconds INTEGER,
  avg_seconds INTEGER,
  session_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    MIN(duration_seconds)::INTEGER AS min_seconds,
    MAX(duration_seconds)::INTEGER AS max_seconds,
    ROUND(AVG(duration_seconds))::INTEGER AS avg_seconds,
    COUNT(*)::BIGINT AS session_count
  FROM client_sessions
  WHERE project_id = p_project_id
    AND duration_seconds IS NOT NULL
    AND duration_seconds > 0
    AND duration_seconds <= GREATEST(1, COALESCE(p_max_seconds, 14400));
$$;

GRANT EXECUTE ON FUNCTION get_project_session_stats(TEXT, INTEGER) TO authenticated;
