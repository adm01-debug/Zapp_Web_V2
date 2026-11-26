CREATE OR REPLACE FUNCTION public.talkx_connection_send_budget(p_connection_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;

  RETURN public.talkx_connection_send_budget_internal(p_connection_id);
END;
$function$
