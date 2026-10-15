-- client_wallet_apply
-- Rollback: nada de estrutura ou dado é criado além da função; o desfazer é dropar public.apply_client_wallet(uuid). As regras de client_wallet_rules e os contatos já atribuídos continuam como estão (a função não muda nenhum deles).
-- Rollback (SQL executável, na ordem):
--   DROP FUNCTION IF EXISTS public.apply_client_wallet(uuid);
--
-- PROBLEMA (cartão t_d155d152)
-- A tela da carteira promete "quando um novo contato chega, o sistema verifica as
-- regras na ordem de prioridade" (ClientWalletView.tsx), mas o único caminho que
-- consulta public.client_wallet_rules é o gatilho BEFORE INSERT
-- on_contact_created_auto_assign -> public.auto_assign_contact(): ele não tem versão
-- chamável (não há como reaplicar a carteira a um contato já existente), não checa se
-- o agente da regra está ativo e não grava a atribuição na trilha de auditoria.
--
-- CORREÇÃO (aditiva: só cria uma função; não altera tabela, policy, GRANT de tabela,
-- gatilho nem dado existente)
--   public.apply_client_wallet(p_contact_id uuid) RETURNS uuid
--   - SECURITY DEFINER com search_path fixo (public, pg_temp);
--   - autorizada só para o backend (service_role com o claim E o papel de banco) e
--     staff (admin/supervisor), resolvidos por public.resolve_contact_guard_actor()
--     — a MESMA identidade que os guards de public.contacts exigem, então a gravação
--     não é barrada depois de ter começado; anon e agente comum levam 42501;
--   - só age em contato SEM assigned_to (idempotente: contato já atribuído nunca é
--     reatribuído);
--   - percorre as regras ATIVAS por prioridade (DESC) e por conexão (a regra sem
--     conexão é curinga) e atribui o agente da primeira regra cujo agente esteja
--     ativo; regra com agente inativo é pulada. A ordenação é a MESMA do gatilho
--     (priority DESC, created_at ASC), com r.id ASC como desempate final, para os dois
--     caminhos nunca escolherem agentes diferentes;
--   - trava a linha do contato (FOR UPDATE) e confirma a atribuição com o UPDATE
--     condicional, para que duas chamadas concorrentes não atribuam duas vezes;
--   - grava a atribuição em public.conversation_events (event_type
--     'wallet_assignment'), a trilha de auditoria existente, numa única transação;
--   - devolve o profile atribuído, ou NULL quando não havia o que fazer.

CREATE OR REPLACE FUNCTION public.apply_client_wallet(p_contact_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
$function$;

-- ACL explícita: nega por padrão e libera só quem deve chamar. A checagem de staff
-- (admin/supervisor) fica dentro da função, porque o GRANT não sabe distinguir papel.
REVOKE ALL ON FUNCTION public.apply_client_wallet(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_client_wallet(uuid) TO authenticated, service_role;
