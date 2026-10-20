
-- ============================================
-- FIX 1: Profiles SELECT - Restrict sensitive fields
-- Replace the overly permissive "true" SELECT with a policy that:
-- - Allows users to see their own full profile
-- - Allows admins/supervisors to see all profiles
-- - Non-admin users can only see non-sensitive fields of others via a secure view
-- ============================================

-- Drop the overly permissive SELECT policy
DROP POLICY IF EXISTS "Authenticated users can view profiles" ON public.profiles;

-- Policy: Users can always read their own profile
CREATE POLICY "Users can view own profile"
ON public.profiles FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Policy: Admins/supervisors can view all profiles
CREATE POLICY "Admins can view all profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (public.is_admin_or_supervisor(auth.uid()));

-- Create a secure view for non-sensitive profile data (for lookups by agents)
CREATE OR REPLACE VIEW public.profiles_public AS
SELECT id, user_id, name, avatar_url, is_active, department, job_title
FROM public.profiles;

-- ============================================
-- FIX 2: Profiles UPDATE - Prevent privilege escalation at RLS level
-- The trigger already blocks it, but RLS should too
-- ============================================

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

-- Users can update own profile but sensitive columns are checked
CREATE POLICY "Users can update own profile safe"
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND (
    -- Either the user is admin/supervisor (can change anything)
    public.is_admin_or_supervisor(auth.uid())
    OR (
      -- Or non-sensitive update: role, permissions, access_level must stay the same
      role IS NOT DISTINCT FROM (SELECT p.role FROM public.profiles p WHERE p.user_id = auth.uid())
      AND permissions IS NOT DISTINCT FROM (SELECT p.permissions FROM public.profiles p WHERE p.user_id = auth.uid())
      AND access_level IS NOT DISTINCT FROM (SELECT p.access_level FROM public.profiles p WHERE p.user_id = auth.uid())
    )
  )
);

-- ============================================
-- FIX 3: Remove conflicting permissive SELECT on contact_tags
-- ============================================

DROP POLICY IF EXISTS "Authenticated users can view contact tags" ON public.contact_tags;

-- ============================================
-- FIX 4: Remove conflicting permissive SELECT on conversation_sla
-- ============================================

DROP POLICY IF EXISTS "Authenticated users can view SLA" ON public.conversation_sla;
