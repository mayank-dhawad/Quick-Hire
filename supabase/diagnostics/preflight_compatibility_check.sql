-- ============================================================================
-- QUICKHIRE PHASE 2 PREFLIGHT HISTORICAL COMPATIBILITY DIAGNOSTICS
-- File: supabase/diagnostics/preflight_compatibility_check.sql
-- Mode: Strictly READ-ONLY (Transaction is rolled back automatically)
-- Description:
--   Inspects existing production/staging database state to identify any historical
--   data that would conflict with Phase 2 constraints before migration application.
-- ============================================================================

BEGIN READ ONLY;

\echo '================================================================'
\echo '1. INSPECTING EXISTING JOB_RECORDS STATUS VALUES'
\echo '================================================================'
SELECT 
  status, 
  count(*) AS row_count,
  CASE 
    WHEN status IN (
      'contacted', 'applied', 'hired', 'confirmed', 'on_the_way',
      'arrived', 'attendance_confirmed', 'in_progress', 'on_break',
      'completed', 'payment_pending', 'partially_paid', 'paid',
      'cancelled', 'no_show', 'disputed', 'rejected'
    ) THEN 'COMPATIBLE'
    ELSE 'INCOMPATIBLE_NEEDS_MAPPING'
  END AS compatibility_status
FROM public.job_records
GROUP BY status
ORDER BY row_count DESC;

\echo '================================================================'
\echo '2. INSPECTING EXISTING PAYMENTS STATUS & VERIFICATION VALUES'
\echo '================================================================'
SELECT 
  status, 
  verification_status, 
  payment_method,
  count(*) AS row_count
FROM public.payments
GROUP BY status, verification_status, payment_method
ORDER BY row_count DESC;

\echo '================================================================'
\echo '3. CHECKING FOR NULL, ZERO OR NEGATIVE PAYMENT AMOUNTS'
\echo '================================================================'
SELECT 
  id, 
  payer_id, 
  payee_id, 
  amount, 
  created_at
FROM public.payments
WHERE amount IS NULL OR amount <= 0;

\echo '================================================================'
\echo '4. CHECKING FOR DUPLICATE (job_id, worker_id) ASSIGNMENTS'
\echo '================================================================'
SELECT 
  job_id, 
  worker_id, 
  count(*) AS duplicate_count
FROM public.job_records
GROUP BY job_id, worker_id
HAVING count(*) > 1;

\echo '================================================================'
\echo '5. CHECKING FOR DUPLICATE TRANSACTION REFERENCES (UTR)'
\echo '================================================================'
SELECT 
  transaction_ref, 
  count(*) AS duplicate_count
FROM public.payments
WHERE transaction_ref IS NOT NULL AND trim(transaction_ref) <> ''
GROUP BY transaction_ref
HAVING count(*) > 1;

\echo '================================================================'
\echo '6. CHECKING FOR ORPHANED PAYMENTS WITHOUT ASSIGNMENT OR JOB REF'
\echo '================================================================'
SELECT 
  p.id, 
  p.payment_for_type, 
  p.reference_id, 
  p.amount,
  p.created_at
FROM public.payments p
WHERE p.payment_for_type = 'worker_wage'
  AND (
    p.reference_id IS NULL 
    OR NOT EXISTS (SELECT 1 FROM public.jobs j WHERE j.id::text = p.reference_id)
  );

\echo '================================================================'
\echo '7. CHECKING JOBS WHERE ACTIVE WORKERS EXCEED WORKERS_NEEDED'
\echo '================================================================'
SELECT 
  j.id AS job_id, 
  j.title, 
  COALESCE(j.workers_needed, 1) AS workers_needed, 
  count(jr.id) AS active_worker_count
FROM public.jobs j
JOIN public.job_records jr ON jr.job_id = j.id
WHERE jr.status IN (
  'hired', 'confirmed', 'on_the_way', 'arrived',
  'attendance_confirmed', 'in_progress', 'on_break', 'completed'
)
GROUP BY j.id, j.title, j.workers_needed
HAVING count(jr.id) > COALESCE(j.workers_needed, 1);

\echo '================================================================'
\echo '8. INSPECTING FOREIGN KEY DEPENDENCIES ON PAYMENTS & JOB_RECORDS'
\echo '================================================================'
SELECT
  tc.table_schema,
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name,
  rc.delete_rule
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.referential_constraints AS rc
  ON tc.constraint_name = rc.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE ccu.table_name IN ('payments', 'job_records')
ORDER BY ccu.table_name, tc.table_name;

ROLLBACK;

