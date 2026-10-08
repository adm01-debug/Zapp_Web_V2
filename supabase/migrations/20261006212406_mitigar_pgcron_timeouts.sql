-- 20261006212406_mitigar_pgcron_timeouts
-- Rollback: SELECT public.apply_pg_cron_anti_timeout(true); DROP FUNCTION public.apply_pg_cron_anti_timeout(boolean);
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
-- A aplicacao no fim do arquivo e CONDICIONAL: so roda onde o papel tem EXECUTE em
-- cron.alter_job. Onde nao tem (medido no banco local do harness: o pg_cron 1.6.4 fecha a
-- funcao para PUBLIC) a migration cria o contrato, AVISA e nao altera nada, em vez de
-- morrer com 42501. Reexecutar segue idempotente e o Rollback roda nos dois ambientes.
--
-- Classe: contrato (CREATE OR REPLACE FUNCTION + REVOKE).

CREATE OR REPLACE FUNCTION public.apply_pg_cron_anti_timeout(p_reverter boolean DEFAULT false)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, cron
AS $fn$
DECLARE
  alvo           record;
  v_invalid      text;
  aplicados      integer := 0;
  v_pode_alterar boolean;
BEGIN
  -- PRE-VALIDACAO DO CAMINHO (08/10/2026): cron.alter_job e fechada para PUBLIC pelo proprio
  -- pg_cron 1.6 (dona supabase_admin; medido no banco local: o papel postgres leva 42501
  -- "permission denied for function alter_job" -- foi o vermelho que derrubou esta entrega na
  -- fila do integrador). Sem o direito, NADA e alterado e NADA QUEBRA: avisa alto e devolve 0.
  -- A funcao segue sendo o contrato reexecutavel onde o papel tem o direito (producao) e o
  -- Rollback roda nos dois ambientes.
  SELECT coalesce(bool_or(pg_catalog.has_function_privilege(current_user, p.oid, 'EXECUTE')), false)
    INTO v_pode_alterar
    FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
   WHERE n.nspname = 'cron' AND p.proname = 'alter_job';

  IF NOT v_pode_alterar THEN
    RAISE WARNING 'apply_pg_cron_anti_timeout: papel % sem EXECUTE em cron.alter_job; NENHUM horario alterado (rode onde o papel tem o direito sobre o pg_cron)', current_user;
    RETURN 0;
  END IF;

  -- Valida TODOS os alvos antes do primeiro cron.alter_job. Assim, uma
  -- ausencia ou duplicidade em alvo posterior aborta sem deixar horarios
  -- parcialmente mitigados.
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

-- ACL fechada: ninguem alem do owner executa.
REVOKE ALL ON FUNCTION public.apply_pg_cron_anti_timeout(boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_pg_cron_anti_timeout(boolean) TO service_role;

-- Aplicacao. O banco LOCAL do harness sobe o pg_cron, mas nao os jobs do projeto (o
-- cron.schedule das migrations nao popula cron.job ali); aplicar a mitigacao nesse banco
-- nao e possivel nem faz sentido. Se algum dos tres jobs nao existir, avisa alto e nao
-- aplica MEIA mitigacao -- a funcao fica criada (SQL e ACL validados) para rodar onde o
-- cron existe de verdade.
DO $aplicar$
DECLARE
  v_invalid   text;
  v_aplicados integer;
BEGIN
  IF to_regclass('cron.job') IS NULL THEN
    RAISE WARNING 'pg_cron ausente neste banco: apply_pg_cron_anti_timeout NAO aplicado (rode onde o cron existe)';
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

  v_aplicados := public.apply_pg_cron_anti_timeout(false);
  IF v_aplicados = 0 THEN
    RAISE WARNING 'apply_pg_cron_anti_timeout: 0 job reagendado neste banco (ver o aviso acima); o contrato ficou criado e a mitigacao roda onde o papel tem direito sobre o pg_cron';
  END IF;
END;
$aplicar$;
