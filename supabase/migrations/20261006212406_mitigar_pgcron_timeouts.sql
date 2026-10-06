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
  jid       bigint;
  qtd       integer;
  aplicados integer := 0;
BEGIN
  FOR alvo IN
    SELECT * FROM (VALUES
      -- job                         horario anterior   horario desta mitigacao
      ('connection-health-check',    '2-57/5 * * * *',  '3-58/5 * * * *'),
      ('cleanup-edge-rate-limits',   '7-52/15 * * * *', '4-49/15 * * * *'),
      ('gmail-incremental-sync',     '0-55/5 * * * *',  '1-56/5 * * * *')
    ) AS t(jobname, horario_anterior, horario_novo)
  LOOP
    -- O job e localizado por NOME, nunca por jobid: jobid e sequencia e muda em
    -- restore ou clone. Se o nome nao existir (ou existir mais de uma vez, o caso
    -- de homonimo de outro dono), a funcao falha alto em vez de aplicar meia mitigacao.
    SELECT count(*) INTO qtd FROM cron.job WHERE jobname = alvo.jobname;
    IF qtd <> 1 THEN
      RAISE EXCEPTION
        'job % esperado 1x em cron.job, encontrado % - mitigacao abortada sem aplicar nada',
        alvo.jobname, qtd;
    END IF;

    SELECT jobid INTO jid FROM cron.job WHERE jobname = alvo.jobname;
    PERFORM cron.alter_job(
      job_id   := jid,
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
  v_faltando text;
BEGIN
  IF to_regclass('cron.job') IS NULL THEN
    RAISE WARNING 'pg_cron ausente neste banco: apply_pg_cron_anti_timeout NAO aplicado (rode onde o cron existe)';
    RETURN;
  END IF;

  SELECT string_agg(alvo.jobname, ', ' ORDER BY alvo.jobname)
    INTO v_faltando
    FROM (VALUES ('connection-health-check'), ('cleanup-edge-rate-limits'),
                 ('gmail-incremental-sync')) AS alvo(jobname)
   WHERE NOT EXISTS (SELECT 1 FROM cron.job AS j WHERE j.jobname = alvo.jobname);

  IF v_faltando IS NOT NULL THEN
    RAISE WARNING 'jobs ausentes em cron.job: % - apply_pg_cron_anti_timeout NAO aplicado neste banco', v_faltando;
    RETURN;
  END IF;

  PERFORM public.apply_pg_cron_anti_timeout(false);
END;
$aplicar$;
