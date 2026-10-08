-- 20261006212406_mitigar_pgcron_timeouts
-- Rollback: DO $$ BEGIN IF to_regprocedure('cron.alter_job(bigint,text,text,text,text,boolean)') IS NOT NULL AND has_function_privilege(current_user, 'cron.alter_job(bigint,text,text,text,text,boolean)'::regprocedure, 'EXECUTE') THEN PERFORM public.apply_pg_cron_anti_timeout(true); ELSE RAISE WARNING 'rollback_pg_cron_anti_timeout_skip: role % sem EXECUTE em cron.alter_job; horarios nao revertidos por esta sessao', current_user; END IF; END $$; DROP FUNCTION public.apply_pg_cron_anti_timeout(boolean);
--
-- Mitigacao dos 'job startup timeout' do pg_cron que o sensor reporta na chave
-- pgcron-timeout (5 timeouts em 45 execucoes em 10 minutos, 06/10 17:41 local).
--
-- CAUSA (medida no runbook docs/ops/runbook-pg-cron-capacidade.md, 02/10):
-- 'job startup timeout' NAO e job lento rodando: e o launcher do pg_cron nao
-- conseguindo INICIAR o job porque nao ha backend livre. O banco tem
-- max_worker_processes=6; quando a MESMA hora:minuto pede 6 jobs ou mais, a
-- condicao exata da falha acontece (e ela atinge qualquer job do minuto, nao um
-- job em particular). A migration 20261002541230_pg_cron_escalonar_jobs ja baixou
-- o pico de 10 para 7 jobs por minuto com offsets de minuto; esta migration
-- termina o servico e tira a frota da faixa de >=6.
--
-- MAPA (extraido das migrations deste repositorio; agenda ja com o escalonamento):
--   por minuto: talkx-scheduler-1min (* * * * *), tasks-notify-due (* * * * *),
--               ai-jobs-tick-1min (1-59 * * * *)
--   */2:   expire-stale-agent-presence (1-59/2), multiplix-send-trigger (0-58/2)
--   */5:   gmail-incremental-sync (0-55/5), connection-health-check (2-57/5)
--   */15:  cleanup-edge-rate-limits (7-52/15)
--   horaria:  avatars-refresh (7 * * * *)
--   diarias:  cleanup-link-preview-cache (12 3 * * *), vacuum-contacts-daily (42 3 * * *),
--             searchbox-budget-alert (0 12 * * *)
-- Sobre a base (3 jobs de minuto + 1 dos pares em TODO minuto = 4), os jobs de
-- cadencia longa caem nos MESMOS minutos:
--   - connection-health-check (2-57/5) coincide com cleanup-edge-rate-limits em
--     {7,22,37,52}  -> 6 jobs nesses minutos;
--   - no minuto 7 de cada hora, avatars-refresh soma o 7o job (7 > 6 workers = a
--     condicao exata do 'job startup timeout');
--   - connection-health-check coincide com as diarias em 03:12 e 03:42 -> 6 jobs;
--   - o job anual vacuum-messages-post-expurgo (20 3 2 9 *) cai no minuto 20 do
--     dia 2/9, que e justamente um minuto do gmail-incremental-sync (0-55/5, passo
--     5) -> 6 jobs nesse unico slot do ano (medido: era o ULTIMO slot >=6 depois
--     de mover so os dois primeiros jobs).
-- Medido no dia inteiro (1440 slots, 13 jobs, scripts/db-audit/pg-cron-concorrencia.py):
--   max 7 por minuto, 99 slots com >=6 jobs, 24 slots com >=7.
--
-- O QUE ESTA MIGRATION FAZ: so AGENDA. cron.alter_job muda o horario sem reescrever
-- o comando do job e sem DML direto em cron.job (proibido desde
-- 20260930430000_cron_sem_dml_direto_v2). Move TRES jobs para minutos que nao
-- colidem entre si nem com as diarias:
--   connection-health-check   2-57/5  -> 3-58/5    (sai de 03:12 e 03:42)
--   cleanup-edge-rate-limits  7-52/15 -> 4-49/15   (sai dos minutos de conn-health)
--   gmail-incremental-sync    0-55/5  -> 1-56/5    (sai do minuto 20 do dia 2/9)
-- Nenhuma cadencia muda (segue */5 e */15); nenhum comando de job e tocado; nenhum
-- job e criado, removido ou desativado. Resultado medido: max 5 por minuto,
--  0 slots com >=6 jobs e 0 com >=7 (o slot 03:20 do dia 2/9 sai de 6 para 5).
-- O offset do gmail e escolhido para nao encostar em 12 (cleanup-link-preview-cache),
-- 42 (vacuum-contacts-daily) nem nos minutos de conn-health/cleanup-edge acima.
--
-- O QUE NAO RESOLVE (de proposito; dono e outro):
--   - os 3 jobs de cadencia por minuto nao tem offset possivel (todo minuto e todo minuto);
--   - a capacidade do banco (max_worker_processes / cron.max_running_jobs) e decisao do dono.
--
-- ORDEM E IDEMPOTENCIA: rodar DEPOIS de apply_pg_cron_escalonamento(). cron.alter_job e
-- um UPDATE -> reexecutar nao duplica nem cria job. Depois de um restore, refazer na ordem
--   SELECT public.apply_pg_cron_escalonamento(false);
--   SELECT public.apply_pg_cron_anti_timeout(false);
-- (o escalonamento repoe 2-57/5, 7-52/15 e 0-55/5; esta migration repoe os offsets finais).
--
-- Classe: contrato (CREATE OR REPLACE FUNCTION + REVOKE).

CREATE OR REPLACE FUNCTION public.apply_pg_cron_anti_timeout(p_reverter boolean DEFAULT false)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, cron
AS $fn$
DECLARE
  alvo      record;
  v_invalid text;
  aplicados integer := 0;
BEGIN
  -- Valida permissao e TODOS os alvos antes do primeiro cron.alter_job. Assim, uma
  -- ausencia, duplicidade ou role local sem EXECUTE aborta sem deixar horarios
  -- parcialmente mitigados.
  IF to_regprocedure('cron.alter_job(bigint,text,text,text,text,boolean)') IS NULL
     OR NOT has_function_privilege(
       current_user,
       'cron.alter_job(bigint,text,text,text,text,boolean)'::regprocedure,
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION
      'role % nao pode executar cron.alter_job; aplique esta mitigacao com o dono do pg_cron/supabase_admin',
      current_user
      USING ERRCODE = '42501';
  END IF;

  WITH alvos AS (
    SELECT * FROM (VALUES
      -- job                         horario anterior   horario desta mitigacao
      ('connection-health-check',    '2-57/5 * * * *',  '3-58/5 * * * *'),
      ('cleanup-edge-rate-limits',   '7-52/15 * * * *', '4-49/15 * * * *'),
      ('gmail-incremental-sync',     '0-55/5 * * * *',  '1-56/5 * * * *')
    ) AS t(jobname, horario_anterior, horario_novo)
  ), contagens AS (
    SELECT alvos.jobname, count(j.jobid) AS qtd
      FROM alvos
      LEFT JOIN cron.job AS j ON j.jobname = alvos.jobname
     GROUP BY alvos.jobname
  )
  SELECT string_agg(format('%s=%s', jobname, qtd), ', ' ORDER BY jobname)
    INTO v_invalid
    FROM contagens
   WHERE qtd <> 1;

  IF v_invalid IS NOT NULL THEN
    RAISE EXCEPTION
      'cron.job deve conter exatamente 1 registro de cada job alvo (%); mitigacao abortada antes de cron.alter_job',
      v_invalid;
  END IF;

  FOR alvo IN
    SELECT t.jobname, t.horario_anterior, t.horario_novo, j.jobid
      FROM (VALUES
        ('connection-health-check',    '2-57/5 * * * *',  '3-58/5 * * * *'),
        ('cleanup-edge-rate-limits',   '7-52/15 * * * *', '4-49/15 * * * *'),
        ('gmail-incremental-sync',     '0-55/5 * * * *',  '1-56/5 * * * *')
      ) AS t(jobname, horario_anterior, horario_novo)
      JOIN cron.job AS j ON j.jobname = t.jobname
     ORDER BY t.jobname
  LOOP
    PERFORM cron.alter_job(
      job_id   := alvo.jobid,
      schedule := CASE WHEN p_reverter THEN alvo.horario_anterior
                       ELSE alvo.horario_novo END
    );
    aplicados := aplicados + 1;
  END LOOP;

  RETURN aplicados;
END;
$fn$;

-- ACL: execucao restrita ao owner e service_role.
REVOKE ALL ON FUNCTION public.apply_pg_cron_anti_timeout(boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_pg_cron_anti_timeout(boolean) TO service_role;

-- Aplicacao. O banco LOCAL do harness pode subir pg_cron em modo limitado: sem
-- cron.job completo ou com cron.alter_job executavel so pelo dono do schema cron. Nesses
-- casos, aplicar a mitigacao nao e possivel nem faz sentido; a migration avisa alto e
-- nao aplica MEIA mitigacao -- a funcao fica criada (SQL e ACL validados) para rodar
-- onde o cron existe de verdade e a role tem EXECUTE em cron.alter_job.
DO $aplicar$
DECLARE
  v_invalid text;
BEGIN
  IF to_regclass('cron.job') IS NULL THEN
    RAISE WARNING 'pg_cron ausente neste banco: apply_pg_cron_anti_timeout NAO aplicado (rode onde o cron existe)';
    RETURN;
  END IF;

  IF to_regprocedure('cron.alter_job(bigint,text,text,text,text,boolean)') IS NULL
     OR NOT has_function_privilege(
       current_user,
       'cron.alter_job(bigint,text,text,text,text,boolean)'::regprocedure,
       'EXECUTE'
     ) THEN
    RAISE WARNING
      'role % sem EXECUTE em cron.alter_job: apply_pg_cron_anti_timeout NAO aplicado neste banco local',
      current_user;
    RETURN;
  END IF;

  WITH alvos AS (
    SELECT * FROM (VALUES ('connection-health-check'), ('cleanup-edge-rate-limits'),
                          ('gmail-incremental-sync')) AS t(jobname)
  ), contagens AS (
    SELECT alvos.jobname, count(j.jobid) AS qtd
      FROM alvos
      LEFT JOIN cron.job AS j ON j.jobname = alvos.jobname
     GROUP BY alvos.jobname
  )
  SELECT string_agg(format('%s=%s', jobname, qtd), ', ' ORDER BY jobname)
    INTO v_invalid
    FROM contagens
   WHERE qtd <> 1;

  IF v_invalid IS NOT NULL THEN
    RAISE WARNING 'cron.job deve conter exatamente 1 registro de cada job alvo (%); apply_pg_cron_anti_timeout NAO aplicado neste banco', v_invalid;
    RETURN;
  END IF;

  PERFORM public.apply_pg_cron_anti_timeout(false);
END;
$aplicar$;
