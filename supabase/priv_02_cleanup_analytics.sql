-- ═══════════════════════════════════════════════════════════════════════════════
-- PRIV-02: Delete client analytics older than 90 days
-- Run once in Supabase SQL Editor, OR rely on Vercel Cron + /api/cleanup-analytics
--
-- Note: client_sessions uses started_at (not created_at).
-- ═══════════════════════════════════════════════════════════════════════════════

-- One-off manual cleanup (safe to run anytime):
DELETE FROM client_sessions     WHERE started_at   < NOW() - INTERVAL '90 days';
DELETE FROM client_clip_watch   WHERE created_at   < NOW() - INTERVAL '90 days';
DELETE FROM client_interactions WHERE created_at   < NOW() - INTERVAL '90 days';
DELETE FROM client_page_views   WHERE viewed_at    < NOW() - INTERVAL '90 days';

-- ── Optional: Supabase Pro + pg_cron (same schedule as vercel.json) ───────────
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- SELECT cron.schedule(
--   'cleanup-old-analytics',
--   '0 3 * * *',
--   $$
--     DELETE FROM client_sessions     WHERE started_at   < NOW() - INTERVAL '90 days';
--     DELETE FROM client_clip_watch   WHERE created_at   < NOW() - INTERVAL '90 days';
--     DELETE FROM client_interactions WHERE created_at   < NOW() - INTERVAL '90 days';
--     DELETE FROM client_page_views   WHERE viewed_at    < NOW() - INTERVAL '90 days';
--   $$
-- );
