-- Verify authenticated users can read operational profile fields but cannot
-- select legacy banking, DOB or residential address columns from profiles.
DO $$
DECLARE
  v_column text;
  v_sensitive text[] := ARRAY[
    'bank_name',
    'bank_account_no',
    'bank_ifsc',
    'upi_id',
    'date_of_birth',
    'address_line'
  ];
  v_safe text[] := ARRAY[
    'id',
    'role',
    'full_name',
    'phone_number',
    'email',
    'location',
    'daily_wage'
  ];
BEGIN
  IF has_table_privilege('authenticated', 'public.profiles', 'SELECT') THEN
    RAISE EXCEPTION 'Authenticated role still has table-level SELECT on profiles';
  END IF;

  FOREACH v_column IN ARRAY v_safe LOOP
    IF NOT has_column_privilege('authenticated', 'public.profiles', v_column, 'SELECT') THEN
      RAISE EXCEPTION 'Authenticated role lost required profile column: %', v_column;
    END IF;
  END LOOP;

  FOREACH v_column IN ARRAY v_sensitive LOOP
    IF has_column_privilege('authenticated', 'public.profiles', v_column, 'SELECT') THEN
      RAISE EXCEPTION 'Sensitive profile column remains readable: %', v_column;
    END IF;
  END LOOP;

  IF has_table_privilege('anon', 'public.profiles', 'SELECT') THEN
    RAISE EXCEPTION 'Anonymous role must not have direct profile table SELECT';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.profile_private_details', 'SELECT') THEN
    RAISE EXCEPTION 'Authenticated role must retain access to its owner-scoped private details table';
  END IF;

  IF has_schema_privilege('anon', 'public', 'CREATE') THEN
    RAISE EXCEPTION 'Anonymous role must not be able to create objects in public schema';
  END IF;

  IF has_schema_privilege('authenticated', 'public', 'CREATE') THEN
    RAISE EXCEPTION 'Authenticated role must not be able to create objects in public schema';
  END IF;
END
$$;
