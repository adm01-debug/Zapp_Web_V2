-- remover_cron_vacuum_messages_post_expurgo
-- Rollback: REVOKE ALL ON FUNCTION public.apply_pg_cron_escalonamento(boolean) FROM PUBLIC, anon, authenticated; GRANT EXECUTE ON FUNCTION public.apply_pg_cron_escalonamento(boolean) TO service_role; CREATE OR REPLACE FUNCTION public.apply_pg_cron_escalonamento(p_reverter boolean DEFAULT false) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, cron AS $fn$ DECLARE alvo record; jid bigint; qtd integer; aplicados integer := 0; BEGIN FOR alvo IN SELECT * FROM (VALUES ('expire-stale-agent-presence','*/2 * * * *','1-59/2 * * * *'), ('multiplix-send-trigger','*/2 * * * *','0-58/2 * * * *'), ('gmail-incremental-sync','*/5 * * * *','0-55/5 * * * *'), ('connection-health-check','*/5 * * * *','2-57/5 * * * *'), ('cleanup-edge-rate-limits','*/15 * * * *','7-52/15 * * * *'), ('avatars-refresh','0 * * * *','7 * * * *'), ('cleanup-link-preview-cache','0 3 * * *','12 3 * * *'), ('vacuum-contacts-daily','30 3 * * *','42 3 * * *'), ('vacuum-messages-post-expurgo','0 3 2 9 *','20 3 2 9 *')) AS t(jobname, horario_original, horario_escalonado) LOOP SELECT count(*) INTO qtd FROM cron.job WHERE jobname = alvo.jobname; IF qtd <> 1 THEN RAISE EXCEPTION 'job % esperado 1x em cron.job, encontrado % - escalonamento abortado sem aplicar nada', alvo.jobname, qtd; END IF; SELECT jobid INTO jid FROM cron.job WHERE jobname = alvo.jobname; PERFORM cron.alter_job(job_id := jid, schedule := CASE WHEN p_reverter THEN alvo.horario_original ELSE alvo.horario_escalonado END); aplicados := aplicados + 1; END LOOP; RETURN aplicados; END; $fn$; SELECT cron.schedule('vacuum-messages-post-expurgo','20 3 2 9 *','VACUUM FULL ANALYZE public.messages');
--
-- Item 471 (DELTA-CRON-ANUAL) do BACKLOG_VERIFICADO.
--
-- O QUE ESTA ERRADO: o job do pg_cron `vacuum-messages-post-expurgo`
-- (comando `VACUUM FULL ANALYZE public.messages`, agenda `20 3 2 9 *`) e o resto de uma
-- tarefa pontual de manutencao depois do expurgo de `messages`. Ele nao foi removido e
-- continua agendado para rodar todo ano, para sempre.
--
-- POR QUE ISSO E RUIM, E NAO "SO UM VACUUM": `VACUUM FULL` nao e o `VACUUM` normal --
-- ele REESCREVE a tabela inteira numa copia e toma AccessExclusiveLock. Em `messages`
-- (tabela quente de escrita) isso para a escrita pelo tempo que a reescrita durar, com
-- tamanho imprevisivel, e ninguem esta esperando esse resultado. A manutencao de
-- `messages` ja e do autovacuum, afinado para a tabela
-- (20260920120100_autovacuum_hot_tables.sql). Fonte do estado vivo: auditoria da frota
-- do pg_cron (docs/audits/onda3-260930/a1-db/RELATORIO.md) e a prova do item 471
-- ("vivo: agenda 20 3 2 9 *"); o job foi criado direto no banco, sem migration no repo
-- (docs/runbooks/slo.md), por isso nao existe um arquivo para "desfazer".
--
-- O QUE ESTA MIGRATION FAZ:
--   1. cron.unschedule('vacuum-messages-post-expurgo') -- remove o job residual.
--      Via permitida: DML direto em cron.job e proibido desde
--      20260930430000_cron_sem_dml_direto_v2 (a tabela e do supabase_admin).
--   2. Reconstroi public.apply_pg_cron_escalonamento() SEM a linha do job removido.
--      A funcao LEVANTA quando um nome da lista nao existe ("esperado 1x em cron.job,
--      encontrado 0"), de proposito: e assim que ela se recusa a aplicar meia escala.
--      So que a lista e a fonte da verdade das duas vias que dependem dela -- o
--      reagendamento depois de um restore (`SELECT public.apply_pg_cron_escalonamento();`)
--      e o rollback da 20261002541230 -- e com o job removido e a linha ainda na lista
--      as duas passam a abortar. A lista tem de acompanhar a frota.
--
-- NAO TOCA: nenhum outro job, nenhuma cadencia, nenhum dado de aplicacao. So o
-- unschedule do job residual e o CREATE OR REPLACE da funcao de escala.
--
-- IDEMPOTENTE: com o job ja ausente o passo 1 nao faz nada (WHERE EXISTS) e o passo 2 e
-- um CREATE OR REPLACE: reaplicar nao duplica, nao falha e nao muda nada.
--
-- Classe: contrato (CREATE OR REPLACE FUNCTION + REVOKE) -- aplicada pelo
-- hermes-tarefa-mergear logo apos merge + deploy.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'vacuum-messages-post-expurgo') THEN
    PERFORM cron.unschedule('vacuum-messages-post-expurgo');
  END IF;

  -- Falhar alto e nao silenciar: se o job sobrou, NAO foi removido (tipicamente porque
  -- pertence a outro papel e cron.unschedule so alcanca os jobs do proprio dono).
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'vacuum-messages-post-expurgo') THEN
    RAISE EXCEPTION 'cron_vacuum_messages: o job vacuum-messages-post-expurgo continua em cron.job apos cron.unschedule()'
      USING HINT = 'Provavelmente o job esta registrado em nome de outro papel (cron.job.username <> o papel que aplica a migration). Remova como supabase_admin: SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = ''vacuum-messages-post-expurgo'';';
  END IF;
END;
$$;

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
      ('vacuum-contacts-daily',       '30 3 * * *',         '42 3 * * *')
      -- 2026-10-06: 'vacuum-messages-post-expurgo' saiu desta lista nesta migration.
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

-- ACL mantida igual a da versao anterior: ninguem alem do owner executa.
REVOKE ALL ON FUNCTION public.apply_pg_cron_escalonamento(boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_pg_cron_escalonamento(boolean) TO service_role;

-- Nota de prova: a versao anterior terminava com `SELECT public.apply_pg_cron_escalonamento(false);`
-- (smoke test na propria aplicacao) e isso NAO cabe aqui. A funcao LEVANTA de proposito
-- quando um job da lista nao existe, e os dois jobs `vacuum-*` foram criados direto no
-- banco (docs/runbooks/slo.md) -- eles nao existem no banco local/shadow, onde o apply
-- da migration roda. A chamada abortaria a migration por um motivo que nao e o defeito.
-- A prova de que o corpo novo continua funcionando (aplica 8, reverte 8, sem tocar no
-- job removido) esta em scripts/db-audit/cron-remocao-vacuum-messages.test.sh, que semeia
-- a frota real e aplica ESTE arquivo e o 20261002541230 em PostgreSQL descartavel.
