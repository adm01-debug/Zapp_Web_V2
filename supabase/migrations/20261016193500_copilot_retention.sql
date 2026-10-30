-- CV-019: retenção e limpeza de dados do copiloto
-- Prazo: 90 dias insights, 30 dias texto de feedback. Decisão D5 em aberto.
--
-- Sentinel '' (string vazia) representa dimensão ausente nas agregações:
--   linha de insight → feedback_action = '' (sem ação de feedback)
--   linha de feedback → insight_type  = '' (sem tipo de insight)
-- Isso evita violação NOT NULL implícita dos campos que compõem a PK.

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
  -- Agrega insights expirados; feedback_action ausente → sentinel ''
  INSERT INTO public.copilot_retention_aggregates
    (period_start, session_id, insight_type, feedback_action, count)
  SELECT date_trunc('day', i.created_at)::date, i.session_id, i.type, '', count(*)
  FROM public.copilot_insights i
  WHERE i.created_at < now() - interval '90 days'
  GROUP BY 1,2,3,4
  ON CONFLICT (period_start, session_id, insight_type, feedback_action)
    DO UPDATE SET count = copilot_retention_aggregates.count + EXCLUDED.count;

  -- Agrega feedbacks expirados; insight_type ausente → sentinel ''
  INSERT INTO public.copilot_retention_aggregates
    (period_start, session_id, insight_type, feedback_action, count)
  SELECT date_trunc('day', f.created_at)::date, f.session_id, '', f.action, count(*)
  FROM public.copilot_feedback f
  WHERE f.created_at < now() - interval '30 days'
  GROUP BY 1,2,3,4
  ON CONFLICT (period_start, session_id, insight_type, feedback_action)
    DO UPDATE SET count = copilot_retention_aggregates.count + EXCLUDED.count;

  -- Só apaga insight se nenhum feedback seu está dentro da janela de 30 dias
  DELETE FROM public.copilot_insights
  WHERE created_at < now() - interval '90 days'
    AND id NOT IN (
      SELECT DISTINCT insight_id
      FROM public.copilot_feedback
      WHERE created_at >= now() - interval '30 days'
    );

  UPDATE public.copilot_feedback
     SET final_text = NULL
   WHERE created_at < now() - interval '30 days' AND final_text IS NOT NULL;
END; $$;
