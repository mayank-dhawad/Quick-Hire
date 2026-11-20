/*
# Add account_status column to profiles table for soft-delete deactivation

1. Changes:
   - Add `account_status` TEXT column defaulting to 'active' on `public.profiles`.
   - Update any existing rows where `account_status` IS NULL to 'active'.
2. Security & RLS:
   - Preserves existing Row Level Security (RLS) policies.
   - Retains all historical relations with `workers`, `jobs`, `job_records`, and `payments`.
*/

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS account_status TEXT DEFAULT 'active';

UPDATE public.profiles 
SET account_status = 'active' 
WHERE account_status IS NULL;
