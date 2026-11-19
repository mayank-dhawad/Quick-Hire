-- ============================================================================
-- QUICKHIRE CONCURRENCY TEST: OVERPAYMENT PREVENTION - SESSION 2
-- File: supabase/tests/04_concurrency_payments_s2.sql
-- Description:
--   Attempts concurrent payment of 500 INR on the same assignment.
--   Expected: Blocks on parent assignment lock. When Session 1 commits,
--   Session 2 re-evaluates, detects 700 + 500 > 700 payable, and aborts with 23514.
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

SELECT 'Session 2 (Payments): Attempting concurrent 500 INR payment (Should block on parent lock)...' AS step;

INSERT INTO public.payments (
  assignment_id, payer_id, payee_id, payment_for_type, amount, payment_method, status, verification_status
) VALUES (
  (SELECT id FROM public.job_records WHERE job_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' LIMIT 1),
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  'worker_wage',
  500,
  'Cash',
  'completed',
  'user_reported'
);

SELECT 'Session 2 (Payments): If this line prints, THE CONCURRENCY TEST FAILED (overpayment permitted)!' AS error_step;
COMMIT;

