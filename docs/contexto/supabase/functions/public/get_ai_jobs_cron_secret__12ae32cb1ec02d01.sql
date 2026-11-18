CREATE OR REPLACE FUNCTION public.get_ai_jobs_cron_secret()
 RETURNS text
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'ai_jobs_cron_secret'
  limit 1
$function$
