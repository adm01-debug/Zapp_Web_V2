CREATE OR REPLACE FUNCTION public.apply_client_wallet(p_contact_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_contact  public.contacts%ROWTYPE;
  v_agent    uuid;
  v_actor    uuid;
  v_updated  integer;
BEGIN
  -- Autorização ANTES de qualquer leitura/escrita, pela MESMA identidade que os
  -- guards de public.contacts usam (resolve_contact_guard_actor): NULL = backend
  -- autorizado (claim E papel de banco = service_role, ou sessão superusuária);
  -- uuid = quem chamou. Contexto sem identidade autorizada levanta 42501 aqui,
  -- então nenhuma chamada barrada chega a escrever.
  v_actor := public.resolve_contact_guard_actor();

  IF v_actor IS NOT NULL AND NOT public.is_admin_or_supervisor(v_actor) THEN
    RAISE EXCEPTION 'apply_client_wallet: operacao restrita a service_role e staff (admin/supervisor)'
      USING ERRCODE = '42501';
  END IF;

  IF p_contact_id IS NULL THEN
    RAISE EXCEPTION 'apply_client_wallet: p_contact_id e obrigatorio'
      USING ERRCODE = '22023';
  END IF;

  -- Trava a linha: a decisão (sem atribuição) e a gravação ficam na mesma transação.
  SELECT * INTO v_contact
    FROM public.contacts
   WHERE id = p_contact_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;  -- contato inexistente: nada a fazer, sem erro
  END IF;

  -- Idempotente: contato já atribuído nunca é reatribuído.
  IF v_contact.assigned_to IS NOT NULL THEN
    RETURN NULL;
  END IF;

  -- Primeira regra ativa que casa a conexão do contato, cujo agente esteja ativo.
  SELECT r.agent_id
    INTO v_agent
    FROM public.client_wallet_rules r
    JOIN public.profiles p ON p.id = r.agent_id
   WHERE r.is_active IS TRUE
     AND p.is_active IS TRUE
     AND (r.whatsapp_connection_id IS NULL
          OR r.whatsapp_connection_id = v_contact.whatsapp_connection_id)
   ORDER BY r.priority DESC, r.created_at ASC, r.id ASC
   LIMIT 1;

  IF v_agent IS NULL THEN
    RETURN NULL;  -- nenhuma regra aplicável: contato continua sem atribuição
  END IF;

  -- O predicado assigned_to IS NULL repete a trava: se outro já atribuiu entre o
  -- SELECT e aqui, nada muda e nada é auditado.
  -- Uma linha só (WHERE na chave primária). O gatilho update_contacts_updated_at
  -- marca o updated_at DESTE contato — mudança real, esperada. Nenhuma outra linha é
  -- reescrita: provado pelo T1b da suíte (1 contato com data nova, 7 intactos).
  UPDATE public.contacts
     SET assigned_to = v_agent
   WHERE id = p_contact_id
   AND assigned_to IS NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.conversation_events (
    contact_id, event_type, to_agent_id, performed_by, metadata
  ) VALUES (
    p_contact_id,
    'wallet_assignment',
    v_agent,
    (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1),
    jsonb_build_object('source', 'client_wallet', 'assigned_profile_id', v_agent)
  );

  RETURN v_agent;
END;
$function$
