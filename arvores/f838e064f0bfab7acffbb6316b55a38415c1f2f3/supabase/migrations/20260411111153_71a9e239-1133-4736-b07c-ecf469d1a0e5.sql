-- Drop redundant INSERT policies
DROP POLICY IF EXISTS "Authenticated can request own reset" ON public.password_reset_requests;
DROP POLICY IF EXISTS "Users can request password reset" ON public.password_reset_requests;

-- Create single INSERT policy that enforces reset_token IS NULL
CREATE POLICY "Users can request own password reset"
ON public.password_reset_requests
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid() AND reset_token IS NULL);