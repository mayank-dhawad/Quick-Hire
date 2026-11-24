-- Remove client EXECUTE privileges from trigger-only SECURITY DEFINER functions.
-- PostgreSQL invokes existing triggers without requiring the invoking app role
-- to have EXECUTE on the trigger function; these functions are not RPC endpoints.
BEGIN;

REVOKE ALL PRIVILEGES ON FUNCTION public.auto_confirm_quickhire_local_users()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION public.check_single_admin_constraint()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION public.protect_profile_admin_role()
  FROM PUBLIC, anon, authenticated;

COMMIT;
