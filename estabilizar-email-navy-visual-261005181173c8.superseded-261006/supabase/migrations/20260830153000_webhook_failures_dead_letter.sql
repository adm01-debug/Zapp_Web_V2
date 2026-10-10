-- E35: Dead-letter table para webhooks que explodem no processamento
CREATE TABLE IF NOT EXISTS public.webhook_failures (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint          TEXT NOT NULL,
  event_type        TEXT,
  instance          TEXT,
  payload_truncated JSONB,
  payload_sha256    TEXT,
  error_message     TEXT NOT NULL,
  error_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  retry_count       INT NOT NULL DEFAULT 0,
  resolved          BOOLEAN NOT NULL DEFAULT false,
  resolved_at       TIMESTAMPTZ
);
ALTER TABLE public.webhook_failures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_full" ON public.webhook_failures USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS webhook_failures_endpoint_idx ON public.webhook_failures (endpoint, error_at DESC);
CREATE INDEX IF NOT EXISTS webhook_failures_resolved_idx ON public.webhook_failures (resolved, error_at DESC) WHERE NOT resolved;
COMMENT ON TABLE public.webhook_failures IS 'Dead-letter: eventos de webhook que falharam no processamento. Payload truncado + erro para diagnóstico e replay.';
