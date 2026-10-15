-- ============================================================================
-- performance_snapshots_retencao — retencao automatica de 7 dias (cartao t_60457211)
--
-- DEFEITO QUE ESTE TESTE TRAVA: public.performance_snapshots foi criada em
-- 20260403143300 com o comentario "Cleanup: auto-delete snapshots older than 7
-- days (via scheduled function)" — mas a "scheduled function" NUNCA existiu:
-- nenhuma funcao, nenhum job. A tela de Telemetria so limpa query_telemetry
-- (botao "Limpar +7d"), entao performance_snapshots CRESCE PARA SEMPRE (um
-- snapshot de web vitals por carga de pagina, por agente).
--
-- O QUE PROVA (na ordem de execucao):
--   T0 pre-estado: fixtures sinteticas (auth.users + profile) e o defeito
--      recriado (funcao e job derrubados);
--   T1 VERMELHO — sem a migration, public.performance_snapshots_expurgo nao
--      existe (42883): e essa a falha que o cartao manda consertar;
--   T2 aplica o ARQUIVO REAL da migration com \i (nao recria nada a mao);
--   T3 expurgo apaga SO o que passou de 7 dias e devolve quantas linhas apagou;
--   T4 EM LOTES — com p_lote=5 e 12 linhas vencidas, devolve 12 (prova que o
--      lote de 5 nao e um teto: a funcao insiste ate nao sobrar linha vencida);
--   T5 reexecutar sem linha vencida devolve 0 (idempotente);
--   T6 entrada invalida (p_days 0/-1/NULL/3651, p_lote 0/100001) negada (22023);
--   T7 ACL — anon e authenticated recebem 42501; service_role executa;
--   T8 job do pg_cron existe, aponta para a funcao e e UNICO mesmo depois de
--      reaplicar a migration (idempotencia do agendamento);
--   T9 NADA QUEBROU — a RLS da tabela continua a mesma barreira: agente
--      authenticated insere o proprio snapshot e nao apaga linha de ninguem;
--   T10 ROLLBACK — o SQL do cabecalho roda: job e funcao somem e a policy de
--      admin continua de pe.
--
-- PAPEL REAL: as asserções de RLS/ACL rodam com `SET LOCAL ROLE` (anon /
-- authenticated / service_role) + request.jwt.claims sintetico — nunca como
-- postgres (que tem BYPASSRLS e nao exercita policy nem GRANT).
--
-- ZERO EFEITO COLATERAL: tudo numa transacao que termina em ROLLBACK; o job
-- agendado dentro dela desaparece junto.
--
-- COMO RODA (da RAIZ do repositorio, com o banco local da tarefa de pe):
--   zapp-db-local up . v2-2610151950ef2b            # sobe a copia (14 min)
--   zapp-db-local env . v2-2610151950ef2b           # devolve a porta do banco desta copia
--   psql no HOSPEDEIRO, contra essa porta, com -f neste arquivo e -v mig=<caminho>
-- O \i :mig le o arquivo do repositorio, entao o psql precisa rodar no hospedeiro:
-- `zapp-db-local psql` despacha o psql para DENTRO do contêiner, onde o caminho nao existe.
-- O caminho da migration pode ser trocado com  -v mig=<caminho>.
-- ============================================================================

\set ON_ERROR_STOP on
\if :{?mig}
\else
\set mig supabase/migrations/20261015225440_performance_snapshots_retencao.sql
\endif

BEGIN;

-- T0 — fixtures e defeito recriado -------------------------------------------
\echo 'T0: fixtures sinteticas + defeito recriado (sem funcao, sem job)'
SET session_replication_role = replica;  -- so durante o fixture de auth/profiles

DO $$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    INSERT INTO auth.users (id) VALUES ('a1000000-0000-0000-0000-0000000000c1')
      ON CONFLICT (id) DO NOTHING;
  END IF;
  INSERT INTO public.profiles (id, user_id, name, role, is_active)
    VALUES ('b2000000-0000-0000-0000-0000000000c1', 'a1000000-0000-0000-0000-0000000000c1',
            'Agente da prova de retencao', 'agent', true)
    ON CONFLICT (user_id) DO NOTHING;
END $$;

SET session_replication_role = origin;

CREATE TEMP TABLE t_fix AS
  SELECT id AS profile_id FROM public.profiles
   WHERE user_id = 'a1000000-0000-0000-0000-0000000000c1';

DO $$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM t_fix;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'T0 FALHOU: fixture de profile nao entrou (achei %)', v_n;
  END IF;

  -- defeito recriado: nada de funcao nem de job de retencao
  -- pg_cron NAO vem instalado na copia de trabalho: um stub minimo da MESMA API
  -- (cron.job + cron.schedule/unschedule) deixa o agendamento exercitavel. O stub
  -- e uma dependencia externa a migration — nao recria o que ela cria.
  IF to_regprocedure('cron.schedule(text,text,text)') IS NULL THEN
    CREATE SCHEMA cron;
    CREATE TABLE cron.job (
      jobid    bigserial PRIMARY KEY,
      jobname  text,
      schedule text,
      command  text,
      active   boolean NOT NULL DEFAULT true
    );
    CREATE FUNCTION cron.schedule(p_jobname text, p_schedule text, p_command text)
    RETURNS bigint LANGUAGE sql AS $stub$
      INSERT INTO cron.job (jobname, schedule, command, active)
      VALUES (p_jobname, p_schedule, p_command, true)
      RETURNING jobid
    $stub$;
    CREATE FUNCTION cron.unschedule(p_jobid bigint)
    RETURNS boolean LANGUAGE sql AS $stub$
      DELETE FROM cron.job WHERE jobid = p_jobid; SELECT true
    $stub$;
    RAISE NOTICE 'T0: stub de cron criado (pg_cron ausente no banco local)';
  END IF;
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'performance-snapshots-retention';
  DROP FUNCTION IF EXISTS public.performance_snapshots_expurgo(integer, integer);

  -- linhas: 2 vencidas (10 e 8 dias), 2 dentro da janela (6 dias e agora)
  INSERT INTO public.performance_snapshots (profile_id, overall_score, created_at)
  SELECT f.profile_id, v.score, now() - make_interval(days => v.dias)
    FROM t_fix f
    CROSS JOIN (VALUES (80, 10), (81, 8), (90, 6), (95, 0)) AS v(score, dias);

  SELECT count(*) INTO v_n FROM public.performance_snapshots;
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'T0 FALHOU: esperava 4 snapshots de fixture, achei %', v_n;
  END IF;
  RAISE NOTICE 'T0 OK: 4 snapshots (2 vencidos, 2 na janela) e o defeito recriado';
END $$;

-- T1 — VERMELHO: a funcao nao existe antes da migration ----------------------
\echo 'T1: sem a migration, performance_snapshots_expurgo nao existe (42883)'
DO $$
BEGIN
  BEGIN
    PERFORM public.performance_snapshots_expurgo();
    RAISE EXCEPTION 'T1 FALHOU: a funcao existia antes da migration';
  EXCEPTION WHEN undefined_function THEN
    RAISE NOTICE 'T1 OK: funcao ausente (undefined_function) — defeito reproduzido';
  END;
END $$;

-- T2 — aplica a MIGRATION REAL ----------------------------------------------
\echo 'T2: aplicando o arquivo real da migration (\i :mig)'
\i :mig

-- T3 — expurgo apaga so o vencido -------------------------------------------
\echo 'T3: expurgo apaga o que passou de 7 dias e preserva o resto'
DO $$
DECLARE v_apagadas int; v_velhas int; v_novas int;
BEGIN
  v_apagadas := public.performance_snapshots_expurgo();

  SELECT count(*) INTO v_velhas FROM public.performance_snapshots WHERE created_at < now() - interval '7 days';
  SELECT count(*) INTO v_novas  FROM public.performance_snapshots WHERE created_at >= now() - interval '7 days';

  IF v_apagadas <> 2 THEN
    RAISE EXCEPTION 'T3 FALHOU: devolveu % (esperado 2 linhas vencidas)', v_apagadas;
  END IF;
  IF v_velhas <> 0 THEN
    RAISE EXCEPTION 'T3 FALHOU: sobraram % linhas vencidas', v_velhas;
  END IF;
  IF v_novas <> 2 THEN
    RAISE EXCEPTION 'T3 FALHOU: as 2 linhas dentro da janela foram tocadas (achei %)', v_novas;
  END IF;
  RAISE NOTICE 'T3 OK: 2 apagadas (10 d e 8 d), 2 preservadas (6 d e agora)';
END $$;

-- T4 — em lotes: o lote nao e teto ------------------------------------------
\echo 'T4: com p_lote=5, 12 linhas vencidas sao todas apagadas (loop)'
DO $$
DECLARE v_apagadas int; v_sobrou int;
BEGIN
  INSERT INTO public.performance_snapshots (profile_id, overall_score, created_at)
  SELECT f.profile_id, 70, now() - interval '30 days'
    FROM t_fix f, generate_series(1, 12);

  v_apagadas := public.performance_snapshots_expurgo(7, 5);

  SELECT count(*) INTO v_sobrou FROM public.performance_snapshots WHERE created_at < now() - interval '7 days';
  IF v_apagadas <> 12 THEN
    RAISE EXCEPTION 'T4 FALHOU: devolveu % com p_lote=5 (esperado 12 — o lote nao pode ser teto)', v_apagadas;
  END IF;
  IF v_sobrou <> 0 THEN
    RAISE EXCEPTION 'T4 FALHOU: sobraram % linhas vencidas depois do loop', v_sobrou;
  END IF;
  RAISE NOTICE 'T4 OK: 12 linhas em lotes de 5 (3 voltas)';
END $$;

-- T5 — idempotente ----------------------------------------------------------
\echo 'T5: reexecutar sem linha vencida devolve 0'
DO $$
DECLARE v_apagadas int;
BEGIN
  v_apagadas := public.performance_snapshots_expurgo();
  IF v_apagadas <> 0 THEN
    RAISE EXCEPTION 'T5 FALHOU: reexecucao devolveu % (esperado 0)', v_apagadas;
  END IF;
  RAISE NOTICE 'T5 OK: 0 (nada vencido)';
END $$;

-- T6 — entrada invalida ------------------------------------------------------
\echo 'T6: entrada invalida e negada (22023)'
DO $$
DECLARE
  v_casos text[] := array['d0', 'dneg', 'dnull', 'd3651', 'l0', 'l100001'];
  v_caso text;
  v_ok   int := 0;
BEGIN
  FOREACH v_caso IN ARRAY v_casos LOOP
    BEGIN
      IF v_caso = 'd0'     THEN PERFORM public.performance_snapshots_expurgo(0);
      ELSIF v_caso = 'dneg' THEN PERFORM public.performance_snapshots_expurgo(-1);
      ELSIF v_caso = 'dnull' THEN PERFORM public.performance_snapshots_expurgo(NULL);
      ELSIF v_caso = 'd3651' THEN PERFORM public.performance_snapshots_expurgo(3651);
      ELSIF v_caso = 'l0'   THEN PERFORM public.performance_snapshots_expurgo(7, 0);
      ELSE PERFORM public.performance_snapshots_expurgo(7, 100001);
      END IF;
      RAISE EXCEPTION 'T6 FALHOU: caso % foi aceito', v_caso;
    EXCEPTION WHEN invalid_parameter_value THEN
      v_ok := v_ok + 1;
    END;
  END LOOP;

  IF v_ok <> 6 THEN
    RAISE EXCEPTION 'T6 FALHOU: % de 6 casos negados', v_ok;
  END IF;
  RAISE NOTICE 'T6 OK: 6 entradas invalidas negadas com 22023';
END $$;

-- T7 — ACL: quem pode executar ----------------------------------------------
\echo 'T7: anon e authenticated negados (42501); service_role executa'
DO $$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'performance_snapshots_expurgo';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'T7 FALHOU: % assinaturas da funcao (esperado 1)', v_n;
  END IF;
END $$;

SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM public.performance_snapshots_expurgo();
    RAISE EXCEPTION 'T7 FALHOU: anon executou o expurgo';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'T7 OK: anon negado (42501)';
  END;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claims', json_build_object('sub', 'a1000000-0000-0000-0000-0000000000c1')::text, true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.performance_snapshots_expurgo();
    RAISE EXCEPTION 'T7 FALHOU: agente authenticated executou o expurgo';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'T7 OK: authenticated negado (42501)';
  END;
END $$;
RESET ROLE;

SET LOCAL ROLE service_role;
DO $$
DECLARE v_n int;
BEGIN
  -- profile_id literal: a tabela temporaria do fixture nao e visivel depois da troca de papel
  INSERT INTO public.performance_snapshots (profile_id, overall_score, created_at)
  VALUES ('b2000000-0000-0000-0000-0000000000c1', 60, now() - interval '40 days');
  v_n := public.performance_snapshots_expurgo();
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'T7 FALHOU: service_role devolveu % (esperado 1)', v_n;
  END IF;
  RAISE NOTICE 'T7 OK: service_role executou o expurgo (1 linha vencida)';
END $$;
RESET ROLE;

-- T8 — agendamento (pg_cron) -------------------------------------------------
\echo 'T8: job performance-snapshots-retention existe, aponta a funcao e e unico'
\i :mig
DO $$
DECLARE v_n int; v_cmd text; v_sched text;
BEGIN
  IF to_regprocedure('cron.schedule(text,text,text)') IS NULL THEN
    RAISE NOTICE 'T8 SKIP: sem agendador (cron.schedule) neste banco — nada a conferir';
    RETURN;
  END IF;

  SELECT count(*) INTO v_n FROM cron.job WHERE jobname = 'performance-snapshots-retention';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'T8 FALHOU: % jobs com o nome (esperado 1 — reagendar nao pode duplicar)', v_n;
  END IF;

  SELECT command, schedule INTO v_cmd, v_sched FROM cron.job WHERE jobname = 'performance-snapshots-retention';
  IF v_cmd NOT ILIKE '%performance_snapshots_expurgo%' THEN
    RAISE EXCEPTION 'T8 FALHOU: o job nao chama a funcao de expurgo: %', v_cmd;
  END IF;
  IF v_sched IS NULL OR v_sched = '' THEN
    RAISE EXCEPTION 'T8 FALHOU: job sem agenda';
  END IF;
  RAISE NOTICE 'T8 OK: 1 job (%) -> %', v_sched, v_cmd;
END $$;

-- T9 — nada quebrou: RLS da tabela segue igual ---------------------------------
\echo 'T9: agente insere o proprio snapshot e NAO apaga linha de ninguem'
SELECT set_config('request.jwt.claims', json_build_object('sub', 'a1000000-0000-0000-0000-0000000000c1')::text, true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_perfil uuid := 'b2000000-0000-0000-0000-0000000000c1';
BEGIN
  INSERT INTO public.performance_snapshots (profile_id, overall_score) VALUES (v_perfil, 88);
  RAISE NOTICE 'T9 OK: agente inseriu o proprio snapshot (policy de INSERT intacta)';
END $$;
RESET ROLE;

SET LOCAL ROLE authenticated;
DO $$
DECLARE v_afetadas int;
BEGIN
  DELETE FROM public.performance_snapshots;
  GET DIAGNOSTICS v_afetadas = ROW_COUNT;
  IF v_afetadas <> 0 THEN
    RAISE EXCEPTION 'T9 FALHOU: agente authenticated apagou % linhas (RLS frouxa)', v_afetadas;
  END IF;
  RAISE NOTICE 'T9 OK: agente nao apaga nada (RLS continua a barreira)';
END $$;
RESET ROLE;

-- T10 — rollback executavel ---------------------------------------------------
\echo 'T10: o SQL do Rollback roda e desfaz so o que a migration criou'
DO $$ BEGIN
  IF to_regprocedure('cron.schedule(text,text,text)') IS NOT NULL THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'performance-snapshots-retention';
  END IF;
END $$;
DROP FUNCTION IF EXISTS public.performance_snapshots_expurgo(integer, integer);

DO $$
DECLARE v_n int;
BEGIN
  IF to_regprocedure('public.performance_snapshots_expurgo(integer,integer)') IS NOT NULL THEN
    RAISE EXCEPTION 'T10 FALHOU: a funcao continuou de pe depois do rollback';
  END IF;
  IF to_regprocedure('cron.schedule(text,text,text)') IS NOT NULL THEN
    SELECT count(*) INTO v_n FROM cron.job WHERE jobname = 'performance-snapshots-retention';
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'T10 FALHOU: o job continuou agendado depois do rollback';
    END IF;
  END IF;
  SELECT count(*) INTO v_n FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
   WHERE c.relname = 'performance_snapshots' AND p.polcmd = 'd';
  IF v_n < 1 THEN
    RAISE EXCEPTION 'T10 FALHOU: a policy de DELETE de admin sumiu no rollback';
  END IF;
  RAISE NOTICE 'T10 OK: funcao e job removidos; policy de admin intacta';
END $$;

ROLLBACK;
\echo 'SUITE VERDE: performance_snapshots_retencao'
