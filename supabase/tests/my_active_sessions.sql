-- Teste SQL de public.my_active_sessions() + public.expire_orphan_user_sessions().
--
-- O que prova:
--   T1  so' as sessoes VIVAS e SO' as do proprio chamador: a orfa (sem auth.sessions)
--       e a de auth_session expirada NAO saem; a sessao do outro usuario NAO sai;
--   T2  is_current marca exatamente a sessao do claim session_id do JWT (e muda quando
--       o claim muda), tanto por request.jwt.claims quanto por request.jwt.claim.session_id;
--   T3  anon NAO executa (42501 de verdade) e PUBLIC nao tem EXECUTE; authenticated tem;
--   T4  sem identidade (auth.uid() nulo) a RPC devolve 0 linhas -- nao vaza nada;
--   T5  limpeza expira (is_active=false + ended_at) a orfa e a expirada, preserva as
--       vivas, e' idempotente (2a chamada = 0) e pega sessao Auth APAGADA;
--   T6  ACL de expire_orphan_user_sessions: anon/authenticated sem EXECUTE, service_role com.
--
-- COMO RODAR (banco LOCAL da tarefa, nunca producao):
--   zapp-db-local psql . <conjunto> -v ON_ERROR_STOP=1 < supabase/tests/my_active_sessions.sql
--
-- Cria dados SINTETICOS e desfaz tudo no ROLLBACK final: nao sobra linha no banco.
-- Sem EXCEPTION = suite verde.
BEGIN;

DO $my_active_sessions$
DECLARE
  v_user_a     uuid := 'a1111111-1111-4111-8111-1111111111a1';
  v_user_b     uuid := 'b1111111-1111-4111-8111-1111111111b2';
  v_sa1        uuid := '51111111-1111-4111-8111-1111111111a1'; -- Auth viva 1 do A (sessao atual)
  v_sa2        uuid := '51111111-1111-4111-8111-1111111111a2'; -- Auth viva 2 do A
  v_sa3        uuid := '51111111-1111-4111-8111-1111111111a3'; -- Auth EXPIRADA (not_after passado)
  v_sb1        uuid := '52222222-2222-4222-8222-2222222222b1'; -- Auth viva do B
  v_us_a1      uuid := '61111111-1111-4111-8111-1111111111a1';
  v_us_a2      uuid := '61111111-1111-4111-8111-1111111111a2';
  v_us_adead   uuid := '61111111-1111-4111-8111-1111111111a3';
  v_us_aghost  uuid := '61111111-1111-4111-8111-1111111111a4';
  v_us_b1      uuid := '62222222-2222-4222-8222-2222222222b1';
  v_total      integer;
  v_cur        integer;
  v_cur_id     uuid;
  v_barrado    boolean;
  v_n          integer;
  v_n2         integer;
  v_ok         integer := 0;
BEGIN
  -- ---------------------------------------------------------------- dados
  INSERT INTO auth.users (id, email) VALUES
    (v_user_a, 'sessoes-reais-a@local.test'),
    (v_user_b, 'sessoes-reais-b@local.test');

  INSERT INTO auth.sessions (id, user_id, not_after) VALUES
    (v_sa1, v_user_a, now() + interval '7 days'),
    (v_sa2, v_user_a, now() + interval '7 days'),
    (v_sa3, v_user_a, now() - interval '1 day'),   -- ja' passou: sessao morta
    (v_sb1, v_user_b, now() + interval '7 days');

  -- us_a1/us_a2 vivas; us_adead aponta para Auth EXPIRADA; us_aghost sem auth_session.
  INSERT INTO public.user_sessions
    (id, user_id, ip_address, user_agent, is_active, started_at, last_activity_at, expires_at, auth_session_id) VALUES
    (v_us_a1,    v_user_a, '10.0.0.1', 'ua-a1',   true, now() - interval '1 hour',  now() - interval '5 minutes',  now() + interval '1 day', v_sa1),
    (v_us_a2,    v_user_a, '10.0.0.2', 'ua-a2',   true, now() - interval '2 hours', now() - interval '1 hour',     now() + interval '1 day', v_sa2),
    (v_us_adead, v_user_a, '10.0.0.3', 'ua-dead', true, now() - interval '2 days',  now() - interval '2 days',     now() + interval '1 day', v_sa3),
    (v_us_aghost,v_user_a, '10.0.0.4', 'ua-ghost',true, now() - interval '3 days',  now() - interval '3 days',     now() + interval '1 day', NULL),
    (v_us_b1,    v_user_b, '10.0.1.1', 'ua-b1',   true, now() - interval '1 hour',  now() - interval '10 minutes', now() + interval '1 day', v_sb1);

  -- ---------------------------------------------------------------- T1
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_a, 'session_id', v_sa1)::text, true);
  PERFORM set_config('role', 'authenticated', true);

  SELECT count(*) INTO v_total FROM public.my_active_sessions();
  SELECT count(*) INTO v_cur   FROM public.my_active_sessions() WHERE is_current;

  -- Nenhuma linha pode ser do usuario B nem das mortas: os auth_session_id sao exatamente sa1/sa2.
  IF v_total <> 2 THEN
    PERFORM set_config('role', session_user, true);
    RAISE EXCEPTION 'T1 FALHOU: A devia ver 2 sessoes vivas e viu %', v_total;
  END IF;
  IF EXISTS (SELECT 1 FROM public.my_active_sessions() WHERE auth_session_id NOT IN (v_sa1, v_sa2)) THEN
    PERFORM set_config('role', session_user, true);
    RAISE EXCEPTION 'T1 FALHOU: apareceu sessao fora das vivas do chamador (orfa/expirada/do outro usuario)';
  END IF;
  IF EXISTS (SELECT 1 FROM public.my_active_sessions() WHERE id IN (v_us_adead, v_us_aghost, v_us_b1)) THEN
    PERFORM set_config('role', session_user, true);
    RAISE EXCEPTION 'T1 FALHOU: linha morta ou de outro usuario vazou';
  END IF;

  v_ok := v_ok + 1;

  -- ---------------------------------------------------------------- T2
  IF v_cur <> 1 THEN
    PERFORM set_config('role', session_user, true);
    RAISE EXCEPTION 'T2 FALHOU: esperava 1 sessao atual (claim sa1) e veio %', v_cur;
  END IF;
  SELECT auth_session_id INTO v_cur_id FROM public.my_active_sessions() WHERE is_current;
  IF v_cur_id <> v_sa1 THEN
    PERFORM set_config('role', session_user, true);
    RAISE EXCEPTION 'T2 FALHOU: is_current apontou % e o claim era %', v_cur_id, v_sa1;
  END IF;

  -- Troca o claim para sa2: a sessao atual acompanha o JWT.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_a, 'session_id', v_sa2)::text, true);
  SELECT auth_session_id INTO v_cur_id FROM public.my_active_sessions() WHERE is_current;
  IF v_cur_id <> v_sa2 THEN
    PERFORM set_config('role', session_user, true);
    RAISE EXCEPTION 'T2 FALHOU: com o claim sa2, is_current apontou %', v_cur_id;
  END IF;

  -- Via claim dedicado request.jwt.claim.session_id (o outro caminho do COALESCE).
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_a)::text, true);
  PERFORM set_config('request.jwt.claim.session_id', v_sa1::text, true);
  SELECT auth_session_id INTO v_cur_id FROM public.my_active_sessions() WHERE is_current;
  IF v_cur_id <> v_sa1 THEN
    PERFORM set_config('role', session_user, true);
    RAISE EXCEPTION 'T2 FALHOU: claim dedicado sa1 -> is_current apontou %', v_cur_id;
  END IF;
  PERFORM set_config('request.jwt.claim.session_id', '', true);

  -- B so' ve' a dele.
  PERFORM set_config('role', session_user, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_b, 'session_id', v_sb1)::text, true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT count(*), count(*) FILTER (WHERE is_current) INTO v_total, v_cur FROM public.my_active_sessions();
  IF v_total <> 1 OR v_cur <> 1 THEN
    PERFORM set_config('role', session_user, true);
    RAISE EXCEPTION 'T2 FALHOU: B esperava 1 sessao (1 atual) e veio total=% atual=%', v_total, v_cur;
  END IF;
  PERFORM set_config('role', session_user, true);
  v_ok := v_ok + 1;

  -- ---------------------------------------------------------------- T3/T4 (identidade)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_a)::text, true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT count(*) INTO v_total FROM public.my_active_sessions();  -- sem claim session_id: nenhuma atual
  SELECT count(*) INTO v_cur   FROM public.my_active_sessions() WHERE is_current;
  PERFORM set_config('role', session_user, true);
  IF v_total <> 2 OR v_cur <> 0 THEN
    RAISE EXCEPTION 'T4 FALHOU: sem claim de sessao esperava 2 linhas e 0 atuais (total=% atual=%)', v_total, v_cur;
  END IF;

  -- Sem NENHUMA identidade (auth.uid() nulo): 0 linhas.
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT count(*) INTO v_total FROM public.my_active_sessions();
  PERFORM set_config('role', session_user, true);
  IF v_total <> 0 THEN
    RAISE EXCEPTION 'T4 FALHOU: sem identidade devia devolver 0 e veio %', v_total;
  END IF;
  v_ok := v_ok + 1;

  -- ACL de my_active_sessions
  IF has_function_privilege('anon', 'public.my_active_sessions()', 'EXECUTE') THEN
    RAISE EXCEPTION 'T3 FALHOU: anon com EXECUTE na RPC';
  END IF;
  IF has_function_privilege('authenticated', 'public.my_active_sessions()', 'EXECUTE') = false THEN
    RAISE EXCEPTION 'T3 FALHOU: authenticated SEM EXECUTE na RPC';
  END IF;

  -- anon tentando de verdade: 42501.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_a, 'session_id', v_sa1)::text, true);
  PERFORM set_config('role', 'anon', true);
  v_barrado := false;
  BEGIN
    PERFORM public.my_active_sessions();
  EXCEPTION WHEN insufficient_privilege THEN
    v_barrado := true;
  END;
  PERFORM set_config('role', session_user, true);
  IF v_barrado = false THEN
    RAISE EXCEPTION 'T3 FALHOU: anon conseguiu chamar a RPC';
  END IF;
  v_ok := v_ok + 1;

  -- ---------------------------------------------------------------- T5 limpeza
  v_n := public.expire_orphan_user_sessions();
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'T5 FALHOU: saneamento esperava expirar 2 (orfa + expirada) e expirou %', v_n;
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_sessions WHERE id IN (v_us_adead, v_us_aghost) AND (is_active OR ended_at IS NULL)) THEN
    RAISE EXCEPTION 'T5 FALHOU: as linhas mortas nao ficaram inativas/ended_at nulo';
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_sessions WHERE id IN (v_us_a1, v_us_a2, v_us_b1) AND is_active IS NOT TRUE) THEN
    RAISE EXCEPTION 'T5 FALHOU: a limpeza mexeu em sessao viva';
  END IF;

  -- idempotente: 2a passada nao muda nada
  v_n2 := public.expire_orphan_user_sessions();
  IF v_n2 <> 0 THEN
    RAISE EXCEPTION 'T5 FALHOU: nao era idempotente (2a passada expirou %)', v_n2;
  END IF;

  -- sessao Auth APAGADA (revogada de fato) tambem e' expirada na proxima passada
  DELETE FROM auth.sessions WHERE id = v_sa2;
  v_n := public.expire_orphan_user_sessions();
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'T5 FALHOU: sessao Auth apagada devia expirar 1 e expirou %', v_n;
  END IF;
  IF (SELECT is_active FROM public.user_sessions WHERE id = v_us_a2) IS NOT FALSE THEN
    RAISE EXCEPTION 'T5 FALHOU: a sessao da Auth apagada continuou ativa';
  END IF;

  -- Depois da limpeza a RPC de A volta a mostrar so' a viva restante (us_a1)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_a, 'session_id', v_sa1)::text, true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT count(*) INTO v_total FROM public.my_active_sessions();
  PERFORM set_config('role', session_user, true);
  IF v_total <> 1 THEN
    RAISE EXCEPTION 'T5 FALHOU: apos a limpeza A devia ver 1 sessao e viu %', v_total;
  END IF;

  v_ok := v_ok + 1;

  -- ACL de expire_orphan_user_sessions
  IF has_function_privilege('anon', 'public.expire_orphan_user_sessions()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.expire_orphan_user_sessions()', 'EXECUTE') THEN
    RAISE EXCEPTION 'T6 FALHOU: anon/authenticated com EXECUTE na limpeza';
  END IF;
  IF has_function_privilege('service_role', 'public.expire_orphan_user_sessions()', 'EXECUTE') = false THEN
    RAISE EXCEPTION 'T6 FALHOU: service_role SEM EXECUTE na limpeza';
  END IF;
  v_ok := v_ok + 1;

  RAISE NOTICE 'my_active_sessions: suite OK (T1 so as vivas do chamador, T2 is_current pelo JWT, T3 anon barrado, T4 sem identidade 0 linhas, T5 limpeza idempotente, T6 ACL) — % grupo(s)', v_ok;
END $my_active_sessions$;

ROLLBACK;
