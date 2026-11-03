-- 1. Gmail accounts: revoke direct SELECT from authenticated, force use of safe view
DROP POLICY IF EXISTS "Users can view own gmail accounts" ON public.gmail_accounts;

CREATE POLICY "Only service role and admins can view gmail accounts"
ON public.gmail_accounts FOR SELECT
TO authenticated
USING (is_admin_or_supervisor(auth.uid()));

-- 2. Profiles: split UPDATE policy into safe and admin-only
DROP POLICY IF EXISTS "Users can update own profile secure" ON public.profiles;

-- Users can update their own NON-SENSITIVE fields only
CREATE POLICY "Users can update own non-sensitive profile fields"
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND role = ( SELECT p.role FROM public.profiles p WHERE p.user_id = auth.uid() )
  AND access_level = ( SELECT p.access_level FROM public.profiles p WHERE p.user_id = auth.uid() )
  AND permissions = ( SELECT p.permissions FROM public.profiles p WHERE p.user_id = auth.uid() )
);

-- Admins can update any profile including sensitive fields
CREATE POLICY "Admins can update any profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (is_admin_or_supervisor(auth.uid()))
WITH CHECK (is_admin_or_supervisor(auth.uid()));
