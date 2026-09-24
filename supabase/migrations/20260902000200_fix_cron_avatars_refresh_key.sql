-- 20260902000200_fix_cron_avatars_refresh_key
-- Reagenda avatars-refresh para usar zapp_anon_key (vault) em vez de sicoob_service_role_key.
-- job_id resolvido por nome (nao hardcoded): pg_cron atribui o jobid por sequence global
-- da instancia, entao o numero real varia entre producao e um banco local recem-criado
-- via replay de migrations. Em producao resolve para o mesmo jobid=8 de sempre.

select cron.alter_job(
  job_id := (select jobid from cron.job where jobname = 'avatars-refresh'),
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