-- 20261002541230_pg_cron_escalonar_jobs
--
-- Mitigacao do 'job startup timeout' do pg_cron documentado no runbook
-- docs/ops/runbook-pg-cron-capacidade.md (PR #1615).
--
-- CAUSA MEDIDA (investigacao de 02/10, somente leitura): 684 falhas em 24h, todas
-- com return_message = 'job startup timeout', todas na MESMA janela
-- (01/10 14:45 -> 02/10 09:47) em TODOS os 12 jobs, com contagens identicas entre os
-- que compartilham cadencia. O job do Talk X e rapido (media 0,482s, p95 2,0s): a
-- duracao das falhas (ate 285s) e a ESPERA por backend ate desistir, nao o job
-- rodando. Configuracao medida: max_worker_processes=6, cron.max_running_jobs=32,
-- cron.use_background_workers=off, max_connections=60.
--
-- O QUE ESTA MIGRATION FAZ: apenas OFFSETS DE MINUTO. Nao muda cadencia de nenhum
-- job, nao desativa nada, nao mexe em capacidade do banco (que e decisao do Joaquim:
-- propostas 1 e 2 do runbook). Reduz a CONCORRENCIA POR MINUTO, que e o agravante
-- que a investigacao identificou.
--
-- O QUE NAO DA PARA RESOLVER AQUI, de proposito: os tres jobs que rodam a CADA
-- MINUTO (talkx-scheduler-1min, tasks-notify-due, ai-jobs-tick-1min) nao tem offset
-- possivel -- todo minuto e todo minuto. Escalona-los exigiria mudar cadencia
-- (decisao de outro dono) ou granularidade de segundo (nao usada na frota). Sobre o
-- talkx-scheduler-1min: o TALK X 02 e o dono do Talk X e decide junto; esta migration
-- nao o toca. ai-jobs-tick-1min ja estava em '1-59 * * * *' (offset de quem o criou,
-- e o motivo de o minuto 0 ter 2 jobs e nao 3) e fica como esta.
--
-- MECANISMO: cron.alter_job() -- muda o horario SEM reescrever o comando do job, e
-- sem DML direto em cron.job (proibido desde 20260930430000_cron_sem_dml_direto_v2).
-- O job e localizado por NOME, nunca por jobid: jobid e sequencia e muda em restore
-- ou clone. Se um nome nao existir, a funcao falha alto em vez de aplicar meia
-- escala -- e o nome e a unica ancora estavel que sobra.
--
-- IDEMPOTENTE: cron.alter_job e um UPDATE; reexecutar nao duplica nem cria job.
-- Molde da funcao reexecutavel: 20260930250000_reschedule_cron_secrets_l5.sql
-- (depois de um restore, refazer o escalonamento e
-- `SELECT public.apply_pg_cron_escalonamento();`, sem reaplicar migration).
--
-- Classe: contrato (CREATE OR REPLACE FUNCTION + REVOKE) -- aplicada pelo
-- hermes-tarefa-mergear logo apos merge + deploy.

-- rollback: SELECT public.apply_pg_cron_escalonamento(true);
--   O parametro p_reverter=true devolve cada job ao horario ORIGINAL registrado nesta
--   migration (a lista abaixo e a fonte da verdade dos dois lados). Reverter e um
--   SELECT, nao uma migration nova. Voltar aos horarios antigos reintroduz a
--   concorrencia de minuto que causou o 'job startup timeout' -- nao ha perda de dado
--   em nenhum dos dois sentidos, so mudanca de horario.

CREATE OR REPLACE FUNCTION public.apply_pg_cron_escalonamento(p_reverter boolean DEFAULT false)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, cron
AS $fn$
DECLARE
  alvo       record;
  jid        bigint;
  qtd        integer;
  aplicados  integer := 0;
BEGIN
  FOR alvo IN
    SELECT * FROM (VALUES
      -- job                          horario original   horario escalonado
      ('expire-stale-agent-presence', '*/2 * * * *',        '1-59/2 * * * *'),
      ('multiplix-send-trigger',      '*/2 * * * *',        '0-58/2 * * * *'),
      ('gmail-incremental-sync',      '*/5 * * * *',        '0-55/5 * * * *'),
      ('connection-health-check',     '*/5 * * * *',        '2-57/5 * * * *'),
      ('cleanup-edge-rate-limits',    '*/15 * * * *',       '7-52/15 * * * *'),
      ('avatars-refresh',             '0 * * * *',          '7 * * * *'),
      ('cleanup-link-preview-cache',  '0 3 * * *',          '12 3 * * *'),
      ('vacuum-contacts-daily',       '30 3 * * *',         '42 3 * * *'),
      ('vacuum-messages-post-expurgo','0 3 2 9 *',          '20 3 2 9 *')
    ) AS t(jobname, horario_original, horario_escalonado)
  LOOP
    SELECT count(*) INTO qtd FROM cron.job WHERE jobname = alvo.jobname;
    IF qtd <> 1 THEN
      RAISE EXCEPTION
        'job % esperado 1x em cron.job, encontrado % - escalonamento abortado sem aplicar nada',
        alvo.jobname, qtd;
    END IF;

    SELECT jobid INTO jid FROM cron.job WHERE jobname = alvo.jobname;
    PERFORM cron.alter_job(
      job_id   := jid,
      schedule := CASE WHEN p_reverter THEN alvo.horario_original
                       ELSE alvo.horario_escalonado END
    );
    aplicados := aplicados + 1;
  END LOOP;

  RETURN aplicados;
END;
$fn$;

-- ACL fechada: ninguem alem do owner executa.
REVOKE ALL ON FUNCTION public.apply_pg_cron_escalonamento(boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_pg_cron_escalonamento(boolean) TO service_role;

SELECT public.apply_pg_cron_escalonamento(false);
