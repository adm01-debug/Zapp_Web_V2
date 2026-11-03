CREATE OR REPLACE FUNCTION public.sync_profile_role_from_user_roles()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id  uuid;
  v_new_role app_role;
BEGIN
  v_user_id := COALESCE(NEW.user_id, OLD.user_id);

  SELECT CASE
    WHEN bool_or(role = 'admin'::app_role)         THEN 'admin'::app_role
    WHEN bool_or(role = 'supervisor'::app_role)    THEN 'supervisor'::app_role
    WHEN bool_or(role = 'special_agent'::app_role) THEN 'special_agent'::app_role
    ELSE 'agent'::app_role
  END
  INTO v_new_role
  FROM public.user_roles
  WHERE user_id = v_user_id;

  IF v_new_role IS NOT NULL THEN
    -- Sinaliza operação interna para prevent_privilege_escalation
    PERFORM set_config('app.internal_role_sync', 'true', true);

    UPDATE public.profiles
    SET role = v_new_role::text
    WHERE user_id = v_user_id
      AND role IS DISTINCT FROM v_new_role::text;

    -- Reset flag (set_config com local=true já reseta no fim da transação,
    -- mas reset explícito é mais claro e seguro em casos de nested txn)
    PERFORM set_config('app.internal_role_sync', 'false', true);
  END IF;

  RETURN NULL;
END;
$function$
