-- QuickHire production hardening: reliable Auth profile creation and safe directory view.
-- This migration is additive and preserves existing profile rows.

BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $function$
DECLARE
  v_role public.profiles.role%TYPE := 'worker';
  v_full_name text;
BEGIN
  -- Only the two self-selectable roles are accepted from user metadata.
  -- Admin access is provisioned separately by an authorized administrator.
  IF NEW.raw_user_meta_data->>'role' = 'employer' THEN
    v_role := 'employer';
  END IF;

  v_full_name := COALESCE(
    NULLIF(BTRIM(NEW.raw_user_meta_data->>'full_name'), ''),
    NULLIF(BTRIM(NEW.raw_user_meta_data->>'name'), ''),
    'QuickHire User'
  );

  INSERT INTO public.profiles (
    id,
    full_name,
    phone_number,
    email,
    role,
    account_status,
    created_at
  )
  VALUES (
    NEW.id,
    v_full_name,
    NEW.phone,
    NEW.email,
    v_role,
    'active',
    COALESCE(NEW.created_at, NOW())
  )
  ON CONFLICT (id) DO UPDATE
  SET
    email = COALESCE(EXCLUDED.email, public.profiles.email),
    phone_number = COALESCE(EXCLUDED.phone_number, public.profiles.phone_number),
    full_name = CASE
      WHEN NULLIF(BTRIM(public.profiles.full_name), '') IS NULL
        THEN EXCLUDED.full_name
      ELSE public.profiles.full_name
    END;

  RETURN NEW;
END;
$function$;

-- Replace the trigger definition so fresh local databases and existing
-- production databases use the same profile-creation function.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();

REVOKE EXECUTE ON FUNCTION public.handle_new_user()
  FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.handle_new_user()
  SET search_path = pg_catalog, public, auth, pg_temp;

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
