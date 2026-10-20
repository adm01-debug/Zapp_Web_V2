
-- Create a SECURITY DEFINER function that safely reads current role
CREATE OR REPLACE FUNCTION public.get_profile_role_for_check(p_user_id uuid)
RETURNS TABLE(role text, access_level text, permissions jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.role, p.access_level, p.permissions
  FROM profiles p
  WHERE p.user_id = p_user_id
  LIMIT 1;
$$;

-- Replace UPDATE policy with one that uses the security definer function
DROP POLICY IF EXISTS "Users can update own profile safe" ON public.profiles;

CREATE POLICY "Users can update own profile secure"
ON public.profiles FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND (
    is_admin_or_supervisor(auth.uid())
    OR (
      role = (SELECT r.role FROM public.get_profile_role_for_check(auth.uid()) r)
      AND access_level = (SELECT r.access_level FROM public.get_profile_role_for_check(auth.uid()) r)
      AND permissions = (SELECT r.permissions FROM public.get_profile_role_for_check(auth.uid()) r)
    )
  )
);

-- Also fix the duplicate audit_logs INSERT policies
DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON public.audit_logs;

-- Fix message_reactions INSERT: scope to assigned contacts
DROP POLICY IF EXISTS "Authenticated can insert reactions" ON public.message_reactions;
DROP POLICY IF EXISTS "Users can insert reactions" ON public.message_reactions;

CREATE POLICY "Users can insert reactions for assigned contacts"
ON public.message_reactions FOR INSERT TO authenticated
WITH CHECK (
  contact_id IN (
    SELECT c.id FROM public.contacts c
    WHERE c.assigned_to IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid())
  )
  OR is_admin_or_supervisor(auth.uid())
);
