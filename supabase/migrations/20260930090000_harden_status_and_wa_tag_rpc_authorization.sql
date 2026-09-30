-- migration: 20260930090000
-- Endurecimento de autorizacao das RPCs de contato — lacunas L1 e L2 da matriz
-- docs/ia/IA-004-matriz-autorizacao.md (casos de aceite N12 e N13).
--
-- L1 — public.set_conversation_status nao checava visibilidade/atribuicao do contato.
--   A funcao e SECURITY DEFINER e as tabelas de public estao sem FORCE ROW LEVEL
--   SECURITY, ou seja o UPDATE roda como owner e NAO passa pela RLS. Resultado:
--   qualquer `authenticated` (inclusive agent sem fila e sem carteira) transicionava
--   o status de QUALQUER contact_id que conhecesse, e ainda podia inserir em
--   conversation_closures. O proprio arquivo que concedeu o EXECUTE
--   (20260927330000_grant_set_conversation_status_to_authenticated.sql, linhas 17-18)
--   deixou o TODO de escopo registrado; a matriz IA-004 marca como lacuna L1.
--
--   O GRANT para `authenticated` PERMANECE: o fixture E2E chama esta RPC com o JWT
--   do usuario logado (e2e/fixtures/e2e-contact.ts, ensureFixtureConversationOpen)
--   e um erro novo la derruba a suite E2E inteira. A correcao e o guard INTERNO,
--   nao a revogacao — e o usuario de QA dos E2E e admin, entao o bypass de
--   admin/supervisor mantem o fixture funcionando.
--
-- L2 — as RPCs de etiqueta de WhatsApp em massa so barravam `anon`
--   (20260927530000_security_revoke_anon_9rpcs_wa_tag_search_path.sql). Qualquer
--   `authenticated` renomeava ou removia etiqueta em TODOS os contatos do sistema.
--   Aqui: as duas por-contato passam a exigir o mesmo predicado de edicao de contato
--   ja usado por delete_contacts/enqueue_outbound_message; as duas em massa passam a
--   exigir admin/supervisor (sao operacoes globais).
--
-- Predicado: public.can_edit_contact(...) com os parametros "hoisted"
-- (20260929820000_contacts_can_edit_contact_hoisted_params) — sem round-trip por linha.
-- Bypass privilegiado no idioma ja estabelecido por clear_login_attempts:
-- coalesce(auth.role(), session_user) IN ('service_role','postgres','supabase_admin'),
-- para nao quebrar automacao/cron que chamam com a service key.
--
-- Sem BEGIN/COMMIT: o gateway aplica a migration numa unica transacao
-- (hermes-db-migrar/mcp_exec recusa BEGIN explicito) — a atomicidade e preservada.

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
  v_current     TEXT;
  v_assigned_to uuid;
  v_queue_id    uuid;
  v_profile_id  uuid;
  v_is_admin    boolean;
  v_visible     uuid[];
  v_allowed     BOOLEAN := FALSE;
BEGIN
  SELECT conversation_status, assigned_to, queue_id
    INTO v_current, v_assigned_to, v_queue_id
  FROM public.contacts
  WHERE id = p_contact_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'contact not found: %', p_contact_id;
  END IF;

  -- Autorizacao ANTES de qualquer efeito e antes do no-op idempotente: um chamador
  -- sem permissao nao pode inferir o estado atual do contato pelo silencio da RPC.
  IF NOT (coalesce(auth.role(), session_user) = ANY (ARRAY['service_role', 'postgres', 'supabase_admin'])) THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
    END IF;

    v_profile_id := public.get_profile_id_for_user(auth.uid());
    v_is_admin   := public.is_admin_or_supervisor(auth.uid());

    SELECT array_agg(ids.agent_id) INTO v_visible
    FROM public.get_visible_agent_ids(auth.uid()) AS ids(agent_id);

    IF NOT (v_is_admin OR public.can_edit_contact(v_assigned_to, v_queue_id, v_visible, v_profile_id, v_is_admin)) THEN
      RAISE EXCEPTION 'contact_not_authorized' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- No-op idempotente: ja esta no estado desejado
  -- (fixture E2E seguro para re-execucao mesmo que test 1 nao tenha fechado)
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

REVOKE EXECUTE ON FUNCTION public.set_conversation_status(uuid, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_conversation_status(uuid, text, text) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.set_conversation_status(uuid, text, text) TO service_role;
GRANT  EXECUTE ON FUNCTION public.set_conversation_status(uuid, text, text) TO postgres;

-- ── L2: etiquetas de WhatsApp ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.add_wa_tag_if_not_exists(p_contact_id uuid, p_prefix text, p_tag text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_assigned_to uuid;
  v_queue_id    uuid;
  v_profile_id  uuid;
  v_is_admin    boolean;
  v_visible     uuid[];
BEGIN
  IF auth.role() = 'anon' THEN RAISE EXCEPTION 'permission denied'; END IF;

  IF NOT (coalesce(auth.role(), session_user) = ANY (ARRAY['service_role', 'postgres', 'supabase_admin'])) THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
    END IF;

    SELECT assigned_to, queue_id INTO v_assigned_to, v_queue_id
    FROM public.contacts WHERE id = p_contact_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'contact not found: %', p_contact_id;
    END IF;

    v_profile_id := public.get_profile_id_for_user(auth.uid());
    v_is_admin   := public.is_admin_or_supervisor(auth.uid());

    SELECT array_agg(ids.agent_id) INTO v_visible
    FROM public.get_visible_agent_ids(auth.uid()) AS ids(agent_id);

    IF NOT (v_is_admin OR public.can_edit_contact(v_assigned_to, v_queue_id, v_visible, v_profile_id, v_is_admin)) THEN
      RAISE EXCEPTION 'contact_not_authorized' USING ERRCODE = '42501';
    END IF;
  END IF;

  UPDATE public.contacts
  SET tags = ARRAY(SELECT t FROM unnest(tags) t WHERE t NOT LIKE p_prefix || '%') || ARRAY[p_tag],
      updated_at = now()
  WHERE id = p_contact_id AND NOT (COALESCE(tags, '{}') @> ARRAY[p_tag]);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.add_wa_tag_if_not_exists(uuid, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.add_wa_tag_if_not_exists(uuid, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.remove_wa_tag_by_prefix(p_contact_id uuid, p_prefix text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_assigned_to uuid;
  v_queue_id    uuid;
  v_profile_id  uuid;
  v_is_admin    boolean;
  v_visible     uuid[];
BEGIN
  IF auth.role() = 'anon' THEN RAISE EXCEPTION 'permission denied'; END IF;

  IF NOT (coalesce(auth.role(), session_user) = ANY (ARRAY['service_role', 'postgres', 'supabase_admin'])) THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
    END IF;

    SELECT assigned_to, queue_id INTO v_assigned_to, v_queue_id
    FROM public.contacts WHERE id = p_contact_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'contact not found: %', p_contact_id;
    END IF;

    v_profile_id := public.get_profile_id_for_user(auth.uid());
    v_is_admin   := public.is_admin_or_supervisor(auth.uid());

    SELECT array_agg(ids.agent_id) INTO v_visible
    FROM public.get_visible_agent_ids(auth.uid()) AS ids(agent_id);

    IF NOT (v_is_admin OR public.can_edit_contact(v_assigned_to, v_queue_id, v_visible, v_profile_id, v_is_admin)) THEN
      RAISE EXCEPTION 'contact_not_authorized' USING ERRCODE = '42501';
    END IF;
  END IF;

  UPDATE public.contacts
  SET tags = ARRAY(SELECT t FROM unnest(tags) t WHERE t NOT LIKE p_prefix || '%'), updated_at = now()
  WHERE id = p_contact_id AND EXISTS (SELECT 1 FROM unnest(tags) t WHERE t LIKE p_prefix || '%');
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.remove_wa_tag_by_prefix(uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.remove_wa_tag_by_prefix(uuid, text) TO authenticated, service_role;

-- Operacao GLOBAL (todos os contatos): so admin/supervisor, inclusive quando a
-- chamada vem de automacao com service key (mantida por compatibilidade).
CREATE OR REPLACE FUNCTION public.remove_wa_label_from_all_contacts(p_label_prefix text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.role() = 'anon' THEN RAISE EXCEPTION 'permission denied'; END IF;

  IF NOT (coalesce(auth.role(), session_user) = ANY (ARRAY['service_role', 'postgres', 'supabase_admin'])) THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
    END IF;
    IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
      RAISE EXCEPTION 'admin_required' USING ERRCODE = '42501';
    END IF;
  END IF;

  UPDATE public.contacts
  SET tags = ARRAY(SELECT t FROM unnest(tags) t WHERE t NOT LIKE p_label_prefix || '%'), updated_at = now()
  WHERE EXISTS (SELECT 1 FROM unnest(tags) t WHERE t LIKE p_label_prefix || '%');
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.remove_wa_label_from_all_contacts(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.remove_wa_label_from_all_contacts(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rename_wa_label_on_all_contacts(p_label_prefix text, p_new_tag text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.role() = 'anon' THEN RAISE EXCEPTION 'permission denied'; END IF;

  IF NOT (coalesce(auth.role(), session_user) = ANY (ARRAY['service_role', 'postgres', 'supabase_admin'])) THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
    END IF;
    IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
      RAISE EXCEPTION 'admin_required' USING ERRCODE = '42501';
    END IF;
  END IF;

  UPDATE public.contacts
  SET tags = ARRAY(SELECT CASE WHEN t LIKE p_label_prefix || '%' THEN p_new_tag ELSE t END FROM unnest(tags) t),
      updated_at = now()
  WHERE EXISTS (SELECT 1 FROM unnest(tags) t WHERE t LIKE p_label_prefix || '%');
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.rename_wa_label_on_all_contacts(text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rename_wa_label_on_all_contacts(text, text) TO authenticated, service_role;

