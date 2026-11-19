-- ============================================================================
-- QUICKHIRE PHASE 2 TEST HARNESS: SETUP SCRIPT
-- File: supabase/tests/01_test_setup.sql
-- Description:
--   Creates genuine test users in auth.users and public.profiles with valid UUIDs,
--   valid passwords, confirmed emails, and correct roles. Sets up test jobs.
--   Enforces ON_ERROR_STOP to prevent false-positive reporting on failure.
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- 1. Ensure setup runs with service_role context so role triggers permit admin and employer roles
SELECT set_config('request.jwt.claim.role', 'service_role', true);

-- 2. Ensure required extensions exist
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Test UUID Constants:
-- Employer: 11111111-1111-1111-1111-111111111111
-- Worker 1: 22222222-2222-2222-2222-222222222222
-- Worker 2: 33333333-3333-3333-3333-333333333333
-- Attacker: 66666666-6666-6666-6666-666666666666
-- Admin:    99999999-9999-9999-9999-999999999999

-- 3. Populate auth.users
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'employer.test@quickhire.in', crypt('Password123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Ramesh Sharma"}'::jsonb, now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'worker1.test@quickhire.in', crypt('Password123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Suresh Kumar"}'::jsonb, now(), now()),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'worker2.test@quickhire.in', crypt('Password123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Amit Patel"}'::jsonb, now(), now()),
  ('66666666-6666-6666-6666-666666666666', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'attacker.test@quickhire.in', crypt('Password123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Malicious User"}'::jsonb, now(), now()),
  ('99999999-9999-9999-9999-999999999999', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin.test@quickhire.in', crypt('Password123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Platform Administrator"}'::jsonb, now(), now())
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  updated_at = now();

-- 4. Populate public.profiles
INSERT INTO public.profiles (id, full_name, role, phone_number, account_status)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'Ramesh Sharma', 'employer', '+919876543210', 'active'),
  ('22222222-2222-2222-2222-222222222222', 'Suresh Kumar', 'worker', '+919876543211', 'active'),
  ('33333333-3333-3333-3333-333333333333', 'Amit Patel', 'worker', '+919876543212', 'active'),
  ('66666666-6666-6666-6666-666666666666', 'Malicious User', 'worker', '+919876543216', 'active'),
  ('99999999-9999-9999-9999-999999999999', 'Platform Administrator', 'admin', '+919876543219', 'active')
ON CONFLICT (id) DO UPDATE SET
  role = EXCLUDED.role,
  full_name = EXCLUDED.full_name,
  phone_number = EXCLUDED.phone_number,
  account_status = EXCLUDED.account_status;

-- 5. Ensure admin user exists in admin_users table (for dual-auth public.is_admin())
-- Strict single-admin safety: never deactivate an unrelated active administrator
DO $$
DECLARE
  v_active_admin_id uuid;
  v_test_admin_id uuid := '99999999-9999-9999-9999-999999999999';
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'admin_users' AND table_schema = 'public') THEN
    -- Check for any currently active administrator
    SELECT user_id INTO v_active_admin_id
    FROM public.admin_users
    WHERE is_active = true
    LIMIT 1;

    IF v_active_admin_id = v_test_admin_id THEN
      -- Designated test administrator is already active; ensure verified_email and email_verified are set
      UPDATE public.admin_users
      SET verified_email = 'admin.test@quickhire.in',
          email_verified = true,
          updated_at = now()
      WHERE user_id = v_test_admin_id;
    ELSIF v_active_admin_id IS NOT NULL THEN
      -- Another administrator is active: do NOT deactivate, stop transaction immediately
      RAISE EXCEPTION 'Test Setup Aborted: An unrelated active administrator (%) already exists in public.admin_users. Automatic deactivation is prohibited.', v_active_admin_id;
    ELSE
      -- No active administrator exists; create or reactivate the designated test administrator
      INSERT INTO public.admin_users (
        user_id, role, permissions, is_active, verified_email, email_verified
      ) VALUES (
        v_test_admin_id,
        'super_admin',
        '{"all"}'::text[],
        true,
        'admin.test@quickhire.in',
        true
      )
      ON CONFLICT (user_id) DO UPDATE SET
        role = 'super_admin',
        is_active = true,
        verified_email = 'admin.test@quickhire.in',
        email_verified = true,
        updated_at = now();
    END IF;
  END IF;
END $$;

-- 6. Create Test Baseline Jobs
INSERT INTO public.jobs (
  id, employer_id, title, category, offered_wages, workers_needed, status, hiring_source
) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Wheat Harvesting Shift', 'Agriculture', 500, 1, 'open', 'application'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'Direct Bricklayer Assistance', 'Construction', 700, 1, 'open', 'direct_phone')
ON CONFLICT (id) DO UPDATE SET
  workers_needed = EXCLUDED.workers_needed,
  offered_wages = EXCLUDED.offered_wages,
  status = EXCLUDED.status,
  hiring_source = EXCLUDED.hiring_source;

-- 7. Pre-commit comprehensive verification of test harness state
DO $$
DECLARE
  v_user_count integer;
  v_prof_count integer;
  v_emp_role text;
  v_wrk1_role text;
  v_wrk2_role text;
  v_atk_role text;
  v_adm_role text;
  v_admin_active boolean;
  v_job_a_emp uuid;
  v_job_b_emp uuid;
BEGIN
  -- 1. Verify all 5 test users in auth.users
  SELECT count(*) INTO v_user_count
  FROM auth.users
  WHERE id IN (
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222',
    '33333333-3333-3333-3333-333333333333',
    '66666666-6666-6666-6666-666666666666',
    '99999999-9999-9999-9999-999999999999'
  );
  IF v_user_count <> 5 THEN
    RAISE EXCEPTION 'Verification Failed: Expected 5 auth.users, found %', v_user_count;
  END IF;

  -- 2. Verify all 5 profiles exist in public.profiles
  SELECT count(*) INTO v_prof_count
  FROM public.profiles
  WHERE id IN (
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222',
    '33333333-3333-3333-3333-333333333333',
    '66666666-6666-6666-6666-666666666666',
    '99999999-9999-9999-9999-999999999999'
  );
  IF v_prof_count <> 5 THEN
    RAISE EXCEPTION 'Verification Failed: Expected 5 public.profiles, found %', v_prof_count;
  END IF;

  -- 3. Verify roles
  SELECT role INTO v_emp_role FROM public.profiles WHERE id = '11111111-1111-1111-1111-111111111111';
  SELECT role INTO v_wrk1_role FROM public.profiles WHERE id = '22222222-2222-2222-2222-222222222222';
  SELECT role INTO v_wrk2_role FROM public.profiles WHERE id = '33333333-3333-3333-3333-333333333333';
  SELECT role INTO v_atk_role FROM public.profiles WHERE id = '66666666-6666-6666-6666-666666666666';
  SELECT role INTO v_adm_role FROM public.profiles WHERE id = '99999999-9999-9999-9999-999999999999';

  IF v_emp_role <> 'employer' THEN
    RAISE EXCEPTION 'Verification Failed: Employer profile has role "%", expected "employer"', v_emp_role;
  END IF;
  IF v_wrk1_role <> 'worker' THEN
    RAISE EXCEPTION 'Verification Failed: Worker 1 profile has role "%", expected "worker"', v_wrk1_role;
  END IF;
  IF v_wrk2_role <> 'worker' THEN
    RAISE EXCEPTION 'Verification Failed: Worker 2 profile has role "%", expected "worker"', v_wrk2_role;
  END IF;
  IF v_atk_role <> 'worker' THEN
    RAISE EXCEPTION 'Verification Failed: Attacker profile has role "%", expected "worker"', v_atk_role;
  END IF;
  IF v_adm_role <> 'admin' THEN
    RAISE EXCEPTION 'Verification Failed: Admin profile has role "%", expected "admin"', v_adm_role;
  END IF;

  -- 4. Verify designated administrator is active in admin_users
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'admin_users' AND table_schema = 'public') THEN
    SELECT is_active INTO v_admin_active
    FROM public.admin_users
    WHERE user_id = '99999999-9999-9999-9999-999999999999';

    IF v_admin_active IS NOT TRUE THEN
      RAISE EXCEPTION 'Verification Failed: Designated test administrator record in public.admin_users is not active';
    END IF;
  END IF;

  -- 5. Verify both baseline jobs exist and reference expected employer
  SELECT employer_id INTO v_job_a_emp FROM public.jobs WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  SELECT employer_id INTO v_job_b_emp FROM public.jobs WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  IF v_job_a_emp IS NULL OR v_job_a_emp <> '11111111-1111-1111-1111-111111111111' THEN
    RAISE EXCEPTION 'Verification Failed: Baseline job "aaaaaaaa-..." missing or has unexpected employer_id "%"', v_job_a_emp;
  END IF;
  IF v_job_b_emp IS NULL OR v_job_b_emp <> '11111111-1111-1111-1111-111111111111' THEN
    RAISE EXCEPTION 'Verification Failed: Baseline job "bbbbbbbb-..." missing or has unexpected employer_id "%"', v_job_b_emp;
  END IF;

  RAISE NOTICE '[VERIFICATION PASSED] All 5 auth.users, 5 profiles, roles, active test admin, and baseline jobs verified.';
END $$;

COMMIT;

SELECT 'Test setup completed successfully. All test accounts, profiles, and baseline jobs verified.' AS status;
