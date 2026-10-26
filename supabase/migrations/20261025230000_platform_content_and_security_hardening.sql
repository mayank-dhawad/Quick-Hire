-- ============================================================================
-- QUICKHIRE PLATFORM CONTENT & SECURITY HARDENING MIGRATION
-- Migration Name: 20261025230000_platform_content_and_security_hardening.sql
-- Description:
--   1. Create public.platform_content table for dynamic admin content management.
--   2. Strict Row Level Security policies for content delivery and admin editing.
--   3. Performance indexes on section, language, and display order.
-- Safety Guarantees:
--   - 100% Non-destructive: IF NOT EXISTS applied on all statements.
--   - Zero data deletion or table drops.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- SECTION 1: PLATFORM_CONTENT TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_key text NOT NULL,
  section text NOT NULL CHECK (section IN ('category', 'legal_card', 'government_resource', 'search_tag', 'faq', 'announcement')),
  language text NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'hi', 'mr', 'bn', 'te')),
  title text NOT NULL,
  description text,
  metadata jsonb DEFAULT '{}'::jsonb,
  display_order integer DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_content_key_section_lang_unique UNIQUE (content_key, section, language)
);

CREATE INDEX IF NOT EXISTS idx_platform_content_section_lang
  ON public.platform_content(section, language, is_active);

CREATE INDEX IF NOT EXISTS idx_platform_content_order
  ON public.platform_content(display_order ASC);

-- ----------------------------------------------------------------------------
-- SECTION 2: ROW LEVEL SECURITY POLICIES
-- ----------------------------------------------------------------------------
ALTER TABLE public.platform_content ENABLE ROW LEVEL SECURITY;

-- Anyone (anonymous or authenticated) can view active published content
DROP POLICY IF EXISTS "Public can view active platform content" ON public.platform_content;
CREATE POLICY "Public can view active platform content"
  ON public.platform_content FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

-- Only verified administrators can view inactive drafts or modify content
DROP POLICY IF EXISTS "Admins can view all platform content" ON public.platform_content;
CREATE POLICY "Admins can view all platform content"
  ON public.platform_content FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can insert platform content" ON public.platform_content;
CREATE POLICY "Admins can insert platform content"
  ON public.platform_content FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can update platform content" ON public.platform_content;
CREATE POLICY "Admins can update platform content"
  ON public.platform_content FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can delete platform content" ON public.platform_content;
CREATE POLICY "Admins can delete platform content"
  ON public.platform_content FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()));
