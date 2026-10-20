-- ============================================================================
-- sla_configurations_single_default — no máximo UM padrão ATIVO (cartão t_18e5bdba)
--
-- DEFEITO QUE ESTE TESTE TRAVA: public.sla_configurations não tinha unicidade de
-- is_default. Com dois padrões ativos, quem lê "o padrão" com LIMIT 1 (o SLA
-- aplicável) escolhia linha arbitrária — o comportamento mudava entre consultas.
--
-- O QUE PROVA (critério de pronto do cartão), na ordem de execução:
--   T0 estado de partida: existe exatamente 1 padrão ativo;
--   T1 PASSA service_role — INSERT de config NÃO-padrão é aceito (nada quebrou);
--   T2 NEGAÇÃO service_role — INSERT de 2º padrão ativo negado (23505): a única
--      barreira é o índice, e ele vale para TODOS os papéis (índice não passa por
--      RLS, logo nem service_role/BYPASSRLS escapa);
--   T3 NEGAÇÃO service_role — UPDATE de outra config ativa para is_default=true
--      também negado (23505): não adianta virar o padrão por UPDATE;
--   T4 NEGAÇÃO anon — INSERT de padrão ativo negado (42501, RLS);
--   T5 NEGAÇÃO agente (authenticated sem admin) — idem (42501, RLS);
--   T6 ESTRUTURA — existe índice ÚNICO e PARCIAL com predicado
--      is_default AND is_active;
--   T7 CORREÇÃO ponta a ponta (reaplicando a MIGRATION REAL via \i): partindo de
--      um estado com 2 padrões ativos, a migration deixa exatamente 1 e PRESERVA o
--      updated_at das linhas rebaixadas (o gatilho de updated_at fica desligado em
--      volta do reparo);
--   T8 ROLLBACK executável — o DROP INDEX do cabeçalho da migration roda e
--      derruba a barreira (o 2º padrão volta a ser aceito).
--
-- VERMELHO antes do verde: com o índice ausente (pré-migração), o PRIMEIRO teste
-- comportamental — T2 — falha ("2º padrão ativo por INSERT foi aceito"); T2/T3 são
-- as asserções que o defeito derruba. Com a migration aplicada, a suíte fecha verde.
--
-- COMO A PROTEÇÃO ENTRA NO TESTE: o índice NÃO é reescrito à mão — a migration
-- real é aplicada VERBATIM com `\i`, como já fazem
-- supabase/tests/user_roles_troca_de_papel_autorizacao_e_auditoria.sql e
-- supabase/tests/indeterminate_optout_outbox.sql. O T7 derruba o índice para
-- recriar o pré-estado do defeito e então reaplica a migration sobre ele.
--
-- PAPEL REAL: as asserções de RLS rodam com `SET LOCAL ROLE` (anon / authenticated
-- / service_role) + request.jwt.claims sintético — nunca como postgres, que tem
-- BYPASSRLS e não exerce policy alguma.
--
-- ZERO EFEITO COLATERAL: tudo numa transação que termina em ROLLBACK.
--
-- COMO RODA (a partir da RAIZ do repositório, contra o banco local da tarefa):
--   zapp-db-local psql . v2-2610122243e611 < supabase/tests/sla_configurations_single_default.sql
-- (o caminho da migration pode ser passado adiante com  -v mig=<caminho absoluto> )
-- ============================================================================

\set ON_ERROR_STOP on
\if :{?mig}
\else
\set mig supabase/migrations/20261013014629_sla_config_single_default.sql
\endif

BEGIN;

-- T0 -------------------------------------------------------------------------
\echo 'T0: estado de partida tem exatamente 1 padrao ativo'
DO $$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM public.sla_configurations WHERE is_default IS TRUE AND is_active IS TRUE;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'T0 FALHOU: % padroes ativos (esperado 1)', v_n;
  END IF;
  RAISE NOTICE 'T0 OK: 1 padrao ativo';
END $$;

-- T1 — service_role: escrita legitima passa ---------------------------------
\echo 'T1: service_role cria uma config NAO-padrao (escrita legitima passa)'
SET LOCAL ROLE service_role;
INSERT INTO public.sla_configurations (name, is_default, is_active)
VALUES ('prova-service-nao-default', false, true);
DO $$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM public.sla_configurations WHERE name = 'prova-service-nao-default';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'T1 FALHOU: service_role nao conseguiu inserir config nao-padrao';
  END IF;
  RAISE NOTICE 'T1 OK: config nao-padrao inserida';
END $$;

-- T2 — service_role: 2o padrao ativo por INSERT negado (23505) ---------------
\echo 'T2: service_role NAO cria um 2o padrao ativo por INSERT (23505)'
DO $$
BEGIN
  BEGIN
    INSERT INTO public.sla_configurations (name, is_default, is_active)
    VALUES ('prova-service-default', true, true);
    RAISE EXCEPTION 'T2 FALHOU: 2o padrao ativo por INSERT foi aceito';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'T2 OK: 2o padrao ativo por INSERT negado (23505)';
  END;
END $$;

-- T3 — service_role: 2o padrao ativo por UPDATE negado (23505) ---------------
\echo 'T3: service_role NAO vira outra config ativa em padrao por UPDATE (23505)'
DO $$
BEGIN
  BEGIN
    UPDATE public.sla_configurations SET is_default = true
     WHERE name = 'prova-service-nao-default';
    RAISE EXCEPTION 'T3 FALHOU: 2o padrao ativo por UPDATE foi aceito';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'T3 OK: 2o padrao ativo por UPDATE negado (23505)';
  END;
END $$;
RESET ROLE;

-- T4 — anon -----------------------------------------------------------------
\echo 'T4: anon NAO cria um padrao ativo (RLS)'
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    INSERT INTO public.sla_configurations (name, is_default, is_active)
    VALUES ('prova-anon-default', true, true);
    RAISE EXCEPTION 'T4 FALHOU: anon criou um padrao ativo';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'T4 OK: anon negado pela RLS (42501)';
  END;
END $$;
RESET ROLE;

-- T5 — agente (authenticated sem admin) -------------------------------------
\echo 'T5: agente (authenticated nao-admin) NAO cria um padrao ativo (RLS)'
SELECT set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid())::text, true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    INSERT INTO public.sla_configurations (name, is_default, is_active)
    VALUES ('prova-agente-default', true, true);
    RAISE EXCEPTION 'T5 FALHOU: agente criou um padrao ativo';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'T5 OK: agente negado pela RLS (42501)';
  END;
END $$;
RESET ROLE;

-- T6 — estrutura ------------------------------------------------------------
\echo 'T6: indice unico parcial existe com o predicado exigido'
DO $$
DECLARE v_def text; v_uniq boolean;
BEGIN
  SELECT i.indisunique, pg_get_indexdef(i.indexrelid)
    INTO v_uniq, v_def
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indexrelid
   WHERE c.relname = 'sla_configurations_single_active_default_idx';
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'T6 FALHOU: indice sla_configurations_single_active_default_idx ausente';
  END IF;
  IF NOT v_uniq THEN
    RAISE EXCEPTION 'T6 FALHOU: indice existe mas NAO e unico: %', v_def;
  END IF;
  IF v_def NOT ILIKE '%is_default%' OR v_def NOT ILIKE '%is_active%' THEN
    RAISE EXCEPTION 'T6 FALHOU: predicado do indice nao cobre is_default/is_active: %', v_def;
  END IF;
  RAISE NOTICE 'T6 OK: %', v_def;
END $$;

-- T7 — correcao ponta a ponta: reaplica a MIGRATION REAL sobre 2 padroes -----
\echo 'T7: migration real reduz 2 padroes ativos a 1 e preserva updated_at'
DROP INDEX public.sla_configurations_single_active_default_idx;
UPDATE public.sla_configurations SET is_default = true WHERE name = 'Urgente';
DO $$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM public.sla_configurations WHERE is_default IS TRUE AND is_active IS TRUE;
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'T7 PRE: esperava 2 padroes ativos no pre-estado, achei %', v_n;
  END IF;
  RAISE NOTICE 'T7 PRE OK: pre-estado do defeito recriado (2 padroes ativos)';
END $$;

CREATE TEMP TABLE t7_snapshot AS
  SELECT id, is_default, updated_at FROM public.sla_configurations WHERE name = 'Normal';

\i :mig

DO $$
DECLARE
  v_n int; v_urg bool; v_norm bool; v_after timestamptz; v_before timestamptz; v_idx int;
BEGIN
  SELECT count(*) INTO v_n FROM public.sla_configurations WHERE is_default IS TRUE AND is_active IS TRUE;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'T7 FALHOU: apos a migration ha % padroes ativos (esperado 1)', v_n;
  END IF;

  SELECT is_default INTO v_urg FROM public.sla_configurations WHERE name = 'Urgente';
  SELECT is_default, updated_at INTO v_norm, v_after FROM public.sla_configurations WHERE name = 'Normal';
  SELECT updated_at INTO v_before FROM t7_snapshot WHERE is_default IS TRUE;

  IF v_urg IS NOT TRUE THEN
    RAISE EXCEPTION 'T7 FALHOU: o padrao mais recente (Urgente) deveria ser o mantido';
  END IF;
  IF v_norm IS NOT FALSE THEN
    RAISE EXCEPTION 'T7 FALHOU: Normal deveria ter sido rebaixada, ficou is_default=%', v_norm;
  END IF;
  IF v_after IS DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'T7 FALHOU: updated_at da linha rebaixada mudou (% -> %)', v_before, v_after;
  END IF;

  SELECT count(*) INTO v_idx FROM pg_class WHERE relname = 'sla_configurations_single_active_default_idx';
  IF v_idx <> 1 THEN
    RAISE EXCEPTION 'T7 FALHOU: a migration nao recriou o indice unico parcial';
  END IF;

  RAISE NOTICE 'T7 OK: 1 padrao ativo; rebaixada preservou updated_at; indice recriado';
END $$;

-- T8 — rollback executavel ---------------------------------------------------
\echo 'T8: o DROP INDEX do rollback roda e derruba a barreira'
DROP INDEX IF EXISTS public.sla_configurations_single_active_default_idx;
SET LOCAL ROLE service_role;
DO $$
BEGIN
  INSERT INTO public.sla_configurations (name, is_default, is_active)
  VALUES ('prova-pos-rollback', true, true);
  RAISE NOTICE 'T8 OK: sem o indice, o 2o padrao ativo volta a ser aceito (rollback suficiente)';
END $$;
RESET ROLE;

ROLLBACK;
\echo 'SUITE VERDE: sla_configurations_single_default'
