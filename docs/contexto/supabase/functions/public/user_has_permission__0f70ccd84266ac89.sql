CREATE OR REPLACE FUNCTION public.user_has_permission(_user_id uuid, _permission_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.secd_caller_ok(_user_id, false) THEN
    RAISE EXCEPTION 'user_has_permission: consulta de permissao de outro usuario nao autorizada'
      USING ERRCODE = '42501';
  END IF;
  RETURN EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role = ur.role
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE ur.user_id = _user_id AND p.name = _permission_name
  );
END;
$function$
