-- CV-013: tabela copilot_insight_feedback
-- Cada interação do vendedor com uma sugestão do RADAR.
--
-- insight_id é nullable: quando o insight expira (90 dias) e é deletado,
-- o FK ON DELETE SET NULL preserva o feedback para sua própria janela
-- de retenção de 30 dias.
--
-- retained_at: preenchido por run_copilot_retention() quando o registro
-- expira (30 dias). Sentinel de idempotência: garante que todos os actions
-- (incluindo discarded/marked_wrong com final_text=NULL) sejam agregados
-- exatamente uma vez.

CREATE TABLE IF NOT EXISTS public.copilot_insight_feedback (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  insight_id      uuid        REFERENCES public.copilot_insights(id) ON DELETE SET NULL,
  session_id      uuid        NOT NULL REFERENCES public.copilot_sessions(id) ON DELETE CASCADE,
  profile_id      uuid        NOT NULL REFERENCES public.profiles(id),
  action          text        NOT NULL
                    CHECK (action IN ('used_as_is','edited_and_used','discarded','marked_wrong')),
  final_text_hash text,
  final_text      text,
  retained_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX copilot_insight_feedback_session_id ON public.copilot_insight_feedback (session_id);
CREATE INDEX copilot_insight_feedback_insight_id ON public.copilot_insight_feedback (insight_id);
CREATE INDEX copilot_insight_feedback_profile_id ON public.copilot_insight_feedback (profile_id);

ALTER TABLE public.copilot_insight_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY copilot_insight_feedback_own ON public.copilot_insight_feedback
  FOR ALL
  TO authenticated
  USING (profile_id IN (
    SELECT id FROM public.profiles WHERE user_id = auth.uid()
  ))
  WITH CHECK (
    profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    AND session_id IN (
      SELECT id FROM public.copilot_sessions
      WHERE profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    )
    AND (
      insight_id IS NULL
      OR insight_id IN (
        SELECT id FROM public.copilot_insights
        WHERE session_id IN (
          SELECT id FROM public.copilot_sessions
          WHERE profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
        )
      )
    )
  );

CREATE POLICY copilot_insight_feedback_service ON public.copilot_insight_feedback
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Guard: impede que clientes PostgREST escrevam retained_at diretamente.
-- Contexto PostgREST = request.jwt.claims presente; funções internas (SECURITY
-- DEFINER, service_role) não têm esse GUC e passam livremente.
CREATE OR REPLACE FUNCTION public.guard_copilot_insight_feedback_retained_at()
RETURNS trigger LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp' AS $$
BEGIN
  IF current_setting('request.jwt.claims', true) IS NOT NULL THEN
    IF TG_OP = 'INSERT' THEN
      NEW.retained_at := NULL;
    ELSE
      -- UPDATE: preserva o valor atual; se já retido, garante redação do texto
      NEW.retained_at := OLD.retained_at;
      IF OLD.retained_at IS NOT NULL THEN
        NEW.final_text := NULL;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER copilot_insight_feedback_retention_guard
  BEFORE INSERT OR UPDATE ON public.copilot_insight_feedback
  FOR EACH ROW EXECUTE FUNCTION public.guard_copilot_insight_feedback_retained_at();
