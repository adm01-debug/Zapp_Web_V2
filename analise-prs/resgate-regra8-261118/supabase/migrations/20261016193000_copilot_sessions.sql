-- CV-011: tabela copilot_sessions
-- Uma linha por contato acompanhado; estado B·R·I·N·D·E, etapa, temperatura, versão.

CREATE TABLE IF NOT EXISTS public.copilot_sessions (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id              uuid        NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  whatsapp_connection_id  uuid        NOT NULL,
  profile_id              uuid        NOT NULL REFERENCES public.profiles(id),
  stage                   text        NOT NULL DEFAULT 'E1'
                            CHECK (stage IN ('E1','E2','E3','E4','E5','E6')),
  brinde_state            jsonb       NOT NULL DEFAULT
                            '{"B":null,"R":null,"I":null,"N":null,"D":null,"E":null}',
  temperature             smallint    NOT NULL DEFAULT 0 CHECK (temperature BETWEEN 0 AND 10),
  state_version           integer     NOT NULL DEFAULT 0,
  last_contact_message_at timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contact_id, whatsapp_connection_id)
);

CREATE INDEX copilot_sessions_profile_id ON public.copilot_sessions (profile_id);

ALTER TABLE public.copilot_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY copilot_sessions_own ON public.copilot_sessions
  FOR ALL
  TO authenticated
  USING (profile_id IN (
    SELECT id FROM public.profiles WHERE user_id = auth.uid()
  ));

CREATE POLICY copilot_sessions_service ON public.copilot_sessions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.touch_copilot_sessions_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_touch_copilot_sessions
  BEFORE UPDATE ON public.copilot_sessions
  FOR EACH ROW EXECUTE FUNCTION public.touch_copilot_sessions_updated_at();
