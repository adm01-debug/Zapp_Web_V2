-- 20260930390000_endurece_l5_contrato_e_jobs
-- Follow-up do L5 (docs/ia/IA-004-matriz-autorizacao.md).
--
-- A 20260930250000 entregou o reagendamento dos dois jobs numa funcao versionada
-- (public.apply_zapp_cron_secrets_l5()) e foi aplicada. Uma verificacao adversarial
-- em PostgreSQL descartavel (128 asseracoes) mediu quatro furos QUE ESTAO NO
-- CONTRATO ATUAL e que esta migration fecha:
--
--   E5.3  o guard checava apenas IS NULL: um segredo existente VAZIO ('') passava e
--         o job era reagendado com x-cron-secret de tamanho 0 -> 401 silencioso a
--         cada tick, permanente (exatamente o modo de falha que o comentario da
--         20260930250000 dizia evitar). Agora o formato e conferido (64 hex = 32
--         bytes) e a funcao LEVANTA antes de tocar em qualquer job.
--   E3.2  o indice unico real do pg_cron e (jobname, username): um homonimo criado
--         por OUTRO usuario convive com o nosso e o agendamento vira DOIS jobs
--         ativos. Apagar a linha do outro dono NAO e possivel por aqui -- medido
--         em producao: cron.job pertence a supabase_admin, as funcoes do pg_cron
--         sao SECURITY INVOKER e o dono desta funcao recebe
--         "permission denied for table job" (42501) em qualquer DML direto. O que
--         esta ao alcance e nao silenciar: o homonimo de outro dono e DETECTADO e a
--         funcao LEVANTA com o comando que quem tem supabase_admin roda para remover.
--         (Antes, o contrato nao dizia nada e o resultado eram dois jobs ativos.)
--   E4.2  unschedule + schedule recria o job: o jobid muda e um job desativado de
--         proposito (active=false) volta a rodar; o historico em cron.job_run_details
--         fica orfao. Agora o job existente e ALTERADO no lugar (cron.alter_job), que
--         preserva jobid e active -- e o caminho idempotente passa a ser tambem o
--         menos invasivo.
--   P7.6  o comentario da versao anterior afirmava "a ACL e fechada (ninguem alem do
--         owner executa)", mas o default ACL do Supabase concede EXECUTE a service_role
--         em toda funcao criada em public e o REVOKE so cobria PUBLIC/anon/authenticated.
--         Medido: service_role tinha EXECUTE nesta funcao de manutencao. Agora o REVOKE
--         inclui service_role (a chave usada por ~60 edge functions nao tem motivo para
--         executar reagendamento de cron).
--
-- Reagendamento: os dois jobs continuam com o mesmo schedule, o mesmo comando e o mesmo
-- x-cron-secret lido por subquery do Vault. Por isso esta migration NAO depende do deploy
-- das edges (ao contrario da 20260930250000, que dependia).
--
-- rollback: n/a — nao guarda dado nem cria objeto novo: substitui o corpo de
--   public.apply_zapp_cron_secrets_l5() (create or replace) e fecha a ACL dela.
--   Voltar atras e reaplicar a versao anterior da funcao, que segue no repo em
--   supabase/migrations/20260930250000_reschedule_cron_secrets_l5.sql; o estado dos
--   jobs nao muda em nenhuma das duas versoes.
--
-- Classe: contrato (CREATE OR REPLACE FUNCTION + REVOKE) — aplicada pelo
-- hermes-tarefa-mergear.

CREATE OR REPLACE FUNCTION public.apply_zapp_cron_secrets_l5()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron, vault
AS $$
DECLARE
  v_health  text;
  v_avatars text;
  v_jobid   bigint;
  v_intruso text;
BEGIN
  SELECT decrypted_secret INTO v_health
    FROM vault.decrypted_secrets WHERE name = 'connection_health_check_cron_secret';
  SELECT decrypted_secret INTO v_avatars
    FROM vault.decrypted_secrets WHERE name = 'avatars_refresh_cron_secret';

  -- E5.3: presenca nao basta -- formato conferido para nao reagendar job com
  -- credencial vazia/truncada e so descobrir no 401 do proximo tick.
  IF v_health IS NULL OR v_health !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'cron_secret_l5: connection_health_check_cron_secret ausente ou fora do formato (esperado 32 bytes em hex = 64 caracteres)'
      USING HINT = 'O segredo e criado por 20260930240000_cron_secret_dedicado_l5. Se existe vazio ou truncado, rotacione antes de reagendar (docs/runbooks/cron-secret-rotation.md).';
  END IF;
  IF v_avatars IS NULL OR v_avatars !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'cron_secret_l5: avatars_refresh_cron_secret ausente ou fora do formato (esperado 32 bytes em hex = 64 caracteres)'
      USING HINT = 'O segredo e criado por 20260930240000_cron_secret_dedicado_l5. Se existe vazio ou truncado, rotacione antes de reagendar (docs/runbooks/cron-secret-rotation.md).';
  END IF;

  -- ── guarda de dono (E3.2), para os dois jobs ────────────────────────────────
  -- Um homonimo de outro dono nao e alcancavel daqui (cron.job e de supabase_admin e
  -- DML direto da 42501). Silenciar isso e o que produzia dois jobs ativos: melhor
  -- falhar alto e entregar o comando de correcao.
  SELECT string_agg(DISTINCT username, ', ') INTO v_intruso
    FROM cron.job
   WHERE jobname IN ('connection-health-check', 'avatars-refresh')
     AND username <> current_user;
  IF v_intruso IS NOT NULL THEN
    RAISE EXCEPTION 'cron_secret_l5: existe job (connection-health-check/avatars-refresh) de outro dono: %', v_intruso
      USING HINT = 'Como supabase_admin: SELECT jobid, jobname, username FROM cron.job WHERE username <> current_user; e depois SELECT cron.unschedule(jobid); para cada um. Enquanto isso o agendamento fica duplicado (dois jobs ativos com o mesmo nome).';
  END IF;

  -- ── connection-health-check (de */5 min, timeout 30s) ────────────────────────
  -- Estado anormal entre jobs NOSSOS: fica o de menor jobid. cron.unschedule(jobid)
  -- e o caminho permitido (resolve o dono por dentro do pg_cron).
  FOR v_jobid IN
    SELECT jobid FROM cron.job
     WHERE jobname = 'connection-health-check'
       AND jobid <> (SELECT min(jobid) FROM cron.job WHERE jobname = 'connection-health-check')
  LOOP
    PERFORM cron.unschedule(v_jobid);
  END LOOP;

  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'connection-health-check';
  IF v_jobid IS NULL THEN
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
  ELSE
    -- E4.2: alter_job muda so o que foi passado -- jobid e active ficam como estavam.
    PERFORM cron.alter_job(
      job_id   := v_jobid,
      schedule := '*/5 * * * *',
      command  := $cmd$
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
  END IF;

  -- ── avatars-refresh (de hora em hora, timeout 150s) ─────────────────────────
  FOR v_jobid IN
    SELECT jobid FROM cron.job
     WHERE jobname = 'avatars-refresh'
       AND jobid <> (SELECT min(jobid) FROM cron.job WHERE jobname = 'avatars-refresh')
  LOOP
    PERFORM cron.unschedule(v_jobid);
  END LOOP;

  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'avatars-refresh';
  IF v_jobid IS NULL THEN
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
  ELSE
    PERFORM cron.alter_job(
      job_id   := v_jobid,
      schedule := '0 * * * *',
      command  := $cmd$
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
  END IF;
END;
$$;

-- P7.6: o default ACL do Supabase concede EXECUTE a service_role em funcao nova em
-- public; sem citar service_role aqui, a afirmacao "so o owner executa" e falsa.
REVOKE ALL ON FUNCTION public.apply_zapp_cron_secrets_l5()
  FROM PUBLIC, anon, authenticated, service_role;

SELECT public.apply_zapp_cron_secrets_l5();
