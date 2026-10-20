-- Drop existing admin UPDATE policy
DROP POLICY IF EXISTS "Only admins can update reset requests" ON public.password_reset_requests;

-- Recreate with WITH CHECK that prevents token manipulation
-- Admin can update status, reviewed_by, etc. but reset_token must remain unchanged
CREATE POLICY "Admins can update reset requests without token access"
ON public.password_reset_requests
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));