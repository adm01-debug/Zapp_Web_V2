
-- Drop the blocking INSERT policy
DROP POLICY IF EXISTS "Block authenticated inserts on audit_logs" ON public.audit_logs;

-- Allow authenticated users to insert their own audit logs
CREATE POLICY "Users can insert own audit logs"
ON public.audit_logs
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());
