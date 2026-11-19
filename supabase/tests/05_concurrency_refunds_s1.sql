-- ============================================================================
-- QUICKHIRE CONCURRENCY TEST: CUMULATIVE REFUND CAP - SESSION 1
-- File: supabase/tests/05_concurrency_refunds_s1.sql
-- Description:
--   Acquires row lock on parent payment, records partial refund of 500 on 700 parent,
--   sleeps 4s, and commits.
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '99999999-9999-9999-9999-999999999999', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

SELECT 'Session 1 (Refunds): Recording partial child refund of 500 on parent...' AS step;

INSERT INTO public.payments (
  assignment_id, parent_payment_id, payer_id, payee_id, payment_for_type, amount, payment_method, status, verification_status
) VALUES (
  (SELECT id FROM public.job_records WHERE job_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' LIMIT 1),
  (SELECT id FROM public.payments WHERE parent_payment_id IS NULL AND amount = 700 LIMIT 1),
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'worker_wage',
  500,
  'Refund',
  'refunded',
  'verified'
);

SELECT 'Session 1 (Refunds): Inserted refund of 500. Sleeping 4s to simulate race condition...' AS step;
SELECT pg_sleep(4);

COMMIT;
SELECT 'Session 1 (Refunds): COMMITTED SUCCESSFULLY.' AS final_result;

