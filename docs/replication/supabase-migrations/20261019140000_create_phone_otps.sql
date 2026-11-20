/*
# Create Phone OTPs Table for Fast2SMS Delivery
#
# 1. New Table:
#    - public.phone_otps: Stores temporary numeric 6-digit OTP codes for mobile verification via Fast2SMS.
#      - id (uuid, primary key)
#      - phone (text, clean 10-digit phone number)
#      - otp (text, 6-digit numeric OTP)
#      - expires_at (timestamptz, expiration timestamp)
#      - created_at (timestamptz, creation timestamp)
#
# 2. Security & RLS:
#    - RLS enabled on phone_otps.
#    - Anonymous and authenticated users can insert, verify (select), and clean up (delete) OTP records.
*/

CREATE TABLE IF NOT EXISTS public.phone_otps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  otp text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Index for speedy phone number lookup during OTP verification
CREATE INDEX IF NOT EXISTS idx_phone_otps_phone ON public.phone_otps(phone);

-- Enable Row Level Security
ALTER TABLE public.phone_otps ENABLE ROW LEVEL SECURITY;

-- Allow anonymous & authenticated visitors to insert new OTP requests
DROP POLICY IF EXISTS "Allow public insert to phone_otps" ON public.phone_otps;
CREATE POLICY "Allow public insert to phone_otps"
  ON public.phone_otps FOR INSERT
  WITH CHECK (true);

-- Allow anonymous & authenticated visitors to verify their OTP
DROP POLICY IF EXISTS "Allow public select from phone_otps" ON public.phone_otps;
CREATE POLICY "Allow public select from phone_otps"
  ON public.phone_otps FOR SELECT
  USING (true);

-- Allow public deletion of verified or expired OTP records
DROP POLICY IF EXISTS "Allow public delete from phone_otps" ON public.phone_otps;
CREATE POLICY "Allow public delete from phone_otps"
  ON public.phone_otps FOR DELETE
  USING (true);
