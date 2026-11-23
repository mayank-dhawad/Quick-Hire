-- Regression test for the auth.users -> public.profiles trigger.
-- This test is transactional and leaves no rows behind.

\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_worker_id uuid := gen_random_uuid();
  v_fallback_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, phone, encrypted_password,
    email_confirmed_at, phone_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    v_worker_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'trigger-worker-' || replace(v_worker_id::text, '-', '') || '@quickhire.test',
    '+919999000001',
    crypt('TriggerTest123!', gen_salt('bf')),
    now(),
    now(),
    '{"provider":"phone","providers":["phone"]}'::jsonb,
    '{"full_name":"Trigger Test Worker","role":"worker"}'::jsonb,
    now(),
    now()
  );

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = v_worker_id
      AND full_name = 'Trigger Test Worker'
      AND role = 'worker'
      AND phone_number = '+919999000001'
  ) THEN
    RAISE EXCEPTION 'Auth signup did not create the expected worker profile';
  END IF;

  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  ) VALUES (
    v_fallback_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'trigger-fallback-' || replace(v_fallback_id::text, '-', '') || '@quickhire.test',
    crypt('TriggerTest123!', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"role":"admin"}'::jsonb,
    now(),
    now()
  );

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = v_fallback_id
      AND full_name = 'QuickHire User'
      AND role = 'worker'
  ) THEN
    RAISE EXCEPTION 'Missing signup metadata was not safely defaulted to a worker profile';
  END IF;
END;
$$;

ROLLBACK;
