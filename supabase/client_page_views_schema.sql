-- ═══════════════════════════════════════════════════════════════════════════════
-- CLIENT PAGE VIEWS — simple view count without RPC or projects table
-- Run in Supabase SQL Editor. No UUID/TEXT issues: project_id is always TEXT.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS client_page_views (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL,
  viewed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_page_views_project_id ON client_page_views(project_id);
CREATE INDEX IF NOT EXISTS idx_client_page_views_viewed_at ON client_page_views(viewed_at DESC);

ALTER TABLE client_page_views ENABLE ROW LEVEL SECURITY;

-- Anyone can insert (client page is public)
DROP POLICY IF EXISTS "client_page_views_insert_anon" ON client_page_views;
CREATE POLICY "client_page_views_insert_anon"
  ON client_page_views FOR INSERT
  WITH CHECK (true);

-- Only authenticated (admin) can read
DROP POLICY IF EXISTS "client_page_views_select_authenticated" ON client_page_views;
CREATE POLICY "client_page_views_select_authenticated"
  ON client_page_views FOR SELECT
  USING (auth.role() = 'authenticated');

-- Grants: anon can insert (client page), authenticated can select (admin radar)
GRANT INSERT ON client_page_views TO anon;
GRANT SELECT ON client_page_views TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- CLIENT INTERACTIONS — clip plays, screenshots, camera changes (no RPC)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS client_interactions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL,
  event_type TEXT NOT NULL,   -- 'clip_play' | 'screenshot' | 'camera_change'
  event_key  TEXT NOT NULL,   -- clip name, camera name, etc.
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_interactions_project_type ON client_interactions(project_id, event_type);

ALTER TABLE client_interactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "client_interactions_insert_anon" ON client_interactions;
CREATE POLICY "client_interactions_insert_anon"
  ON client_interactions FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "client_interactions_select_authenticated" ON client_interactions;
CREATE POLICY "client_interactions_select_authenticated"
  ON client_interactions FOR SELECT USING (auth.role() = 'authenticated');

GRANT INSERT ON client_interactions TO anon;
GRANT SELECT ON client_interactions TO authenticated;
