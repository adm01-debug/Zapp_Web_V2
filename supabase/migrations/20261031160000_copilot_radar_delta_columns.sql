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

-- 3. comm_style: 20261031120000 criou como text[]; normaliza para text
--    (motor RADAR v4 usa string única, não array)
ALTER TABLE public.copilot_sessions
  ALTER COLUMN comm_style TYPE text USING (comm_style[1]);

ALTER TABLE public.copilot_sessions
  ALTER COLUMN comm_style DROP NOT NULL;

ALTER TABLE public.copilot_sessions
  ALTER COLUMN comm_style SET DEFAULT NULL;

-- 4. Perfil comportamental e sentimento detectado
ALTER TABLE public.copilot_sessions
  ADD COLUMN IF NOT EXISTS intent text;

ALTER TABLE public.copilot_sessions
  ADD COLUMN IF NOT EXISTS sentiment text;
