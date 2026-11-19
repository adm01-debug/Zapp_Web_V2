-- 20260903120000_register_first_response
-- Registra o timestamp real da primeira resposta do atendente (SLA de 1a resposta).
-- Necessario porque a UI usava conversation.updatedAt (tempo de resolucao) como
-- first_response_at, gerando violacoes falsas; e ninguem escrevia first_response_at.
-- RLS de conversation_sla so permite escrita de admin/supervisor -> SECURITY DEFINER.



CREATE OR REPLACE FUNCTION public.mark_first_response(p_contact_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_first_message_at timestamptz;
  v_now timestamptz := now();
  v_row_id uuid;
BEGIN
  -- registro de SLA mais recente do contato ainda sem primeira resposta
  SELECT id
  INTO v_row_id
  FROM public.conversation_sla
  WHERE contact_id = p_contact_id
    AND first_response_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_row_id IS NOT NULL THEN
    -- pega a base do cronometro do proprio registro
    UPDATE public.conversation_sla
    SET first_response_at = v_now,
        first_response_breached = v_now > first_message_at + interval '5 minutes'
    WHERE id = v_row_id;
    RETURN;
  END IF;

  -- sem registro: cria um novo (base = 1a mensagem do cliente)
  SELECT min(m.created_at)
  INTO v_first_message_at
  FROM public.messages m
  WHERE m.contact_id = p_contact_id
    AND m.sender = 'contact';

  IF v_first_message_at IS NULL THEN
    -- sem mensagem do cliente, nao ha SLA de 1a resposta a registrar
    RETURN;
  END IF;

  -- se ja existe registro COM resposta, nao reabre (idempotente)
  IF EXISTS (
    SELECT 1 FROM public.conversation_sla
    WHERE contact_id = p_contact_id
      AND first_response_at IS NOT NULL
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.conversation_sla (contact_id, first_message_at, first_response_at, first_response_breached)
  VALUES (
    p_contact_id,
    v_first_message_at,
    v_now,
    v_now > v_first_message_at + interval '5 minutes'
  );
END;
$$;

-- So usuarios autenticados podem chamar; anon nao
REVOKE ALL ON FUNCTION public.mark_first_response(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_first_response(uuid) TO authenticated;
