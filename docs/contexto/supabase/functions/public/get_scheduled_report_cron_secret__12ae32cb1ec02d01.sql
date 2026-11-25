CREATE OR REPLACE FUNCTION public.get_scheduled_report_cron_secret()
 RETURNS text
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT decrypted_secret
  FROM vault.decrypted_secrets
  WHERE name = 'scheduled_report_cron_secret'
  LIMIT 1
$function$
