-- Expose only settlement-configuration booleans to administrators.
-- Bank account numbers and UPI identifiers remain owner-private.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_admin_profile_settlement_status(p_profile_ids uuid[])
RETURNS TABLE (
  profile_id uuid,
  bank_account_configured boolean,
  upi_configured boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
SET row_security = off
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Administrator access is required.'
      USING ERRCODE = '42501';
  END IF;

  IF COALESCE(cardinality(p_profile_ids), 0) > 200 THEN
    RAISE EXCEPTION 'A maximum of 200 profile IDs may be checked per request.'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT details.profile_id,
    NULLIF(btrim(details.bank_account_no), '') IS NOT NULL,
    NULLIF(btrim(details.upi_id), '') IS NOT NULL
  FROM public.profile_private_details AS details
  WHERE details.profile_id = ANY(COALESCE(p_profile_ids, ARRAY[]::uuid[]));
END;
$function$;

REVOKE ALL ON FUNCTION public.get_admin_profile_settlement_status(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_profile_settlement_status(uuid[]) TO authenticated;

COMMENT ON FUNCTION public.get_admin_profile_settlement_status(uuid[]) IS
  'Administrator-only status lookup; returns boolean bank/UPI configured flags and never returns private account values.';

COMMIT;
