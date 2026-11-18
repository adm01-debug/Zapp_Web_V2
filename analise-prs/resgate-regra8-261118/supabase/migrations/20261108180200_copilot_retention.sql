-- CV-143: Agregados de retenção do copiloto RADAR
-- Tabela + função de agregação periódica para analytics de uso do copiloto.
-- Sem dados destrutivos; usa INSERT ... ON CONFLICT DO UPDATE (upsert por dia/profile).

CREATE TABLE IF NOT EXISTS public.copilot_retention_aggregates (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agg_date        date        NOT NULL,
  sessions_opened integer     NOT NULL DEFAULT 0,
  ticks_processed integer     NOT NULL DEFAULT 0,
  insights_gen    integer     NOT NULL DEFAULT 0,
  brinde_complete integer     NOT NULL DEFAULT 0, -- sessões com brinde_meter = 6
  avg_temperature numeric(5,2),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, agg_date)
);

CREATE INDEX IF NOT EXISTS idx_copilot_retention_profile_date
  ON public.copilot_retention_aggregates (profile_id, agg_date DESC);

-- Índice em copilot_insights.created_at para o JOIN diário de retenção.
CREATE INDEX IF NOT EXISTS idx_copilot_insights_created_at
  ON public.copilot_insights (created_at);

ALTER TABLE public.copilot_retention_aggregates ENABLE ROW LEVEL SECURITY;

-- Idempotência: DROP antes de CREATE.
DROP POLICY IF EXISTS "own_retention" ON public.copilot_retention_aggregates;
CREATE POLICY "own_retention" ON public.copilot_retention_aggregates
  FOR SELECT USING (profile_id = auth.uid());

DROP POLICY IF EXISTS "service_role_retention" ON public.copilot_retention_aggregates;
CREATE POLICY "service_role_retention" ON public.copilot_retention_aggregates
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Função de agregação: computa métricas do dia anterior e faz upsert.
CREATE OR REPLACE FUNCTION public.run_copilot_retention()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_target_date date := current_date - 1;
BEGIN
  INSERT INTO public.copilot_retention_aggregates (
    profile_id,
    agg_date,
    sessions_opened,
    ticks_processed,
    insights_gen,
    brinde_complete,
    avg_temperature,
    updated_at
  )
  SELECT
    s.profile_id,
    v_target_date,
    COUNT(DISTINCT s.id)                                           AS sessions_opened,
    -- ticks_processed: ai_jobs de kind 'copilot_tick' enfileirados p/ a sessão no dia
    (SELECT COUNT(*)
       FROM public.ai_jobs j
      WHERE j.payload->>'session_id' = s.id::text
        AND j.kind = 'copilot_tick'
        AND j.available_at >= v_target_date
        AND j.available_at <  v_target_date + 1)                  AS ticks_processed,
    COUNT(DISTINCT i.id)                                           AS insights_gen,
    COUNT(DISTINCT s.id) FILTER (WHERE s.brinde_meter = 6)         AS brinde_complete,
    AVG(s.temperature)                                             AS avg_temperature
  FROM public.copilot_sessions s
  LEFT JOIN public.copilot_insights i
    ON i.session_id = s.id
   AND i.created_at >= v_target_date
   AND i.created_at <  v_target_date + 1
  WHERE s.started_at >= v_target_date
    AND s.started_at <  v_target_date + 1
  GROUP BY s.profile_id
  ON CONFLICT (profile_id, agg_date)
  DO UPDATE SET
    sessions_opened = EXCLUDED.sessions_opened,
    ticks_processed = EXCLUDED.ticks_processed,
    insights_gen    = EXCLUDED.insights_gen,
    brinde_complete = EXCLUDED.brinde_complete,
    avg_temperature = EXCLUDED.avg_temperature,
    updated_at      = now();
END;
$$;

REVOKE ALL ON FUNCTION public.run_copilot_retention() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_copilot_retention() TO service_role;

-- Agendar execução diária às 02:00 UTC.
-- Idempotência: unschedule antes de recriar para evitar jobs duplicados em re-apply.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('copilot-retention-daily');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    PERFORM cron.schedule(
      'copilot-retention-daily',
      '0 2 * * *',
      $cmd$SELECT public.run_copilot_retention();$cmd$
    );
  END IF;
END;
$$;

COMMENT ON TABLE public.copilot_retention_aggregates IS
  'CV-143 — agregados diários de uso do copiloto RADAR por atendente.';
COMMENT ON FUNCTION public.run_copilot_retention IS
  'CV-143 — computa e armazena métricas do dia anterior; executado pelo cron às 02:00 UTC.';
