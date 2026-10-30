-- CV-017: presença — "alguém está olhando esta conversa?"
-- TTL 90 s: linha fica stale após fechar a aba.

CREATE TABLE IF NOT EXISTS public.copilot_presence (
  session_id  uuid        NOT NULL REFERENCES public.copilot_sessions(id) ON DELETE CASCADE,
  profile_id  uuid        NOT NULL REFERENCES public.profiles(id),
  expires_at  timestamptz NOT NULL DEFAULT now() + interval '90 seconds',
  PRIMARY KEY (session_id, profile_id)
);

CREATE INDEX copilot_presence_session ON public.copilot_presence (session_id);

ALTER TABLE public.copilot_presence ENABLE ROW LEVEL SECURITY;

CREATE POLICY copilot_presence_own ON public.copilot_presence
  FOR ALL TO authenticated
  USING (profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()))
  WITH CHECK (
    profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    AND session_id IN (
      SELECT id FROM public.copilot_sessions
      WHERE profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    )
    AND expires_at <= now() + interval '5 minutes'
  );

CREATE POLICY copilot_presence_service ON public.copilot_presence
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.upsert_copilot_presence(p_session_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','pg_temp' AS $$
DECLARE v_profile_id uuid;
BEGIN
  SELECT id INTO v_profile_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
  IF v_profile_id IS NULL THEN RETURN; END IF;
  -- Verifica que a sessão pertence ao perfil do chamador
  IF NOT EXISTS (
    SELECT 1 FROM public.copilot_sessions
    WHERE id = p_session_id AND profile_id = v_profile_id
  ) THEN RETURN; END IF;
  INSERT INTO public.copilot_presence (session_id, profile_id, expires_at)
  VALUES (p_session_id, v_profile_id, now() + interval '90 seconds')
  ON CONFLICT (session_id, profile_id) DO UPDATE SET expires_at = now() + interval '90 seconds';
END; $$;

CREATE OR REPLACE FUNCTION public.copilot_has_presence(p_session_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public','pg_temp' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.copilot_presence cp
    JOIN public.copilot_sessions cs ON cs.id = cp.session_id
    JOIN public.profiles p ON p.id = cs.profile_id
     WHERE cp.session_id = p_session_id
       AND cp.expires_at > now()
       AND p.user_id = auth.uid()
  );
$$;
