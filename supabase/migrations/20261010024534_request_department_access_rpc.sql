-- request_department_access
-- Rollback:
--   drop function if exists public.request_department_access(uuid);
--   alter table public.department_audit_logs drop constraint if exists department_audit_logs_action_check;
--   alter table public.department_audit_logs add constraint department_audit_logs_action_check check (action in ('accept_invite','create_invite','join_department','leave_department','remove_member','update_settings','delete_department','create_department','update_role','kick_member','create_group','delete_group','whatsapp_updated'));
--   -- restore previous function body (before access_requested was added):
--   create or replace function public.request_department_access(p_department_id uuid) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $function$
--   declare v_profile_id uuid; v_admin_profile_id uuid; v_admin_user_id uuid; v_department_name text;
--   begin
--     v_profile_id := public.current_profile_id();
--     if v_profile_id is null then return jsonb_build_object('ok', false, 'error', 'not_authenticated'); end if;
--     select d.name into v_department_name from public.departments d where d.id = p_department_id;
--     if not found then return jsonb_build_object('ok', false, 'error', 'department_not_found'); end if;
--     for v_admin_profile_id, v_admin_user_id in select p.id, p.user_id from public.profiles p where p.department_id = p_department_id and p.role in ('admin','supervisor') loop
--       insert into public.notifications(user_id, title, message, type, metadata) values (v_admin_user_id, 'Pedido de acesso ao departamento', 'Um agente solicitou acesso ao departamento ' || coalesce(v_department_name, ''), 'info', jsonb_build_object('department_id', p_department_id, 'requester_profile_id', v_profile_id));
--     end loop;
--     insert into public.department_audit_logs(department_id, action, profile_id, details) values (p_department_id, 'access_requested', v_profile_id, jsonb_build_object('department_name', v_department_name));
--     return jsonb_build_object('ok', true);
--   end;
--   $function$;
--   revoke execute on function public.request_department_access(uuid) from authenticated, anon;
--   grant execute on function public.request_department_access(uuid) to public;
-- Cartão N-071: RPC que cria notificações para admins do departamento e linha access_requested na auditoria. Anon recebe recusa.

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

REVOKE EXECUTE ON FUNCTION public.request_department_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_department_access(uuid) TO authenticated, anon;