-- CV-052-delta: Colunas do motor RADAR v4 e atomicidade do copilot-tick
-- Complementa CV-011 (20261030100000), CV-012 (20261030110000) e
-- CV-031/037/038/039 (20261031120000) sem modificá-las.

-- 1. Cursor de posição do tick (evita reprocessamento de mensagens)
ALTER TABLE public.copilot_sessions
  ADD COLUMN IF NOT EXISTS last_processed_message_at timestamptz;

-- 2. Tier de inferência, latência e payload extra nos insights
ALTER TABLE public.copilot_insights
  ADD COLUMN IF NOT EXISTS tier smallint NOT NULL DEFAULT 1
    CHECK (tier IN (1, 2));

ALTER TABLE public.copilot_insights
  ADD COLUMN IF NOT EXISTS latency_ms integer;

ALTER TABLE public.copilot_insights
  ADD COLUMN IF NOT EXISTS data jsonb;

-- 3. comm_style: garante tipo text nullable.
--    Se a coluna já é text (20261030200000 corrigida ou produção prévia), não-op.
--    Se ainda for text[] (20261031120000 legada), converte com guard de dados.
DO $$
DECLARE
  v_type text;
BEGIN
  SELECT data_type INTO v_type
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name   = 'copilot_sessions'
     AND column_name  = 'comm_style';

  IF v_type = 'ARRAY' THEN
    -- Guard: aborta se alguma linha tiver mais de um elemento (invariante de dados).
    IF EXISTS (
      SELECT 1 FROM public.copilot_sessions
      WHERE array_length(comm_style, 1) > 1
    ) THEN
      RAISE EXCEPTION
        'comm_style conversion: existem linhas com múltiplos elementos, abortar migration';
    END IF;

    -- Remove o default array antes de mudar o tipo.
    ALTER TABLE public.copilot_sessions ALTER COLUMN comm_style DROP DEFAULT;
    ALTER TABLE public.copilot_sessions ALTER COLUMN comm_style TYPE text USING (comm_style[1]);
    ALTER TABLE public.copilot_sessions ALTER COLUMN comm_style DROP NOT NULL;
    ALTER TABLE public.copilot_sessions ALTER COLUMN comm_style SET DEFAULT NULL;
  END IF;
  -- Se v_type = 'text': coluna já está correta, não-op.
END$$;

-- 4. Perfil comportamental e sentimento detectado
ALTER TABLE public.copilot_sessions
  ADD COLUMN IF NOT EXISTS intent text;

ALTER TABLE public.copilot_sessions
  ADD COLUMN IF NOT EXISTS sentiment text;
