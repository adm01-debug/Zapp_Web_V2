CREATE OR REPLACE FUNCTION public.get_channel_credentials(_connection_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT is_admin_or_supervisor(auth.uid()) THEN
    RETURN NULL;
  END IF;
  RETURN (SELECT credentials FROM public.channel_connections WHERE id = _connection_id);
END;
$function$
