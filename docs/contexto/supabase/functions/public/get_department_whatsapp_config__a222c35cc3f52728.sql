CREATE OR REPLACE FUNCTION public.get_department_whatsapp_config(p_department_id uuid)
 RETURNS TABLE(mode text, instance_id text, has_api_key boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT d.whatsapp_mode,
           d.whatsapp_instance_id,
           (NULLIF(d.whatsapp_api_key, '') IS NOT NULL)
    FROM public.departments d
    WHERE d.id = p_department_id;
END;
$function$
