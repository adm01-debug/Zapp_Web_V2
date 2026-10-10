-- Fix 1: Allow agents to view their own deal activities
CREATE POLICY "Agents can view activities on their deals"
ON public.deal_activities
FOR SELECT
TO authenticated
USING (
  public.is_admin_or_supervisor(auth.uid())
  OR performed_by = public.get_profile_id_for_user(auth.uid())
  OR deal_id IN (
    SELECT sd.id FROM public.sales_deals sd
    WHERE sd.assigned_to = public.get_profile_id_for_user(auth.uid())
  )
);

-- Fix 2: Ensure login_attempts INSERT is properly restricted (service role only)
-- Drop the existing INSERT policy that uses WITH CHECK (false) which is confusing
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'login_attempts' 
    AND policyname = 'No direct insert for authenticated users'
  ) THEN
    DROP POLICY "No direct insert for authenticated users" ON public.login_attempts;
  END IF;
END $$;

-- Recreate with clear naming - only service role can insert (RLS bypassed for service role)
CREATE POLICY "Authenticated users cannot insert login attempts"
ON public.login_attempts
FOR INSERT
TO authenticated
WITH CHECK (false);

-- Ensure the SELECT policy exists and is restrictive
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'login_attempts' 
    AND policyname = 'Only admins can view login attempts'
  ) THEN
    CREATE POLICY "Only admins can view login attempts"
    ON public.login_attempts
    FOR SELECT
    TO authenticated
    USING (public.is_admin_or_supervisor(auth.uid()));
  END IF;
END $$;