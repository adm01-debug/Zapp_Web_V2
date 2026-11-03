CREATE OR REPLACE FUNCTION public.audit_role_permissions_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_perm_name text;
BEGIN
  SELECT name INTO v_perm_name
  FROM public.permissions
  WHERE id = COALESCE(NEW.permission_id, OLD.permission_id);

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, details)
    VALUES (
      auth.uid(), 'permission_granted_to_role', 'role_permissions', NEW.permission_id,
      jsonb_build_object(
        'role',       NEW.role,
        'permission', v_perm_name,
        'granted_by', auth.uid()
      )
    );
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, details)
    VALUES (
      auth.uid(), 'permission_revoked_from_role', 'role_permissions', OLD.permission_id,
      jsonb_build_object(
        'role',       OLD.role,
        'permission', v_perm_name,
        'revoked_by', auth.uid()
      )
    );
  END IF;
  RETURN NULL;
END;
$function$
