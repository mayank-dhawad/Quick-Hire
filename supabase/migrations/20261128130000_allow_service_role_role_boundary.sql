-- Permit trusted service-role backend operations to provision and repair role records.
-- Ordinary authenticated users still cannot self-promote or change their account role.
BEGIN;

-- The legacy admin-role trigger predates the newer role-boundary trigger.
-- Both must recognize the trusted service-role JWT or service-role provisioning
-- can be silently downgraded by the older trigger.
CREATE OR REPLACE FUNCTION public.protect_profile_admin_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_is_service_role boolean :=
    COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role';
BEGIN
  IF v_is_service_role THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.role = 'admin' AND NOT COALESCE(public.is_admin(auth.uid()), false) THEN
      NEW.role := 'worker';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.role = 'admin' AND (OLD.role IS NULL OR OLD.role <> 'admin') THEN
      IF NOT COALESCE(public.is_admin(auth.uid()), false) THEN
        NEW.role := COALESCE(OLD.role, 'worker');
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_worker_employer_role_boundary()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_is_service_role boolean :=
    COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role';
  v_is_admin boolean := COALESCE(public.is_admin(auth.uid()), false);
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.role NOT IN ('worker', 'employer', 'admin') THEN
      RAISE EXCEPTION 'QuickHire accounts must use the Worker or Employer role.'
        USING ERRCODE = '23514';
    END IF;

    IF NEW.role = 'admin' AND NOT v_is_service_role AND NOT v_is_admin THEN
      NEW.role := 'worker';
    END IF;
  ELSIF TG_OP = 'UPDATE' AND NEW.role IS DISTINCT FROM OLD.role THEN
    IF NOT v_is_service_role AND NOT v_is_admin THEN
      RAISE EXCEPTION 'Account roles cannot be changed after registration. Contact QuickHire support if your role is incorrect.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

COMMIT;
