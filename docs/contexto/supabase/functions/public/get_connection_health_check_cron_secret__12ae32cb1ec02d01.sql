CREATE OR REPLACE FUNCTION public.get_connection_health_check_cron_secret()
 RETURNS text
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT decrypted_secret
  FROM vault.decrypted_secrets
  WHERE name = 'connection_health_check_cron_secret'
  LIMIT 1
$function$
