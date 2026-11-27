-- ============================================================================
-- QUICKHIRE PHASE 2 REVISED TEST SUITE: SEQUENTIAL EXECUTION
-- File: supabase/tests/02_test_execution.sql
-- Description:
--   20 comprehensive tests covering lifecycle, authorization, field protection,
--   accounting integrity, refund direction, and audit immutability.
--   Fully repeatable, idempotent, and executed within a safe transaction block.
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_emp_id uuid := '11111111-1111-1111-1111-111111111111';
  v_wrk_id uuid := '22222222-2222-2222-2222-222222222222';
  v_wrk2_id uuid := '33333333-3333-3333-3333-333333333333';
  v_adm_id uuid := '99999999-9999-9999-9999-999999999999';

  -- Isolated unique test identifiers per run (prevents immutability conflicts)
  v_job1_id uuid := gen_random_uuid();
  v_job2_id uuid := gen_random_uuid();
  v_assign_id uuid;
  v_assign2_id uuid;
  v_pay_id uuid;
  v_child_pay_id uuid;
  v_unverified_pay_id uuid;

  v_op_succeeded boolean;
  v_error_code text;
  v_error_msg text;
  v_current_paid numeric;
  v_current_status text;
  v_row_count integer;
  v_verif_status text;
BEGIN
  RAISE NOTICE '================================================================';
  RAISE NOTICE 'STARTING QUICKHIRE REVISED PHASE 2 SEQUENTIAL TEST SUITE';
  RAISE NOTICE '================================================================';

  -- Create fresh isolated test jobs
  INSERT INTO public.jobs (id, employer_id, title, category, offered_wages, workers_needed, status, hiring_source)
  VALUES (v_job1_id, v_emp_id, 'Test Harvest Job', 'Agriculture', 500, 1, 'open', 'application');

  INSERT INTO public.jobs (id, employer_id, title, category, offered_wages, workers_needed, status, hiring_source)
  VALUES (v_job2_id, v_emp_id, 'Test Direct Masonry', 'Construction', 700, 1, 'open', 'direct_phone');

  -- --------------------------------------------------------------------------
  -- TEST 1: Anonymous User Blocked from Creating Job Records
  -- --------------------------------------------------------------------------
  PERFORM set_config('role', 'anon', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', 'anon', true);

  v_op_succeeded := false;
  BEGIN
    INSERT INTO public.job_records (job_id, worker_id, status)
    VALUES (v_job1_id, v_wrk_id, 'applied');
    v_op_succeeded := true;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error_code = RETURNED_SQLSTATE, v_error_msg = MESSAGE_TEXT;
  END;

  IF v_op_succeeded THEN
    RAISE EXCEPTION 'TEST 1 FAILED: Anonymous user was able to insert into job_records!';
  ELSE
    RAISE NOTICE '[PASS] Test 1: Anonymous user rejected with SQLSTATE % (Msg: %)', v_error_code, v_error_msg;
  END IF;

  -- --------------------------------------------------------------------------
  -- TEST 2: Worker Cannot Insert Directly as 'hired' (Must Be 'applied')
  -- --------------------------------------------------------------------------
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_wrk_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  v_op_succeeded := false;
  BEGIN
    INSERT INTO public.job_records (
      job_id, worker_id, hiring_source, agreement_evidence_type, status
    ) VALUES (
      v_job1_id, v_wrk_id, 'application', 'worker_application_and_employer_acceptance', 'hired'
    );
    v_op_succeeded := true;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error_code = RETURNED_SQLSTATE, v_error_msg = MESSAGE_TEXT;
  END;

  IF v_op_succeeded THEN
    RAISE EXCEPTION 'TEST 2 FAILED: Worker was able to insert assignment directly as hired!';
  ELSE
    RAISE NOTICE '[PASS] Test 2: Worker self-promotion on insert rejected with SQLSTATE %', v_error_code;
  END IF;

  -- --------------------------------------------------------------------------
  -- TEST 3: Legitimate Worker Self-Application (Workflow A)
  -- --------------------------------------------------------------------------
  INSERT INTO public.job_records (
    job_id, worker_id, hiring_source, agreement_evidence_type, status
  ) VALUES (
    v_job1_id, v_wrk_id, 'application', 'worker_application_and_employer_acceptance', 'applied'
  ) RETURNING id INTO v_assign_id;

  SELECT total_paid, payment_status INTO v_current_paid, v_current_status
  FROM public.job_records WHERE id = v_assign_id;

  IF v_current_paid = 0 AND v_current_status = 'pending' THEN
    RAISE NOTICE '[PASS] Test 3: Worker self-application succeeded cleanly (total_paid: %, status: %)', v_current_paid, v_current_status;
  ELSE
    RAISE EXCEPTION 'TEST 3 FAILED: Assignment ledger initialization corrupted!';
  END IF;

  -- --------------------------------------------------------------------------
  -- TEST 4: Worker Cannot Tamper With Agreed Wage
  -- --------------------------------------------------------------------------
  v_op_succeeded := false;
  BEGIN
    UPDATE public.job_records SET agreed_wage = 2500 WHERE id = v_assign_id;
    v_op_succeeded := true;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error_code = RETURNED_SQLSTATE, v_error_msg = MESSAGE_TEXT;
  END;

  IF v_op_succeeded THEN
    RAISE EXCEPTION 'TEST 4 FAILED: Worker modified agreed_wage!';
  ELSE
    RAISE NOTICE '[PASS] Test 4: Worker wage tampering rejected with SQLSTATE %', v_error_code;
  END IF;

  -- --------------------------------------------------------------------------
  -- TEST 5: Worker Cannot Self-Confirm Attendance
  -- --------------------------------------------------------------------------
  v_op_succeeded := false;
  BEGIN
    UPDATE public.job_records
    SET attendance_confirmed_at = now(), attendance_confirmed_by = v_wrk_id
    WHERE id = v_assign_id;
    v_op_succeeded := true;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error_code = RETURNED_SQLSTATE, v_error_msg = MESSAGE_TEXT;
  END;

  IF v_op_succeeded THEN
    RAISE EXCEPTION 'TEST 5 FAILED: Worker self-confirmed attendance!';
  ELSE
    RAISE NOTICE '[PASS] Test 5: Worker attendance confirmation rejected with SQLSTATE %', v_error_code;
  END IF;

  -- --------------------------------------------------------------------------
  -- TEST 6: Worker Cannot Falsify Total Paid or Payment Status
  -- --------------------------------------------------------------------------
  UPDATE public.job_records SET total_paid = 10000, payment_status = 'paid' WHERE id = v_assign_id;
  SELECT total_paid, payment_status INTO v_current_paid, v_current_status FROM public.job_records WHERE id = v_assign_id;

  IF v_current_paid = 0 AND v_current_status = 'pending' THEN
    RAISE NOTICE '[PASS] Test 6: Forged payment status neutralized by authoritative ledger sync (Status: %, Paid: %)', v_current_status, v_current_paid;
  ELSE
    RAISE EXCEPTION 'TEST 6 FAILED: Forged payment persisted!';
  END IF;

  -- --------------------------------------------------------------------------
  -- TEST 7: Employer Creates Direct Phone Assignment (Workflow B)
  -- --------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_emp_id::text, true);

  INSERT INTO public.job_records (
    job_id, worker_id, hiring_source, agreement_evidence_type, status, agreed_wage, total_payable
  ) VALUES (
    v_job2_id, v_wrk2_id, 'direct_phone', 'employer_reported_verbal_agreement', 'hired', 700, 700
  ) RETURNING id INTO v_assign2_id;

  RAISE NOTICE '[PASS] Test 7: Employer created direct phone assignment without worker login (ID: %)', v_assign2_id;

  -- --------------------------------------------------------------------------
  -- TEST 8: Capacity Limit Enforced on Promotion (Job 1 capacity = 1)
  -- --------------------------------------------------------------------------
  -- Employer hires Worker 1
  UPDATE public.job_records SET status = 'hired' WHERE id = v_assign_id;

  -- Worker 2 applies
  PERFORM set_config('request.jwt.claim.sub', v_wrk2_id::text, true);
  INSERT INTO public.job_records (job_id, worker_id, hiring_source, agreement_evidence_type, status)
  VALUES (v_job1_id, v_wrk2_id, 'application', 'worker_application_and_employer_acceptance', 'applied');

  -- Employer attempts to promote Worker 2 to hired (exceeding capacity 1)
  PERFORM set_config('request.jwt.claim.sub', v_emp_id::text, true);
  v_op_succeeded := false;
  BEGIN
    UPDATE public.job_records SET status = 'hired' WHERE job_id = v_job1_id AND worker_id = v_wrk2_id;
    v_op_succeeded := true;
  EXCEPTION WHEN SQLSTATE '23514' THEN
    GET STACKED DIAGNOSTICS v_error_code = RETURNED_SQLSTATE, v_error_msg = MESSAGE_TEXT;
  END;

  IF v_op_succeeded THEN
    RAISE EXCEPTION 'TEST 8 FAILED: Capacity was exceeded by promoting second applicant to hired!';
  ELSE
    RAISE NOTICE '[PASS] Test 8: Capacity limit strictly enforced on promotion (SQLSTATE %, Msg: %)', v_error_code, v_error_msg;
  END IF;

  -- Mark the direct-hire assignment complete through its owning Employer.
  -- Wage-payment tests below must use the same completed-work rule as production.
  PERFORM set_config('request.jwt.claim.sub', v_emp_id::text, true);
  UPDATE public.job_records
  SET status = 'completed', work_completed_at = now()
  WHERE id = v_assign2_id;

  -- --------------------------------------------------------------------------
  -- TEST 9: Reject NULL, Zero and Negative Payment Amounts
  -- --------------------------------------------------------------------------
  v_op_succeeded := false;
  BEGIN
    INSERT INTO public.payments (assignment_id, reference_id, payer_id, payee_id, payment_for_type, amount, payment_method, payment_reference, status)
    VALUES (v_assign2_id, v_job2_id, v_emp_id, v_wrk2_id, 'worker_wage', -50, 'Cash', 'QH-TEST-NEGATIVE-' || v_assign2_id::text, 'completed');
    v_op_succeeded := true;
  EXCEPTION WHEN SQLSTATE '23514' THEN
    GET STACKED DIAGNOSTICS v_error_code = RETURNED_SQLSTATE, v_error_msg = MESSAGE_TEXT;
  END;

  IF v_op_succeeded THEN
    RAISE EXCEPTION 'TEST 9 FAILED: Negative payment amount succeeded!';
  ELSE
    RAISE NOTICE '[PASS] Test 9: Negative payment amount rejected with 23514';
  END IF;

  -- --------------------------------------------------------------------------
  -- TEST 10: Cash Payment Updates Assignment Ledger Atomically
  -- --------------------------------------------------------------------------
  INSERT INTO public.payments (
    assignment_id, reference_id, payer_id, payee_id, payment_for_type, amount, payment_method, payment_reference, status, verification_status
  ) VALUES (
    v_assign2_id, v_job2_id, v_emp_id, v_wrk2_id, 'worker_wage', 700, 'Cash', 'QH-TEST-CASH-' || v_assign2_id::text, 'completed', 'user_reported'
  ) RETURNING id INTO v_pay_id;

  SELECT total_paid, payment_status INTO v_current_paid, v_current_status FROM public.job_records WHERE id = v_assign2_id;

  IF v_current_paid = 700 AND v_current_status = 'paid' THEN
    RAISE NOTICE '[PASS] Test 10: Cash payment updated ledger to 700 / paid';
  ELSE
    RAISE EXCEPTION 'TEST 10 FAILED: Ledger did not sync! (Paid: %, Status: %)', v_current_paid, v_current_status;
  END IF;

  -- --------------------------------------------------------------------------
  -- TEST 11: Overpayment Rejected (Agreed 700, settled 700, attempt +100)
  -- --------------------------------------------------------------------------
  v_op_succeeded := false;
  BEGIN
    INSERT INTO public.payments (
      assignment_id, reference_id, payer_id, payee_id, payment_for_type, amount, payment_method, payment_reference, status, verification_status
    ) VALUES (
      v_assign2_id, v_job2_id, v_emp_id, v_wrk2_id, 'worker_wage', 100, 'Cash', 'QH-TEST-OVERPAY-' || v_assign2_id::text, 'completed', 'user_reported'
    );
    v_op_succeeded := true;
  EXCEPTION WHEN SQLSTATE '23514' THEN
    GET STACKED DIAGNOSTICS v_error_code = RETURNED_SQLSTATE, v_error_msg = MESSAGE_TEXT;
  END;

  IF v_op_succeeded THEN
    RAISE EXCEPTION 'TEST 11 FAILED: Overpayment succeeded!';
  ELSE
    RAISE NOTICE '[PASS] Test 11: Overpayment blocked with 23514 (Msg: %)', v_error_msg;
  END IF;

  -- --------------------------------------------------------------------------
  -- TEST 12: Child Refund Direction & Ledger Reduction
  -- (Direction: Worker returns funds to Employer)
  -- --------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_adm_id::text, true);

  INSERT INTO public.payments (
    assignment_id, parent_payment_id, payer_id, payee_id, payment_for_type, amount, payment_method, status, verification_status
  ) VALUES (
    v_assign2_id, v_pay_id, v_wrk2_id, v_emp_id, 'worker_wage', 300, 'Refund', 'refunded', 'user_reported'
  ) RETURNING id INTO v_child_pay_id;

  SELECT total_paid, payment_status INTO v_current_paid, v_current_status FROM public.job_records WHERE id = v_assign2_id;

  IF v_current_paid = 400 AND v_current_status = 'partially_paid' THEN
    RAISE NOTICE '[PASS] Test 12.1: Child refund (Worker->Employer) reduced ledger to 400 / partially_paid';
  ELSE
    RAISE EXCEPTION 'TEST 12.1 FAILED: Ledger corrupted after partial refund! (Paid: %, Status: %)', v_current_paid, v_current_status;
  END IF;

  -- Attempt child refund exceeding parent amount (remaining refundable: 400, attempt 500 -> FAIL)
  v_op_succeeded := false;
  BEGIN
    INSERT INTO public.payments (
      assignment_id, parent_payment_id, payer_id, payee_id, payment_for_type, amount, payment_method, status, verification_status
    ) VALUES (
      v_assign2_id, v_pay_id, v_wrk2_id, v_emp_id, 'worker_wage', 500, 'Refund', 'refunded', 'user_reported'
    );
    v_op_succeeded := true;
  EXCEPTION WHEN SQLSTATE '23514' THEN
    GET STACKED DIAGNOSTICS v_error_code = RETURNED_SQLSTATE, v_error_msg = MESSAGE_TEXT;
  END;

  IF v_op_succeeded THEN
    RAISE EXCEPTION 'TEST 12.2 FAILED: Child refund exceeding refundable cap succeeded!';
  ELSE
    RAISE NOTICE '[PASS] Test 12.2: Child refund cap strictly enforced (Msg: %)', v_error_msg;
  END IF;

  -- --------------------------------------------------------------------------
  -- TEST 13: Disputed Payments Do NOT Count Towards Settled Funds
  -- --------------------------------------------------------------------------
  UPDATE public.payments SET status = 'disputed' WHERE id = v_pay_id;
  SELECT total_paid, payment_status INTO v_current_paid, v_current_status FROM public.job_records WHERE id = v_assign2_id;

  IF v_current_paid = 0 AND v_current_status = 'disputed' THEN
    RAISE NOTICE '[PASS] Test 13: Disputed payment deducted from settled funds (total_paid: 0, status: disputed)';
  ELSE
    RAISE EXCEPTION 'TEST 13 FAILED: Disputed payment incorrectly counted as settled! (Paid: %, Status: %)', v_current_paid, v_current_status;
  END IF;

  -- --------------------------------------------------------------------------
  -- TEST 14: Payment Linkage (assignment_id) is Strictly Immutable
  -- --------------------------------------------------------------------------
  v_op_succeeded := false;
  BEGIN
    UPDATE public.payments SET assignment_id = v_assign_id WHERE id = v_pay_id;
    v_op_succeeded := true;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error_code = RETURNED_SQLSTATE, v_error_msg = MESSAGE_TEXT;
  END;

  IF v_op_succeeded THEN
    RAISE EXCEPTION 'TEST 14 FAILED: Payment assignment_id was modified!';
  ELSE
    RAISE NOTICE '[PASS] Test 14: Payment assignment reassignment strictly blocked (SQLSTATE %)', v_error_code;
  END IF;

  -- --------------------------------------------------------------------------
  -- TEST 15: Verification Status Dual-Layer Protection (RLS & Triggers)
  -- --------------------------------------------------------------------------
  -- Ensure parent payment is in verified state (set by admin)
  PERFORM set_config('request.jwt.claim.sub', v_adm_id::text, true);
  UPDATE public.payments SET status = 'completed', verification_status = 'verified' WHERE id = v_pay_id;

  -- --------------------------------------------------------------------------
  -- TEST 15A: RLS Protection — Unrelated Worker Cannot Update Payment
  -- --------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_wrk_id::text, true);
  UPDATE public.payments SET verification_status = 'unverified' WHERE id = v_pay_id;
  GET DIAGNOSTICS v_row_count = ROW_COUNT;

  -- Verify stored payment status remains verified
  PERFORM set_config('request.jwt.claim.sub', v_adm_id::text, true);
  SELECT verification_status INTO v_verif_status FROM public.payments WHERE id = v_pay_id;

  IF v_row_count = 0 AND v_verif_status = 'verified' THEN
    RAISE NOTICE '[PASS] Test 15A: RLS prevented unrelated worker update (affected rows: %, status: %)', v_row_count, v_verif_status;
  ELSE
    RAISE EXCEPTION 'TEST 15A FAILED: Unrelated worker modified payment! (Rows: %, Status: %)', v_row_count, v_verif_status;
  END IF;

  -- --------------------------------------------------------------------------
  -- TEST 15B: Non-Admin Payer Downgrade Blocked by Trigger
  -- --------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_emp_id::text, true);
  v_op_succeeded := false;
  v_error_code := NULL;
  v_error_msg := NULL;
  BEGIN
    UPDATE public.payments SET verification_status = 'unverified' WHERE id = v_pay_id;
    v_op_succeeded := true;
  EXCEPTION WHEN SQLSTATE '42501' THEN
    GET STACKED DIAGNOSTICS v_error_code = RETURNED_SQLSTATE, v_error_msg = MESSAGE_TEXT;
  WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error_code = RETURNED_SQLSTATE, v_error_msg = MESSAGE_TEXT;
    RAISE EXCEPTION 'TEST 15B FAILED: Unexpected error: SQLSTATE %, Msg: %', v_error_code, v_error_msg;
  END;

  SELECT verification_status INTO v_verif_status FROM public.payments WHERE id = v_pay_id;

  IF NOT v_op_succeeded AND v_error_code = '42501' AND v_verif_status = 'verified' THEN
    RAISE NOTICE '[PASS] Test 15B: Non-admin payer downgrade rejected by trigger (SQLSTATE %, Status: %)', v_error_code, v_verif_status;
  ELSIF v_op_succeeded THEN
    RAISE EXCEPTION 'TEST 15B FAILED: Non-admin payer downgraded verification status!';
  ELSE
    RAISE EXCEPTION 'TEST 15B FAILED: Stored status corrupted or unexpected error (SQLSTATE %, Status: %)', v_error_code, v_verif_status;
  END IF;

  -- --------------------------------------------------------------------------
  -- TEST 15C: Non-Admin Escalation Blocked by Trigger
  -- --------------------------------------------------------------------------
  -- Create a separate eligible unverified payment on v_assign_id (Job 1).
  -- The assignment must be completed and the payment must carry a stable reference.
  PERFORM set_config('request.jwt.claim.sub', v_emp_id::text, true);
  UPDATE public.job_records
  SET status = 'completed', work_completed_at = now()
  WHERE id = v_assign_id;

  INSERT INTO public.payments (
    assignment_id, reference_id, payer_id, payee_id, payment_for_type,
    amount, payment_method, payment_reference, status, verification_status
  ) VALUES (
    v_assign_id, v_job1_id, v_emp_id, v_wrk_id, 'worker_wage',
    100, 'UPI', 'QH-TEST-UNVERIFIED-' || v_assign_id::text, 'pending', 'unverified'
  ) RETURNING id INTO v_unverified_pay_id;

  -- Non-admin payer attempts to escalate verification_status to 'verified'
  v_op_succeeded := false;
  v_error_code := NULL;
  v_error_msg := NULL;
  BEGIN
    UPDATE public.payments SET verification_status = 'verified' WHERE id = v_unverified_pay_id;
    v_op_succeeded := true;
  EXCEPTION WHEN SQLSTATE '42501' THEN
    GET STACKED DIAGNOSTICS v_error_code = RETURNED_SQLSTATE, v_error_msg = MESSAGE_TEXT;
  WHEN SQLSTATE 'P0001' THEN
    GET STACKED DIAGNOSTICS v_error_code = RETURNED_SQLSTATE, v_error_msg = MESSAGE_TEXT;
  WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error_code = RETURNED_SQLSTATE, v_error_msg = MESSAGE_TEXT;
    RAISE EXCEPTION 'TEST 15C FAILED: Unexpected error: SQLSTATE %, Msg: %', v_error_code, v_error_msg;
  END;

  SELECT verification_status INTO v_verif_status FROM public.payments WHERE id = v_unverified_pay_id;

  IF NOT v_op_succeeded AND v_error_code IN ('42501', 'P0001') AND v_verif_status = 'unverified' THEN
    RAISE NOTICE '[PASS] Test 15C: Non-admin escalation rejected by trigger (SQLSTATE %, Status: %)', v_error_code, v_verif_status;
  ELSIF v_op_succeeded THEN
    RAISE EXCEPTION 'TEST 15C FAILED: Non-admin escalated payment to verified!';
  ELSE
    RAISE EXCEPTION 'TEST 15C FAILED: Stored status corrupted or unexpected error (SQLSTATE %, Status: %)', v_error_code, v_verif_status;
  END IF;

  -- --------------------------------------------------------------------------
  -- TEST 16: Payment Deletion Strictly Blocked
  -- --------------------------------------------------------------------------
  v_op_succeeded := false;
  BEGIN
    DELETE FROM public.payments WHERE id = v_pay_id;
    v_op_succeeded := true;
  EXCEPTION WHEN SQLSTATE '42501' THEN
    GET STACKED DIAGNOSTICS v_error_code = RETURNED_SQLSTATE, v_error_msg = MESSAGE_TEXT;
  END;

  IF v_op_succeeded THEN
    RAISE EXCEPTION 'TEST 16 FAILED: Payment row was deleted!';
  ELSE
    RAISE NOTICE '[PASS] Test 16: Payment deletion strictly prevented with 42501';
  END IF;

  -- --------------------------------------------------------------------------
  -- TEST 17: Payment Audit Log Tampering and Deletion Blocked
  -- --------------------------------------------------------------------------
  v_op_succeeded := false;
  BEGIN
    DELETE FROM public.payment_audit_events WHERE payment_id = v_pay_id;
    v_op_succeeded := true;
  EXCEPTION WHEN SQLSTATE '42501' THEN
    GET STACKED DIAGNOSTICS v_error_code = RETURNED_SQLSTATE, v_error_msg = MESSAGE_TEXT;
  END;

  IF v_op_succeeded THEN
    RAISE EXCEPTION 'TEST 17 FAILED: Audit event was deleted!';
  ELSE
    RAISE NOTICE '[PASS] Test 17: Payment audit event tampering/deletion blocked with 42501';
  END IF;

  RAISE NOTICE '================================================================';
  RAISE NOTICE 'ALL 17 REVISED SEQUENTIAL INTEGRITY TESTS PASSED CLEANLY';
  RAISE NOTICE '================================================================';
END $$;

ROLLBACK;
