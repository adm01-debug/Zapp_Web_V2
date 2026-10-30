-- instance_auth_event_series — prova da serie de eventos de auth por instancia
-- (cartao t_e75e24e9, filho do IP2 t_3ca58cb7).
--
-- O QUE PROVA:
--   1) '24h' soma 5 eventos (A=4: auth 2/disc 1/err 0; B=1: err 1); o de 30 h fica fora;
--   2) '7d' soma 7 (A=5: auth 3/disc 1; B=2: err 2); o de 9 d fica fora;
--   3) sem argumento = '24h'; chaves exatas do resultado; so contagens;
--   4) admin passa; agent e anon recebem 42501; '30d'/NULL/'7D' recebem 22023;
--   5) ACL: EXECUTE para authenticated, nao para anon/PUBLIC;
--   6) o `-- Rollback:` da migration executa, remove a funcao, e ROLLBACK TO SAVEPOINT restaura.
--
-- COMO RODA (banco LOCAL do cartao, nunca producao):
--   zapp-db-local psql . <nome-do-conjunto> < supabase/tests/instance_auth_event_series.sql
-- Papel real: request.jwt.claims + SET LOCAL ROLE authenticated/anon. Termina em ROLLBACK.
-- Sem a migration aplicada o teste FALHA ja na 1a chamada (funcao inexistente).

\set ON_ERROR_STOP on

BEGIN;

-- ------------------------------------------------------------------ fixtures
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users (id) VALUES
  ('e75e24e9-0000-4000-8000-0000000000a1'),
  ('e75e24e9-0000-4000-8000-0000000000a2');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('e75e24e9-0000-4000-8000-0000000000a1', 'admin'),
  ('e75e24e9-0000-4000-8000-0000000000a2', 'agent');
INSERT INTO public.whatsapp_connections (id, name, phone_number, instance_id)
VALUES ('e75e24e9-0000-4000-8000-0000000000c1', 'itest-auth-series', '5500000000000', 'itest-A');
SET LOCAL session_replication_role = origin;

INSERT INTO public.connection_health_logs (connection_id, instance_id, status, checked_at) VALUES
  ('e75e24e9-0000-4000-8000-0000000000c1', 'itest-A', 'no_credentials', now() - interval '1 hour'),
  ('e75e24e9-0000-4000-8000-0000000000c1', 'itest-A', 'no_credentials', now() - interval '2 hours'),
  ('e75e24e9-0000-4000-8000-0000000000c1', 'itest-A', 'disconnected',   now() - interval '3 hours'),
  ('e75e24e9-0000-4000-8000-0000000000c1', 'itest-A', 'healthy',        now() - interval '4 hours'),
  ('e75e24e9-0000-4000-8000-0000000000c1', 'itest-A', 'no_credentials', now() - interval '4 days'),
  ('e75e24e9-0000-4000-8000-0000000000c1', 'itest-B', 'error',         now() - interval '5 hours'),
  ('e75e24e9-0000-4000-8000-0000000000c1', 'itest-B', 'timeout',       now() - interval '30 hours'),
  ('e75e24e9-0000-4000-8000-0000000000c1', 'itest-B', 'healthy',       now() - interval '9 days');

-- ------------------------------------------------- 1-3) admin: somas e chaves
DO $$
DECLARE
  v_total int; v_a int[]; v_b int[]; v_keys text[]; v_n int; v_w text;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"e75e24e9-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
  SET LOCAL ROLE authenticated;

  -- 24h
  SELECT coalesce(sum(total), 0) INTO v_total
    FROM public.instance_auth_event_series('24h') WHERE instance IN ('itest-A', 'itest-B');
  IF v_total <> 5 THEN RAISE EXCEPTION '24h: total % (esperado 5)', v_total; END IF;
  SELECT ARRAY[sum(auth_failures), sum(disconnected), sum(errors), sum(total)]::int[] INTO v_a
    FROM public.instance_auth_event_series('24h') WHERE instance = 'itest-A';
  IF v_a IS DISTINCT FROM ARRAY[2, 1, 0, 4] THEN RAISE EXCEPTION '24h A: % (esperado {2,1,0,4})', v_a; END IF;
  SELECT ARRAY[sum(auth_failures), sum(disconnected), sum(errors), sum(total)]::int[] INTO v_b
    FROM public.instance_auth_event_series('24h') WHERE instance = 'itest-B';
  IF v_b IS DISTINCT FROM ARRAY[0, 0, 1, 1] THEN RAISE EXCEPTION '24h B: % (esperado {0,0,1,1})', v_b; END IF;

  -- 7d
  SELECT coalesce(sum(total), 0) INTO v_total
    FROM public.instance_auth_event_series('7d') WHERE instance IN ('itest-A', 'itest-B');
  IF v_total <> 7 THEN RAISE EXCEPTION '7d: total % (esperado 7)', v_total; END IF;
  SELECT ARRAY[sum(auth_failures), sum(disconnected), sum(errors), sum(total)]::int[] INTO v_a
    FROM public.instance_auth_event_series('7d') WHERE instance = 'itest-A';
  IF v_a IS DISTINCT FROM ARRAY[3, 1, 0, 5] THEN RAISE EXCEPTION '7d A: % (esperado {3,1,0,5})', v_a; END IF;
  SELECT ARRAY[sum(auth_failures), sum(disconnected), sum(errors), sum(total)]::int[] INTO v_b
    FROM public.instance_auth_event_series('7d') WHERE instance = 'itest-B';
  IF v_b IS DISTINCT FROM ARRAY[0, 0, 2, 2] THEN RAISE EXCEPTION '7d B: % (esperado {0,0,2,2})', v_b; END IF;

  -- sem argumento = 24h
  SELECT coalesce(sum(total), 0) INTO v_total
    FROM public.instance_auth_event_series() WHERE instance IN ('itest-A', 'itest-B');
  IF v_total <> 5 THEN RAISE EXCEPTION 'sem argumento: total % (esperado 5 = 24h)', v_total; END IF;

  -- chaves exatas (so contagens: nada de error_message/IP/telefone)
  SELECT array_agg(k ORDER BY k) INTO v_keys
    FROM (SELECT jsonb_object_keys(to_jsonb(s)) AS k
            FROM (SELECT * FROM public.instance_auth_event_series('24h') LIMIT 1) s) q;
  IF v_keys IS DISTINCT FROM ARRAY['auth_failures','bucket','disconnected','errors','instance','total'] THEN
    RAISE EXCEPTION 'chaves inesperadas: %', v_keys;
  END IF;

  -- baldes: 24h = horas cheias; 7d = dias
  SELECT count(*) INTO v_n FROM public.instance_auth_event_series('24h')
   WHERE bucket <> date_trunc('hour', bucket);
  IF v_n <> 0 THEN RAISE EXCEPTION '24h: % baldes fora da hora cheia', v_n; END IF;

  RESET ROLE;

  -- janela invalida (admin): 22023
  FOREACH v_w IN ARRAY ARRAY['30d', '7D', '']::text[] LOOP
    BEGIN
      SET LOCAL ROLE authenticated;
      PERFORM * FROM public.instance_auth_event_series(v_w);
      RESET ROLE;
      RAISE EXCEPTION 'janela % foi aceita', v_w;
    EXCEPTION WHEN SQLSTATE '22023' THEN RESET ROLE;
    END;
  END LOOP;
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM * FROM public.instance_auth_event_series(NULL);
    RESET ROLE;
    RAISE EXCEPTION 'janela NULL foi aceita';
  EXCEPTION WHEN SQLSTATE '22023' THEN RESET ROLE;
  END;
END $$;

-- ------------------------------------------------------- 4) agent e anon: 42501
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"e75e24e9-0000-4000-8000-0000000000a2","role":"authenticated"}', true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM * FROM public.instance_auth_event_series('24h');
    RESET ROLE;
    RAISE EXCEPTION 'agent conseguiu ler a serie';
  EXCEPTION WHEN SQLSTATE '42501' THEN RESET ROLE;
  END;

  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM * FROM public.instance_auth_event_series('24h');
    RESET ROLE;
    RAISE EXCEPTION 'anon conseguiu ler a serie';
  EXCEPTION WHEN SQLSTATE '42501' THEN RESET ROLE;
  END;
END $$;

-- ------------------------------------------------------------------- 5) ACL
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.instance_auth_event_series(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon tem EXECUTE'; END IF;
  IF NOT has_function_privilege('authenticated', 'public.instance_auth_event_series(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated NAO tem EXECUTE'; END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
              WHERE p.oid = 'public.instance_auth_event_series(text)'::regprocedure AND a.grantee = 0) THEN
    RAISE EXCEPTION 'PUBLIC tem EXECUTE'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = 'public.instance_auth_event_series(text)'::regprocedure
                  AND prosecdef AND provolatile = 's' AND proconfig = ARRAY['search_path=public, pg_temp']) THEN
    RAISE EXCEPTION 'funcao sem SECURITY DEFINER/STABLE/search_path fixo'; END IF;
END $$;

-- -------------------------------------------- 6) T-rollback: executa o Rollback
SAVEPOINT t_rollback;

DO $$
DECLARE v_sql text;
BEGIN
  -- mesma instrucao da linha `-- Rollback:` do topo da migration
  v_sql := 'drop function if exists public.instance_auth_event_series(text)';
  EXECUTE v_sql;
  IF to_regprocedure('public.instance_auth_event_series(text)') IS NOT NULL THEN
    RAISE EXCEPTION 'Rollback nao removeu a funcao';
  END IF;
END $$;

ROLLBACK TO SAVEPOINT t_rollback;

DO $$
BEGIN
  IF to_regprocedure('public.instance_auth_event_series(text)') IS NULL THEN
    RAISE EXCEPTION 'ROLLBACK TO SAVEPOINT nao restaurou a funcao';
  END IF;
  RAISE NOTICE 'instance_auth_event_series: suite OK';
END $$;

ROLLBACK;
