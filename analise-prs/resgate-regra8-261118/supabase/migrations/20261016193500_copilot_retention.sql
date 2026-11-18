-- CV-019: retenção e limpeza de dados do copiloto
-- Prazo: 90 dias insights, 30 dias feedback (texto redigido, action preservado).
--
-- Sentinel '' representa dimensão ausente nas agregações:
--   linha de insight → feedback_action = '' (sem ação de feedback)
--   linha de feedback → insight_type   = '' (sem tipo de insight)
--
-- Idempotência:
--   insights: agregados imediatamente antes do DELETE; após apagados,
--             nunca reaparecem no próximo run → sem double-count.
--   feedback: retained_at IS NULL → ainda não agregado (inclui todos os
--             actions: used_as_is, edited_and_used, discarded, marked_wrong).
--             Após agregação, retained_at = now() e final_text = NULL.
--             Próximo run: retained_at IS NOT NULL → não reagregado.

CREATE TABLE IF NOT EXISTS public.copilot_retention_aggregates (
  period_start    date        NOT NULL,
  profile_id      uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  insight_type    text        NOT NULL DEFAULT '',
  feedback_action text        NOT NULL DEFAULT '',
  count           integer     NOT NULL DEFAULT 0,
  PRIMARY KEY (period_start, profile_id, insight_type, feedback_action)
);

ALTER TABLE public.copilot_retention_aggregates ENABLE ROW LEVEL SECURITY;

-- Somente a função de retenção (SECURITY DEFINER, roda como service_role) acessa esta tabela.
-- O front nunca lê nem escreve nela diretamente.
CREATE POLICY "copilot_retention_aggregates_service"
  ON public.copilot_retention_aggregates
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.run_copilot_retention()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','pg_temp' AS $$
BEGIN
  -- 1. Agrega insights expirados antes de apagarlos.
  --    copilot_insights só tem session_id; JOIN copilot_sessions para obter profile_id.
  INSERT INTO public.copilot_retention_aggregates
    (period_start, profile_id, insight_type, feedback_action, count)
  SELECT date_trunc('day', i.created_at)::date, cs.profile_id, i.type, '', count(*)
  FROM public.copilot_insights i
  JOIN public.copilot_sessions cs ON cs.id = i.session_id
  WHERE i.created_at < now() - interval '90 days'
  GROUP BY 1,2,3,4
  ON CONFLICT (period_start, profile_id, insight_type, feedback_action)
    DO UPDATE SET count = copilot_retention_aggregates.count + EXCLUDED.count;

  -- 2. Apaga insights expirados; copilot_insight_feedback.insight_id vira NULL via ON DELETE SET NULL
  DELETE FROM public.copilot_insights
  WHERE created_at < now() - interval '90 days';

  -- 3. Agrega todos os feedbacks expirados ainda não retidos.
  --    copilot_insight_feedback já tem profile_id direto; sem necessidade de JOIN.
  INSERT INTO public.copilot_retention_aggregates
    (period_start, profile_id, insight_type, feedback_action, count)
  SELECT date_trunc('day', f.created_at)::date, f.profile_id, '', f.action, count(*)
  FROM public.copilot_insight_feedback f
  WHERE f.created_at < now() - interval '30 days'
    AND f.retained_at IS NULL
  GROUP BY 1,2,3,4
  ON CONFLICT (period_start, profile_id, insight_type, feedback_action)
    DO UPDATE SET count = copilot_retention_aggregates.count + EXCLUDED.count;

  -- 4. Marcar feedbacks como retidos e redigir texto
  UPDATE public.copilot_insight_feedback
     SET retained_at = now(),
         final_text  = NULL
   WHERE created_at < now() - interval '30 days'
     AND retained_at IS NULL;
END; $$;

-- Impede chamadas diretas de clientes autenticados via PostgREST.
-- pg_cron roda como postgres (superuser) e não é afetado pelo REVOKE.
REVOKE EXECUTE ON FUNCTION public.run_copilot_retention() FROM PUBLIC, authenticated;

-- Agendamento diário às 02:35 UTC via pg_cron (escalonado para evitar pico do minuto-zero)
SELECT cron.schedule('copilot-retention-daily', '35 2 * * *', $$SELECT public.run_copilot_retention()$$);
