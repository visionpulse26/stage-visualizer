-- Admin Presentation version management v2.
-- Idempotent migration for draft/publish history, restore metadata, and optimistic locking.

ALTER TABLE presentation_versions
  ADD COLUMN IF NOT EXISTS version_token UUID NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS superseded_by UUID REFERENCES presentation_versions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS restored_from UUID REFERENCES presentation_versions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS published_by TEXT NOT NULL DEFAULT '';

CREATE OR REPLACE FUNCTION rotate_version_token()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.snapshot_json IS DISTINCT FROM OLD.snapshot_json THEN
    NEW.version_token = gen_random_uuid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS presentation_versions_rotate_token ON presentation_versions;
CREATE TRIGGER presentation_versions_rotate_token
  BEFORE UPDATE ON presentation_versions
  FOR EACH ROW EXECUTE FUNCTION rotate_version_token();

CREATE OR REPLACE FUNCTION assign_presentation_version_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  next_num INTEGER;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(NEW.project_id::TEXT));

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

CREATE INDEX IF NOT EXISTS presentation_versions_status_project
  ON presentation_versions (project_id, status, version_number DESC);

CREATE UNIQUE INDEX IF NOT EXISTS presentation_versions_project_version_number_unique
  ON presentation_versions (project_id, version_number);
