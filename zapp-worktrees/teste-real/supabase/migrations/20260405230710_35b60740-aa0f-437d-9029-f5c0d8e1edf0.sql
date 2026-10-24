
-- 1. FIX PROFILES: Replace permissive UPDATE policies with proper RESTRICTIVE approach
-- Drop existing UPDATE policies
DROP POLICY IF EXISTS "Users can update own non-sensitive profile fields" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;

-- Admin/supervisor can update any profile (permissive)
CREATE POLICY "Admins can update any profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (is_admin_or_supervisor(auth.uid()))
WITH CHECK (is_admin_or_supervisor(auth.uid()));

-- Users can update their own profile (permissive for USING)
CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- RESTRICTIVE policy: prevent non-admins from changing sensitive fields
-- This policy MUST pass in addition to any permissive policy
CREATE POLICY "Block sensitive field changes by non-admins"
ON public.profiles
AS RESTRICTIVE
FOR UPDATE
TO authenticated
WITH CHECK (
  -- Admins/supervisors can change anything
  is_admin_or_supervisor(auth.uid())
  OR
  -- Non-admins: sensitive fields must remain unchanged
  (
    role = (SELECT p.role FROM profiles p WHERE p.user_id = auth.uid())
    AND access_level = (SELECT p.access_level FROM profiles p WHERE p.user_id = auth.uid())
    AND permissions = (SELECT p.permissions FROM profiles p WHERE p.user_id = auth.uid())
    AND is_active = (SELECT p.is_active FROM profiles p WHERE p.user_id = auth.uid())
  )
);

-- 2. FIX GMAIL ACCOUNTS: Add SELECT policy for owners (safe fields only via view)
-- The gmail_accounts_safe view uses security_invoker, so it needs a SELECT policy on the base table
CREATE POLICY "Users can view own gmail account"
ON public.gmail_accounts
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);
