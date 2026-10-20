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
--   deixou a pendencia de escopo anotada; a matriz IA-004 marca como lacuna L1.
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
--   As duas por-contato passam a exigir o mesmo predicado de edicao de contato ja
--   usado por delete_contacts/enqueue_outbound_message; as duas em massa exigem
--   admin/supervisor (sao operacoes globais).
--
-- A autorizacao vive em DUAS funcoes reutilizaveis (e nao repetida em cada RPC):
--   is_privileged_contact_caller()  — bypass de automacao/cron, no idioma ja
--       estabelecido por clear_login_attempts: coalesce(auth.role(), session_user)
--       IN ('service_role','postgres','supabase_admin'). Sem claims, auth.role() e
--       NULL e o fallback e o session_user (conexao direta/cron continua passando).
--   require_contact_edit_permission(uuid) — exige admin/supervisor ou
--       can_edit_contact(...) com parametros "hoisted"
--       (20260929820000_contacts_can_edit_contact_hoisted_params), sem round-trip
--       por linha; RAISE 42501 quando nao pode.
--   require_contact_global_admin() — exigido pelas duas operacoes em massa.
--
-- Sem BEGIN/COMMIT: o gateway aplica a migration numa unica transacao
-- (hermes-db-migrar/mcp_exec recusa BEGIN explicito) — a atomicidade e preservada.

CREATE OR REPLACE FUNCTION public.is_privileged_contact_caller()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT coalesce(auth.role(), session_user) = ANY (ARRAY['service_role', 'postgres', 'supabase_admin']);
$$;

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
END;
$$;

CREATE OR REPLACE FUNCTION public.require_contact_global_admin()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF public.is_privileged_contact_caller() THEN
    RETURN;
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'admin_required' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.is_privileged_contact_caller() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_privileged_contact_caller() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.require_contact_edit_permission(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.require_contact_edit_permission(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.require_contact_global_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.require_contact_global_admin() TO authenticated, service_role;

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
  v_current TEXT;
  v_allowed BOOLEAN := FALSE;
BEGIN
  SELECT conversation_status INTO v_current
  FROM public.contacts
  WHERE id = p_contact_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'contact not found: %', p_contact_id;
  END IF;

  -- Autorizacao ANTES de qualquer efeito e antes do no-op idempotente: um chamador
  -- sem permissao nao pode inferir o estado atual do contato pelo silencio da RPC.
  PERFORM public.require_contact_edit_permission(p_contact_id);

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
-- As duas por-contato: predicado de edicao de contato.
-- As duas em massa: operacao GLOBAL, exige admin/supervisor.

CREATE OR REPLACE FUNCTION public.add_wa_tag_if_not_exists(p_contact_id uuid, p_prefix text, p_tag text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.role() = 'anon' THEN RAISE EXCEPTION 'permission denied'; END IF;
  PERFORM public.require_contact_edit_permission(p_contact_id);

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
BEGIN
  IF auth.role() = 'anon' THEN RAISE EXCEPTION 'permission denied'; END IF;
  PERFORM public.require_contact_edit_permission(p_contact_id);

  UPDATE public.contacts
  SET tags = ARRAY(SELECT t FROM unnest(tags) t WHERE t NOT LIKE p_prefix || '%'), updated_at = now()
  WHERE id = p_contact_id AND EXISTS (SELECT 1 FROM unnest(tags) t WHERE t LIKE p_prefix || '%');
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.remove_wa_tag_by_prefix(uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.remove_wa_tag_by_prefix(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rename_wa_label_on_all_contacts(p_label_prefix text, p_new_tag text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.role() = 'anon' THEN RAISE EXCEPTION 'permission denied'; END IF;
  PERFORM public.require_contact_global_admin();

  UPDATE public.contacts
  SET tags = ARRAY(SELECT CASE WHEN t LIKE p_label_prefix || '%' THEN p_new_tag ELSE t END FROM unnest(tags) t),
      updated_at = now()
  WHERE EXISTS (SELECT 1 FROM unnest(tags) t WHERE t LIKE p_label_prefix || '%');
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.rename_wa_label_on_all_contacts(text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rename_wa_label_on_all_contacts(text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.remove_wa_label_from_all_contacts(p_label_prefix text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.role() = 'anon' THEN RAISE EXCEPTION 'permission denied'; END IF;
  PERFORM public.require_contact_global_admin();

  UPDATE public.contacts
  SET tags = ARRAY(SELECT t FROM unnest(tags) t WHERE t NOT LIKE p_label_prefix || '%'), updated_at = now()
  WHERE EXISTS (SELECT 1 FROM unnest(tags) t WHERE t LIKE p_label_prefix || '%');
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.remove_wa_label_from_all_contacts(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.remove_wa_label_from_all_contacts(text) TO authenticated, service_role;
