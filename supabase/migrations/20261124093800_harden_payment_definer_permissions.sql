-- Limit SECURITY DEFINER functions to their intended RPC/trigger callers.
BEGIN;

-- RPCs exposed to authenticated users only. Each function performs its own
-- caller/role/ownership validation internally.
REVOKE ALL ON FUNCTION public.record_direct_payment(text, uuid, uuid, uuid, numeric, text, text, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_direct_payment(text, uuid, uuid, uuid, numeric, text, text, text, text)
  TO authenticated;

REVOKE ALL ON FUNCTION public.reconcile_payment_admin(uuid, text, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_payment_admin(uuid, text, text, text)
  TO authenticated;

-- These functions are invoked by database triggers or by other SECURITY
-- DEFINER functions. They are not client-facing RPC endpoints.
REVOKE ALL ON FUNCTION public.check_job_worker_capacity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_payment_status_authorization() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_validated_caller_context() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_payment_audit_event() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_assignment_payment_ledger() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_job_record_transition() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_payment_integrity_and_limits() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_payment_deletion() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_audit_tampering() FROM PUBLIC, anon, authenticated;

-- Harden the two trigger functions flagged for mutable search_path.
ALTER FUNCTION public.prevent_payment_deletion() SET search_path = public, pg_temp;
ALTER FUNCTION public.prevent_audit_tampering() SET search_path = public, pg_temp;

COMMIT;
