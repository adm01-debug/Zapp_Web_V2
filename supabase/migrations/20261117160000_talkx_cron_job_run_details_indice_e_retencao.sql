-- Resgate de claude/fix-talkx-cron-startup-timeout-261025-1700 (nunca mergeada).
--
-- Aquela branch diagnosticou 4.007 falhas do job pg_cron 'talkx-scheduler-1min'
-- em 30 dias (9,3%) e apontou tres causas raiz. A 20261117110000 desta mesma PR
-- resgatou DUAS delas (janela de 14 dias em talkx_engine_cron_runs; advisory
-- lock + captura de query_canceled/57014 no tick). Faltaram as duas peças que
-- atacam a causa raiz C1, e sem elas as outras so aliviam o sintoma:
--
--   C1 (indice): cron.job_run_details nao tem indice por (jobid, start_time).
--       Toda leitura do historico do job faz varredura sequencial — 69 MB na
--       medicao da branch — e estoura o statement_timeout. A janela de 14 dias
--       da 20261117110000 reduz o conjunto DEVOLVIDO, mas sem indice o Postgres
--       ainda varre a tabela inteira para aplicar o filtro.
--
--   C1b (retencao): pg_cron nunca limpa job_run_details. Mesmo com o indice, a
--       tabela volta a crescer sem limite e o custo do scan de manutencao
--       (vacuum/analyze) sobe com ela.
--
-- Nao ha DML de dado de negocio aqui: cron.job_run_details e o historico de
-- execucoes do proprio agendador.
--
-- Sobre os dois prazos, que sao diferentes de proposito (herdado da branch): a
-- UI le ate 14 dias (20261117110000) e a retencao guarda 7. O SELECT com janela
-- de 14 dias segue correto — devolve o que existir. O diagnostico de falha usa
-- as ultimas horas, entao 7 dias cobrem o uso real sem deixar a tabela crescer.

-- C1: indice composto. IF NOT EXISTS para replay idempotente.
CREATE INDEX IF NOT EXISTS idx_job_run_details_jobid_start
  ON cron.job_run_details (jobid, start_time DESC, runid DESC);

-- C1b: retencao diaria. Padrao idempotente do repo (ver
-- 20261003xxxxxx_connection_health_check e as migrations de notify-due-*):
-- desagenda por jobid antes de reagendar, para replay nao duplicar a job.
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'cleanup-cron-run-details-7d';

SELECT cron.schedule(
  'cleanup-cron-run-details-7d',
  '0 4 * * *',
  $cmd$DELETE FROM cron.job_run_details WHERE end_time < now() - interval '7 days' AND end_time IS NOT NULL$cmd$
);

-- Rollback:
-- SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'cleanup-cron-run-details-7d';
-- DROP INDEX IF EXISTS cron.idx_job_run_details_jobid_start;
