-- Achado na auditoria exaustiva de regressao desta sessao: a migration
-- 20260924120000_role_change_audit_attribution.sql (PR #562) fez
-- CREATE OR REPLACE FUNCTION public.audit_user_role_changes() -- mas o
-- trigger em user_roles sempre chamou public.audit_role_changes() (sem
-- "user_"). Nomes diferentes: a migration criou uma funcao nova e orfa,
-- nada aponta pra ela. O trigger continuou executando a funcao antiga,
-- sem nenhum campo de atribuicao forense (actor_kind/actor_db_role/
-- actor_app_name/actor_addr). Confirmado por pg_get_functiondef ao vivo:
-- audit_role_changes() nao tinha os campos; audit_user_role_changes()
-- (nunca referenciada por trigger nenhum) tinha.
--
-- Resultado pratico: a correcao que a PR #562 dizia entregar (parte 1,
-- atribuicao forense) nunca entrou em vigor em producao. changed_by
-- continua NULL para qualquer escrita via service_role em user_roles,
-- exatamente o problema original. admin_set_role (parte 2) foi aplicada
-- corretamente e funciona.
--
-- Fix: refaz o CREATE OR REPLACE no nome correto (audit_role_changes,
-- o que o trigger de fato executa) e remove a funcao orfa criada por
-- engano, pra nao sobrar duas versoes conflitantes no schema.

CREATE OR REPLACE FUNCTION public.audit_role_changes()
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

-- Funcao orfa criada por engano na 20260924120000; nada a referencia
-- (trigger sempre apontou pra audit_role_changes, nome correto acima).
DROP FUNCTION IF EXISTS public.audit_user_role_changes();
