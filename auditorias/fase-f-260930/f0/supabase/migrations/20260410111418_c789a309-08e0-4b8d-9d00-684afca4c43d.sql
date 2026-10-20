
-- Block authenticated users from inserting arbitrary audit log entries
-- Only SECURITY DEFINER functions (like log_audit_event) should insert
CREATE POLICY "Block direct audit log inserts"
ON public.audit_logs
FOR INSERT
TO authenticated
WITH CHECK (false);

-- Remove calls and queue_positions from Realtime to prevent unauthorized subscriptions
ALTER PUBLICATION supabase_realtime DROP TABLE public.calls;
ALTER PUBLICATION supabase_realtime DROP TABLE public.queue_positions;
