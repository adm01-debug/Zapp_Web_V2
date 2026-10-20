-- Achado na validacao exaustiva do sistema de Skins (2026-09-24): a auditoria
-- de troca de papel e ANONIMA quando a escrita vem por service_role.
--
-- Evidencia ao vivo (audit_logs, action='role_changed'): as 3 trocas de papel
-- ja registradas para o usuario de QA visual tem changed_by = NULL --
-- inclusive uma rebaixando supervisor -> agent em 2026-09-23T13:01:37Z que
-- nenhuma sessao do container e nenhum cron job produziu (ambos descartados
-- na investigacao). Causa: o trigger audit_user_role_changes grava
-- changed_by := auth.uid(), e auth.uid() e NULL em qualquer conexao
-- service_role (MCP Supabase, psql direto, Edge Function com service key).
-- Resultado pratico: uma escalacao de privilegio feita por service_role e
-- indistinguivel de outra no log -- nao da para saber QUEM fez.
--
-- RLS de user_roles ja esta correta ("Only admins can manage roles" com
-- has_role(auth.uid(),'admin')), mas service_role bypassa RLS por design.
-- Por isso a correcao tem DUAS partes e nao so a RPC:
--
--   1) Atribuicao forense no trigger (vale para TODOS os caminhos, inclusive
--      service_role): alem de changed_by, grava actor_kind (jwt vs
--      service_role_or_direct_sql), actor_db_role (current_user),
--      actor_app_name (application_name -- o cliente pode se identificar) e
--      actor_addr (inet_client_addr). Aditivo: nenhuma chave existente do
--      details muda, nada que le audit_logs quebra.
--
--   2) Caminho legitimo e auditavel para o app trocar papel:
--      admin_set_role(uuid, app_role), SECURITY DEFINER, que EXIGE sessao JWT
--      de admin real (auth.uid() nao-nulo + is_admin). Nao "fecha" o SQL
--      direto (nada fecha, service_role bypassa RLS por definicao), mas da ao
--      produto uma porta unica, validada e sempre atribuida.

-- --- 1) Trigger de auditoria com atribuicao de fallback -------------------

CREATE OR REPLACE FUNCTION public.audit_user_role_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_actor jsonb;
BEGIN
  v_actor := jsonb_build_object(
    'actor_kind',     CASE WHEN auth.uid() IS NOT NULL THEN 'jwt' ELSE 'service_role_or_direct_sql' END,
    'actor_db_role',  current_user,
    'actor_app_name', NULLIF(current_setting('application_name', true), ''),
    'actor_addr',     COALESCE(host(inet_client_addr()), 'local')
  );

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, details)
    VALUES (
      auth.uid(), 'role_granted', 'user_roles', NEW.id,
      jsonb_build_object(
        'user_id',    NEW.user_id,
        'role',       NEW.role,
        'granted_by', auth.uid()
      ) || v_actor
    );
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, details)
    VALUES (
      auth.uid(), 'role_revoked', 'user_roles', OLD.id,
      jsonb_build_object(
        'user_id',    OLD.user_id,
        'role',       OLD.role,
        'revoked_by', auth.uid()
      ) || v_actor
    );
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, details)
    VALUES (
      auth.uid(), 'role_changed', 'user_roles', NEW.id,
      jsonb_build_object(
        'user_id',    NEW.user_id,
        'old_role',   OLD.role,
        'new_role',   NEW.role,
        'changed_by', auth.uid()
      ) || v_actor
    );
  END IF;
  RETURN NULL;
END;
$fn$;

-- --- 2) Porta unica e sempre atribuida para o app -------------------------

CREATE OR REPLACE FUNCTION public.admin_set_role(_user_id uuid, _role public.app_role)
RETURNS TABLE (out_user_id uuid, out_old_role public.app_role, out_new_role public.app_role)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_caller uuid := auth.uid();
  v_old    public.app_role;
BEGIN
  -- Exige sessao JWT real: service_role sem JWT tem auth.uid() nulo e cai aqui.
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'jwt_session_required'
      USING HINT = 'admin_set_role exige sessao autenticada; service_role sem JWT nao pode usar esta RPC';
  END IF;

  IF NOT public.is_admin(v_caller) THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

  -- Nao permite que um admin remova o proprio admin e trave a instalacao.
  IF _user_id = v_caller AND _role <> 'admin'::public.app_role THEN
    RAISE EXCEPTION 'cannot_demote_self';
  END IF;

  SELECT ur.role INTO v_old FROM public.user_roles ur WHERE ur.user_id = _user_id LIMIT 1;

  IF v_old IS NULL THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, _role);
  ELSIF v_old IS DISTINCT FROM _role THEN
    UPDATE public.user_roles ur SET role = _role WHERE ur.user_id = _user_id;
  END IF;

  -- audit_user_role_changes dispara sozinho no INSERT/UPDATE acima, ja com
  -- changed_by = auth.uid() preenchido (sessao JWT garantida no guard).
  RETURN QUERY SELECT _user_id, v_old, _role;
END;
$fn$;

-- Least privilege: so sessao autenticada chama; o guard interno filtra quem nao e admin.
REVOKE EXECUTE ON FUNCTION public.admin_set_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_set_role(uuid, public.app_role) TO authenticated;

COMMENT ON FUNCTION public.admin_set_role(uuid, public.app_role) IS
  'Troca o papel de um usuario exigindo sessao JWT de admin. Unico caminho de troca de papel com autoria garantida em audit_logs. service_role sem JWT recebe jwt_session_required.';
