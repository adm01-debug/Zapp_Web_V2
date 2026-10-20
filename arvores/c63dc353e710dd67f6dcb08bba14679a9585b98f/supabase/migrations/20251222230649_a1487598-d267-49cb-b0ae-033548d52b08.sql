-- Enable realtime for audit_logs to receive sentiment alerts in real-time
ALTER TABLE public.audit_logs REPLICA IDENTITY FULL;

-- Add table to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_logs;