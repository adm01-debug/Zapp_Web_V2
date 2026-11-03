CREATE OR REPLACE FUNCTION public.get_department_whatsapp_api_key(p_department_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_key text;
BEGIN
  IF current_setting('request.jwt.claims', true)::jsonb ->> 'role' <> 'service_role' THEN
    RAISE EXCEPTION 'access_denied';
  END IF;
  SELECT whatsapp_api_key INTO v_key FROM public.departments WHERE id = p_department_id;
  RETURN v_key;
END;
$function$
