-- ============================================================================
-- my_network_status — RPC de diagnostico de rede para o painel de geo (t_684693d3)
--
-- DEFEITO QUE ESTE TESTE TRAVA: nao existia fonte no banco que dissesse ao admin
-- "o que a politica de rede detecta para voce" (pais do cf-ipcountry e IP do
-- x-forwarded-for, exatamente como request-policy.ts/getClientIP enxergam). Sem
-- isso o painel nao distingue "geo funcionando" de "gateway nao informa pais".
--
-- O QUE PROVA (criterio de pronto do cartao), na ordem de execucao:
--   T0 ESTRUTURA — a funcao existe, e SECURITY DEFINER e tem search_path fixo;
--   T1 ACL/ESTRUTURA — PUBLIC e anon NAO tem EXECUTE; authenticated tem;
--   T2 NEGACAO anon — chamada negada (42501);
--   T3 NEGACAO agente — authenticated sem admin/supervisor negado (42501) e a
--      mensagem e IDENTICA com ou sem usuario existente (sem oraculo);
--   T4 ADMIN sem cabecalhos — country NULL ("gateway nao informa pais") e
--      ip_seen 'unknown' (a sentinela que getClientIP devolve);
--   T5 ADMIN com cabecalhos — country 'BR' e ip_seen = ULTIMO item de
--      x-forwarded-for (9.9.9.9), nao o primeiro;
--   T6 country normalizado/validado — ' br ' vira 'BR'; 'brazil', 'b', '-', ''
--      viram NULL (mesma regra de normalizeCountryCode);
--   T7 so cabecalho confiavel — 'x-country: RU' e IGNORADO (country NULL) e
--      x-real-ip vale quando x-forwarded-for falta ou tem ultimo item vazio;
--   T8 SUPERVISOR tambem passa (o cartao pede admin/supervisor);
--   T9 service_role sem chamador humano NAO passa (42501);
--   T10 ROLLBACK executavel — o DROP FUNCTION do cabecalho da migration roda.
--
-- VERMELHO antes do verde: sem a migration, T0 falha (funcao ausente) e T4–T8
-- falham por nao haver o que chamar. Com a migration aplicada, a suite fecha
-- verde. A negacao (T2/T3/T9) so passa a valer junto com o GRANT/REVOKE dela.
--
-- COMO A PROTECAO ENTRA NO TESTE: a funcao testada e o objeto REAL aplicado pela
-- migration (via `hermes-db-migrar supabase/migrations/20261016002012_my_network_status.sql`
-- no banco local da tarefa) — DDL nenhuma e reescrita a mao aqui; o T10 prova o
-- SQL de rollback do cabecalho da migration.
--
-- PAPEL REAL: as chamadas rodam com SET LOCAL ROLE (anon / authenticated /
-- service_role) + request.jwt.claims sintetico — nunca como postgres, que
-- ignoraria o REVOKE e o auth.uid().
--
-- ZERO EFEITO COLATERAL: tudo numa transacao que termina em ROLLBACK (a fixture
-- de auth.users roda com session_replication_role = replica e volta a origin).
--
-- COMO RODA (a partir da RAIZ do repositorio, contra o banco local da tarefa):
--   zapp-db-local psql . v2-mynetstatus < supabase/tests/my_network_status.sql
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- Fixture: 1 admin, 1 supervisor, 1 agente ------------------------------------
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users (id) VALUES
  ('aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa'),
  ('bbbbbbbb-2222-2222-2222-bbbbbbbbbbbb'),
  ('cccccccc-3333-3333-3333-cccccccccccc');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa', 'admin'),
  ('bbbbbbbb-2222-2222-2222-bbbbbbbbbbbb', 'supervisor'),
  ('cccccccc-3333-3333-3333-cccccccccccc', 'agent');
RESET session_replication_role;

-- T0 — estrutura --------------------------------------------------------------
\echo 'T0: funcao existe, SECURITY DEFINER, search_path fixo'
DO $$
DECLARE v_secdef bool; v_cfg text[];
BEGIN
  SELECT p.prosecdef, p.proconfig INTO v_secdef, v_cfg
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'my_network_status';
  IF v_secdef IS NULL THEN
    RAISE EXCEPTION 'T0 FALHOU: public.my_network_status() nao existe';
  END IF;
  IF NOT v_secdef THEN
    RAISE EXCEPTION 'T0 FALHOU: nao e SECURITY DEFINER';
  END IF;
  IF v_cfg IS NULL OR NOT EXISTS (SELECT 1 FROM unnest(v_cfg) c WHERE c LIKE 'search_path=%public%') THEN
    RAISE EXCEPTION 'T0 FALHOU: sem search_path fixo (proconfig=%)', v_cfg;
  END IF;
  -- sem parametro: nao ha entrada vinda do cliente
  IF (SELECT proargtypes::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='public' AND p.proname='my_network_status') <> '' THEN
    RAISE EXCEPTION 'T0 FALHOU: a funcao aceita parametro (deveria ser sem argumentos)';
  END IF;
  RAISE NOTICE 'T0 OK: SECURITY DEFINER, search_path fixo, sem argumentos';
END $$;

-- T1 — ACL: fechada por padrao -------------------------------------------------
\echo 'T1: PUBLIC/anon sem EXECUTE; authenticated com EXECUTE'
DO $$
DECLARE v_public bool; v_anon bool; v_auth bool;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace,
         aclexplode(coalesce(p.proacl, '{}')) a
    WHERE n.nspname = 'public' AND p.proname = 'my_network_status'
      AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'
  ) INTO v_public;
  v_anon := has_function_privilege('anon', 'public.my_network_status()', 'EXECUTE');
  v_auth := has_function_privilege('authenticated', 'public.my_network_status()', 'EXECUTE');
  IF v_public THEN RAISE EXCEPTION 'T1 FALHOU: PUBLIC tem EXECUTE'; END IF;
  IF v_anon THEN RAISE EXCEPTION 'T1 FALHOU: anon tem EXECUTE'; END IF;
  IF NOT v_auth THEN RAISE EXCEPTION 'T1 FALHOU: authenticated NAO tem EXECUTE (admin nao conseguiria chamar)'; END IF;
  RAISE NOTICE 'T1 OK: PUBLIC/anon negados, authenticated concedido';
END $$;

-- T2 — anon nao chama ---------------------------------------------------------
\echo 'T2: anon NAO executa (42501)'
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.my_network_status();
    RAISE EXCEPTION 'T2 FALHOU: anon executou a funcao';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'T2 OK: anon negado (42501)';
  END;
END $$;
RESET ROLE;

-- T3 — agente negado, sem oraculo --------------------------------------------
\echo 'T3: agente negado (42501) e mensagem igual com/sem usuario existente'
CREATE TEMP TABLE t3_errs (quem text, estado text, msg text);
GRANT INSERT, SELECT ON t3_errs TO authenticated;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'cccccccc-3333-3333-3333-cccccccccccc', 'role', 'authenticated')::text, true);
DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.my_network_status();
    RAISE EXCEPTION 'T3 FALHOU: agente executou a funcao';
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO t3_errs VALUES ('agente', SQLSTATE, SQLERRM);
  END;
END $$;
SELECT set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.my_network_status();
    RAISE EXCEPTION 'T3 FALHOU: usuario inexistente executou a funcao';
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO t3_errs VALUES ('inexistente', SQLSTATE, SQLERRM);
  END;
END $$;
RESET ROLE;
DO $$
DECLARE v_n int; v_dif int;
BEGIN
  SELECT count(*) INTO v_n FROM t3_errs;
  SELECT count(DISTINCT (estado, msg)) INTO v_dif FROM t3_errs;
  IF v_n <> 2 THEN RAISE EXCEPTION 'T3 FALHOU: esperava 2 negacoes capturadas, achei %', v_n; END IF;
  IF v_dif <> 1 THEN RAISE EXCEPTION 'T3 FALHOU: mensagem difere entre usuario existente e inexistente (oraculo)'; END IF;
  RAISE NOTICE 'T3 OK: 42501 identico nos dois casos';
END $$;

-- T4 — admin sem cabecalhos --------------------------------------------------
\echo 'T4: admin sem pais/ip -> country NULL, ip_seen unknown'
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa', 'role', 'authenticated')::text, true);
SELECT set_config('request.headers', '{"user-agent":"curl/8.0"}', true);
DO $$
DECLARE v_country text; v_ip text;
BEGIN
  SELECT country, ip_seen INTO v_country, v_ip FROM public.my_network_status();
  IF v_country IS NOT NULL THEN RAISE EXCEPTION 'T4 FALHOU: country deveria ser NULL, veio %', v_country; END IF;
  IF v_ip <> 'unknown' THEN RAISE EXCEPTION 'T4 FALHOU: ip_seen esperado unknown, veio %', v_ip; END IF;
  RAISE NOTICE 'T4 OK: country NULL e ip_seen unknown';
END $$;

-- T5 — admin com cabecalhos (ultimo item do XFF) ------------------------------
\echo 'T5: admin com cf-ipcountry=br e XFF -> BR / ultimo IP'
SELECT set_config('request.headers',
  '{"cf-ipcountry":"br","x-forwarded-for":"1.2.3.4, 9.9.9.9","user-agent":"ua"}', true);
DO $$
DECLARE v_country text; v_ip text;
BEGIN
  SELECT country, ip_seen INTO v_country, v_ip FROM public.my_network_status();
  IF v_country <> 'BR' THEN RAISE EXCEPTION 'T5 FALHOU: country esperado BR, veio %', v_country; END IF;
  IF v_ip <> '9.9.9.9' THEN RAISE EXCEPTION 'T5 FALHOU: ip_seen esperado 9.9.9.9 (ultimo do XFF), veio %', v_ip; END IF;
  RAISE NOTICE 'T5 OK: BR / 9.9.9.9';
END $$;

-- T6 — normalizacao e validacao do pais --------------------------------------
\echo 'T6: normalizacao/validacao do cf-ipcountry'
DO $$
DECLARE
  v_casos text[][] := ARRAY[
    [' br ', 'BR'], ['BR', 'BR'], ['brazil', NULL], ['b', NULL],
    ['-', NULL], ['', NULL], ['0x', NULL], ['BR2', NULL]
  ];
  v_raw text; v_esperado text; v_country text; v_i int;
BEGIN
  FOR v_i IN 1..array_length(v_casos, 1) LOOP
    v_raw := v_casos[v_i][1];
    v_esperado := v_casos[v_i][2];
    PERFORM set_config('request.headers', json_build_object('cf-ipcountry', v_raw)::text, true);
    SELECT country INTO v_country FROM public.my_network_status();
    IF v_country IS DISTINCT FROM v_esperado THEN
      RAISE EXCEPTION 'T6 FALHOU: cf-ipcountry=% deu % (esperado %)', v_raw, v_country, v_esperado;
    END IF;
  END LOOP;
  RAISE NOTICE 'T6 OK: trim/maiusculas aplicados; invalidos viram NULL';
END $$;

-- T7 — so cabecalho confiavel; fallback de IP --------------------------------
\echo 'T7: x-country ignorado; x-real-ip como fallback'
SELECT set_config('request.headers',
  '{"x-country":"RU","x-real-ip":"10.0.0.1","user-agent":"ua"}', true);
DO $$
DECLARE v_country text; v_ip text;
BEGIN
  SELECT country, ip_seen INTO v_country, v_ip FROM public.my_network_status();
  IF v_country IS NOT NULL THEN RAISE EXCEPTION 'T7 FALHOU: x-country (nao confiavel) foi usado: %', v_country; END IF;
  IF v_ip <> '10.0.0.1' THEN RAISE EXCEPTION 'T7 FALHOU: esperado x-real-ip 10.0.0.1, veio %', v_ip; END IF;
  RAISE NOTICE 'T7a OK: x-country ignorado, x-real-ip usado';
END $$;
SELECT set_config('request.headers',
  '{"cf-ipcountry":"us","x-forwarded-for":"1.2.3.4,","x-real-ip":"10.0.0.2"}', true);
DO $$
DECLARE v_ip text;
BEGIN
  SELECT ip_seen INTO v_ip FROM public.my_network_status();
  IF v_ip <> '10.0.0.2' THEN
    RAISE EXCEPTION 'T7 FALHOU: XFF com ultimo item vazio deveria cair em x-real-ip, veio %', v_ip;
  END IF;
  RAISE NOTICE 'T7b OK: ultimo item vazio do XFF cai em x-real-ip';
END $$;
RESET ROLE;

-- T8 — supervisor tambem passa -------------------------------------------------
\echo 'T8: supervisor tambem recebe o status'
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'bbbbbbbb-2222-2222-2222-bbbbbbbbbbbb', 'role', 'authenticated')::text, true);
SELECT set_config('request.headers', '{"cf-ipcountry":"pt","x-forwarded-for":"8.8.8.8"}', true);
DO $$
DECLARE v_country text;
BEGIN
  SELECT country INTO v_country FROM public.my_network_status();
  IF v_country <> 'PT' THEN RAISE EXCEPTION 'T8 FALHOU: supervisor nao recebeu o status (country=%)', v_country; END IF;
  RAISE NOTICE 'T8 OK: supervisor recebe PT';
END $$;
RESET ROLE;

-- T9 — service_role nao passa (sem chamador humano) ---------------------------
\echo 'T9: service_role sem JWT NAO recebe o status (42501)'
SELECT set_config('request.jwt.claims', '{}', true); -- sem JWT: nenhum chamador humano
SET LOCAL ROLE service_role;
DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.my_network_status();
    RAISE EXCEPTION 'T9 FALHOU: service_role recebeu o status';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'T9 OK: service_role negado (42501)';
  END;
END $$;
RESET ROLE;

-- T10 — rollback executavel ----------------------------------------------------
\echo 'T10: o DROP FUNCTION do rollback roda'
DROP FUNCTION IF EXISTS public.my_network_status();
DO $$
BEGIN
  IF to_regprocedure('public.my_network_status()') IS NOT NULL THEN
    RAISE EXCEPTION 'T10 FALHOU: a funcao continuou existindo apos o DROP do rollback';
  END IF;
  RAISE NOTICE 'T10 OK: rollback (DROP FUNCTION) suficiente';
END $$;

ROLLBACK;
\echo 'SUITE VERDE: my_network_status'
