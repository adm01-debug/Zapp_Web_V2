
-- Drop the overly permissive SELECT policy
DROP POLICY IF EXISTS "Authenticated users can view blacklist" ON public.talkx_blacklist;
DROP POLICY IF EXISTS "Anyone can view blacklist" ON public.talkx_blacklist;

-- Find and drop any SELECT policy with true condition
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies 
    WHERE tablename = 'talkx_blacklist' AND cmd = 'SELECT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.talkx_blacklist', pol.policyname);
  END LOOP;
END $$;

-- Create restricted SELECT policy for admins/supervisors only
CREATE POLICY "Only admins can view blacklist"
ON public.talkx_blacklist
FOR SELECT
TO authenticated
USING (public.is_admin_or_supervisor(auth.uid()));
