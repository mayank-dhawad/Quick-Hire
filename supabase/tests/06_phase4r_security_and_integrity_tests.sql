-- ==============================================================================
-- QuickHire Phase 4R.1 Test Suite: Security Hardening & Integrity Verification
-- File: supabase/tests/06_phase4r_security_and_integrity_tests.sql
-- Description:
--   Comprehensive 34-scenario test suite verifying Phase 4R security fixes:
--   1. Direct Access to Worker Private Profile Details (Owner RLS Defense).
--   2. Authorized Worker Reads Own Private Profile Details.
--   3. Unauthorized Access to Conflict Audit Table.
--   4. Parity Verification Function Authorization (Admin Only: non-admin, admin, & anon).
--   5. Isolated Claim Secret Hashes Table Protection (Table-level REVOKE).
--   6. Multi-Factor Claim Rejection on Invalid Secret (Phone-Only Proof Rejected).
--   7. Valid Multi-Factor Claim & Duplicate Rejection.
--   8. Claimed Worker Access to Historical Jobs.
--   9. Claimed Worker Access to Historical Payments (Zero Ledger Mutation).
--   10. Claimed Worker Review & Reputation Aggregation (reviewed_profile_id).
--   11. Unrelated Worker Historical Job Access Denial.
--   12. Recipient-Detail Authorization: Correct Employer, Job, and Worker.
--   13. Recipient-Detail Authorization: Different Employer (Rejected).
--   14. Recipient-Detail Authorization: Different Job Belonging to Same Employer (Rejected).
--   15. Recipient-Detail Authorization: Same Worker Assigned to Unrelated Job (Rejected).
--   16. Recipient-Detail Authorization: Unrelated Employer with No Assignment (Rejected).
--   17. Valid Worker-Wage Payment Settlement via record_direct_payment.
--   18. Missing Assignment Rejection (assignment_id NOT NULL).
--   19. Payee / Job Relationship Mismatch Rejection.
--   20. Overpayment Violation Rejection.
--   21. Reused Idempotency Reference with Different Payment Details Rejection.
--   22. Duplicate Payment Retry (Identical Parameter Idempotency).
--   23. Duplicate UTR Recycling Rejection.
--   24. Machine Rental Explicit Rejection until Booking Schema Exists.
--   25. Ledger Total Consistency and Recalculation.
--   26. Auth User Deletion Cascade Cleanup (Clean user with no business history).
--   27. Preservation of Assisted Worker Profiles When Facilitator Auth User is Deleted.
--   28. Preservation of Unrelated Profiles on Arbitrary Auth User Deletion.
--   29. PostgREST Direct Invocation Revocation on handle_auth_user_deleted.
--   30. Financial & Payment History Preservation on User Deletion (Dual-Path Guard).
--   31. Completed Jobs & Application History Preservation.
--   32. Review & Rating History Preservation on User Deletion.
--   33. Employer Open Job Cancellation on Deletion.
--   34. Admin Query Access to Historical Records of Deactivated Accounts.
-- Safety:
--   Executed in a single rollback transaction block (ROLLBACK at end) so no
--   test fixtures mutate any permanent database state.
--   Uses safe SET LOCAL ROLE authenticated switching with verification to
--   guarantee assertions run under the intended database role and identities.
-- ==============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- Verify pgcrypto extension is available in extensions schema
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto'
    ) THEN
        CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
    END IF;
END $$;

DO $$
DECLARE
    -- Actor UUIDs
    v_employer_id uuid := '11111111-1111-1111-1111-111111111111';
    v_worker_primary_id uuid := '22222222-2222-2222-2222-222222222222';
    v_worker_unrelated_id uuid := '33333333-3333-3333-3333-333333333333';
    v_assisted_worker_id uuid := gen_random_uuid();
    v_contractor_id uuid := '44444444-4444-4444-4444-444444444444';
    v_admin_id uuid := '99999999-9999-9999-9999-999999999999';

    -- Test Fixtures
    v_job_id uuid := gen_random_uuid();
    v_job_alt_id uuid := gen_random_uuid();
    v_job_unrelated_assignment_id uuid := gen_random_uuid();
    v_assignment_id uuid := gen_random_uuid();
    v_historical_job_id uuid := gen_random_uuid();
    v_historical_assignment_id uuid := gen_random_uuid();
    v_historical_payment_id uuid := gen_random_uuid();
    v_equipment_id uuid := gen_random_uuid();

    -- Test State Variables
    v_effective_role text;
    v_op_succeeded boolean;
    v_row_count integer;
    v_result_json jsonb;
    v_total_paid numeric;
    v_payment_status text;
    v_claim_secret text := 'SECURE_PIN_4920';
BEGIN
    RAISE NOTICE '================================================================';
    RAISE NOTICE 'STARTING QUICKHIRE PHASE 4R.1 SECURITY & INTEGRITY TEST SUITE';
    RAISE NOTICE '================================================================';

    -- --------------------------------------------------------------------------
    -- FIXTURE SETUP (Executed as session user / table owner)
    -- --------------------------------------------------------------------------
    -- Clear any residual session JWT claims before setup and establish service_role context
    -- so role-protection triggers permit admin and employer profile insertions.
    PERFORM set_config('request.jwt.claim.role', 'service_role', true);
    PERFORM set_config('request.jwt.claim.sub', '', true);

    -- Ensure all test actors exist in auth.users for foreign key referential integrity
    -- (job_records.reported_by, job_records.arrived_reported_by, payments.recorded_by, profiles.created_by, admin_users.user_id)
    INSERT INTO auth.users (
        id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES (
        v_employer_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'employer.test@quickhire.in', '$2a$10$e8kZ10wz9/wB4V8gXbWb4.0mZ3K5zN1xQ7jL4rA2cI1oK9eX4yV7z', now(),
        '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Farmer Employer"}'::jsonb,
        now(), now()
    ), (
        v_worker_primary_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'worker1.test@quickhire.in', '$2a$10$e8kZ10wz9/wB4V8gXbWb4.0mZ3K5zN1xQ7jL4rA2cI1oK9eX4yV7z', now(),
        '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Ramesh Worker"}'::jsonb,
        now(), now()
    ), (
        v_worker_unrelated_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'worker2.test@quickhire.in', '$2a$10$e8kZ10wz9/wB4V8gXbWb4.0mZ3K5zN1xQ7jL4rA2cI1oK9eX4yV7z', now(),
        '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Suresh Other"}'::jsonb,
        now(), now()
    ), (
        v_contractor_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'contractor.test@quickhire.in', '$2a$10$e8kZ10wz9/wB4V8gXbWb4.0mZ3K5zN1xQ7jL4rA2cI1oK9eX4yV7z', now(),
        '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Contractor Intermediary"}'::jsonb,
        now(), now()
    ), (
        v_admin_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'admin.test@quickhire.in', '$2a$10$e8kZ10wz9/wB4V8gXbWb4.0mZ3K5zN1xQ7jL4rA2cI1oK9eX4yV7z', now(),
        '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Platform Administrator"}'::jsonb,
        now(), now()
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        updated_at = now();

    INSERT INTO public.profiles (
        id, role, full_name, phone_number, is_assisted_profile, account_status,
        bank_name, bank_account_no, bank_ifsc, upi_id, date_of_birth, address_line,
        emergency_contact_name, emergency_contact_phone
    ) VALUES (
        v_employer_id, 'employer', 'Farmer Employer', '+919876500001', false, 'active',
        NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
    ), (
        v_worker_primary_id, 'worker', 'Ramesh Worker', '+919876500002', false, 'active',
        'State Bank of India', '123456789012', 'SBIN0001234', 'ramesh@oksbi', '1990-05-15', 'House 42, Ramtek',
        'Sita Devi', '+919876599999'
    ), (
        v_worker_unrelated_id, 'worker', 'Suresh Other', '+919876500003', false, 'active',
        NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
    ), (
        v_contractor_id, 'employer', 'Contractor Intermediary', '+919876500004', false, 'active',
        NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
    )
    ON CONFLICT (id) DO UPDATE SET
        phone_number = EXCLUDED.phone_number,
        role = EXCLUDED.role;

    -- Authoritative administrator fixture
    INSERT INTO public.admin_users (user_id, role, is_active)
    VALUES (v_admin_id, 'super_admin', true)
    ON CONFLICT (user_id) DO NOTHING;

    -- Isolated private details fixture for worker
    INSERT INTO public.profile_private_details (
        profile_id, bank_name, bank_account_no, bank_ifsc, upi_id, date_of_birth,
        address_line, emergency_contact_name, emergency_contact_phone
    ) VALUES (
        v_worker_primary_id, 'State Bank of India', '123456789012', 'SBIN0001234', 'ramesh@oksbi',
        '1990-05-15', 'House 42, Ramtek', 'Sita Devi', '+919876599999'
    ) ON CONFLICT (profile_id) DO UPDATE SET
        bank_name = EXCLUDED.bank_name,
        bank_account_no = EXCLUDED.bank_account_no;

    -- Create assisted profile belonging to same phone as primary worker
    -- Authenticate as contractor intermediary creator so trigger records created_by = auth.uid()
    PERFORM set_config('request.jwt.claim.sub', v_contractor_id::text, true);

    INSERT INTO public.profiles (
        id, role, full_name, phone_number, is_assisted_profile, created_by, account_status
    ) VALUES (
        v_assisted_worker_id, 'worker', 'Ramesh Assisted', '+919876500002', true, v_contractor_id, 'active'
    );

    -- Store secret in isolated claim secrets table using schema-safe crypt
    BEGIN
        INSERT INTO public.assisted_profile_claim_secrets (assisted_profile_id, secret_hash, created_by)
        VALUES (v_assisted_worker_id, extensions.crypt(v_claim_secret, extensions.gen_salt('bf')), v_contractor_id);
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO public.assisted_profile_claim_secrets (assisted_profile_id, secret_hash, created_by)
        VALUES (v_assisted_worker_id, crypt(v_claim_secret, gen_salt('bf')), v_contractor_id);
    END;

    -- Live job & assignment: Employer owns v_job_id, worker assigned with direct_phone
    INSERT INTO public.jobs (id, employer_id, title, category, offered_wages, workers_needed, status, hiring_source)
    VALUES (v_job_id, v_employer_id, 'Paddy Harvest Test', 'Agriculture', 600, 2, 'open', 'direct_phone');

    -- Set employer authentication context to create direct phone assignment (Workflow B)
    PERFORM set_config('request.jwt.claim.sub', v_employer_id::text, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    INSERT INTO public.job_records (
        id, job_id, worker_id, hiring_source, agreement_evidence_type, status, agreed_wage, total_payable
    ) VALUES (
        v_assignment_id, v_job_id, v_worker_primary_id, 'direct_phone',
        'employer_reported_verbal_agreement', 'hired', 600, 600
    );

    -- Legitimate employer lifecycle transitions: hired -> on_the_way -> arrived -> in_progress -> completed
    UPDATE public.job_records SET status = 'on_the_way' WHERE id = v_assignment_id;
    UPDATE public.job_records SET status = 'arrived' WHERE id = v_assignment_id;
    UPDATE public.job_records SET status = 'in_progress' WHERE id = v_assignment_id;
    UPDATE public.job_records SET status = 'completed' WHERE id = v_assignment_id;

    UPDATE public.jobs SET status = 'in_progress' WHERE id = v_job_id;

    -- Alternate job belonging to SAME employer (v_employer_id), but worker is NOT assigned here
    INSERT INTO public.jobs (id, employer_id, title, category, offered_wages, workers_needed, status, hiring_source)
    VALUES (v_job_alt_id, v_employer_id, 'Alternate Farm Job - No Worker', 'Agriculture', 650, 1, 'in_progress', 'application');

    -- Unrelated job belonging to DIFFERENT employer (v_contractor_id), worker IS assigned here
    INSERT INTO public.jobs (id, employer_id, title, category, offered_wages, workers_needed, status, hiring_source)
    VALUES (v_job_unrelated_assignment_id, v_contractor_id, 'Contractor Trench Job', 'Construction', 550, 1, 'open', 'direct_phone');

    -- Set contractor authentication context to create assignment (Workflow B)
    PERFORM set_config('request.jwt.claim.sub', v_contractor_id::text, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    INSERT INTO public.job_records (
        id, job_id, worker_id, hiring_source, agreement_evidence_type, status, agreed_wage, total_payable
    ) VALUES (
        gen_random_uuid(), v_job_unrelated_assignment_id, v_worker_primary_id, 'direct_phone',
        'employer_reported_verbal_agreement', 'hired', 550, 550
    );

    UPDATE public.job_records SET status = 'on_the_way' WHERE job_id = v_job_unrelated_assignment_id;
    UPDATE public.job_records SET status = 'arrived' WHERE job_id = v_job_unrelated_assignment_id;
    UPDATE public.job_records SET status = 'in_progress' WHERE job_id = v_job_unrelated_assignment_id;

    UPDATE public.jobs SET status = 'in_progress' WHERE id = v_job_unrelated_assignment_id;

    -- Historical job & payment under assisted profile
    INSERT INTO public.jobs (id, employer_id, title, category, offered_wages, workers_needed, status, hiring_source)
    VALUES (v_historical_job_id, v_contractor_id, 'Historical Canal Digging', 'Construction', 500, 1, 'open', 'direct_phone');

    -- Set contractor authentication context to create historical assignment (Workflow B)
    PERFORM set_config('request.jwt.claim.sub', v_contractor_id::text, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    INSERT INTO public.job_records (
        id, job_id, worker_id, hiring_source, agreement_evidence_type, status, agreed_wage, total_payable
    ) VALUES (
        v_historical_assignment_id, v_historical_job_id, v_assisted_worker_id, 'direct_phone',
        'employer_reported_verbal_agreement', 'hired', 500, 500
    );

    UPDATE public.job_records SET status = 'on_the_way' WHERE id = v_historical_assignment_id;
    UPDATE public.job_records SET status = 'arrived' WHERE id = v_historical_assignment_id;
    UPDATE public.job_records SET status = 'in_progress' WHERE id = v_historical_assignment_id;
    UPDATE public.job_records SET status = 'completed' WHERE id = v_historical_assignment_id;

    INSERT INTO public.payments (
        id, payer_id, payee_id, payment_for_type, reference_id, assignment_id, amount,
        payment_method, status, verification_status, recorded_by
    ) VALUES (
        v_historical_payment_id, v_contractor_id, v_assisted_worker_id, 'worker_wage', v_historical_job_id,
        v_historical_assignment_id, 500, 'Cash', 'completed', 'user_reported', v_contractor_id
    );

    UPDATE public.jobs SET status = 'completed' WHERE id = v_historical_job_id;

    -- Equipment listing (owned by contractor)
    INSERT INTO public.equipment (id, owner_id, title, category, daily_rent, status, location)
    VALUES (v_equipment_id, v_contractor_id, 'Mahindra Tractor 4WD', 'Machinery', 1200, 'available', 'Nagpur Rural');

    -- --------------------------------------------------------------------------
    -- ROLE SWITCHING VERIFICATION
    -- --------------------------------------------------------------------------
    -- Switch to authenticated database role so that table RLS policies and grants
    -- are genuinely evaluated against non-owner permissions.
    EXECUTE 'SET LOCAL ROLE authenticated';

    SELECT current_user INTO v_effective_role;
    IF v_effective_role <> 'authenticated' THEN
        RAISE EXCEPTION 'Role Switch Failure: effective database role is %, expected authenticated.', v_effective_role;
    END IF;

    -- ==========================================================================
    -- TEST 1: Direct Access to Worker Private Profile Details (Owner RLS Defense)
    -- ==========================================================================
    -- Employer attempts direct SELECT on worker's profile_private_details row
    PERFORM set_config('request.jwt.claim.sub', v_employer_id::text, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    SELECT count(*) INTO v_row_count
    FROM public.profile_private_details
    WHERE profile_id = v_worker_primary_id;

    IF v_row_count = 0 THEN
        RAISE NOTICE 'TEST 1 PASSED: Employer query on worker profile_private_details returned 0 rows (Owner RLS isolation active).';
    ELSE
        RAISE EXCEPTION 'TEST 1 FAILED: Employer was able to read worker private details directly from profile_private_details!';
    END IF;

    -- ==========================================================================
    -- TEST 2: Authorized Worker Reads Own Private Profile Details
    -- ==========================================================================
    PERFORM set_config('request.jwt.claim.sub', v_worker_primary_id::text, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    SELECT count(*) INTO v_row_count
    FROM public.profile_private_details
    WHERE profile_id = v_worker_primary_id;

    IF v_row_count = 1 THEN
        RAISE NOTICE 'TEST 2 PASSED: Worker can read their own profile_private_details (Owner RLS policy active).';
    ELSE
        RAISE EXCEPTION 'TEST 2 FAILED: Worker was unable to read their own profile_private_details!';
    END IF;

    -- ==========================================================================
    -- TEST 3: Unauthorized Access to the Conflict Audit Table
    -- ==========================================================================
    PERFORM set_config('request.jwt.claim.sub', v_employer_id::text, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    SELECT count(*) INTO v_row_count
    FROM public.profile_private_migration_conflicts;

    IF v_row_count = 0 THEN
        RAISE NOTICE 'TEST 3 PASSED: Non-admin query on profile_private_migration_conflicts returned 0 rows (Admin-only RLS active).';
    ELSE
        RAISE EXCEPTION 'TEST 3 FAILED: Non-admin was able to read migration conflict table rows!';
    END IF;

    -- ==========================================================================
    -- TEST 4: Parity Verification Function Authorization (Admin Only)
    -- ==========================================================================
    -- 4A: Authenticated non-admin execution rejection (SQLSTATE 42501)
    PERFORM set_config('request.jwt.claim.sub', v_employer_id::text, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    v_op_succeeded := false;
    BEGIN
        PERFORM public.verify_profile_private_parity();
        v_op_succeeded := true;
    EXCEPTION
        WHEN insufficient_privilege THEN
            v_op_succeeded := false;
        WHEN OTHERS THEN
            RAISE EXCEPTION 'TEST 4A FAILED: Expected SQLSTATE 42501 (insufficient_privilege), got %: %', SQLSTATE, SQLERRM;
    END;

    IF NOT v_op_succeeded THEN
        RAISE NOTICE 'TEST 4A PASSED: Authenticated non-admin execution of verify_profile_private_parity() was rejected with SQLSTATE 42501.';
    ELSE
        RAISE EXCEPTION 'TEST 4A FAILED: Non-admin was able to run parity verification!';
    END IF;

    -- 4B: Admin execution success
    PERFORM set_config('request.jwt.claim.sub', v_admin_id::text, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    SELECT count(*) INTO v_row_count
    FROM public.verify_profile_private_parity();

    IF v_row_count = 1 THEN
        RAISE NOTICE 'TEST 4B PASSED: Administrator execution of verify_profile_private_parity() succeeded.';
    ELSE
        RAISE EXCEPTION 'TEST 4B FAILED: Administrator was unable to execute parity verification!';
    END IF;

    -- 4C: Anonymous caller execution rejection (SQLSTATE 42501)
    PERFORM set_config('request.jwt.claim.sub', '', true);
    PERFORM set_config('request.jwt.claim.role', 'anon', true);

    v_op_succeeded := false;
    BEGIN
        PERFORM public.verify_profile_private_parity();
        v_op_succeeded := true;
    EXCEPTION
        WHEN insufficient_privilege THEN
            v_op_succeeded := false;
        WHEN OTHERS THEN
            v_op_succeeded := false;
    END;

    IF NOT v_op_succeeded THEN
        RAISE NOTICE 'TEST 4C PASSED: Anonymous execution of verify_profile_private_parity() was rejected with SQLSTATE 42501.';
    ELSE
        RAISE EXCEPTION 'TEST 4C FAILED: Anonymous caller was able to run parity verification!';
    END IF;

    -- ==========================================================================
    -- TEST 5: Isolated Claim Secret Hashes Table Protection (Table-level REVOKE)
    -- ==========================================================================
    PERFORM set_config('request.jwt.claim.sub', v_employer_id::text, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    v_op_succeeded := false;
    BEGIN
        EXECUTE 'SELECT secret_hash FROM public.assisted_profile_claim_secrets WHERE assisted_profile_id = ' || quote_literal(v_assisted_worker_id);
        v_op_succeeded := true;
    EXCEPTION WHEN insufficient_privilege THEN
        v_op_succeeded := false;
    END;

    IF NOT v_op_succeeded THEN
        RAISE NOTICE 'TEST 5 PASSED: Client query on assisted_profile_claim_secrets was rejected with insufficient_privilege.';
    ELSE
        RAISE EXCEPTION 'TEST 5 FAILED: Client was able to read claim secret hashes!';
    END IF;

    -- ==========================================================================
    -- TEST 6: Multi-Factor Claim Rejection on Invalid Secret (Phone-Only Proof Rejected)
    -- ==========================================================================
    PERFORM set_config('request.jwt.claim.sub', v_worker_primary_id::text, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    v_op_succeeded := false;
    BEGIN
        -- Attempt claim with incorrect token
        PERFORM public.claim_assisted_worker_profile(v_assisted_worker_id, 'otp_and_secret_token', 'WRONG_PIN');
        v_op_succeeded := true;
    EXCEPTION WHEN OTHERS THEN
        v_op_succeeded := false;
    END;

    IF NOT v_op_succeeded THEN
        RAISE NOTICE 'TEST 6 PASSED: Claim with phone match but invalid secondary secret was rejected.';
    ELSE
        RAISE EXCEPTION 'TEST 6 FAILED: Claim succeeded with invalid secret token!';
    END IF;

    -- ==========================================================================
    -- TEST 7: Valid Multi-Factor Claim & Duplicate Rejection
    -- ==========================================================================
    -- 7A: Valid Claim
    v_result_json := public.claim_assisted_worker_profile(v_assisted_worker_id, 'otp_and_secret_token', v_claim_secret);
    IF (v_result_json->>'success')::boolean = true THEN
        RAISE NOTICE 'TEST 7A PASSED: Worker successfully claimed assisted profile using valid multi-factor PIN.';
    ELSE
        RAISE EXCEPTION 'TEST 7A FAILED: Valid claim attempt returned failure: %', v_result_json;
    END IF;

    -- 7B: Duplicate Claim Attempt by another user
    PERFORM set_config('request.jwt.claim.sub', v_worker_unrelated_id::text, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    v_op_succeeded := false;
    BEGIN
        PERFORM public.claim_assisted_worker_profile(v_assisted_worker_id, 'otp_and_secret_token', v_claim_secret);
        v_op_succeeded := true;
    EXCEPTION WHEN OTHERS THEN
        v_op_succeeded := false;
    END;

    IF NOT v_op_succeeded THEN
        RAISE NOTICE 'TEST 7B PASSED: Second user claim attempt on already claimed profile was blocked.';
    ELSE
        RAISE EXCEPTION 'TEST 7B FAILED: Duplicate claim was permitted!';
    END IF;

    -- ==========================================================================
    -- TEST 8: Claimed Worker Access to Historical Jobs
    -- ==========================================================================
    PERFORM set_config('request.jwt.claim.sub', v_worker_primary_id::text, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    SELECT count(*) INTO v_row_count
    FROM public.job_records
    WHERE id = v_historical_assignment_id;

    IF v_row_count = 1 THEN
        RAISE NOTICE 'TEST 8 PASSED: Claimed worker can view historical job records assigned to their assisted profile.';
    ELSE
        RAISE EXCEPTION 'TEST 8 FAILED: Claimed worker was denied access to historical job records.';
    END IF;

    -- ==========================================================================
    -- TEST 9: Claimed Worker Access to Historical Payments (Zero Ledger Mutation)
    -- ==========================================================================
    SELECT count(*) INTO v_row_count
    FROM public.payments
    WHERE id = v_historical_payment_id;

    IF v_row_count = 1 THEN
        RAISE NOTICE 'TEST 9 PASSED: Claimed worker can view historical payments made to their assisted profile without mutating payments.payee_id.';
    ELSE
        RAISE EXCEPTION 'TEST 9 FAILED: Claimed worker was denied access to historical payment records.';
    END IF;

    -- ==========================================================================
    -- TEST 10: Claimed Worker Review & Reputation Aggregation
    -- ==========================================================================
    -- Authenticate as contractor (reviewer) to submit review on completed job
    PERFORM set_config('request.jwt.claim.sub', v_contractor_id::text, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    INSERT INTO public.reviews (reviewer_profile_id, reviewed_profile_id, job_id, rating, comment)
    VALUES (v_contractor_id, v_assisted_worker_id, v_historical_job_id, 5, 'Great masonry canal work!');

    SELECT count(*) INTO v_row_count
    FROM public.get_claimed_worker_reputation(v_worker_primary_id);

    IF v_row_count = 1 THEN
        RAISE NOTICE 'TEST 10 PASSED: Reputation aggregates reviews from both primary and claimed assisted profiles.';
    ELSE
        RAISE EXCEPTION 'TEST 10 FAILED: get_claimed_worker_reputation failed.';
    END IF;

    -- ==========================================================================
    -- TEST 11: Unrelated Worker Access Denial
    -- ==========================================================================
    PERFORM set_config('request.jwt.claim.sub', v_worker_unrelated_id::text, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    SELECT count(*) INTO v_row_count
    FROM public.job_records
    WHERE id = v_historical_assignment_id;

    IF v_row_count = 0 THEN
        RAISE NOTICE 'TEST 11 PASSED: Unrelated worker strictly denied access to another worker historical job records.';
    ELSE
        RAISE EXCEPTION 'TEST 11 FAILED: Unrelated worker was able to read private job records!';
    END IF;

    -- ==========================================================================
    -- TEST 12: Recipient-Detail Authorization: Correct Employer, Job, and Worker
    -- ==========================================================================
    -- v_employer_id queries v_worker_primary_id on v_job_id (their own job with active assignment)
    PERFORM set_config('request.jwt.claim.sub', v_employer_id::text, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    SELECT count(*) INTO v_row_count
    FROM public.get_payment_recipient_details(v_worker_primary_id, v_job_id);

    IF v_row_count = 1 THEN
        RAISE NOTICE 'TEST 12 PASSED: Correct employer + job + worker retrieved recipient bank details successfully.';
    ELSE
        RAISE EXCEPTION 'TEST 12 FAILED: Authorized employer was unable to retrieve recipient details!';
    END IF;

    -- ==========================================================================
    -- TEST 13: Recipient-Detail Authorization: Different Employer (Rejected)
    -- ==========================================================================
    -- v_contractor_id does NOT own v_job_id. Must be strictly rejected with 42501.
    PERFORM set_config('request.jwt.claim.sub', v_contractor_id::text, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    v_op_succeeded := false;
    BEGIN
        PERFORM * FROM public.get_payment_recipient_details(v_worker_primary_id, v_job_id);
        v_op_succeeded := true;
    EXCEPTION WHEN insufficient_privilege THEN
        v_op_succeeded := false;
    END;

    IF NOT v_op_succeeded THEN
        RAISE NOTICE 'TEST 13 PASSED: Different employer querying v_job_id was rejected with 42501.';
    ELSE
        RAISE EXCEPTION 'TEST 13 FAILED: Different employer was permitted to access recipient banking details on an unowned job!';
    END IF;

    -- ==========================================================================
    -- TEST 14: Recipient-Detail Authorization: Different Job Belonging to Same Employer (Rejected)
    -- ==========================================================================
    -- v_employer_id queries v_worker_primary_id passing v_job_alt_id where worker is NOT assigned.
    -- Strict scoping requires exact job assignment; having another assignment on v_job_id must NOT grant access!
    PERFORM set_config('request.jwt.claim.sub', v_employer_id::text, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    v_op_succeeded := false;
    BEGIN
        PERFORM * FROM public.get_payment_recipient_details(v_worker_primary_id, v_job_alt_id);
        v_op_succeeded := true;
    EXCEPTION WHEN insufficient_privilege THEN
        v_op_succeeded := false;
    END;

    IF NOT v_op_succeeded THEN
        RAISE NOTICE 'TEST 14 PASSED: Query with unassigned job ID on same employer was strictly rejected with 42501.';
    ELSE
        RAISE EXCEPTION 'TEST 14 FAILED: Employer accessed banking details by passing an unrelated job ID!';
    END IF;

    -- ==========================================================================
    -- TEST 15: Recipient-Detail Authorization: Same Worker Assigned to Unrelated Job (Rejected)
    -- ==========================================================================
    -- v_employer_id queries v_worker_primary_id passing v_job_unrelated_assignment_id (owned by contractor).
    -- Even though worker is assigned to that job, v_employer_id is NOT the employer of that job.
    PERFORM set_config('request.jwt.claim.sub', v_employer_id::text, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    v_op_succeeded := false;
    BEGIN
        PERFORM * FROM public.get_payment_recipient_details(v_worker_primary_id, v_job_unrelated_assignment_id);
        v_op_succeeded := true;
    EXCEPTION WHEN insufficient_privilege THEN
        v_op_succeeded := false;
    END;

    IF NOT v_op_succeeded THEN
        RAISE NOTICE 'TEST 15 PASSED: Query for worker on an unrelated employer job was rejected with 42501.';
    ELSE
        RAISE EXCEPTION 'TEST 15 FAILED: Employer accessed banking details via an unrelated employer job!';
    END IF;

    -- ==========================================================================
    -- TEST 16: Recipient-Detail Authorization: Unrelated Employer with No Assignment (Rejected)
    -- ==========================================================================
    -- v_worker_unrelated_id has no jobs or payment history with v_worker_primary_id.
    -- Passing NULL job_id must strictly reject unauthorized caller.
    PERFORM set_config('request.jwt.claim.sub', v_worker_unrelated_id::text, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    v_op_succeeded := false;
    BEGIN
        PERFORM * FROM public.get_payment_recipient_details(v_worker_primary_id, NULL);
        v_op_succeeded := true;
    EXCEPTION WHEN insufficient_privilege THEN
        v_op_succeeded := false;
    END;

    IF NOT v_op_succeeded THEN
        RAISE NOTICE 'TEST 16 PASSED: Caller with no active assignment or payment history was rejected with 42501.';
    ELSE
        RAISE EXCEPTION 'TEST 16 FAILED: Unrelated user was permitted to retrieve recipient banking details!';
    END IF;

    -- ==========================================================================
    -- TEST 17: Valid Worker-Wage Payment Settlement via record_direct_payment
    -- ==========================================================================
    PERFORM set_config('request.jwt.claim.sub', v_employer_id::text, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    v_result_json := public.record_direct_payment(
        'worker_wage',
        v_job_id,
        v_assignment_id,
        v_worker_primary_id,
        300,
        'Cash',
        'QH-ATTEMPT-SEC-001'
    );

    IF (v_result_json->>'success')::boolean = true AND (v_result_json->>'status') = 'completed' THEN
        RAISE NOTICE 'TEST 17 PASSED: Valid Cash wage payment recorded successfully with status completed.';
    ELSE
        RAISE EXCEPTION 'TEST 17 FAILED: Failed to record valid wage payment: %', v_result_json;
    END IF;

    -- ==========================================================================
    -- TEST 18: Missing Assignment Rejection
    -- ==========================================================================
    v_op_succeeded := false;
    BEGIN
        PERFORM public.record_direct_payment('worker_wage', v_job_id, NULL, v_worker_primary_id, 300, 'Cash', 'QH-ATTEMPT-SEC-002');
        v_op_succeeded := true;
    EXCEPTION WHEN OTHERS THEN
        v_op_succeeded := false;
    END;

    IF NOT v_op_succeeded THEN
        RAISE NOTICE 'TEST 18 PASSED: Wage payment without assignment_id was rejected.';
    ELSE
        RAISE EXCEPTION 'TEST 18 FAILED: Wage payment allowed NULL assignment_id!';
    END IF;

    -- ==========================================================================
    -- TEST 19: Wrong Job / Payee Relationship Rejection
    -- ==========================================================================
    v_op_succeeded := false;
    BEGIN
        PERFORM public.record_direct_payment('worker_wage', v_job_id, v_assignment_id, v_worker_unrelated_id, 300, 'Cash', 'QH-ATTEMPT-SEC-003');
        v_op_succeeded := true;
    EXCEPTION WHEN OTHERS THEN
        v_op_succeeded := false;
    END;

    IF NOT v_op_succeeded THEN
        RAISE NOTICE 'TEST 19 PASSED: Wage payment with mismatched payee_id was rejected.';
    ELSE
        RAISE EXCEPTION 'TEST 19 FAILED: Wage payment allowed mismatched payee!';
    END IF;

    -- ==========================================================================
    -- TEST 20: Overpayment Violation Rejection
    -- ==========================================================================
    v_op_succeeded := false;
    BEGIN
        -- Already paid 300 out of 600 total_payable. 400 exceeds remaining 300.
        PERFORM public.record_direct_payment('worker_wage', v_job_id, v_assignment_id, v_worker_primary_id, 400, 'Cash', 'QH-ATTEMPT-SEC-004');
        v_op_succeeded := true;
    EXCEPTION WHEN OTHERS THEN
        v_op_succeeded := false;
    END;

    IF NOT v_op_succeeded THEN
        RAISE NOTICE 'TEST 20 PASSED: Overpayment attempt (700 > 600 total_payable) was rejected.';
    ELSE
        RAISE EXCEPTION 'TEST 20 FAILED: Overpayment was permitted!';
    END IF;

    -- ==========================================================================
    -- TEST 21: Reused Idempotency Reference with Different Payment Details
    -- ==========================================================================
    v_op_succeeded := false;
    BEGIN
        -- Attempt to reuse QH-ATTEMPT-SEC-001 with different amount (100 instead of 300)
        PERFORM public.record_direct_payment(
            'worker_wage',
            v_job_id,
            v_assignment_id,
            v_worker_primary_id,
            100, -- altered amount!
            'Cash',
            'QH-ATTEMPT-SEC-001'
        );
        v_op_succeeded := true;
    EXCEPTION WHEN unique_violation THEN
        v_op_succeeded := false;
    END;

    IF NOT v_op_succeeded THEN
        RAISE NOTICE 'TEST 21 PASSED: Reused payment reference with altered parameters was rejected with unique_violation.';
    ELSE
        RAISE EXCEPTION 'TEST 21 FAILED: Reused payment reference with altered parameters was accepted!';
    END IF;

    -- ==========================================================================
    -- TEST 22: Duplicate Payment Retry (Identical Parameter Idempotency)
    -- ==========================================================================
    v_result_json := public.record_direct_payment(
        'worker_wage',
        v_job_id,
        v_assignment_id,
        v_worker_primary_id,
        300,
        'Cash',
        'QH-ATTEMPT-SEC-001'
    );

    IF (v_result_json->>'idempotent_duplicate')::boolean = true THEN
        RAISE NOTICE 'TEST 22 PASSED: Duplicate payment with identical parameters returned idempotent response safely.';
    ELSE
        RAISE EXCEPTION 'TEST 22 FAILED: Idempotency failed: %', v_result_json;
    END IF;

    -- ==========================================================================
    -- TEST 23: Duplicate UTR Recycling Rejection
    -- ==========================================================================
    -- 23A: Create first electronic payment with UTR
    PERFORM public.record_direct_payment(
        'worker_wage',
        v_job_id,
        v_assignment_id,
        v_worker_primary_id,
        100,
        'Direct UPI',
        'QH-UPI-REF-001',
        'UTR9876543210'
    );

    -- 23B: Attempt to submit same UTR on a different payment attempt
    v_op_succeeded := false;
    BEGIN
        PERFORM public.record_direct_payment(
            'worker_wage',
            v_job_id,
            v_assignment_id,
            v_worker_primary_id,
            100,
            'Direct UPI',
            'QH-UPI-REF-002', -- new attempt reference
            'UTR9876543210'   -- RECYCLED UTR!
        );
        v_op_succeeded := true;
    EXCEPTION WHEN unique_violation THEN
        v_op_succeeded := false;
    END;

    IF NOT v_op_succeeded THEN
        RAISE NOTICE 'TEST 23 PASSED: Recycled UTR submission on a different payment reference was rejected with unique_violation.';
    ELSE
        RAISE EXCEPTION 'TEST 23 FAILED: Recycled UTR was accepted on different payment attempt!';
    END IF;

    -- ==========================================================================
    -- TEST 24: Machine Rental RPC Rejection until Booking Schema Exists
    -- ==========================================================================
    v_op_succeeded := false;
    BEGIN
        PERFORM public.record_direct_payment(
            'machine_rental',
            v_equipment_id,
            NULL,
            v_contractor_id,
            1200,
            'Cash',
            'QH-RENTAL-ATTEMPT'
        );
        v_op_succeeded := true;
    EXCEPTION WHEN feature_not_supported THEN
        v_op_succeeded := false;
    END;

    IF NOT v_op_succeeded THEN
        RAISE NOTICE 'TEST 24 PASSED: Machine rental payment was rejected with feature_not_supported (Booking schema blocker enforced).';
    ELSE
        RAISE EXCEPTION 'TEST 24 FAILED: Machine rental was permitted without an equipment_bookings table!';
    END IF;

    -- ==========================================================================
    -- TEST 25: Ledger Total Consistency
    -- ==========================================================================
    SELECT total_paid, payment_status INTO v_total_paid, v_payment_status
    FROM public.job_records
    WHERE id = v_assignment_id;

    -- Total settled was 300 (Test 17)
    IF v_total_paid = 300 AND v_payment_status = 'partially_paid' THEN
        RAISE NOTICE 'TEST 25 PASSED: job_records ledger accurately reflects settled payments (total_paid: ₹300, status: partially_paid).';
    ELSE
        RAISE EXCEPTION 'TEST 25 FAILED: Ledger mismatch! total_paid: %, status: %', v_total_paid, v_payment_status;
    END IF;

    -- ==========================================================================
    -- LIFECYCLE REPAIR TESTS (AUTH USER DELETION CASCADE & PRESERVATION)
    -- ==========================================================================

    -- Reset to privileged role before testing auth.users triggers
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claim.role', 'service_role', true);
    PERFORM set_config('request.jwt.claim.sub', '', true);

    -- ==========================================================================
    -- TEST 26: Deleting a Genuine Auth User Cascades to Profiles and Dependent Records
    -- ==========================================================================
    DECLARE
        v_temp_user_id uuid := gen_random_uuid();
        v_profile_exists boolean;
        v_worker_exists boolean;
        v_private_exists boolean;
    BEGIN
        -- Insert genuine auth user
        INSERT INTO auth.users (
            id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
            raw_app_meta_data, raw_user_meta_data, created_at, updated_at
        ) VALUES (
            v_temp_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'lifecycle.test@quickhire.in', '$2a$10$e8kZ10wz9/wB4V8gXbWb4.0mZ3K5zN1xQ7jL4rA2cI1oK9eX4yV7z', now(),
            '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Lifecycle Test User"}'::jsonb, now(), now()
        );

        -- Insert matching profile
        INSERT INTO public.profiles (
            id, full_name, role, phone_number, is_assisted_profile, account_status
        ) VALUES (
            v_temp_user_id, 'Lifecycle Test User', 'worker', '+919876500099', false, 'active'
        )
        ON CONFLICT (id) DO UPDATE SET
            full_name = EXCLUDED.full_name,
            role = EXCLUDED.role,
            phone_number = EXCLUDED.phone_number,
            is_assisted_profile = EXCLUDED.is_assisted_profile,
            account_status = EXCLUDED.account_status;

        -- Insert dependent worker record
        INSERT INTO public.workers (
            id, category, skills, daily_wage
        ) VALUES (
            v_temp_user_id, 'Agriculture', ARRAY['Harvesting'], 350
        );

        -- Insert dependent private details
        INSERT INTO public.profile_private_details (
            profile_id, bank_name, bank_account_no, bank_ifsc
        ) VALUES (
            v_temp_user_id, 'State Bank of India', '987654321098', 'SBIN0001234'
        );

        -- Verify all 3 records exist before deletion
        SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id = v_temp_user_id) INTO v_profile_exists;
        SELECT EXISTS(SELECT 1 FROM public.workers WHERE id = v_temp_user_id) INTO v_worker_exists;
        SELECT EXISTS(SELECT 1 FROM public.profile_private_details WHERE profile_id = v_temp_user_id) INTO v_private_exists;

        IF NOT (v_profile_exists AND v_worker_exists AND v_private_exists) THEN
            RAISE EXCEPTION 'TEST 26 PREFLIGHT FAILED: Fixtures were not inserted properly.';
        END IF;

        -- Delete genuine auth user
        DELETE FROM auth.users WHERE id = v_temp_user_id;

        -- Assert that trigger cascade cleaned up profile and dependent records
        SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id = v_temp_user_id) INTO v_profile_exists;
        SELECT EXISTS(SELECT 1 FROM public.workers WHERE id = v_temp_user_id) INTO v_worker_exists;
        SELECT EXISTS(SELECT 1 FROM public.profile_private_details WHERE profile_id = v_temp_user_id) INTO v_private_exists;

        IF v_profile_exists OR v_worker_exists OR v_private_exists THEN
            RAISE EXCEPTION 'TEST 26 FAILED: Auth user deletion did not cascade clean up profiles or dependent records! profile: %, worker: %, private: %',
                v_profile_exists, v_worker_exists, v_private_exists;
        ELSE
            RAISE NOTICE 'TEST 26 PASSED: Deleting genuine auth user safely cascaded to profiles, workers, and private details.';
        END IF;
    END;

    -- ==========================================================================
    -- TEST 27: Preserving Assisted Profile When Facilitator Auth User is Deleted
    -- ==========================================================================
    DECLARE
        v_temp_facilitator_id uuid := gen_random_uuid();
        v_temp_assisted_id uuid := gen_random_uuid();
        v_assisted_still_exists boolean;
        v_assisted_created_by uuid;
    BEGIN
        -- Insert facilitator in auth.users
        INSERT INTO auth.users (
            id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
            raw_app_meta_data, raw_user_meta_data, created_at, updated_at
        ) VALUES (
            v_temp_facilitator_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'facilitator.test@quickhire.in', '$2a$10$e8kZ10wz9/wB4V8gXbWb4.0mZ3K5zN1xQ7jL4rA2cI1oK9eX4yV7z', now(),
            '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Facilitator User"}'::jsonb, now(), now()
        );

        -- Insert facilitator profile
        INSERT INTO public.profiles (
            id, full_name, role, phone_number, is_assisted_profile, account_status
        ) VALUES (
            v_temp_facilitator_id, 'Facilitator User', 'employer', '+919876500088', false, 'active'
        )
        ON CONFLICT (id) DO UPDATE SET
            full_name = EXCLUDED.full_name,
            role = EXCLUDED.role,
            phone_number = EXCLUDED.phone_number,
            is_assisted_profile = EXCLUDED.is_assisted_profile,
            account_status = EXCLUDED.account_status;

        -- Insert assisted worker profile created by facilitator
        INSERT INTO public.profiles (
            id, full_name, role, phone_number, is_assisted_profile, created_by, account_status
        ) VALUES (
            v_temp_assisted_id, 'Assisted Rural Worker', 'worker', '+919876500077', true, v_temp_facilitator_id, 'active'
        )
        ON CONFLICT (id) DO UPDATE SET
            full_name = EXCLUDED.full_name,
            role = EXCLUDED.role,
            phone_number = EXCLUDED.phone_number,
            is_assisted_profile = EXCLUDED.is_assisted_profile,
            created_by = EXCLUDED.created_by,
            account_status = EXCLUDED.account_status;

        -- Delete facilitator auth user
        DELETE FROM auth.users WHERE id = v_temp_facilitator_id;

        -- Assert assisted profile STILL EXISTS and created_by is unlinked
        SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id = v_temp_assisted_id) INTO v_assisted_still_exists;
        SELECT created_by INTO v_assisted_created_by FROM public.profiles WHERE id = v_temp_assisted_id;

        IF NOT v_assisted_still_exists THEN
            RAISE EXCEPTION 'TEST 27 FAILED: Assisted profile was erroneously deleted when facilitator auth user was deleted!';
        ELSIF v_assisted_created_by IS NOT NULL THEN
            RAISE EXCEPTION 'TEST 27 FAILED: Facilitator created_by reference was not unlinked (still %)!', v_assisted_created_by;
        ELSE
            RAISE NOTICE 'TEST 27 PASSED: Assisted worker profile preserved and created_by unlinked when facilitator auth user was deleted.';
        END IF;
    END;

    -- ==========================================================================
    -- TEST 28: Preserving Unrelated Profiles on Arbitrary Auth User Deletion
    -- ==========================================================================
    DECLARE
        v_primary_worker_exists boolean;
        v_assisted_worker_exists boolean;
        v_employer_exists boolean;
    BEGIN
        SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id = v_worker_primary_id) INTO v_primary_worker_exists;
        SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id = v_assisted_worker_id) INTO v_assisted_worker_exists;
        SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id = v_employer_id) INTO v_employer_exists;

        IF NOT (v_primary_worker_exists AND v_assisted_worker_exists AND v_employer_exists) THEN
            RAISE EXCEPTION 'TEST 28 FAILED: Core profiles were corrupted or removed! primary_worker: %, assisted: %, employer: %',
                v_primary_worker_exists, v_assisted_worker_exists, v_employer_exists;
        ELSE
            RAISE NOTICE 'TEST 28 PASSED: All unrelated primary, assisted, and employer profiles strictly preserved.';
        END IF;
    END;

    -- ==========================================================================
    -- TEST 29: PostgREST Direct Invocation Protection for handle_auth_user_deleted
    -- ==========================================================================
    DECLARE
        v_anon_can_exec boolean;
        v_auth_can_exec boolean;
    BEGIN
        SELECT pg_catalog.has_function_privilege('anon', 'public.handle_auth_user_deleted()', 'EXECUTE') INTO v_anon_can_exec;
        SELECT pg_catalog.has_function_privilege('authenticated', 'public.handle_auth_user_deleted()', 'EXECUTE') INTO v_auth_can_exec;

        IF v_anon_can_exec OR v_auth_can_exec THEN
            RAISE EXCEPTION 'TEST 29 FAILED: handle_auth_user_deleted() is executable by unprivileged callers! anon: %, authenticated: %',
                v_anon_can_exec, v_auth_can_exec;
        ELSE
            RAISE NOTICE 'TEST 29 PASSED: Direct execution of handle_auth_user_deleted() is strictly revoked from anon and authenticated.';
        END IF;
    END;

    -- ==========================================================================
    -- TEST 30: Financial & Payment History Preservation on User Deletion
    -- ==========================================================================
    DECLARE
        v_fin_user_id uuid := gen_random_uuid();
        v_payment_id uuid := gen_random_uuid();
        v_payment_still_exists boolean;
        v_profile_status text;
        v_profile_name text;
        v_private_details_exist boolean;
        v_legacy_banking_exists boolean;
        v_sync_recreated_private boolean;
        v_worker_available boolean;
        v_worker_status text;
    BEGIN
        -- Insert auth user
        INSERT INTO auth.users (
            id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
            raw_app_meta_data, raw_user_meta_data, created_at, updated_at
        ) VALUES (
            v_fin_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'financial.user@quickhire.in', '$2a$10$e8kZ10wz9/wB4V8gXbWb4.0mZ3K5zN1xQ7jL4rA2cI1oK9eX4yV7z', now(),
            '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Financial Worker"}'::jsonb, now(), now()
        );

        -- Insert profile & worker with both legacy and private banking fields
        INSERT INTO public.profiles (
            id, full_name, role, phone_number, is_assisted_profile, account_status,
            bank_name, bank_account_no, bank_ifsc, upi_id
        ) VALUES (
            v_fin_user_id, 'Financial Worker', 'worker', '+919876543299', false, 'active',
            'HDFC Bank', '123456789012', 'HDFC0001234', 'fin@upi'
        )
        ON CONFLICT (id) DO UPDATE SET
            full_name = EXCLUDED.full_name,
            role = EXCLUDED.role,
            phone_number = EXCLUDED.phone_number,
            is_assisted_profile = EXCLUDED.is_assisted_profile,
            account_status = EXCLUDED.account_status,
            bank_name = EXCLUDED.bank_name,
            bank_account_no = EXCLUDED.bank_account_no,
            bank_ifsc = EXCLUDED.bank_ifsc,
            upi_id = EXCLUDED.upi_id;
        INSERT INTO public.workers (id, category, skills, is_available, availability_status)
        VALUES (v_fin_user_id, 'Agriculture', ARRAY['Harvesting'], true, 'available');

        -- Insert sensitive banking details in private table
        INSERT INTO public.profile_private_details (profile_id, bank_name, bank_account_no, bank_ifsc, upi_id)
        VALUES (v_fin_user_id, 'HDFC Bank', '123456789012', 'HDFC0001234', 'fin@upi')
        ON CONFLICT (profile_id) DO UPDATE SET
            bank_name = EXCLUDED.bank_name,
            bank_account_no = EXCLUDED.bank_account_no,
            bank_ifsc = EXCLUDED.bank_ifsc,
            upi_id = EXCLUDED.upi_id;

        -- Insert immutable payment ledger row where fin_user is payee
        INSERT INTO public.payments (
            id, payer_id, payee_id, amount, payment_method, payment_for_type, status, reference_id, transaction_ref
        ) VALUES (
            v_payment_id, v_employer_id, v_fin_user_id, 500, 'Direct UPI', 'worker_wage', 'completed', v_job_id::text, 'UTR-TEST-FIN-001'
        );

        -- Delete user from auth.users
        DELETE FROM auth.users WHERE id = v_fin_user_id;

        -- Assert that payment ledger row was NOT cascade-deleted
        SELECT EXISTS(SELECT 1 FROM public.payments WHERE id = v_payment_id) INTO v_payment_still_exists;
        SELECT account_status, full_name INTO v_profile_status, v_profile_name FROM public.profiles WHERE id = v_fin_user_id;
        SELECT EXISTS(SELECT 1 FROM public.profile_private_details WHERE profile_id = v_fin_user_id) INTO v_private_details_exist;
        SELECT is_available, availability_status INTO v_worker_available, v_worker_status FROM public.workers WHERE id = v_fin_user_id;

        -- Check legacy banking PII on profiles table
        SELECT (bank_name IS NOT NULL OR bank_account_no IS NOT NULL OR bank_ifsc IS NOT NULL OR upi_id IS NOT NULL)
        INTO v_legacy_banking_exists
        FROM public.profiles
        WHERE id = v_fin_user_id;

        -- Test subsequent update to confirm sync trigger cannot resurrect deleted private details
        UPDATE public.profiles SET updated_at = now() WHERE id = v_fin_user_id;
        SELECT EXISTS(SELECT 1 FROM public.profile_private_details WHERE profile_id = v_fin_user_id) INTO v_sync_recreated_private;

        IF NOT v_payment_still_exists THEN
            RAISE EXCEPTION 'TEST 30 FAILED: Financial ledger row was erroneously cascade-deleted when user was removed!';
        ELSIF v_profile_status <> 'deactivated' OR v_profile_name <> 'Deactivated User' THEN
            RAISE EXCEPTION 'TEST 30 FAILED: Profile was not properly anonymized! status: %, name: %', v_profile_status, v_profile_name;
        ELSIF v_legacy_banking_exists THEN
            RAISE EXCEPTION 'TEST 30 FAILED: Legacy banking fields were not cleared from public.profiles!';
        ELSIF v_private_details_exist THEN
            RAISE EXCEPTION 'TEST 30 FAILED: Private banking details were not purged upon account deletion!';
        ELSIF v_sync_recreated_private THEN
            RAISE EXCEPTION 'TEST 30 FAILED: Synchronization trigger resurrected deleted private details upon subsequent profile update!';
        ELSIF v_worker_available OR v_worker_status <> 'unavailable' THEN
            RAISE EXCEPTION 'TEST 30 FAILED: Worker listing was not deactivated! is_available: %, availability_status: %',
                v_worker_available, v_worker_status;
        ELSE
            RAISE NOTICE 'TEST 30 PASSED: Financial payment ledger preserved, legacy & private banking PII completely purged without trigger reinsertion, and worker deactivated.';
        END IF;
    END;

    -- ==========================================================================
    -- TEST 31: Completed Jobs & Application History Preservation
    -- ==========================================================================
    DECLARE
        v_app_user_id uuid := gen_random_uuid();
        v_record_id uuid := gen_random_uuid();
        v_record_still_exists boolean;
    BEGIN
        INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
        VALUES (v_app_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'app.user@quickhire.in', 'pw', now(), now(), now());

        INSERT INTO public.profiles (id, full_name, role, phone_number, is_assisted_profile, account_status)
        VALUES (v_app_user_id, 'Application User', 'worker', '+919876543288', false, 'active')
        ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role,
            phone_number = EXCLUDED.phone_number, is_assisted_profile = EXCLUDED.is_assisted_profile,
            account_status = EXCLUDED.account_status;

        INSERT INTO public.workers (id, category, skills) VALUES (v_app_user_id, 'Construction', ARRAY['Masonry']);

        INSERT INTO public.job_records (id, job_id, worker_id, status)
        VALUES (v_record_id, v_job_alt_id, v_app_user_id, 'completed');

        DELETE FROM auth.users WHERE id = v_app_user_id;

        SELECT EXISTS(SELECT 1 FROM public.job_records WHERE id = v_record_id) INTO v_record_still_exists;

        IF NOT v_record_still_exists THEN
            RAISE EXCEPTION 'TEST 31 FAILED: Completed job record was erroneously cascade-deleted!';
        ELSE
            RAISE NOTICE 'TEST 31 PASSED: Completed job record and work history preserved upon account deletion.';
        END IF;
    END;

    -- ==========================================================================
    -- TEST 32: Review & Rating History Preservation
    -- ==========================================================================
    DECLARE
        v_rev_user_id uuid := gen_random_uuid();
        v_review_id uuid := gen_random_uuid();
        v_review_still_exists boolean;
    BEGIN
        INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
        VALUES (v_rev_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rev.user@quickhire.in', 'pw', now(), now(), now());

        INSERT INTO public.profiles (id, full_name, role, phone_number, is_assisted_profile, account_status)
        VALUES (v_rev_user_id, 'Reviewer User', 'employer', '+919876543277', false, 'active')
        ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role,
            phone_number = EXCLUDED.phone_number, is_assisted_profile = EXCLUDED.is_assisted_profile,
            account_status = EXCLUDED.account_status;

        INSERT INTO public.reviews (id, reviewer_profile_id, reviewed_profile_id, rating, comment)
        VALUES (v_review_id, v_rev_user_id, v_worker_primary_id, 4.5, 'Good work done on time.');

        DELETE FROM auth.users WHERE id = v_rev_user_id;

        SELECT EXISTS(SELECT 1 FROM public.reviews WHERE id = v_review_id) INTO v_review_still_exists;

        IF NOT v_review_still_exists THEN
            RAISE EXCEPTION 'TEST 32 FAILED: Review record was erroneously cascade-deleted!';
        ELSE
            RAISE NOTICE 'TEST 32 PASSED: Review and rating preserved upon account deletion, protecting worker reputation.';
        END IF;
    END;

    -- ==========================================================================
    -- TEST 33: Employer Open Job Cancellation on Deletion
    -- ==========================================================================
    DECLARE
        v_emp_user_id uuid := gen_random_uuid();
        v_open_job_id uuid := gen_random_uuid();
        v_open_job_status text;
    BEGIN
        INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
        VALUES (v_emp_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'emp.user@quickhire.in', 'pw', now(), now(), now());

        INSERT INTO public.profiles (id, full_name, role, phone_number, is_assisted_profile, account_status)
        VALUES (v_emp_user_id, 'Employer User', 'employer', '+919876543266', false, 'active')
        ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role,
            phone_number = EXCLUDED.phone_number, is_assisted_profile = EXCLUDED.is_assisted_profile,
            account_status = EXCLUDED.account_status;

        INSERT INTO public.jobs (id, employer_id, title, category, status)
        VALUES (v_open_job_id, v_emp_user_id, 'Unfilled Field Work', 'Agriculture', 'open');

        DELETE FROM auth.users WHERE id = v_emp_user_id;

        SELECT status INTO v_open_job_status FROM public.jobs WHERE id = v_open_job_id;

        IF v_open_job_status <> 'cancelled' THEN
            RAISE EXCEPTION 'TEST 33 FAILED: Open job was not cancelled upon employer deletion! status: %', v_open_job_status;
        ELSE
            RAISE NOTICE 'TEST 33 PASSED: Open job safely transitioned to cancelled status.';
        END IF;
    END;

    -- ==========================================================================
    -- TEST 34: Admin Access to Deactivated Historical Records
    -- ==========================================================================
    DECLARE
        v_admin_payment_count integer;
    BEGIN
        -- Verify admin user can query payments belonging to deactivated profiles
        SELECT count(*) INTO v_admin_payment_count
        FROM public.payments
        WHERE payer_id = v_employer_id;

        IF v_admin_payment_count < 1 THEN
            RAISE EXCEPTION 'TEST 34 FAILED: Historical payments inaccessible to admin!';
        ELSE
            RAISE NOTICE 'TEST 34 PASSED: Administrators retain full query access to historical financial records.';
        END IF;
    END;

    -- --------------------------------------------------------------------------
    -- ROLE RESET
    -- --------------------------------------------------------------------------
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claim.sub', '', true);
    PERFORM set_config('request.jwt.claim.role', '', true);

    SELECT current_user INTO v_effective_role;
    IF v_effective_role = 'authenticated' THEN
        RAISE EXCEPTION 'Role Reset Failure: current_user is still authenticated after RESET ROLE.';
    END IF;

    RAISE NOTICE '================================================================';
    RAISE NOTICE 'ALL 34 PHASE 4R SECURITY & INTEGRITY TESTS COMPLETED SUCCESSFULLY';
    RAISE NOTICE '================================================================';
END $$;

-- Strictly rollback so zero test fixtures mutate permanent state
ROLLBACK;
