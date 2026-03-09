-- ═══════════════════════════════════════════════════════════════════════════════
-- CLIENT ANALYTICS EXTENDED — time-based & device tracking
-- Run after client_page_views_schema.sql. project_id is TEXT.
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. client_sessions: session duration, device, screen (one row per visit)
CREATE TABLE IF NOT EXISTS client_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      TEXT NOT NULL,
  session_id      TEXT NOT NULL,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  duration_seconds INTEGER,   -- set on beforeunload via Beacon
  device_os       TEXT,       -- Windows, macOS, iOS, Android, etc.
  form_factor     TEXT,       -- Desktop, Mobile
  screen_width    INTEGER,
  screen_height   INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_client_sessions_session_project ON client_sessions(project_id, session_id);
CREATE INDEX IF NOT EXISTS idx_client_sessions_project_id ON client_sessions(project_id);

ALTER TABLE client_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "client_sessions_insert_anon" ON client_sessions;
CREATE POLICY "client_sessions_insert_anon"
  ON client_sessions FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "client_sessions_update_anon" ON client_sessions;
CREATE POLICY "client_sessions_update_anon"
  ON client_sessions FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "client_sessions_select_authenticated" ON client_sessions;
CREATE POLICY "client_sessions_select_authenticated"
  ON client_sessions FOR SELECT USING (auth.role() = 'authenticated');

GRANT INSERT, UPDATE ON client_sessions TO anon;
GRANT SELECT ON client_sessions TO authenticated;

-- 2. client_clip_watch: cumulative seconds per clip (one row per watch segment)
CREATE TABLE IF NOT EXISTS client_clip_watch (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   TEXT NOT NULL,
  clip_key     TEXT NOT NULL,
  watch_seconds INTEGER NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_clip_watch_project ON client_clip_watch(project_id);
CREATE INDEX IF NOT EXISTS idx_client_clip_watch_created ON client_clip_watch(created_at DESC);

ALTER TABLE client_clip_watch ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "client_clip_watch_insert_anon" ON client_clip_watch;
CREATE POLICY "client_clip_watch_insert_anon"
  ON client_clip_watch FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "client_clip_watch_select_authenticated" ON client_clip_watch;
CREATE POLICY "client_clip_watch_select_authenticated"
  ON client_clip_watch FOR SELECT USING (auth.role() = 'authenticated');

GRANT INSERT ON client_clip_watch TO anon;
GRANT SELECT ON client_clip_watch TO authenticated;
