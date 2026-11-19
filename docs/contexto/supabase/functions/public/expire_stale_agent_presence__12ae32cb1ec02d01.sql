CREATE OR REPLACE FUNCTION public.expire_stale_agent_presence()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  UPDATE public.agent_presence
  SET status = 'offline'
  WHERE status <> 'offline'
    AND updated_at < now() - interval '90 seconds';
$function$
