-- 20260903233000_sla_base_only_valid_messages
-- Achado do cubic (PR #199): a base do cronometro usava max(created_at) de
-- QUALQUER mensagem do atendente, incluindo status 'sending'/'failed'.
-- Corrige: considera apenas mensagens com status ('sent','delivered','read').

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
         AND r.status IN ('sent','delivered','read')
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

REVOKE ALL ON FUNCTION public.register_first_response_internal(uuid, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
