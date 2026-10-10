-- E07: pg_cron job para disparar talkx-scheduler a cada minuto
-- Segredos armazenados no vault (vault.create_secret executado manualmente):
--   talkx_scheduler_url → URL da edge function talkx-scheduler
--   talkx_anon_key      → anon key do projeto (função autentica internamente com service_role)
--
-- Para recriar manualmente:
--   SELECT vault.create_secret('<URL>', 'talkx_scheduler_url', '...');
--   SELECT vault.create_secret('<ANON_KEY>', 'talkx_anon_key', '...');
--   SELECT cron.schedule('talkx-scheduler-1min', '* * * * *', $$ ... $$);

-- Job já criado via MCP (jobid=11). Este arquivo documenta e versiona a intenção.
-- Para recriar se necessário:
SELECT cron.schedule(
  'talkx-scheduler-1min',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'talkx_scheduler_url'),
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'talkx_anon_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  ) AS request_id
  $$
) WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'talkx-scheduler-1min');
