-- Sincroniza com supabase_migrations.schema_migrations (version 20260924100800),
-- ja aplicada ao vivo via MCP em 2026-09-24 ~10:08 UTC (jobid 12 em cron.job).
-- Este commit so adiciona o arquivo versionado para check-migration-drift.mjs
-- nao acusar drift (registro no banco sem arquivo no repo).
-- Idempotente: reagenda se a job ja existir (permite reaplicar em outros ambientes).

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'connection-health-check';

SELECT cron.schedule(
  'connection-health-check',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://tnnnlkbymytvtqngbbqh.supabase.co/functions/v1/connection-health-check',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer '||(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='zapp_anon_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) AS request_id
  $$
);
