-- 20260903225000_sla_first_response_v2
-- Correcoes P1 da auditoria de 5 agentes (run h439328):
-- 1) base do cronometro passa a ser a primeira mensagem do cliente AINDA SEM
--    resposta (nao mais a primeira mensagem do historico inteiro);
-- 2) registro via TRIGGER quando mensagem do atendente chega a status='sent';
-- 3) corrida de concorrencia fechada com advisory lock + indice unico parcial;
-- 4) first_response_at usa created_at exato da mensagem (sem drift de now()).

CREATE UNIQUE INDEX IF NOT EXISTS ux_conversation_sla_open_per_contact
  ON public.conversation_sla (contact_id)
  WHERE first_response_at IS NULL;

CREATE OR REPLACE FUNCTION public.register_first_response_internal(
  p_contact_id uuid,
  p_responded_at timestamptz,
  p_before_created_at timestamptz DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_first_message_at timestamptz;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_contact_id::text, 42));

  SELECT min(m.created_at)
  INTO v_first_message_at
  FROM public.messages m
  WHERE m.contact_id = p_contact_id
    AND m.sender = 'contact'
    AND m.created_at <= p_responded_at
    AND m.created_at > coalesce(
      (SELECT max(r.created_at)
       FROM public.messages r
       WHERE r.contact_id = p_contact_id
         AND r.sender = 'agent'
         AND r.created_at < coalesce(p_before_created_at, p_responded_at)),
      timestamptz '-infinity'
    );

  IF v_first_message_at IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.conversation_sla (contact_id, first_message_at, first_response_at, first_response_breached)
  VALUES (
    p_contact_id,
    v_first_message_at,
    p_responded_at,
    p_responded_at > v_first_message_at + interval '5 minutes'
  )
  ON CONFLICT (contact_id) WHERE first_response_at IS NULL
  DO UPDATE SET first_response_at = EXCLUDED.first_response_at,
                first_response_breached = EXCLUDED.first_response_breached;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_first_response(p_contact_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.contacts c
    WHERE c.id = p_contact_id
      AND (
        public.is_admin_or_supervisor(auth.uid())
        OR c.assigned_to IN (SELECT public.get_visible_agent_ids(auth.uid()))
        OR EXISTS (
          SELECT 1 FROM public.queue_members qm
          WHERE qm.queue_id = c.queue_id
            AND qm.profile_id = public.get_profile_id_for_user(auth.uid())
            AND qm.is_active = true
        )
      )
  ) THEN
    RAISE EXCEPTION 'nao autorizado para o contato %', p_contact_id
      USING ERRCODE = '42501';
  END IF;

  PERFORM public.register_first_response_internal(p_contact_id, now());
END;
$$;

REVOKE ALL ON FUNCTION public.mark_first_response(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_first_response(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.register_first_response_internal(uuid, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.messages_sla_first_response_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.register_first_response_internal(
    NEW.contact_id,
    NEW.created_at,
    NEW.created_at
  );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_messages_sla_first_response ON public.messages;
CREATE TRIGGER trg_messages_sla_first_response
  AFTER INSERT OR UPDATE OF status ON public.messages
  FOR EACH ROW
  WHEN (NEW.contact_id IS NOT NULL
        AND NEW.sender = 'agent'
        AND NEW.status = 'sent')
  EXECUTE FUNCTION public.messages_sla_first_response_trigger();
