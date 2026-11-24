-- Verify that assignments cannot target profiles that are not active workers.
BEGIN;

DO $test$
DECLARE
  v_denied boolean := false;
BEGIN
  -- The fixture employer owns job A, but must never be accepted as its own worker.
  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  BEGIN
    INSERT INTO public.job_records (job_id, worker_id, hiring_source, agreement_evidence_type, status)
    VALUES (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      '11111111-1111-1111-1111-111111111111',
      'direct_phone',
      'employer_reported_verbal_agreement',
      'hired'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;

  IF NOT v_denied THEN RAISE EXCEPTION 'Direct-hire accepted a profile whose role is employer.'; END IF;
END;
$test$;

ROLLBACK;
