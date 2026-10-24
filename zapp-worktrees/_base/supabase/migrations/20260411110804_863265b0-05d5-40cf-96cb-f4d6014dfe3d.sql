-- Drop redundant SELECT policies
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view own role" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;

-- Create single consolidated SELECT policy
CREATE POLICY "Users view own roles, admins view all"
ON public.user_roles
FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR is_admin_or_supervisor(auth.uid()));