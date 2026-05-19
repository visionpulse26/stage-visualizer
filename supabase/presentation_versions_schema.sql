-- ═══════════════════════════════════════════════════════════════════════════════
-- PRESENTATION VERSIONS + CLIENT FEEDBACK ITEMS
-- Phase 0 foundations for the client review system.
-- Run in Supabase SQL Editor (or via CLI) after project_stacking_and_lock_schema.sql
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── presentation_versions ────────────────────────────────────────────────────
-- One row per published (or draft) snapshot for a project.
-- snapshot_json is the frozen client payload — slides, camera presets, etc.

CREATE TABLE IF NOT EXISTS presentation_versions (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        TEXT        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version_number    INTEGER     NOT NULL,                        -- auto-incremented per project
  version_name      TEXT        NOT NULL DEFAULT '',
  status            TEXT        NOT NULL DEFAULT 'draft'
                                CHECK (status IN ('draft', 'published', 'archived')),
  release_notes     TEXT        NOT NULL DEFAULT '',
  snapshot_json     JSONB       NOT NULL DEFAULT '{}',
  created_by        TEXT        NOT NULL DEFAULT '',
  published_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Each project has at most one published version at a time.
CREATE UNIQUE INDEX IF NOT EXISTS presentation_versions_one_published
  ON presentation_versions (project_id)
  WHERE status = 'published';

-- Fast lookup: latest version per project.
CREATE INDEX IF NOT EXISTS presentation_versions_project_created
  ON presentation_versions (project_id, created_at DESC);

-- ── client_feedback_items ────────────────────────────────────────────────────
-- Each row is one feedback comment from a desktop client reviewer.
-- Stores enough context to restore exactly what the reviewer saw.

CREATE TABLE IF NOT EXISTS client_feedback_items (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id                TEXT        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  presentation_version_id   UUID        REFERENCES presentation_versions(id) ON DELETE SET NULL,
  slide_id                  TEXT        NOT NULL DEFAULT '',
  clip_id                   TEXT        NOT NULL DEFAULT '',
  reviewer_name             TEXT        NOT NULL DEFAULT '',
  comment                   TEXT        NOT NULL DEFAULT '',
  status                    TEXT        NOT NULL DEFAULT 'pending'
                                        CHECK (status IN ('pending', 'resolved')),
  clip_time_seconds         FLOAT,
  camera_snapshot_json      JSONB,      -- { presetId, name, position, target, fov }
  annotation_json           JSONB,      -- { type, space, bounds, viewport }
  admin_note                TEXT        NOT NULL DEFAULT '',
  resolved_at               TIMESTAMPTZ,
  resolved_by               TEXT        NOT NULL DEFAULT '',
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS client_feedback_items_project
  ON client_feedback_items (project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS client_feedback_items_version
  ON client_feedback_items (presentation_version_id);

CREATE INDEX IF NOT EXISTS client_feedback_items_slide
  ON client_feedback_items (project_id, slide_id);

-- ── updated_at triggers ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS presentation_versions_updated_at ON presentation_versions;
CREATE TRIGGER presentation_versions_updated_at
  BEFORE UPDATE ON presentation_versions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS client_feedback_items_updated_at ON client_feedback_items;
CREATE TRIGGER client_feedback_items_updated_at
  BEFORE UPDATE ON client_feedback_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── auto-increment version_number per project ────────────────────────────────

CREATE OR REPLACE FUNCTION assign_presentation_version_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  next_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(version_number), 0) + 1
    INTO next_num
    FROM presentation_versions
   WHERE project_id = NEW.project_id;

  NEW.version_number = next_num;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS presentation_versions_auto_number ON presentation_versions;
CREATE TRIGGER presentation_versions_auto_number
  BEFORE INSERT ON presentation_versions
  FOR EACH ROW EXECUTE FUNCTION assign_presentation_version_number();

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Authenticated users can read all; write is handled via service role / anon
-- with project ownership check in application layer (matching existing pattern).

ALTER TABLE presentation_versions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_feedback_items   ENABLE ROW LEVEL SECURITY;

-- Allow anon read (client page loads published snapshot without login)
CREATE POLICY "anon read presentation_versions"
  ON presentation_versions FOR SELECT TO anon USING (true);

CREATE POLICY "anon read client_feedback_items"
  ON client_feedback_items FOR SELECT TO anon USING (true);

-- Allow anon insert for feedback (reviewer has no login)
CREATE POLICY "anon insert client_feedback_items"
  ON client_feedback_items FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon update client_feedback_items"
  ON client_feedback_items FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anon delete client_feedback_items"
  ON client_feedback_items FOR DELETE TO anon USING (true);

-- Authenticated users get full access (admin operations)
CREATE POLICY "auth all presentation_versions"
  ON presentation_versions FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth all client_feedback_items"
  ON client_feedback_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
