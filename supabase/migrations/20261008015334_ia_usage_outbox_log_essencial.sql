-- ia_usage_outbox_log_essencial
-- Rollback: DROP TABLE IF EXISTS public.ai_usage_outbox;

CREATE TABLE public.ai_usage_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text,
  payload jsonb NOT NULL,
  motivo text NOT NULL,
  tentativas integer NOT NULL DEFAULT 0,
  processed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT ai_usage_outbox_tentativas_nonnegative CHECK (tentativas >= 0),
  CONSTRAINT ai_usage_outbox_event_id_length CHECK (event_id IS NULL OR char_length(event_id) <= 200)
);

CREATE UNIQUE INDEX ai_usage_outbox_event_id_unique
  ON public.ai_usage_outbox (event_id)
  WHERE event_id IS NOT NULL;

CREATE INDEX ai_usage_outbox_pendentes_idx
  ON public.ai_usage_outbox (tentativas ASC, created_at ASC)
  WHERE processed_at IS NULL;

ALTER TABLE public.ai_usage_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_usage_outbox FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_usage_outbox TO service_role;

CREATE POLICY "Service role can manage AI usage outbox"
ON public.ai_usage_outbox
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

COMMENT ON TABLE public.ai_usage_outbox IS
  'Pendencias duraveis do log essencial de consumo de IA quando ai_usage_logs nao aceitou a escrita.';
COMMENT ON COLUMN public.ai_usage_outbox.event_id IS
  'Identificador externo opcional para idempotencia futura; NULL para pendencias criadas apenas a partir da linha de consumo.';
COMMENT ON COLUMN public.ai_usage_outbox.payload IS
  'JSONB com a linha de ai_usage_logs em payload.linha, reprocessada por supabase/functions/_shared/ai-usage.ts.';
