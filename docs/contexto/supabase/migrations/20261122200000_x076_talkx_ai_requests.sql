CREATE TABLE IF NOT EXISTS public.talkx_ai_requests (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  kind         text        NOT NULL
               CHECK (kind IN ('insight_text', 'message_variation', 'segment_suggestion')),
  entity_type  text,
  entity_id    text,
  input_hash   text        NOT NULL,
  output       jsonb,
  model        text,
  tokens_in    integer     NOT NULL DEFAULT 0 CHECK (tokens_in  >= 0),
  tokens_out   integer     NOT NULL DEFAULT 0 CHECK (tokens_out >= 0),
  cost_usd     numeric(18, 8) CHECK (cost_usd IS NULL OR cost_usd >= 0),
  status       text        NOT NULL CHECK (status IN ('ok', 'error')),
  created_by   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now()
)

COMMENT ON TABLE public.talkx_ai_requests IS
  'X076 — trilha de toda chamada de IA do Talk X: teto mensal, limite diario e cache de 24 h. cost_usd NULO = sem tarifa em ai_model_prices, nunca zero.'

COMMENT ON COLUMN public.talkx_ai_requests.input_hash IS
  'SHA-256 do kind + entrada canonica. Mesmo hash dentro de 24 h devolve o output do cache sem pagar de novo.'

COMMENT ON COLUMN public.talkx_ai_requests.cost_usd IS
  'Custo medido pela tarifa vigente (ai_model_prices). NULO quando o modelo nao tem tarifa — nao somar como zero.'

CREATE INDEX IF NOT EXISTS talkx_ai_requests_cache_idx
  ON public.talkx_ai_requests (input_hash, created_at DESC)

CREATE INDEX IF NOT EXISTS talkx_ai_requests_usuario_dia_idx
  ON public.talkx_ai_requests (created_by, created_at DESC)

CREATE INDEX IF NOT EXISTS talkx_ai_requests_mes_idx
  ON public.talkx_ai_requests (created_at)

ALTER TABLE public.talkx_ai_requests ENABLE ROW LEVEL SECURITY

DROP POLICY IF EXISTS talkx_ai_requests_admin_read ON public.talkx_ai_requests

CREATE POLICY talkx_ai_requests_admin_read
  ON public.talkx_ai_requests
  FOR SELECT TO authenticated
  USING (COALESCE(public.is_admin_or_supervisor(auth.uid()), false))

REVOKE ALL ON public.talkx_ai_requests FROM anon

GRANT SELECT ON public.talkx_ai_requests TO authenticated

INSERT INTO public.talkx_settings (key, value, description) VALUES
  ('ai_monthly_budget_usd',       '0'::jsonb, 'Teto de gasto mensal de IA do Talk X em USD. 0 = IA desligada (padrao do item X076).'),
  ('ai_daily_requests_per_user',  '20'::jsonb, 'Limite de pedidos de IA por usuario por dia no Talk X.')
ON CONFLICT (key) DO NOTHING
