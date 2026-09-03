-- 20260902000200_fix_cron_avatars_refresh_key
-- Reagenda avatars-refresh para usar zapp_anon_key (vault) em vez de sicoob_service_role_key.
-- SQL real conforme estado vigente no banco (cron.job jobid=8).

select cron.alter_job(
  job_id := 8,
  schedule := '0 * * * *',
  command := $cron$
  SELECT net.http_post(
    url := 'https://tnnnlkbymytvtqngbbqh.supabase.co/functions/v1/batch-fetch-avatars',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer '||(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='zapp_anon_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  )
  $cron$
);
