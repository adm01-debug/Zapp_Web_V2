-- CV-011: SessÃµes do copiloto de vendas RADAR
-- Uma linha por conversa monitorada; armazena estado BÂ·RÂ·IÂ·NÂ·DÂ·E, estÃ¡gio e temperatura.

CREATE TABLE IF NOT EXISTS public.copilot_sessions (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id     uuid        NOT NULL,
  contact_id          uuid        NOT NULL,
  profile_id          uuid        NOT NULL REFERENCES auth.users(id),
  -- BÂ·RÂ·IÂ·NÂ·DÂ·E
  brinde_budget       text,
  brinde_responsible  text,
  brinde_intention    text,
  brinde_quantity     integer,
  brinde_deadline     date,
  brinde_delivery     text,
  brinde_meter        integer     NOT NULL DEFAULT 0
    CHECK (brinde_meter >= 0 AND brinde_meter <= 6),
  -- EstÃ¡gio e temperatura
  sale_stage          text        NOT NULL DEFAULT 'novo_contato'
    CHECK (sale_stage IN (
      'novo_contato','qualificando','apresentando','negociando',
      'fechando','pos_venda','perdido'
    )),
  temperature         integer     NOT NULL DEFAULT 0
    CHECK (temperature >= 0 AND temperature <= 100),
  state_version       integer     NOT NULL DEFAULT 1,
  -- Timestamps
  started_at          timestamptz NOT NULL DEFAULT now(),
  last_tick_at        timestamptz,
  closed_at           timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id)
);

CREATE INDEX IF NOT EXISTS idx_copilot_sessions_profile
  ON public.copilot_sessions (profile_id);

CREATE INDEX IF NOT EXISTS idx_copilot_sessions_temperature
  ON public.copilot_sessions (temperature DESC);

ALTER TABLE public.copilot_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vendor_own_sessions" ON public.copilot_sessions
  FOR ALL USING (profile_id = auth.uid());

CREATE POLICY "service_role_sessions" ON public.copilot_sessions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.copilot_sessions_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END>Ê$$

CREATE TRIGGER trg_copilot_sessions_updated_at
  BEFORE UPDATE ON public.copilot_sessions
  FOR EACH ROW EXECUTE4T5D”ôâTeTä5D”ôâV&Æ–2æ6÷–Æ÷E÷6W76–öç5÷WFFVEöB‚“°