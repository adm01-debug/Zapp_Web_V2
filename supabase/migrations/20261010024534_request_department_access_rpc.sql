-- N-071: request_department_access — pedido de acesso a departamento.
-- Rollback: delete from public.department_audit_logs where action = 'access_requested'; drop function if exists public.request_department_access(uuid); alter table public.department_audit_logs drop constraint if exists department_audit_logs_action_check; alter table public.department_audit_logs add constraint department_audit_logs_action_check check (action in ('accept_invite','create_invite','join_department','leave_department','remove_member','update_settings','delete_department','create_department','update_role','kick_member','create_group','delete_group','whatsapp_updated'));
-- Cartao N-071: RPC que cria notificacoes para admins/supervisores do departamento e linha access_requested na auditoria.
-- Estado anterior (meio de prova, arquivos reais do repositorio):
--   * a funcao NAO existia: nenhuma migration do repositorio cria public.request_department_access
--     (so este arquivo a menciona); por isso o rollback e DROP FUNCTION, sem recriar corpo nem GRANT;
--   * o CHECK anterior e o do F10 (supabase/migrations/20261006213734_team_chat_f10_department_whatsapp_safe_config.sql):
--     os mesmos 13 verbos, na mesma ordem; nenhum verbo antigo sai.
-- ACL: so authenticated executa. anon recebe permission denied do Postgres (sem oraculo de JSON).

-- 1) Amplia o vocabulario de auditoria: 'access_requested' (nenhum verbo antigo sai).
ALTER TABLE public.department_audit_logs DROP CONSTRAINT IF EXISTS department_audit_logs_action_check;

ALTER TABLE public.department_audit_logs ADD CONSTRAINT department_audit_logs_action_check CHECK (action IN (
  'accept_invite','create_invite','join_department','leave_department','remove_member','update_settings',
  'delete_department','create_department','update_role','kick_member','create_group','delete_group',
  'whatsapp_updated','access_requested'));

-- 2) RPC: request_department_access — autenticado pede acesso, admins do departamento recebem notificacao e auditoria registra.
CREATE OR REPLACE FUNCTION public.request_department_access(p_department_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_profile_id uuid;
  v_admin_profile_id uuid;
  v_admin_user_id uuid;
  v_department_name text;
BEGIN
  v_profile_id := public.current_profile_id();
  IF v_profile_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT d.name INTO v_department_name FROM public.departments d WHERE d.id = p_department_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'department_not_found');
  END IF;

  FOR v_admin_profile_id, v_admin_user_id IN
    SELECT p.id, p.user_id
    FROM public.profiles p
    WHERE p.department_id = p_department_id
      AND p.role IN ('admin', 'supervisor')
  LOOP
    INSERT INTO public.notifications(user_id, title, message, type, metadata)
    VALUES (
      v_admin_user_id,
      'Pedido de acesso ao departamento',
      'Um agente solicitou acesso ao departamento ' || COALESCE(v_department_name, ''),
      'info',
      jsonb_build_object('department_id', p_department_id, 'requester_profile_id', v_profile_id)
    );
  END LOOP;

  INSERT INTO public.department_audit_logs(department_id, action, profile_id, details)
  VALUES (p_department_id, 'access_requested', v_profile_id, jsonb_build_object('department_name', v_department_name));

  RETURN jsonb_build_object('ok', true);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.request_department_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_department_access(uuid) TO authenticated;
