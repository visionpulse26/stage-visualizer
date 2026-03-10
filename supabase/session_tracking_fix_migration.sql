-- ═══════════════════════════════════════════════════════════════════════════════
-- SESSION TRACKING FIX — RLS Bypass via SECURITY DEFINER RPC
-- Run after client_analytics_extended_schema.sql
-- ═══════════════════════════════════════════════════════════════════════════════
-- Direct POST upsert to client_sessions was blocked by RLS ("new row violates...").
-- This RPC runs with elevated privileges, bypassing RLS. Anon can call it.
-- duration_seconds is in SECONDS (frontend: (Date.now()-start)/1000).
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE UNIQUE INDEX IF NOT EXISTS idx_client_sessions_session_project 
  ON client_sessions(project_id, session_id);

CREATE OR REPLACE FUNCTION upsert_client_session(
  p_project_id   TEXT,
  p_session_id   TEXT,
  p_duration_seconds INTEGER,
  p_device_os    TEXT DEFAULT NULL,
  p_form_factor  TEXT DEFAULT NULL,
  p_screen_width INTEGER DEFAULT NULL,
  p_screen_height INTEGER DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO client_sessions (
    project_id, session_id, duration_seconds,
    device_os, form_factor, screen_width, screen_height
  )
  VALUES (
    p_project_id, p_session_id, p_duration_seconds,
    p_device_os, p_form_factor, p_screen_width, p_screen_height
  )
  ON CONFLICT (project_id, session_id) DO UPDATE SET
    duration_seconds = EXCLUDED.duration_seconds,
    device_os        = COALESCE(EXCLUDED.device_os, client_sessions.device_os),
    form_factor      = COALESCE(EXCLUDED.form_factor, client_sessions.form_factor),
    screen_width     = COALESCE(EXCLUDED.screen_width, client_sessions.screen_width),
    screen_height    = COALESCE(EXCLUDED.screen_height, client_sessions.screen_height);
END;
$$;

GRANT EXECUTE ON FUNCTION upsert_client_session(TEXT, TEXT, INTEGER, TEXT, TEXT, INTEGER, INTEGER) TO anon;
