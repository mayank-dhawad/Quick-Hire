-- Allow administrators to see only the UPI identifier needed for payment
-- reconciliation. Do not broaden read access to the private-details table.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_admin_payment_upi(p_profile_ids uuid[])
RETURNS TABLE (profile_id uuid, upi_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: administrator access is required.'
      USING ERRCODE = '42501';
  END IF;

  IF COALESCE(array_length(p_profile_ids, 1), 0) > 200 THEN
    RAISE EXCEPTION 'Too many profile IDs requested.'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT d.profile_id, d.upi_id
  FROM public.profile_private_details d
  WHERE d.profile_id = ANY(COALESCE(p_profile_ids, ARRAY[]::uuid[]));
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_payment_upi(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_payment_upi(uuid[]) TO authenticated;

COMMIT;
