-- Cron de sync incremental do Gmail (a cada 5 minutos).
-- Chama a edge function gmail-cron-sync com autenticacao via vault.
--
-- SEGURANCA: o x-cron-secret e lido do vault em runtime
-- (vault.decrypted_secrets WHERE name='gmail_cron_secret').
-- Nenhum secret e hardcodado neste arquivo.
--
-- Em fresh db reset: o vault.decrypted_secrets precisa ter 'gmail_cron_secret'
-- inserido manualmente antes de aplicar esta migration.
-- O CRON_SECRET da edge function deve ser igual ao valor do vault.
--
-- cron.schedule com mesmo nome = UPDATE (idempotente no pg_cron).

SELECT cron.schedule(
  'gmail-incremental-sync',
  '*/5 * * * *',
  $$SELECT net.http_post(
    url := 'https://tnnnlkbymytvtqngbbqh.supabase.co/functions/v1/gmail-cron-sync',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRubm5sa2J5bXl0dnRxbmdiYnFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3MjU0MDEsImV4cCI6MjEwMzMwMTQwMX0.4kDVowXzo3yBVboLOFn1bsij-vBKncJXVoPot3iknC0',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'gmail_cron_secret')
    ),
    timeout_milliseconds := 30000
  )$$
);
