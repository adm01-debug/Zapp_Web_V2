CREATE OR REPLACE FUNCTION public.trigger_due_scheduled_report_configs()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_config_id uuid;
  v_cron_secret text;
BEGIN
  SELECT decrypted_secret INTO v_cron_secret
  FROM vault.decrypted_secrets WHERE name = 'scheduled_report_cron_secret' LIMIT 1;

  FOR v_config_id IN
    SELECT id FROM public.scheduled_report_configs
    WHERE is_active
      AND frequency IN ('daily', 'weekly', 'biweekly', 'monthly')
      AND (next_send_at IS NULL OR next_send_at <= now())
    ORDER BY created_at
    LIMIT 20
  LOOP
    PERFORM net.http_post(
      url := 'https://tnnnlkbymytvtqngbbqh.supabase.co/functions/v1/send-scheduled-report',
      body := jsonb_build_object('configId', v_config_id::text),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', v_cron_secret
      ),
      timeout_milliseconds := 30000
    );
  END LOOP;
END;
$function$
