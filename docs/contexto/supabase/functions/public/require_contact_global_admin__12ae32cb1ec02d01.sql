CREATE OR REPLACE FUNCTION public.require_contact_global_admin()
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF public.is_privileged_contact_caller() THEN
    RETURN;
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'admin_required' USING ERRCODE = '42501';
  END IF;
END;
$function$
