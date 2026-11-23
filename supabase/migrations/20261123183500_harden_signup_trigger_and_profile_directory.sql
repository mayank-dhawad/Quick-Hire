-- QuickHire production hotfix: safe public profile directory and signup trigger.
-- This is an incremental record only. The remote database has an existing schema
-- with no recorded migration history; reconcile the baseline before replaying
-- the complete migration directory through the Supabase CLI.

BEGIN;

ALTER FUNCTION public.handle_new_user()
  SET search_path = pg_catalog, public, auth, pg_temp;

REVOKE EXECUTE ON FUNCTION public.handle_new_user()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE VIEW public.public_profile_directory
WITH (security_barrier = true, security_invoker = true)
AS
SELECT
  id,
  full_name,
  role,
  location,
  village,
  city,
  district,
  state
FROM public.profiles
WHERE account_status IS NULL OR account_status = 'active';

REVOKE ALL ON TABLE public.public_profile_directory FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.public_profile_directory TO authenticated;

COMMIT;
