CREATE OR REPLACE FUNCTION public.request_department_access(p_department_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
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
$function$
