-- CV-012: tabela copilot_insights
-- Cada "pensamento" do RADAR: sugestão, alerta, próxima ação, objeção, sinal.

CREATE TABLE IF NOT EXISTS public.copilot_insights (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        uuid        NOT NULL REFERENCES public.copilot_sessions(id) ON DELETE CASCADE,
  type              text        NOT NULL
                      CHECK (type IN ('suggestion','alert','next_action','objection','signal')),
  content           text        NOT NULL,
  sources           jsonb       NOT NULL DEFAULT '[]',
  trigger_message_id uuid,
  model             text,
  cost_usd          numeric(10,6),
  latency_ms        integer,
  state_version     integer     NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX copilot_insights_session_created
  ON public.copilot_insights (session_id, created_at DESC);

ALTER TABLE public.copilot_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY copilot_insights_own ON public.copilot_insights
  FOR SELECT
  TO authenticated
  USING (session_id IN (
    SELECT id FROM public.copilot_sessions
     WHERE profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  ));

CREATE POLICY copilot_insights_service ON public.copilot_insights
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
