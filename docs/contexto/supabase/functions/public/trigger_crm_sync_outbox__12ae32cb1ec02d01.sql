CREATE OR REPLACE FUNCTION public.trigger_crm_sync_outbox()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_url text; v_secret text;
BEGIN
  IF NOT public.crm_sync_outbox_cron_enabled() THEN RETURN 0; END IF;
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name='crm_sync_outbox_url' LIMIT 1;
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name='crm_sync_outbox_cron_secret' LIMIT 1;
  IF v_url IS NULL OR v_secret IS NULL THEN RETURN 0; END IF;
  PERFORM net.http_post(url:=v_url, body:=jsonb_build_object('action','processOutbox'), headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret',v_secret), timeout_milliseconds:=30000);
  RETURN 1;
END;
$function$
