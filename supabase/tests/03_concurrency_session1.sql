-- ============================================================================
-- QUICKHIRE CONCURRENCY TEST: SESSION 1 (Run in Terminal 1)
-- File: supabase/tests/03_concurrency_session1.sql
-- Description:
--   Acquires row-level pessimistic lock on the parent job/assignment row,
--   sleeps for 3 seconds to guarantee that Session 2 attempts concurrent mutation
--   while Session 1 is in-flight, then commits.
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- Setup context as Employer
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

SELECT 'Session 1: Starting transaction and acquiring parent row lock...' AS step;

-- Lock parent job and insert first worker
INSERT INTO public.job_records (
  job_id, worker_id, hiring_source, agreement_evidence_type, status, agreed_wage, total_payable
) VALUES (
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  '22222222-2222-2222-2222-222222222222',
  'direct_phone',
  'employer_reported_verbal_agreement',
  'hired',
  700,
  700
);

SELECT 'Session 1: Inserted Worker 1. Holding lock for 5 seconds to simulate high concurrency...' AS step;
SELECT pg_sleep(5);

SELECT 'Session 1: Committing transaction...' AS step;
COMMIT;

SELECT 'Session 1: COMMITTED SUCCESSFULLY.' AS final_result;

