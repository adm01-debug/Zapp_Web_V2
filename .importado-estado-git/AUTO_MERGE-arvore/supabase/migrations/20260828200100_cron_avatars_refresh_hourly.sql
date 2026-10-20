-- Cron que dispara batch-fetch-avatars a cada hora para cobrir contatos novos.
-- O Bearer e lido do vault em runtime (nao hardcodado aqui).
-- Backoff de 7d controlado pela coluna avatar_fetch_attempted_at (migration 20260828200000).
-- Criado via: SELECT cron.schedule('avatars-refresh','0 * * * *', <comando>)
-- username=postgres (acesso a vault.decrypted_secrets + net.http_post confirmado).
-- timeout_milliseconds=150000 (fire-and-forget; cron nao trava no intervalo de 1h).
SELECT cron.schedule(
  'avatars-refresh',
  '0 * * * *',
  $$SELECT net.http_post(
    url := 'https://tnnnlkbymytvtqngbbqh.supabase.co/functions/v1/batch-fetch-avatars',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer '||(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='sicoob_service_role_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  )$$
);
