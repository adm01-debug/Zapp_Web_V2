-- 20260930250000_reschedule_cron_secrets_l5
-- L5 da matriz docs/ia/IA-004-matriz-autorizacao.md -- segunda metade.
--
-- Troca a credencial dos dois jobs que ainda mandavam a anon key do projeto
-- (zapp_anon_key) para a credencial DEDICADA de cada um, criada em
-- 20260930240000_cron_secret_dedicado_l5.
--
-- O valor do segredo NAO e escrito no comando do job: o reagendamento guarda a
-- SUBQUERY que le o Vault a cada tick (mesmo formato que os jobs ja usavam com a anon
-- key, e que 20260929610000 usa com o segredo do Multiplix). Assim rotacionar o
-- segredo e um UPDATE no Vault -- sem reaplicar migration e sem janela de dual-key.
--
-- ORDEM OBRIGATORIA: esta migration so pode rodar DEPOIS do deploy das edges. Se ela
-- entrar antes, o job passa a mandar x-cron-secret para uma funcao que ainda exige JWT
-- do gateway e o health check / o refresh de avatars param ate o deploy terminar. Por
-- isso ela e registrada como PENDENTE_POS_MERGE e o hermes-tarefa-mergear a aplica
-- apos o deploy verde (o proprio mergear recusa aplicar DDL de contrato com deploy
-- falho). O primeiro comando confere que o segredo existe, para falhar alto em vez de
-- reagendar um job que so levaria 401.
--
-- Escrita como funcao versionada no molde de trigger_pending_multiplix_dispatches()
-- (job 15): o corpo fica reexecutavel -- depois de um restore ou de um clone, refazer
-- o reagendamento e `SELECT public.apply_zapp_cron_secrets_l5();` em vez de reaplicar
-- migration. A funcao e chamada no fim do arquivo e a ACL dela e fechada (ninguem
-- alem do owner executa).
--
-- Classe: contrato (CREATE OR REPLACE FUNCTION + REVOKE) -- aplicada pelo
-- hermes-tarefa-mergear logo apos merge + deploy.

-- rollback: n/a — a migration nao guarda dado nem cria objeto de contrato: ela reagenda
--   dois jobs. Reverter significaria REABRIR o defeito do L5 (voltar a mandar a anon key
--   no Authorization), entao nao ha volta "segura" a oferecer. O que existe e o retorno
--   operacional: enquanto 20260930240000 estiver aplicada, refazer o reagendamento e
--   `SELECT public.apply_zapp_cron_secrets_l5();` (idempotente, unschedule antes de schedule).

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
$$;

REVOKE ALL ON FUNCTION public.apply_zapp_cron_secrets_l5() FROM PUBLIC, anon, authenticated;

SELECT public.apply_zapp_cron_secrets_l5();
