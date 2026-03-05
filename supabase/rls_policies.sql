-- ═══════════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS) for IP Protection
-- Run this in Supabase SQL Editor: Project Settings → SQL Editor → New Query
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Enable RLS on projects table
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- 2. Allow SELECT for everyone (Client/Collab need to load project data)
CREATE POLICY "projects_select_public"
  ON projects FOR SELECT
  USING (true);

-- 3. Allow INSERT only for authenticated users (Admin)
CREATE POLICY "projects_insert_authenticated"
  ON projects FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- 4. Allow UPDATE only for authenticated users (Admin)
CREATE POLICY "projects_update_authenticated"
  ON projects FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- 5. Allow DELETE only for authenticated users (Admin)
CREATE POLICY "projects_delete_authenticated"
  ON projects FOR DELETE
  USING (auth.role() = 'authenticated');

-- Note: Anon (Client/Collab) can SELECT but cannot INSERT/UPDATE/DELETE.

-- ═══════════════════════════════════════════════════════════════════════════════
-- STORAGE BUCKET (optional — for stricter IP protection)
-- Make the 'projects' bucket private so raw URLs cannot be used without auth
-- ═══════════════════════════════════════════════════════════════════════════════

-- In Supabase Dashboard: Storage → projects bucket → Policies
-- Add policy: "Allow public read" only if you want Client/Collab to load assets
-- For maximum protection: make bucket PRIVATE and serve via signed URLs from
-- a serverless function that checks auth or project access.
