-- ============================================================================
-- QUICKHIRE CONCURRENCY TEST: CUMULATIVE REFUND CAP - SESSION 2
-- File: supabase/tests/05_concurrency_refunds_s2.sql
-- Description:
--   Attempts concurrent refund of 400 on the same 700 parent payment.
--   Expected: Blocks on parent payment lock. When Session 1 commits 500,
--   Session 2 re-evaluates, detects 500 + 400 = 900 > 700 parent amount,
--   and aborts with 23514.
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '99999999-9999-9999-9999-999999999999', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

SELECT 'Session 2 (Refunds): Attempting concurrent refund of 400 (Should block on parent lock)...' AS step;

INSERT INTO public.payments (
  assignment_id, parent_payment_id, payer_id, payee_id, payment_for_type, amount, payment_method, status, verification_status
) VALUES (
  (SELECT id FROM public.job_records WHERE job_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' LIMIT 1),
  (SELECT id FROM public.payments WHERE parent_payment_id IS NULL AND amount = 700 LIMIT 1),
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'worker_wage',
  400,
  'Refund',
  'refunded',
  'verified'
);

SELECT 'Session 2 (Refunds): If this line prints, THE CONCURRENCY TEST FAILED (refund exceeded parent)!' AS error_step;
COMMIT;

