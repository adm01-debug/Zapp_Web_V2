CREATE OR REPLACE FUNCTION public.get_talkx_send_url()
 RETURNS text
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT decrypted_secret
  FROM vault.decrypted_secrets
  WHERE name = 'talkx_send_url'
  LIMIT 1
$function$
