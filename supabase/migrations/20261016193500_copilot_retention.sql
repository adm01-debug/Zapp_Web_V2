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
  session_id      uuid        NOT NULL,
  insight_type    text        NOT NULL DEFAULT '',
  feedback_action text        NOT NULL DEFAULT '',
  count           integer     NOT NULL DEFAULT 0,
  PRIMARY KEY (period_start, session_id, insight_type, feedback_action)
);

CREATE OR REPLACE FUNCTION public.run_copilot_retention()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','pg_temp' AS $$
BEGIN
  -- 1. Agrega insights expirados antes de apagarlos
  INSERT INTO public.copilot_retention_aggregates
    (period_start, session_id, insight_type, feedback_action, count)
  SELECT date_trunc('day', i.created_at)::date, i.session_id, i.type, '', count(*)
  FROM public.copilot_insights i
  WHERE i.created_at < now() - interval '90 days'
  GROUP BY 1,2,3,4
  ON CONFLICT (period_start, session_id, insight_type, feedback_action)
    DO UPDATE SET count = copilot_retention_aggregates.count + EXCLUDED.count;

  -- 2. Apaga insights expirados; copilot_insight_feedback.insight_id vira NULL via ON DELETE SET NULL
  DELETE FROM public.copilot_insights
  WHERE created_at < now() - interval '90 days';

  -- 3. Agrega todos os feedbacks expirados ainda não retidos
  --    (retained_at IS NULL cobre todos os actions, incluindo discarded/marked_wrong
  --     que nunca tiveram final_text)
  INSERT INTO public.copilot_retention_aggregates
    (period_start, session_id, insight_type, feedback_action, count)
  SELECT date_trunc('day', f.created_at)::date, f.session_id, '', f.action, count(*)
  FROM public.copilot_insight_feedback f
  WHERE f.created_at < now() - interval '30 days'
    AND f.retained_at IS NULL
  GROUP BY 1,2,3,4
  ON CONFLICT (period_start, session_id, insight_type, feedback_action)
    DO UPDATE SET count = copilot_retention_aggregates.count + EXCLUDED.count;

  -- 4. Marcar feedbacks como retidos e redigir texto
  UPDATE public.copilot_insight_feedback
     SET retained_at = now(),
         final_text  = NULL
   WHERE created_at < now() - interval '30 days'
     AND retained_at IS NULL;
END; $$;
