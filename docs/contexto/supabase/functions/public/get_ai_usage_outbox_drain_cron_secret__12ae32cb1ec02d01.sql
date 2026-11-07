CREATE OR REPLACE FUNCTION public.get_ai_usage_outbox_drain_cron_secret()
 RETURNS text
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT decrypted_secret
  FROM vault.decrypted_secrets
  WHERE name = 'ai_usage_outbox_drain_cron_secret'
  LIMIT 1
$function$
