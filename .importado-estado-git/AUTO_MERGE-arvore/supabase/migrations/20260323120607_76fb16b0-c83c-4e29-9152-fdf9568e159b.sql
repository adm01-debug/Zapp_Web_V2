
CREATE TABLE public.query_telemetry (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  operation TEXT NOT NULL DEFAULT 'select',
  table_name TEXT,
  rpc_name TEXT,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  record_count INTEGER,
  query_limit INTEGER,
  query_offset INTEGER,
  count_mode TEXT,
  severity TEXT NOT NULL DEFAULT 'normal',
  error_message TEXT,
  user_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_query_telemetry_created_at ON public.query_telemetry (created_at DESC);
CREATE INDEX idx_query_telemetry_severity ON public.query_telemetry (severity);

ALTER TABLE public.query_telemetry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read telemetry"
  ON public.query_telemetry FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert telemetry"
  ON public.query_telemetry FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can delete telemetry"
  ON public.query_telemetry FOR DELETE
  TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));
