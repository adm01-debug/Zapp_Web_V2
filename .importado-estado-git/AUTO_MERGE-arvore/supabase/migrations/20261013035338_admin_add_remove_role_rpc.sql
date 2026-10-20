-- admin_add_remove_role_rpc
-- Rollback: dropa as duas RPCs novas (admin_add_role, admin_remove_role); nada mais e tocado.
-- Rollback (SQL executavel, na ordem):
--   drop function if exists public.admin_add_role(uuid, public.app_role);
--   drop function if exists public.admin_remove_role(uuid, public.app_role);
--
-- A tela de papeis (src/pages/admin/useRolesPageState.ts) fala DIRETO com
-- public.user_roles por PostgREST: handleAddRole faz INSERT e handleRemoveRole
-- faz DELETE por id. A tela de admin /admin/roles nunca usa admin_set_role.
-- Consequencia: "adicionar" e "remover" papel passam por fora do unico caminho
-- com guarda de chamador, piso de admin e autoria garantida em audit_logs — o
-- INSERT/DELETE direto depende SO da RLS de user_roles e nao impede
-- auto-promocao a admin nem apagar o proprio ultimo admin da instalacao.
--
-- Estas duas RPCs fecham o par com admin_set_role (que troca o papel da unica
-- linha), seguindo o mesmo contrato: SECURITY DEFINER com search_path fixo,
-- sessao JWT obrigatoria (auth.uid() nao nulo), chamador admin, auditoria pelo
-- gatilho ja existente em public.user_roles e least privilege no EXECUTE.
--
--   admin_add_role(_user_id, _role)     concede um papel (INSERT em user_roles)
--   admin_remove_role(_user_id, _role)  revoga um papel (DELETE em user_roles)
--
-- Travas de admin_remove_role:
--   * piso de admin — nao deixar a instalacao sem nenhum administrador;
--   * nao remover o proprio papel de admin — evitar que o admin se tranque para fora.
-- (O piso e conferido ANTES da trava de proprio admin: quando o alvo e o proprio
--  chamador e ele e o ultimo admin, a mensagem reportada e a do piso, que e o
--  motivo real; com 2+ admins, remover o proprio admin reporta cannot_remove_own_admin.)
--
-- A auditoria nao e escrita aqui: os gatilhos audit_user_role_changes (INSERT ->
-- role_granted, DELETE -> role_revoked, com changed_by = auth.uid()) e
-- sync_profile_role_from_user_roles (recompoe profiles.role pelo effective_role)
-- disparam sozinhos na escrita de user_roles, exatamente como em admin_set_role.

CREATE OR REPLACE FUNCTION public.admin_add_role(_user_id uuid, _role public.app_role)
RETURNS TABLE(out_user_id uuid, out_role public.app_role)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  -- Exige sessao JWT real: service_role sem JWT tem auth.uid() nulo e cai aqui.
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'jwt_session_required'
      USING HINT = 'admin_add_role exige sessao autenticada; service_role sem JWT nao pode usar esta RPC';
  END IF;

  IF NOT public.is_admin(v_caller) THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

  -- Estado invalido explicito: conceder um papel que o usuario ja tem nao e um
  -- no-op silencioso (evita reexecucao virar sucesso fantasma).
  IF EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id AND ur.role = _role
  ) THEN
    RAISE EXCEPTION 'role_already_assigned'
      USING HINT = 'o usuario ja possui esse papel; nada a conceder';
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, _role);

  -- audit_user_role_changes (role_granted) e sync_profile_role_from_user_roles
  -- disparam sozinhos no INSERT acima, ja com changed_by = auth.uid().
  RETURN QUERY SELECT _user_id, _role;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.admin_remove_role(_user_id uuid, _role public.app_role)
RETURNS TABLE(out_user_id uuid, out_role public.app_role)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_caller uuid := auth.uid();
  v_admin_count int;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'jwt_session_required'
      USING HINT = 'admin_remove_role exige sessao autenticada; service_role sem JWT nao pode usar esta RPC';
  END IF;

  IF NOT public.is_admin(v_caller) THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

  -- Piso de admin: nao zerar o ultimo administrador da instalacao.
  IF _role = 'admin'::public.app_role THEN
    SELECT count(*) INTO v_admin_count
    FROM public.user_roles ur WHERE ur.role = 'admin'::public.app_role;
    IF v_admin_count <= 1 THEN
      RAISE EXCEPTION 'cannot_demote_last_admin'
        USING HINT = 'a instalacao precisa de pelo menos 1 administrador';
    END IF;
  END IF;

  -- Nao permite que o admin remova o proprio admin e trave a instalacao.
  IF _user_id = v_caller AND _role = 'admin'::public.app_role THEN
    RAISE EXCEPTION 'cannot_remove_own_admin';
  END IF;

  DELETE FROM public.user_roles ur WHERE ur.user_id = _user_id AND ur.role = _role;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'role_not_assigned'
      USING HINT = 'o usuario nao possui esse papel; nada a remover';
  END IF;

  -- audit_user_role_changes (role_revoked) e sync_profile_role_from_user_roles
  -- disparam sozinhos no DELETE acima.
  RETURN QUERY SELECT _user_id, _role;
END;
$fn$;

-- Least privilege: so sessao autenticada e backend chamam; o guard interno
-- filtra quem nao e admin. anon/PUBLIC ficam de fora.
REVOKE EXECUTE ON FUNCTION public.admin_add_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_remove_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_add_role(uuid, public.app_role) TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.admin_remove_role(uuid, public.app_role) TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_add_role(uuid, public.app_role) IS
  'Concede um papel a um usuario exigindo sessao JWT de admin. Irma de admin_set_role: unico caminho de concessao com autoria garantida em audit_logs. service_role sem JWT recebe jwt_session_required.';

COMMENT ON FUNCTION public.admin_remove_role(uuid, public.app_role) IS
  'Revoga um papel de um usuario exigindo sessao JWT de admin, com piso de admin (nao zera o ultimo administrador) e trava de proprio admin. service_role sem JWT recebe jwt_session_required.';
