-- Reject job assignments whose target profile is not an active worker.
-- This guard applies to both employer direct-hire and worker self-application paths.
BEGIN;

CREATE OR REPLACE FUNCTION public.validate_job_record_worker_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
SET row_security = off
AS $function$
DECLARE
  v_role text;
  v_account_status text;
BEGIN
  SELECT profile.role::text, profile.account_status
    INTO v_role, v_account_status
  FROM public.profiles AS profile
  WHERE profile.id = NEW.worker_id;

  IF NOT FOUND
     OR v_role IS DISTINCT FROM 'worker'
     OR v_account_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'A job assignment must target an active worker profile.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_job_records_validate_worker_profile ON public.job_records;
CREATE TRIGGER trg_job_records_validate_worker_profile
BEFORE INSERT ON public.job_records
FOR EACH ROW
EXECUTE FUNCTION public.validate_job_record_worker_profile();

REVOKE ALL ON FUNCTION public.validate_job_record_worker_profile() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.validate_job_record_worker_profile() IS
  'Rejects assignment inserts for missing, non-worker, or deactivated profiles regardless of hiring path.';

COMMIT;
