-- Migration: guest_login_mode
-- Purpose: Fix guest identity gate name-override + add email-only "login" lookup.
-- Run after: presentation_guests_migration.sql
--
-- Two changes:
--   1. upsert_guest no longer overwrites a returning guest's registered name.
--      Re-entering an existing email keeps the original name; the gate surfaces
--      it via the welcome-back screen instead of silently replacing it.
--   2. lookup_guest: email-only path for returning guests ("already registered?
--      just enter your email"). Errors with guest_not_found when unknown.

-- ── 1. upsert_guest — keep stored name on return ──────────────────────────────

CREATE OR REPLACE FUNCTION upsert_guest(
  p_presentation_id TEXT,
  p_email           TEXT,
  p_name            TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT;
  v_name  TEXT;
  v_guest presentation_guests%ROWTYPE;
  v_is_new BOOLEAN;
BEGIN
  v_email := lower(trim(p_email));
  v_name  := trim(p_name);

  IF v_email !~ '^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$' THEN
    RAISE EXCEPTION 'invalid_email' USING ERRCODE = 'P0001';
  END IF;

  IF length(v_name) < 1 OR length(v_name) > 100 THEN
    RAISE EXCEPTION 'invalid_name' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM projects WHERE id = p_presentation_id
  ) THEN
    RAISE EXCEPTION 'presentation_not_found' USING ERRCODE = 'P0003';
  END IF;

  SELECT * INTO v_guest
  FROM presentation_guests
  WHERE presentation_id = p_presentation_id AND email = v_email;

  IF NOT FOUND THEN
    v_is_new := true;
    INSERT INTO presentation_guests (presentation_id, email, name)
    VALUES (p_presentation_id, v_email, v_name)
    RETURNING * INTO v_guest;
  ELSE
    -- Returning guest — refresh activity/token only. The originally registered
    -- name is authoritative and must NOT be overwritten by a new submission.
    v_is_new := false;
    UPDATE presentation_guests
    SET last_seen_at     = NOW(),
        token_expires_at = NOW() + INTERVAL '30 days'
    WHERE id = v_guest.id
    RETURNING * INTO v_guest;
  END IF;

  RETURN jsonb_build_object(
    'is_new',           v_is_new,
    'id',               v_guest.id,
    'name',             v_guest.name,
    'email',            v_guest.email,
    'guest_token',      v_guest.guest_token,
    'token_expires_at', v_guest.token_expires_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION upsert_guest(TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION upsert_guest(TEXT, TEXT, TEXT) TO authenticated;

-- ── 2. lookup_guest — email-only login for returning guests ───────────────────

CREATE OR REPLACE FUNCTION lookup_guest(
  p_presentation_id TEXT,
  p_email           TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT;
  v_guest presentation_guests%ROWTYPE;
BEGIN
  v_email := lower(trim(p_email));

  IF v_email !~ '^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$' THEN
    RAISE EXCEPTION 'invalid_email' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_guest
  FROM presentation_guests
  WHERE presentation_id = p_presentation_id AND email = v_email;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'guest_not_found' USING ERRCODE = 'P0004';
  END IF;

  UPDATE presentation_guests
  SET last_seen_at     = NOW(),
      token_expires_at = NOW() + INTERVAL '30 days'
  WHERE id = v_guest.id
  RETURNING * INTO v_guest;

  RETURN jsonb_build_object(
    'is_new',           false,
    'id',               v_guest.id,
    'name',             v_guest.name,
    'email',            v_guest.email,
    'guest_token',      v_guest.guest_token,
    'token_expires_at', v_guest.token_expires_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION lookup_guest(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION lookup_guest(TEXT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
