-- F10 (docs/audits/PLANO_TEAM_CHAT_FINALIZACAO_100_ETAPAS_2026-09-29.md:46) — DDL 5/6 —
-- WhatsApp de departamento (R4 = docs/audits/AUDITORIA_TEAM_CHAT_ESTADO_REAL_2026-09-29.md:104).
-- Item 56 / TC-005 / R2-AUTH-017: contrato de banco da gestao de departamento.
--
-- Rollback: DROP FUNCTION IF EXISTS public.get_department_whatsapp_config(uuid); CREATE OR REPLACE FUNCTION public.set_department_whatsapp_config(p_department_id uuid, p_whatsapp_mode text, p_api_key text DEFAULT NULL::text, p_instance_id text DEFAULT NULL::text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$ DECLARE v_profile_id uuid; v_is_admin boolean; BEGIN v_profile_id := public.current_profile_id(); IF v_profile_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated'); END IF; SELECT (role IN ('admin','supervisor')) INTO v_is_admin FROM public.profiles WHERE id = v_profile_id; IF NOT v_is_admin THEN RETURN jsonb_build_object('ok', false, 'error', 'not_authorized'); END IF; IF p_whatsapp_mode NOT IN ('none','evolution','official') THEN RETURN jsonb_build_object('ok', false, 'error', 'invalid_mode'); END IF; UPDATE public.departments SET whatsapp_mode = p_whatsapp_mode, whatsapp_api_key = COALESCE(p_api_key, whatsapp_api_key), whatsapp_instance_id = COALESCE(p_instance_id, whatsapp_instance_id), updated_at = now() WHERE id = p_department_id; IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'department_not_found'); END IF; RETURN jsonb_build_object('ok', true); END; $function$; DELETE FROM public.department_audit_logs WHERE action = 'whatsapp_updated'; ALTER TABLE public.department_audit_logs DROP CONSTRAINT IF EXISTS department_audit_logs_action_check; ALTER TABLE public.department_audit_logs ADD CONSTRAINT department_audit_logs_action_check CHECK (action IN ('accept_invite','create_invite','join_department','leave_department','remove_member','update_settings','delete_department','create_department','update_role','kick_member','create_group','delete_group'));
--
-- DEFEITO (contrato de banco invalido): a unica RPC de LEITURA do WhatsApp de departamento e
-- public.get_department_whatsapp_credentials(uuid) (20260928550000). Ela exige service_role e
-- devolve o segredo em claro ('whatsapp_api_key'). A aba WhatsApp do departamento a chama como
-- `authenticated` e recebe `access_denied`: o modo salvo nunca carrega. Abrir aquela RPC ao
-- authenticated exporia a chave; o plano (F10) pede uma RPC propria da tela, 3 colunas, sem segredo.
--
-- CORRECAO:
--   1) nova public.get_department_whatsapp_config(p_department_id uuid)
--      RETURNS TABLE (mode text, instance_id text, has_api_key boolean), STABLE SECURITY DEFINER,
--      exclusiva de admin/supervisor pela fonte CANONICA (public.is_admin_or_supervisor(auth.uid()));
--      agente recebe `not_authorized`; a chave NUNCA aparece no retorno nem no erro.
--   2) set_department_whatsapp_config passa a usar a MESMA guarda da leitura
--      (public.is_admin_or_supervisor(auth.uid()), fonte public.user_roles) no lugar de
--      profiles.role: a autorizacao da LEITURA e da ESCRITA e uma so, decidida pelo mesmo dado.
--      O unico uso que sobra de public.current_profile_id() na escrita e o ATOR da auditoria,
--      nunca a decisao de autorizar.
--   3) set_department_whatsapp_config passa a registrar auditoria 'whatsapp_updated' (sem a chave),
--      e details.has_api_key mede o ESTADO ARMAZENADO depois do UPDATE (via RETURNING), nao o
--      parametro recebido: chamada com p_api_key NULL num departamento que JA tem chave registra
--      has_api_key = true (a chave continuou la), e nao false como media a versao anterior.
--   4) as duas funcoes ficam com SET search_path = public, pg_temp.
--   5) o CHECK department_audit_logs_action_check ganha o verbo 'whatsapp_updated' (o vocabulario so
--      e AMPLIADO: os 12 verbos antigos seguem validos, inclusive nas linhas ja gravadas — testado
--      com dado legado).
--   get_department_whatsapp_credentials/_api_key continuam service_role-only (edge functions).
--   A leitura/escrita das 2 colunas de segredo (whatsapp_api_key, whatsapp_instance_id) por
--   `authenticated` ja esta fechada por 20260930530000 (REVOKE de TABELA em departments); este
--   arquivo nao a reabre e o teste confirma por has_column_privilege.
--
-- FLUXOS que usam este contrato (prova: scripts/db-audit/team-chat-department-whatsapp-safe-config.test.sh):
--   * aba de gestao do departamento (admin/supervisor) LE por get_department_whatsapp_config e
--     GRAVA por set_department_whatsapp_config — as DUAS sob a mesma guarda canonica
--     public.is_admin_or_supervisor(auth.uid()); profiles.role nao decide nenhuma das pontas;
--   * consumidores que precisam da chave bruta seguem em get_department_whatsapp_credentials
--     (service_role), inalterado.
--   Fica para o cartao da camada de tela (F62/F77) trocar o hook para a RPC nova; aqui entrega-se
--   o CONTRATO DE BANCO.

-- 1) Leitura segura do WhatsApp de departamento (admin/supervisor), sem nunca devolver a chave.
CREATE OR REPLACE FUNCTION public.get_department_whatsapp_config(p_department_id uuid)
RETURNS TABLE (mode text, instance_id text, has_api_key boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT d.whatsapp_mode,
           d.whatsapp_instance_id,
           (NULLIF(d.whatsapp_api_key, '') IS NOT NULL)
    FROM public.departments d
    WHERE d.id = p_department_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_department_whatsapp_config(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_department_whatsapp_config(uuid) TO authenticated;

-- 2) Vocabulario da auditoria: amplia com 'whatsapp_updated' (nenhum verbo antigo sai).
ALTER TABLE public.department_audit_logs DROP CONSTRAINT IF EXISTS department_audit_logs_action_check;

ALTER TABLE public.department_audit_logs ADD CONSTRAINT department_audit_logs_action_check CHECK (action IN (
  'accept_invite','create_invite','join_department','leave_department','remove_member','update_settings',
  'delete_department','create_department','update_role','kick_member','create_group','delete_group',
  'whatsapp_updated'));

-- 3) Escrita: mesma assinatura; guarda IGUAL a da leitura; audita 'whatsapp_updated' SEM a chave.
CREATE OR REPLACE FUNCTION public.set_department_whatsapp_config(
  p_department_id uuid,
  p_whatsapp_mode text,
  p_api_key text DEFAULT NULL::text,
  p_instance_id text DEFAULT NULL::text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  -- Ator da auditoria (nao e decisao de autorizacao: quem autoriza e public.is_admin_or_supervisor).
  v_profile_id   uuid := public.current_profile_id();
  -- Estado ARMAZENADO depois do UPDATE (nao o parametro recebido).
  v_has_api_key  boolean;
BEGIN
  -- Guarda canonica: a MESMA da leitura e a mesma fonte (public.user_roles via
  -- is_admin_or_supervisor). profiles.role nao autoriza nada aqui.
  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authorized');
  END IF;

  IF p_whatsapp_mode NOT IN ('none','evolution','official') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_mode');
  END IF;

  UPDATE public.departments
  SET
    whatsapp_mode        = p_whatsapp_mode,
    whatsapp_api_key     = COALESCE(p_api_key, whatsapp_api_key),
    whatsapp_instance_id = COALESCE(p_instance_id, whatsapp_instance_id),
    updated_at           = now()
  WHERE id = p_department_id
  RETURNING (NULLIF(whatsapp_api_key, '') IS NOT NULL) INTO v_has_api_key;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'department_not_found');
  END IF;

  -- Auditoria sem a chave: guarda o modo e se existe chave ARMAZENADA, nunca o segredo.
  INSERT INTO public.department_audit_logs(department_id, action, profile_id, details)
  VALUES (
    p_department_id,
    'whatsapp_updated',
    v_profile_id,
    jsonb_build_object('mode', p_whatsapp_mode, 'has_api_key', COALESCE(v_has_api_key, false))
  );

  RETURN jsonb_build_object('ok', true);
END;
$function$;
