-- Security fix: resolve Supabase Advisor warnings on 3 public views
--
-- Issues fixed:
--   1. SECURITY DEFINER (implicit) on views → views ran as postgres/service_role,
--      bypassing RLS on underlying tables entirely.
--   2. auth.users exposed via JOIN → email + raw_user_meta_data visible to any
--      authenticated user through the view.
--
-- Fix strategy:
--   • Add WITH (security_invoker = true) to all 3 views → RLS now applies to
--     the caller's role, not the view creator's role.
--   • Replace direct auth.users JOINs with a SECURITY DEFINER helper function
--     that returns only a display name string (never the full auth.users row).
--   • Add an anon RLS policy on projects so projects_client_public remains
--     readable by client visitors after security_invoker is enabled.
--
-- Run after: presentation_versions_author_uuid.sql, presentation_versions_rls_v3.sql

BEGIN;

-- ── Safe display-name accessor ────────────────────────────────────────────────
-- Only this function is allowed to read auth.users. It returns a single display
-- string per user_id — no email, no raw_user_meta_data object, nothing else.
CREATE OR REPLACE FUNCTION public.get_user_display_name(p_user_id UUID)
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    raw_user_meta_data->>'full_name',
    raw_user_meta_data->>'name',
    split_part(email, '@', 1)   -- fallback: username portion of email only
  )
  FROM auth.users
  WHERE id = p_user_id;
$$;

-- anon must not call this — only authenticated admin views use it
-- Must revoke from both PUBLIC and anon explicitly (Supabase grants PUBLIC by default)
REVOKE EXECUTE ON FUNCTION public.get_user_display_name(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_display_name(UUID) FROM anon;
GRANT EXECUTE  ON FUNCTION public.get_user_display_name(UUID) TO authenticated;

-- ── presentation_versions_with_author ─────────────────────────────────────────
-- Before: JOINed auth.users directly → exposed email + raw_user_meta_data to
--         any authenticated caller; RLS on presentation_versions bypassed.
-- After:  security_invoker enforces RLS; display names come from the safe
--         accessor function instead of a raw auth.users JOIN.
DROP VIEW IF EXISTS public.presentation_versions_with_author;
CREATE VIEW public.presentation_versions_with_author
  WITH (security_invoker = true)
AS
SELECT
  pv.*,
  public.get_user_display_name(pv.created_by_user_id)   AS created_by_name,
  public.get_user_display_name(pv.published_by_user_id) AS published_by_name
FROM public.presentation_versions pv;

REVOKE ALL  ON public.presentation_versions_with_author FROM anon;
REVOKE ALL  ON public.presentation_versions_with_author FROM authenticated;
GRANT SELECT ON public.presentation_versions_with_author TO authenticated;

-- ── client_feedback_with_resolver ─────────────────────────────────────────────
-- Same issues as above, same fix pattern.
DROP VIEW IF EXISTS public.client_feedback_with_resolver;
CREATE VIEW public.client_feedback_with_resolver
  WITH (security_invoker = true)
AS
SELECT
  cfi.*,
  public.get_user_display_name(cfi.resolved_by_user_id) AS resolved_by_name
FROM public.client_feedback_items cfi;

REVOKE ALL  ON public.client_feedback_with_resolver FROM anon;
REVOKE ALL  ON public.client_feedback_with_resolver FROM authenticated;
GRANT SELECT ON public.client_feedback_with_resolver TO authenticated;

-- ── projects_client_public ────────────────────────────────────────────────────
-- Before: anon-accessible view with no WHERE filter; ran as postgres → RLS on
--         projects bypassed → anon could enumerate all projects.
-- After:  security_invoker = true means anon is subject to RLS on projects.
--         We add an anon SELECT policy that allows reading project rows (clients
--         need to load their assigned project by ID from /view/:projectId).
--         sanitize_public_scene_config already strips _private keys from scene_config.

DROP POLICY IF EXISTS "anon_select_projects_for_client_view" ON public.projects;
CREATE POLICY "anon_select_projects_for_client_view"
  ON public.projects FOR SELECT TO anon
  USING (true);

DROP VIEW IF EXISTS public.projects_client_public;
CREATE VIEW public.projects_client_public
  WITH (security_invoker = true)
AS
SELECT
  id,
  name,
  stage_url,
  video_url,
  media_playlist,
  camera_presets,
  grid_cell_size,
  public.sanitize_public_scene_config(scene_config) AS scene_config,
  group_id,
  is_client_locked
FROM public.projects;

REVOKE ALL  ON public.projects_client_public FROM anon;
REVOKE ALL  ON public.projects_client_public FROM authenticated;
GRANT SELECT ON public.projects_client_public TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
