CREATE OR REPLACE FUNCTION public.apply_zapp_cron_secrets_l5()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron, vault
AS $$
BEGIN
  IF (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'connection_health_check_cron_secret') IS NULL
     OR (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'avatars_refresh_cron_secret') IS NULL THEN
    RAISE EXCEPTION 'cron_secret_l5: segredo dedicado ausente no Vault'
      USING HINT = 'Aplique 20260930240000_cron_secret_dedicado_l5 antes (ela cria os dois segredos e as RPCs).';
  END IF;

  -- connection-health-check -- de */5 min, timeout 30s
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'connection-health-check';
  PERFORM cron.schedule(
    'connection-health-check',
    '*/5 * * * *',
    $cmd$
  SELECT net.http_post(
    url := 'https://tnnnlkbymytvtqngbbqh.supabase.co/functions/v1/connection-health-check',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='connection_health_check_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) AS request_id
  $cmd$
  );

  -- avatars-refresh -- de hora em hora, timeout 150s
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'avatars-refresh';
  PERFORM cron.schedule(
    'avatars-refresh',
    '0 * * * *',
    $cmd$
  SELECT net.http_post(
    url := 'https://tnnnlkbymytvtqngbbqh.supabase.co/functions/v1/batch-fetch-avatars',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='avatars_refresh_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  )
  $cmd$
  );
END;
$$

REVOKE ALL ON FUNCTION public.apply_zapp_cron_secrets_l5() FROM PUBLIC, anon, authenticated

SELECT public.apply_zapp_cron_secrets_l5()
