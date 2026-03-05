-- ═══════════════════════════════════════════════════════════════════════════════
-- ANALYTICS: visitor_logs + interaction_events (stealth tracking)
-- Run in Supabase SQL Editor. RLS: anon INSERT only; authenticated SELECT only.
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Visitor log (one row per session start)
CREATE TABLE IF NOT EXISTS visitor_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_agent TEXT,
  page_visited TEXT NOT NULL
);

-- 2. Granular interaction events (many per session)
CREATE TABLE IF NOT EXISTS interaction_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_detail JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for Admin queries
CREATE INDEX IF NOT EXISTS idx_visitor_logs_created_at ON visitor_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_visitor_logs_session_id ON visitor_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_interaction_events_session_id ON interaction_events(session_id);
CREATE INDEX IF NOT EXISTS idx_interaction_events_created_at ON interaction_events(created_at DESC);

-- 3. RLS: Enable on both tables
ALTER TABLE visitor_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE interaction_events ENABLE ROW LEVEL SECURITY;

-- 4. visitor_logs: anon can INSERT (tracking), only authenticated can SELECT
DROP POLICY IF EXISTS "visitor_logs_insert_anon" ON visitor_logs;
CREATE POLICY "visitor_logs_insert_anon"
  ON visitor_logs FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "visitor_logs_select_authenticated" ON visitor_logs;
CREATE POLICY "visitor_logs_select_authenticated"
  ON visitor_logs FOR SELECT
  USING (auth.role() = 'authenticated');

-- 5. interaction_events: anon can INSERT, only authenticated can SELECT
DROP POLICY IF EXISTS "interaction_events_insert_anon" ON interaction_events;
CREATE POLICY "interaction_events_insert_anon"
  ON interaction_events FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "interaction_events_select_authenticated" ON interaction_events;
CREATE POLICY "interaction_events_select_authenticated"
  ON interaction_events FOR SELECT
  USING (auth.role() = 'authenticated');
