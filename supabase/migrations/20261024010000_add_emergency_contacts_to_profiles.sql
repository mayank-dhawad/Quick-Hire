-- ============================================================================
-- QUICKHIRE ADDITIVE MIGRATION: PERSONAL EMERGENCY CONTACTS IN PROFILES
-- Migration Name: 20261024010000_add_emergency_contacts_to_profiles.sql
-- Description: Adds emergency_contact_name and emergency_contact_phone to public.profiles.
-- Safety: 100% Additive, non-destructive, safe to rerun.
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT;

-- Verification Comment
COMMENT ON COLUMN public.profiles.emergency_contact_name IS 'Name of trusted personal emergency contact for rural SOS broadcasts';
COMMENT ON COLUMN public.profiles.emergency_contact_phone IS 'Phone number of trusted personal emergency contact (+91)';
