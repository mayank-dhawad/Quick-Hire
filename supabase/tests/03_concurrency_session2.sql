-- ============================================================================
-- QUICKHIRE CONCURRENCY TEST: SESSION 2 (Run in Terminal 2 while Session 1 sleeps)
-- File: supabase/tests/03_concurrency_session2.sql
-- Description:
--   Attempts to concurrently hire a second worker on the same single-capacity job.
--   Expected Behavior: Blocks immediately on the parent job row lock held by Session 1.
--   When Session 1 commits, Session 2 unblocks, re-evaluates via EvalPlanQual,
--   detects capacity is now full (1/1), and aborts with ERRCODE 23514.
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- Setup context as Employer
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

SELECT 'Session 2: Attempting concurrent hire on Job bbbbbbbb... (Should block waiting for Session 1)' AS step;

-- This statement will BLOCK until Session 1 completes!
-- Upon unblocking, it MUST raise ERRCODE 23514 'QuickHire Capacity Exceeded'
INSERT INTO public.job_records (
  job_id, worker_id, hiring_source, agreement_evidence_type, status, agreed_wage, total_payable
) VALUES (
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  '33333333-3333-3333-3333-333333333333',
  'direct_phone',
  'employer_reported_verbal_agreement',
  'hired',
  700,
  700
);

SELECT 'Session 2: If this line prints, THE CONCURRENCY TEST FAILED (overbooking occurred)!' AS error_step;
COMMIT;

