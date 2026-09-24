-- Agenda a edge function connection-health-check via pg_cron (5 em 5 min).
-- Aplicado 2026-09-24 -- investigacao do item "alarme de queda de conexao".
--
-- Contexto: a function supabase/functions/connection-health-check/index.ts
-- ja existia, completa e correta -- consulta whatsapp_connections, chama
-- /instance/connectionState na Evolution API, grava em connection_health_logs
-- a cada checagem e cria um warroom_alerts quando uma conexao transiciona de
-- 'connected' para 'disconnected'. So que nunca foi agendada: connection_health_logs
-- tinha apenas 2 linhas em toda a historia (2026-09-22, 8min de diferenca,
-- claramente execucao manual/teste), sem nenhum cron.job chamando a function.
-- Resultado: a queda de hoje (2026-09-24, ~10:00-10:38 UTC, instancia PRINCIPAL)
-- nao gerou alerta nenhum -- o gap nao era logica quebrada, era ausencia de
-- agendamento.
--
-- verify_jwt=true nesta function (nao esta nas excecoes de supabase/config.toml),
-- entao o cron autentica com o mesmo 'zapp_anon_key' (vault) ja usado pelos
-- outros cron jobs deste projeto que chamam functions verify_jwt=true
-- (ex.: avatars-refresh).

SELECT cron.schedule(
  'connection-health-check',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://tnnnlkbymytvtqngbbqh.supabase.co/functions/v1/connection-health-check',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'zapp_anon_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) AS request_id
  $$
);
