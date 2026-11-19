-- ============================================================================
-- QUICKHIRE CONCURRENCY TEST: OVERPAYMENT PREVENTION - SESSION 1
-- File: supabase/tests/04_concurrency_payments_s1.sql
-- Description:
--   Acquires row lock on job_records for assignment 'bbbbbbbb-...',
--   inserts full cash payment of 700, sleeps 4s, and commits.
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

SELECT 'Session 1 (Payments): Acquiring lock on assignment and recording 700 INR...' AS step;

INSERT INTO public.payments (
  assignment_id, payer_id, payee_id, payment_for_type, amount, payment_method, status, verification_status
) VALUES (
  (SELECT id FROM public.job_records WHERE job_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' LIMIT 1),
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  'worker_wage',
  700,
  'Cash',
  'completed',
  'user_reported'
);

SELECT 'Session 1 (Payments): Inserted 700 INR. Sleeping 4s to simulate in-flight race condition...' AS step;
SELECT pg_sleep(4);

COMMIT;
SELECT 'Session 1 (Payments): COMMITTED SUCCESSFULLY.' AS final_result;

