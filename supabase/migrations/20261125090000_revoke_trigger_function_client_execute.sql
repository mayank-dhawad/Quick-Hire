-- Trigger-only SECURITY DEFINER functions must never be callable as RPCs.
-- PostgreSQL grants EXECUTE to PUBLIC by default when a function is created;
-- trigger invocation does not require client roles to have EXECUTE privileges.
BEGIN;

REVOKE ALL ON FUNCTION public.auto_confirm_quickhire_local_users() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_single_admin_constraint() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_profile_admin_role() FROM PUBLIC, anon, authenticated;

COMMIT;
