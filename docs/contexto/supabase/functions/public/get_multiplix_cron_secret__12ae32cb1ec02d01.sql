CREATE OR REPLACE FUNCTION public.get_multiplix_cron_secret()
 RETURNS text
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT decrypted_secret
  FROM vault.decrypted_secrets
  WHERE name = 'multiplix_cron_secret'
  LIMIT 1
$function$
