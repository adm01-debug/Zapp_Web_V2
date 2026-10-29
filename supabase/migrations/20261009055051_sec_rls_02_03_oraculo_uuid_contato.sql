-- SEC-RLS_CONTATOS_MENSAGENS-02 e -03 (achado P1 do relatorio de auditoria de 07/10): as RPCs de contato
-- param de distinguir "UUID inexistente" de "UUID existente fora do alcance" -- hoje qualquer
-- `authenticated` enumera contatos conhecendo/advinhando uuid.
-- Rollback: desfaz esta migration reescrevendo as 3 funcoes com o corpo ANTERIOR (SQL executavel comentado logo abaixo).
-- As linhas REVOKE/GRANT do fim deste arquivo nao mudam ACL nenhuma (ACL antes e depois e a mesma:
-- PUBLIC/anon sem EXECUTE, authenticated/service_role com EXECUTE), entao o rollback nao precisa reemiti-las.
--
-- ── ROLLBACK (SQL EXECUTAVEL, COMENTADO) ─────────────────────────────────────────────────────────────
-- CREATE OR REPLACE FUNCTION public.require_contact_edit_permission(p_contact_id uuid)
-- RETURNS void
-- LANGUAGE plpgsql
-- STABLE
-- SECURITY DEFINER
-- SET search_path TO 'public', 'pg_temp'
-- AS $$
-- DECLARE
--   v_assigned_to uuid;
--   v_queue_id    uuid;
--   v_profile_id  uuid;
--   v_is_admin    boolean;
--   v_visible     uuid[];
-- BEGIN
--   IF public.is_privileged_contact_caller() THEN
--     RETURN;
--   END IF;
--
--   IF auth.uid() IS NULL THEN
--     RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
--   END IF;
--
--   SELECT assigned_to, queue_id INTO v_assigned_to, v_queue_id
--   FROM public.contacts
--   WHERE id = p_contact_id;
--
--   IF NOT FOUND THEN
--     RAISE EXCEPTION 'contact not found: %', p_contact_id;
--   END IF;
--
--   v_profile_id := public.get_profile_id_for_user(auth.uid());
--   v_is_admin   := public.is_admin_or_supervisor(auth.uid());
--
--   SELECT array_agg(ids.agent_id) INTO v_visible
--   FROM public.get_visible_agent_ids(auth.uid()) AS ids(agent_id);
--
--   IF NOT (v_is_admin OR public.can_edit_contact(v_assigned_to, v_queue_id, v_visible, v_profile_id, v_is_admin)) THEN
--     RAISE EXCEPTION 'contact_not_authorized' USING ERRCODE = '42501';
--   END IF;
-- END;
-- $$;
--
-- CREATE OR REPLACE FUNCTION public.set_conversation_status(
--   p_contact_id uuid,
--   p_next       text,
--   p_reason     text DEFAULT NULL
-- )
-- RETURNS void
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- SET search_path TO 'public', 'pg_temp'
-- AS $$
-- DECLARE
--   v_current TEXT;
--   v_allowed BOOLEAN := FALSE;
-- BEGIN
--   SELECT conversation_status INTO v_current
--   FROM public.contacts
--   WHERE id = p_contact_id
--   FOR UPDATE;
--
--   IF NOT FOUND THEN
--     RAISE EXCEPTION 'contact not found: %', p_contact_id;
--   END IF;
--
--   PERFORM public.require_contact_edit_permission(p_contact_id);
--
--   IF v_current = p_next THEN
--     RETURN;
--   END IF;
--
--   IF v_current = 'open'     AND p_next IN ('waiting', 'resolved', 'archived') THEN v_allowed := TRUE; END IF;
--   IF v_current = 'waiting'  AND p_next IN ('open', 'resolved')                THEN v_allowed := TRUE; END IF;
--   IF v_current = 'resolved' AND p_next IN ('open', 'archived')                THEN v_allowed := TRUE; END IF;
--   IF v_current = 'archived' AND p_next = 'open'                               THEN v_allowed := TRUE; END IF;
--
--   IF NOT v_allowed THEN
--     RAISE EXCEPTION 'invalid transition % -> %', v_current, p_next;
--   END IF;
--
--   UPDATE public.contacts
--   SET conversation_status            = p_next,
--       conversation_status_changed_at = NOW()
--   WHERE id = p_contact_id;
--
--   IF p_next = 'resolved' THEN
--     INSERT INTO public.conversation_closures (contact_id, close_reason)
--     VALUES (p_contact_id, COALESCE(p_reason, 'resolved'))
--     ON CONFLICT DO NOTHING;
--   END IF;
-- END;
-- $$;
--
-- CREATE OR REPLACE FUNCTION public.can_delete_contacts(p_ids uuid[])
--  RETURNS TABLE(contact_id uuid, can_delete boolean)
--  LANGUAGE sql
--  STABLE SECURITY DEFINER
--  SET search_path TO 'public', 'pg_temp'
-- AS $function$
--   SELECT c.id,
--          public.can_edit_contact(
--            c.assigned_to,
--            c.queue_id,
--            (SELECT array_agg(v) FROM public.get_visible_agent_ids(auth.uid()) v),
--            (SELECT public.get_profile_id_for_user(auth.uid())),
--            (SELECT public.is_admin_or_supervisor(auth.uid()))
--          )
--   FROM public.contacts c
--   WHERE c.id = ANY(p_ids)
--     AND c.deleted_at IS NULL
-- $function$;
--
-- COMMENT ON FUNCTION public.can_delete_contacts(uuid[]) IS
--   'Para cada id informado, se o chamador pode excluir o contato (mesmo predicado de can_edit_contact). Contatos inexistentes ou ja excluidos nao retornam linha. Alimenta o gate do item "Excluir" na UI do modulo Contatos.';
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
--
-- O QUE MUDA E POR QUE
--
-- (02) require_contact_edit_permission era o unico caminho que dizia, em texto, se o uuid EXISTE:
--      'contact not found: <uuid>' (inexistente) x 'contact_not_authorized' (existe, fora do alcance).
--      Agora ha UM unico ponto de recusa: uuid inexistente e uuid fora do alcance levantam a MESMA
--      excecao -- mesmo texto ('contact_not_authorized'), mesmo SQLSTATE (42501), mesmo ponto/contexto
--      -- e o id NAO entra na mensagem. Quem PODE editar o contato nao muda em nada.
--
--      Mesmo defeito, mesmo arquivo, outro ponto de entrada: set_conversation_status levantava
--      'contact not found: <uuid>' ANTES de delegar a require_contact_edit_permission -- o mesmo
--      oraculo por outra RPC que tambem tem EXECUTE para `authenticated` (e que chega la antes de
--      qualquer checagem de permissao). Corrigido aqui tambem: a delegacao passa a ser o UNICO ponto
--      de recusa tambem para o chamador comum. Nao sobrou outro ponto que devolva texto diferente
--      para uuid inexistente no modulo Contatos: delete_contact/delete_contacts ja unificam em
--      'Contato nao encontrado ou sem permissao para excluir.'.
--
-- (03) can_delete_contacts devolvia linha (can_delete=false) para contato que o chamador NAO pode ver:
--      a EXISTENCIA da linha ja era a resposta do oraculo. O predicado de alcance passa para o WHERE
--      -- contato fora do alcance (ou inexistente, ou ja excluido) nao retorna linha, exatamente como
--      o COMMENT da funcao ja prometia.
--
--      Nao ha perda para a UI: a lista (search_contacts) e a policy de SELECT de public.contacts usam
--      o MESMO predicado can_edit_contact, entao contato que aparece na lista do usuario e sempre
--      can_delete=true; e useContactsSearch -> ContactService.getDeletableContacts so manda os ids
--      que ja vieram da lista visivel.
--
-- Sem BEGIN/COMMIT de topo: o gateway aplica a migration numa unica transacao (a atomicidade e
-- preservada) -- a correcao toda e um unico conjunto de CREATE OR REPLACE.
-- ====================================================================================================

CREATE OR REPLACE FUNCTION public.require_contact_edit_permission(p_contact_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_assigned_to uuid;
  v_queue_id    uuid;
  v_profile_id  uuid;
  v_is_admin    boolean;
  v_visible     uuid[];
  v_encontrado  boolean;
BEGIN
  IF public.is_privileged_contact_caller() THEN
    RETURN;
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  SELECT assigned_to, queue_id INTO v_assigned_to, v_queue_id
  FROM public.contacts
  WHERE id = p_contact_id;
  v_encontrado := FOUND;

  v_profile_id := public.get_profile_id_for_user(auth.uid());
  v_is_admin   := public.is_admin_or_supervisor(auth.uid());

  SELECT array_agg(ids.agent_id) INTO v_visible
  FROM public.get_visible_agent_ids(auth.uid()) AS ids(agent_id);

  -- (SEC-RLS-02) UM UNICO ponto de recusa: "uuid inexistente" (v_encontrado = false) e "uuid
  -- existente fora do alcance" levantam a MESMA excecao -- mesmo texto, mesmo SQLSTATE (42501) e
  -- mesmo ponto do codigo (o contexto do erro nao distingue os dois casos) -- e o id nao e ecoado.
  IF NOT (v_encontrado
          AND (v_is_admin
               OR public.can_edit_contact(v_assigned_to, v_queue_id, v_visible, v_profile_id, v_is_admin))) THEN
    RAISE EXCEPTION 'contact_not_authorized' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_conversation_status(
  p_contact_id uuid,
  p_next       text,
  p_reason     text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_current    TEXT;
  v_encontrado boolean;
  v_allowed    BOOLEAN := FALSE;
BEGIN
  SELECT conversation_status INTO v_current
  FROM public.contacts
  WHERE id = p_contact_id
  FOR UPDATE;
  v_encontrado := FOUND;

  -- Autorizacao (e, para o chamador comum, tambem a EXISTENCIA) em UM unico ponto. Antes da
  -- correcao, esta RPC levantava 'contact not found: <uuid>' aqui -- o mesmo oraculo de UUID do
  -- SEC-RLS-02 por outro caminho (SEC-RLS-02: qualquer `authenticated` enumera contatos).
  PERFORM public.require_contact_edit_permission(p_contact_id);

  -- Chamador privilegiado (service_role/postgres/cron): require_contact_edit_permission nao checa
  -- existencia, entao a inexistencia e recusada com a MESMA excecao de autorizacao -- nada aqui
  -- distingue "nao existe" de "nao posso ver".
  IF NOT v_encontrado THEN
    RAISE EXCEPTION 'contact_not_authorized' USING ERRCODE = '42501';
  END IF;

  -- No-op idempotente: ja esta no estado desejado (o no-op VEM DEPOIS da autorizacao: um chamador
  -- sem permissao nao pode inferir o estado atual do contato pelo silencio da RPC).
  IF v_current = p_next THEN
    RETURN;
  END IF;

  IF v_current = 'open'     AND p_next IN ('waiting', 'resolved', 'archived') THEN v_allowed := TRUE; END IF;
  IF v_current = 'waiting'  AND p_next IN ('open', 'resolved')                THEN v_allowed := TRUE; END IF;
  IF v_current = 'resolved' AND p_next IN ('open', 'archived')                THEN v_allowed := TRUE; END IF;
  IF v_current = 'archived' AND p_next = 'open'                               THEN v_allowed := TRUE; END IF;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'invalid transition % -> %', v_current, p_next;
  END IF;

  UPDATE public.contacts
  SET conversation_status            = p_next,
      conversation_status_changed_at = NOW()
  WHERE id = p_contact_id;

  IF p_next = 'resolved' THEN
    INSERT INTO public.conversation_closures (contact_id, close_reason)
    VALUES (p_contact_id, COALESCE(p_reason, 'resolved'))
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_delete_contacts(p_ids uuid[])
 RETURNS TABLE(contact_id uuid, can_delete boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT c.id,
         public.can_edit_contact(
           c.assigned_to,
           c.queue_id,
           (SELECT array_agg(v) FROM public.get_visible_agent_ids(auth.uid()) v),
           (SELECT public.get_profile_id_for_user(auth.uid())),
           (SELECT public.is_admin_or_supervisor(auth.uid()))
         )
  FROM public.contacts c
  WHERE c.id = ANY(p_ids)
    AND c.deleted_at IS NULL
    -- (SEC-RLS-03) O predicado de alcance entra no WHERE: contato fora do alcance (ou inexistente,
    -- ou ja excluido) NAO retorna linha -- a existencia da linha deixa de ser a resposta do oraculo.
    -- O can_delete do SELECT ja e sempre true nas linhas que sobram (mesmo predicado).
    AND public.can_edit_contact(
          c.assigned_to,
          c.queue_id,
          (SELECT array_agg(v) FROM public.get_visible_agent_ids(auth.uid()) v),
          (SELECT public.get_profile_id_for_user(auth.uid())),
          (SELECT public.is_admin_or_supervisor(auth.uid()))
        )
$function$;

COMMENT ON FUNCTION public.can_delete_contacts(uuid[]) IS
  'Para cada id informado, se o chamador pode excluir o contato (mesmo predicado de can_edit_contact). Contatos inexistentes, ja excluidos OU fora do alcance do chamador nao retornam linha (a existencia da linha nao revela contato invisivel). Alimenta o gate do item "Excluir" na UI do modulo Contatos.';

-- ACL pela ASSINATURA exata (CREATE OR REPLACE preserva a ACL: estas linhas reconfirmam o contrato de
-- cada assinatura e NAO concedem nada novo).
REVOKE ALL ON FUNCTION public.require_contact_edit_permission(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.require_contact_edit_permission(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.can_delete_contacts(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_delete_contacts(uuid[]) TO authenticated, service_role;
