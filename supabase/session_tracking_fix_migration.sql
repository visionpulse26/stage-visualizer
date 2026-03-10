-- ═══════════════════════════════════════════════════════════════════════════════
-- SESSION TRACKING FIX — RLS & Upsert Verification
-- Run after client_analytics_extended_schema.sql
-- ═══════════════════════════════════════════════════════════════════════════════
-- Ensures anon can INSERT and UPDATE client_sessions for session duration tracking.
-- The frontend uses POST upsert (on_conflict=project_id,session_id) with keepalive.
-- duration_seconds is in SECONDS (frontend: (Date.now()-start)/1000).
-- Outlier cap: 4h = 14400 seconds (get_project_session_stats).
-- ═══════════════════════════════════════════════════════════════════════════════

-- Ensure unique constraint exists for upsert (PostgREST on_conflict)
-- (Already in client_analytics_extended_schema.sql; idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_sessions_session_project 
  ON client_sessions(project_id, session_id);

-- Ensure anon has INSERT + UPDATE (for upsert)
GRANT INSERT, UPDATE ON client_sessions TO anon;

-- RLS policies (idempotent)
DROP POLICY IF EXISTS "client_sessions_insert_anon" ON client_sessions;
CREATE POLICY "client_sessions_insert_anon"
  ON client_sessions FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "client_sessions_update_anon" ON client_sessions;
CREATE POLICY "client_sessions_update_anon"
  ON client_sessions FOR UPDATE USING (true) WITH CHECK (true);
