-- Ensure stage_url supports long external URLs (e.g. Cloudflare R2, signed URLs)
-- TEXT allows URLs up to ~1GB; standard URLs are typically under 2048 chars
ALTER TABLE projects ALTER COLUMN stage_url TYPE TEXT;
