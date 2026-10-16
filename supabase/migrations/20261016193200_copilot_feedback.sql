-- CV-013: tabela copilot_feedback
-- Cada interação do vendedor com uma sugestão do RADAR.

CREATE TABLE IF NOT EXISTS public.copilot_feedback (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  insight_id      uuid        NOT NULL REFERENCES public.copilot_insights(id) ON DELETE CASCADE,
  session_id      uuid        NOT NULL REFERENCES public.copilot_sessions(id) ON DELETE CASCADE,
  profile_id      uuid        NOT NULL REFERENCES public.profiles(id),
  action          text        NOT NULL
                    CHECK (action IN ('used_as_is','edited_and_used','discarded','marked_wrong')),
  final_text_hash text,
  final_text      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX copilot_feedback_session_id ON public.copilot_feedback (session_id);
CREATE INDEX copilot_feedback_profile_id ON public.copilot_feedback (profile_id);

ALTER TABLE public.copilot_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY copilot_feedback_own ON public.copilot_feedback
  FOR ALL
  TO authenticated
  USING (profile_id IN (
    SELECT id FROM public.profiles WHERE user_id = auth.uid()
  ))
  WITH CHECK (profile_id IN (
    SELECT id FROM public.profiles WHERE user_id = auth.uid()
  ));

CREATE POLICY copilot_feedback_service ON public.copilot_feedback
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
