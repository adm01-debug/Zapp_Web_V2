-- CV-142: Tabela de presença do copiloto — quem está visualizando qual conversa
-- TTL de 90 s (mantido via upsert periódico do front); copilot-live usa para
-- evitar processar contexto duplicado quando o agente não está mais presente.

CREATE TABLE IF NOT EXISTS public.copilot_presence (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id uuid        NOT NULL,
  session_id      uuid        REFERENCES public.copilot_sessions(id) ON DELETE SET NULL,
  last_seen_at    timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '90 seconds'),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, conversation_id)
);

CREATE INDEX IF NOT EXISTS idx_copilot_presence_conversation
  ON public.copilot_presence (conversation_id)
  WHERE expires_at > now();

CREATE INDEX IF NOT EXISTS idx_copilot_presence_expires
  ON public.copilot_presence (expires_at);

ALTER TABLE public.copilot_presence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_presence" ON public.copilot_presence
  FOR ALL USING (profile_id = auth.uid());

CREATE POLICY "service_role_presence" ON public.copilot_presence
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- RPC upsert_copilot_presence: atualiza ou cria presença do usuário autenticado.
CREATE OR REPLACE FUNCTION public.upsert_copilot_presence(
  p_conversation_id uuid,
  p_session_id      uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  INSERT INTO public.copilot_presence (profile_id, conversation_id, session_id, last_seen_at, expires_at)
  VALUES (
    auth.uid(),
    p_conversation_id,
    p_session_id,
    now(),
    now() + interval '90 seconds'
  )
  ON CONFLICT (profile_id, conversation_id)
  DO UPDATE SET
    last_seen_at = now(),
    expires_at   = now() + interval '90 seconds',
    session_id   = COALESCE(EXCLUDED.session_id, copilot_presence.session_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_copilot_presence(uuid, uuid) TO authenticated;

-- RPC copilot_has_presence: retorna se o usuário autenticado está presente na conversa.
CREATE OR REPLACE FUNCTION public.copilot_has_presence(
  p_conversation_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.copilot_presence
    WHERE profile_id      = auth.uid()
      AND conversation_id = p_conversation_id
      AND expires_at      > now()
  );
$$;

GRANT EXECUTE ON FUNCTION public.copilot_has_presence(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.copilot_has_presence(uuid) TO service_role;

-- Job cron para limpeza de registros expirados (roda de 5 em 5 min).
-- Requer pg_cron; falha silenciosa se não estiver disponível.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'copilot-presence-cleanup',
      '*/5 * * * *',
      $$DELETE FROM public.copilot_presence WHERE expires_at < now() - interval '5 minutes';$$
    );
  END IF;
END;
$$;

COMMENT ON TABLE public.copilot_presence IS
  'CV-142 — presença do atendente em uma conversa; TTL 90 s via upsert periódico.';
