-- Repair claimed assisted-worker history visibility after profile column-level grants.
-- The helper is SECURITY DEFINER and explicitly disables row security so its
-- narrow ID-only lookup remains independent of caller profile SELECT grants/RLS.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_claimed_profile_ids(p_user_id uuid)
RETURNS TABLE (id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public, pg_temp
SET row_security = off
AS $function$
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS NULL
     OR (p_user_id <> auth.uid() AND NOT public.is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'You may only inspect your own claimed profiles.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT p.id
  FROM public.profiles AS p
  WHERE p.claimed_by_profile_id = p_user_id
    AND p.is_assisted_profile IS TRUE;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_claimed_profile_ids(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_claimed_profile_ids(uuid) TO authenticated;

DROP POLICY IF EXISTS "Job records read policy" ON public.job_records;
CREATE POLICY "Job records read policy"
ON public.job_records
FOR SELECT
TO authenticated
USING (
  worker_id = (SELECT auth.uid())
  OR worker_id IN (
    SELECT claimed.id
    FROM public.get_claimed_profile_ids((SELECT auth.uid())) AS claimed
  )
  OR public.is_admin((SELECT auth.uid()))
  OR EXISTS (
    SELECT 1
    FROM public.jobs AS j
    WHERE j.id = job_records.job_id
      AND j.employer_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "Payments read policy" ON public.payments;
CREATE POLICY "Payments read policy"
ON public.payments
FOR SELECT
TO authenticated
USING (
  payer_id = (SELECT auth.uid())
  OR payee_id = (SELECT auth.uid())
  OR payer_id IN (
    SELECT claimed.id
    FROM public.get_claimed_profile_ids((SELECT auth.uid())) AS claimed
  )
  OR payee_id IN (
    SELECT claimed.id
    FROM public.get_claimed_profile_ids((SELECT auth.uid())) AS claimed
  )
  OR public.is_admin((SELECT auth.uid()))
);

COMMIT;
