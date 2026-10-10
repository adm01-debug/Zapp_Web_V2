
-- Connection health check logs table
CREATE TABLE public.connection_health_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  connection_id UUID REFERENCES public.whatsapp_connections(id) ON DELETE CASCADE NOT NULL,
  instance_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unknown',
  response_time_ms INTEGER,
  error_message TEXT,
  checked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for fast queries
CREATE INDEX idx_health_logs_connection_checked ON public.connection_health_logs(connection_id, checked_at DESC);
CREATE INDEX idx_health_logs_checked_at ON public.connection_health_logs(checked_at DESC);

-- Enable RLS
ALTER TABLE public.connection_health_logs ENABLE ROW LEVEL SECURITY;

-- Only admin/supervisor can view
CREATE POLICY "Admins can view health logs" ON public.connection_health_logs
  FOR SELECT TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));

-- Service role inserts (from edge function)
CREATE POLICY "Service can insert health logs" ON public.connection_health_logs
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Webhook rate limit tracking table
CREATE TABLE public.webhook_rate_limits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instance_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_count INTEGER NOT NULL DEFAULT 1,
  window_start TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_rate_limits_instance_window ON public.webhook_rate_limits(instance_id, window_start DESC);

ALTER TABLE public.webhook_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view rate limits" ON public.webhook_rate_limits
  FOR SELECT TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));

-- Add last_health_check and health_status columns to whatsapp_connections
ALTER TABLE public.whatsapp_connections 
  ADD COLUMN IF NOT EXISTS last_health_check TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS health_status TEXT DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS health_response_ms INTEGER;

-- Enable realtime for health logs
ALTER PUBLICATION supabase_realtime ADD TABLE public.connection_health_logs;
