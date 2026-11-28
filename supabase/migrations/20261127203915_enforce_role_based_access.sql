-- Enforce the selected Worker / Employer role after account creation.
-- Operational job listings are authenticated-only; only employers can publish/manage them.
BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_worker_employer_role_boundary()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.role NOT IN ('worker', 'employer', 'admin') THEN
      RAISE EXCEPTION 'QuickHire accounts must use the Worker or Employer role.'
        USING ERRCODE = '23514';
    END IF;

    -- The only admin role assignment path is verified administrator provisioning.
    IF NEW.role = 'admin' AND NOT COALESCE(public.is_admin(auth.uid()), false) THEN
      NEW.role := 'worker';
    END IF;
  ELSIF TG_OP = 'UPDATE' AND NEW.role IS DISTINCT FROM OLD.role THEN
    IF NOT COALESCE(public.is_admin(auth.uid()), false) THEN
      RAISE EXCEPTION 'Account roles cannot be changed after registration. Contact QuickHire support if your role is incorrect.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_worker_employer_role_boundary ON public.profiles;
CREATE TRIGGER trg_enforce_worker_employer_role_boundary
BEFORE INSERT OR UPDATE OF role ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.enforce_worker_employer_role_boundary();

-- Do not expose operational job records to unauthenticated visitors.
DROP POLICY IF EXISTS "Jobs are viewable by everyone" ON public.jobs;

-- A profile's stored role is the source of truth. Hiding a button is not authorization.
DROP POLICY IF EXISTS "Employers can insert jobs" ON public.jobs;
CREATE POLICY "Employers can insert jobs"
ON public.jobs
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = employer_id
  AND (
    COALESCE(public.is_admin(auth.uid()), false)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'employer'
    )
  )
);

DROP POLICY IF EXISTS "Employers can update their own jobs" ON public.jobs;
CREATE POLICY "Employers can update their own jobs"
ON public.jobs
FOR UPDATE
TO authenticated
USING (
  auth.uid() = employer_id
  AND (
    COALESCE(public.is_admin(auth.uid()), false)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'employer'
    )
  )
)
WITH CHECK (
  auth.uid() = employer_id
  AND (
    COALESCE(public.is_admin(auth.uid()), false)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'employer'
    )
  )
);

DROP POLICY IF EXISTS "Employers can delete their own jobs" ON public.jobs;
CREATE POLICY "Employers can delete their own jobs"
ON public.jobs
FOR DELETE
TO authenticated
USING (
  auth.uid() = employer_id
  AND (
    COALESCE(public.is_admin(auth.uid()), false)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'employer'
    )
  )
);

COMMIT;
