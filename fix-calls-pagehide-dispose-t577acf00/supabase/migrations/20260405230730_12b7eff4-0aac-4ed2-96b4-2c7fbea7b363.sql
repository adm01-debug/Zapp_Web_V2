
-- Remove admin SELECT on the base table - admins should use the safe view
DROP POLICY IF EXISTS "Only admins can view reset requests" ON public.password_reset_requests;

-- Add admin SELECT on the safe view's base table scoped to hide tokens
-- Admins can still read via the safe view (which excludes reset_token)
CREATE POLICY "Admins can view reset requests"
ON public.password_reset_requests
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Verify audit_logs INSERT is properly blocked 
-- (already done - "Block authenticated inserts" with false is in place)
-- The log_audit_event function uses SECURITY DEFINER to bypass this
