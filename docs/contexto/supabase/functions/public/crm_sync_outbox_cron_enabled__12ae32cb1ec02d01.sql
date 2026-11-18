CREATE OR REPLACE FUNCTION public.crm_sync_outbox_cron_enabled()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_flag boolean;
BEGIN
  SELECT enabled INTO v_flag FROM public.feature_flags WHERE key='crm.integration';
  IF v_flag IS NOT TRUE THEN RETURN false; END IF;
  IF to_regclass('vault.decrypted_secrets') IS NULL THEN RETURN false; END IF;
  RETURN EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name='crm_sync_outbox_url')
     AND EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name='crm_sync_outbox_cron_secret');
END;
$function$
