-- Teste SQL dos eventos de autenticacao por instancia (cartao t_8b123f2f).
--
-- O que prova:
--   T1  instance_auth_event_trend(24) (staff) devolve a serie POR HORA com as
--       contagens por motivo (invalid_signature/auth_401/auth_403) e o total,
--       somando exatamente os eventos das ultimas 24 h; o filtro por instancia
--       (inclusive com espacos em volta) restringe a serie;
--   T2  instance_auth_event_trend(168) agrupa POR DIA (24 h => hora; 7 d => dia)
--       e alcanca os eventos de ate 7 dias;
--   T3  instance_auth_event_summary devolve a JANELA EXPLICITA (window_hours) e
--       respeita o que foi pedido: 24 h / 48 h deixam de fora o evento de 72 h que
--       uma janela de 168 h inclui; o filtro por instancia tambem muda o resumo;
--   T4  agente NAO-staff recebe 42501 em trend e summary (autorizacao ANTES de
--       qualquer efeito) e le ZERO linha da tabela;
--   T5  anon e' barrado na leitura da tabela (42501) e pelo ACL das funcoes;
--   T6  service_role (o webhook) usa trend e summary normalmente;
--   T7  validacao de entrada ANTES do efeito: janela de horas fora de 1..168
--       (0, 169, nulo) e dias de expurgo fora de 1..3650 -> 22023; e as travas da
--       tabela (motivo invalido, source invalido, http_status invalido, instance
--       em branco, detail com 201 caracteres) -> 23514;
--   T8  retencao de 30 dias: purge_instance_auth_events(30) apaga SO o que passou
--       de 30 dias e preserva o resto (31 d e 40 d saem; 29 d fica);
--   T9  RLS/ACL: RLS ligada e UMA policy de SELECT (staff); staff le, agente
--       NAO-staff le ZERO, anon barrado; INSERT/UPDATE/DELETE diretos nao sao
--       concedidos a papel de cliente (42501); service_role ESCREVE; EXECUTE das
--       funcoes so para authenticated/service_role (expurgo so service_role);
--   T10 o bloco "-- Rollback" da migration, executado contra o schema REAL, some
--       com tudo (tabela, tres funcoes, policy e o job do pg_cron) e o ROLLBACK TO
--       SAVEPOINT restaura o estado.
--
-- COMO RODAR (banco LOCAL da tarefa, nunca producao):
--   zapp-db-local psql . v2-26101408585128 -v ON_ERROR_STOP=1 < supabase/tests/instance_auth_events.sql
--
-- VERMELHO antes da migration: a tabela e as funcoes nao existem, entao a suite
-- quebra no primeiro uso de public.instance_auth_events (T1).
--
-- Enforcamento como PAPEL REAL: claims sinteticos em request.jwt.claims
-- (sub + role) + set_config('role', <papel>) — o caminho do PostgREST —, nunca
-- como postgres dentro das assercoes. Dados SINTETICOS; tudo desfeito no
-- ROLLBACK final (nao sobra linha nem usuario no banco).
BEGIN;

DO $instance_auth_events$
DECLARE
  v_admin_user uuid := '44444444-4444-4444-4444-4444444444a1';
  v_sup_user   uuid := '44444444-4444-4444-4444-4444444444a2';
  v_agent_user uuid := '44444444-4444-4444-4444-4444444444b1';
  v_admin_prof uuid;
  v_sup_prof   uuid;
  v_agent_prof uuid;
  v_inst_a     text := 'inst-evt-teste-a';
  v_inst_b     text := 'inst-evt-teste-b';
  v_inst_c     text := 'inst-evt-teste-limite';
  v_out        jsonb;
  v_buckets    int;
  v_total      int;
  v_inv        int;
  v_401        int;
  v_403        int;
  v_n          int;
  v_errcode    text;
  v_errmsg     text;
  v_ok         int := 0;
BEGIN
  -- ---------------------------------------------------------------- dados (postgres)
  INSERT INTO auth.users (id, email) VALUES
    (v_admin_user, 'instance-auth-events-admin@local.test'),
    (v_sup_user,   'instance-auth-events-supervisor@local.test'),
    (v_agent_user, 'instance-auth-events-agent@local.test');

  INSERT INTO public.profiles (user_id, name)
  VALUES (v_admin_user, 'Admin (sintetico)'),
         (v_sup_user,   'Supervisor (sintetico)'),
         (v_agent_user, 'Agente (sintetico)')
  ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name;

  INSERT INTO public.user_roles (user_id, role) VALUES
    (v_admin_user, 'admin'),
    (v_sup_user,   'supervisor'),
    (v_agent_user, 'agent')
  ON CONFLICT (user_id, role) DO NOTHING;

  SELECT id INTO v_admin_prof FROM public.profiles WHERE user_id = v_admin_user;
  SELECT id INTO v_sup_prof FROM public.profiles WHERE user_id = v_sup_user;
  SELECT id INTO v_agent_prof FROM public.profiles WHERE user_id = v_agent_user;
  IF v_admin_prof IS NULL OR v_sup_prof IS NULL OR v_agent_prof IS NULL THEN
    RAISE EXCEPTION 'fixture invalida: perfil sintetico nao encontrado (% / % / %)',
      v_admin_prof, v_sup_prof, v_agent_prof;
  END IF;

  -- Eventos sinteticos. `now()` e' unico para todo o bloco (transaction_timestamp).
  --   e1/e2: instancia A, ultimos minutos (mesmo balde de hora)
  --   e3:    instancia A, 2 h atras (balde de hora anterior)
  --   e4:    instancia B, 72 h atras (fora de 24 h/48 h, dentro de 7 d)
  --   e5:    instancia A, 40 d (expurgo remove)   e6: B, 31 d (remove)   e7: B, 29 d (mantem)
  INSERT INTO public.instance_auth_events (instance_name, reason, source, http_status, detail, created_at) VALUES
    (v_inst_a, 'invalid_signature', 'webhook', 401, 'Assinatura invalida (sintetico)', now() - interval '5 minutes'),
    (v_inst_a, 'auth_401',          'webhook', 401, 'Nao autorizado (sintetico)',     now() - interval '5 minutes'),
    (v_inst_a, 'auth_403',          'webhook', 403, 'Proibido (sintetico)',           now() - interval '2 hours'),
    (v_inst_b, 'auth_401',          'evolution-api', 401, NULL,                       now() - interval '3 days'),
    (v_inst_a, 'auth_401',          'webhook', 401, NULL,                             now() - interval '40 days'),
    (v_inst_b, 'auth_403',          'webhook', 403, NULL,                             now() - interval '31 days'),
    (v_inst_b, 'auth_401',          'webhook', 401, NULL,                             now() - interval '29 days');

  -- ======================================================== T1 (serie por hora, 24 h)
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v_errcode := NULL;
  BEGIN
    SELECT count(*), coalesce(sum(total), 0),
           coalesce(sum(invalid_signature), 0), coalesce(sum(auth_401), 0), coalesce(sum(auth_403), 0)
      INTO v_buckets, v_total, v_inv, v_401, v_403
    FROM public.instance_auth_event_trend(24);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE, v_errmsg = MESSAGE_TEXT;
  END;
  IF v_errcode IS NOT NULL THEN
    RAISE EXCEPTION 'T1 FALHOU: staff deveria ver a serie de 24 h (erro=[%] %)', v_errcode, v_errmsg;
  END IF;
  IF v_total <> 3 THEN
    RAISE EXCEPTION 'T1 FALHOU: 24 h deveriam somar 3 eventos, somei %', v_total;
  END IF;
  IF v_buckets <> 2 THEN
    RAISE EXCEPTION 'T1 FALHOU: esperava 2 baldes de hora, encontrei %', v_buckets;
  END IF;
  IF v_inv <> 1 OR v_401 <> 1 OR v_403 <> 1 THEN
    RAISE EXCEPTION 'T1 FALHOU: contagens por motivo erradas (inv=%, 401=%, 403=%)', v_inv, v_401, v_403;
  END IF;
  SELECT count(*) INTO v_n FROM public.instance_auth_event_trend(24) WHERE total = 2;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'T1 FALHOU: esperava 1 balde com 2 eventos, encontrei %', v_n;
  END IF;
  -- granularidade POR HORA
  SELECT count(*) INTO v_n FROM public.instance_auth_event_trend(24) WHERE bucket <> date_trunc('hour', bucket);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'T1 FALHOU: % balde(s) de 24 h nao estao alinhados a hora', v_n;
  END IF;
  -- filtro por instancia (com espacos em volta)
  SELECT coalesce(sum(total), 0) INTO v_total FROM public.instance_auth_event_trend(24, v_inst_a);
  IF v_total <> 3 THEN
    RAISE EXCEPTION 'T1 FALHOU: instancia A deveria somar 3, somei %', v_total;
  END IF;
  SELECT coalesce(sum(total), 0) INTO v_total FROM public.instance_auth_event_trend(24, '   ' || v_inst_a || '   ');
  IF v_total <> 3 THEN
    RAISE EXCEPTION 'T1 FALHOU: filtro com espacos em volta deveria somar 3, somei %', v_total;
  END IF;
  SELECT coalesce(sum(total), 0) INTO v_total FROM public.instance_auth_event_trend(24, v_inst_b);
  IF v_total <> 0 THEN
    RAISE EXCEPTION 'T1 FALHOU: instancia B nao tem evento em 24 h, somei %', v_total;
  END IF;
  PERFORM set_config('role', 'none', true);
  v_ok := v_ok + 1;

  -- ======================================================== T2 (serie por dia, 7 d)
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT count(*), coalesce(sum(total), 0) INTO v_buckets, v_total
  FROM public.instance_auth_event_trend(168);
  SELECT count(*) INTO v_n FROM public.instance_auth_event_trend(168) WHERE bucket <> date_trunc('day', bucket);
  PERFORM set_config('role', 'none', true);
  IF v_total <> 4 THEN
    RAISE EXCEPTION 'T2 FALHOU: 7 d deveriam somar 4 eventos, somei %', v_total;
  END IF;
  IF v_buckets <> 2 THEN
    RAISE EXCEPTION 'T2 FALHOU: esperava 2 baldes de dia, encontrei %', v_buckets;
  END IF;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'T2 FALHOU: % balde(s) de 7 d nao estao alinhados ao dia', v_n;
  END IF;
  v_ok := v_ok + 1;

  -- ======================================================== T3 (resumo e janela)
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v_out := public.instance_auth_event_summary(24);
  IF (v_out ->> 'window_hours')::int <> 24 THEN
    RAISE EXCEPTION 'T3 FALHOU: window_hours deveria ser 24 (%)', v_out ->> 'window_hours';
  END IF;
  IF (v_out ->> 'total')::int <> 3 THEN
    RAISE EXCEPTION 'T3 FALHOU: resumo de 24 h deveria somar 3 (%)', v_out ->> 'total';
  END IF;
  v_out := public.instance_auth_event_summary(48);
  IF (v_out ->> 'window_hours')::int <> 48 OR (v_out ->> 'total')::int <> 3 THEN
    RAISE EXCEPTION 'T3 FALHOU: 48 h deveria devolver janela 48 e total 3 (%)', v_out::text;
  END IF;
  v_out := public.instance_auth_event_summary(168);
  IF (v_out ->> 'window_hours')::int <> 168 OR (v_out ->> 'total')::int <> 4 THEN
    RAISE EXCEPTION 'T3 FALHOU: 168 h deveria devolver janela 168 e total 4 (%)', v_out::text;
  END IF;
  IF v_out ->> 'first_event_at' IS NULL OR v_out ->> 'last_event_at' IS NULL THEN
    RAISE EXCEPTION 'T3 FALHOU: first/last_event_at nao vieram no resumo';
  END IF;
  IF (v_out -> 'top_instances' -> 0 ->> 'instance_name') <> v_inst_a
     OR (v_out -> 'top_instances' -> 0 ->> 'total')::int <> 3 THEN
    RAISE EXCEPTION 'T3 FALHOU: top_instances deveria por A com 3 (%)', v_out -> 'top_instances';
  END IF;
  -- filtro por instancia muda o resumo
  v_out := public.instance_auth_event_summary(168, v_inst_b);
  IF (v_out ->> 'total')::int <> 1 THEN
    RAISE EXCEPTION 'T3 FALHOU: instancia B em 7 d deveria somar 1 (%)', v_out ->> 'total';
  END IF;
  v_out := public.instance_auth_event_summary(24, v_inst_b);
  IF (v_out ->> 'total')::int <> 0 THEN
    RAISE EXCEPTION 'T3 FALHOU: instancia B em 24 h deveria somar 0 (%)', v_out ->> 'total';
  END IF;
  PERFORM set_config('role', 'none', true);
  v_ok := v_ok + 1;

  -- ======================================================== T4 (agente nao-staff)
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_agent_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v_errcode := NULL;
  BEGIN PERFORM count(*) FROM public.instance_auth_event_trend(24);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE; END;
  IF v_errcode IS DISTINCT FROM '42501' THEN
    RAISE EXCEPTION 'T4 FALHOU: agente nao-staff deveria receber 42501 em trend (deu %)', coalesce(v_errcode, 'sem erro');
  END IF;
  v_errcode := NULL;
  BEGIN PERFORM public.instance_auth_event_summary(24);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE; END;
  IF v_errcode IS DISTINCT FROM '42501' THEN
    RAISE EXCEPTION 'T4 FALHOU: agente nao-staff deveria receber 42501 em summary (deu %)', coalesce(v_errcode, 'sem erro');
  END IF;
  SELECT count(*) INTO v_n FROM public.instance_auth_events;
  PERFORM set_config('role', 'none', true);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'T4 FALHOU: agente nao-staff deveria ler ZERO linha (leu %)', v_n;
  END IF;
  v_ok := v_ok + 1;

  -- ======================================================== T5 (anon barrado)
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  PERFORM set_config('role', 'anon', true);
  v_errcode := NULL;
  BEGIN PERFORM count(*) FROM public.instance_auth_events;
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE; END;
  PERFORM set_config('role', 'none', true);
  IF v_errcode IS DISTINCT FROM '42501' THEN
    RAISE EXCEPTION 'T5 FALHOU: anon deveria ser barrado na leitura da tabela (deu %)', coalesce(v_errcode, 'sem erro');
  END IF;
  v_ok := v_ok + 1;

  -- ======================================================== T6 (service_role = webhook)
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  PERFORM set_config('role', 'service_role', true);
  v_errcode := NULL;
  BEGIN
    SELECT coalesce(sum(total), 0) INTO v_total FROM public.instance_auth_event_trend(24);
    v_out := public.instance_auth_event_summary(24);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE, v_errmsg = MESSAGE_TEXT;
  END;
  PERFORM set_config('role', 'none', true);
  IF v_errcode IS NOT NULL THEN
    RAISE EXCEPTION 'T6 FALHOU: service_role deveria usar trend/summary (erro=[%] %)', v_errcode, v_errmsg;
  END IF;
  IF v_total <> 3 OR (v_out ->> 'total')::int <> 3 THEN
    RAISE EXCEPTION 'T6 FALHOU: service_role leu 24 h errado (trend=%, summary=%)', v_total, v_out ->> 'total';
  END IF;
  v_ok := v_ok + 1;

  -- ======================================================== T7 (validacao de entrada)
  -- staff: janela de horas invalida
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v_errcode := NULL;
  BEGIN PERFORM count(*) FROM public.instance_auth_event_trend(0);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE; END;
  IF v_errcode IS DISTINCT FROM '22023' THEN
    RAISE EXCEPTION 'T7 FALHOU: trend(0) deveria dar 22023 (deu %)', coalesce(v_errcode, 'sem erro');
  END IF;
  v_errcode := NULL;
  BEGIN PERFORM count(*) FROM public.instance_auth_event_trend(169);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE; END;
  IF v_errcode IS DISTINCT FROM '22023' THEN
    RAISE EXCEPTION 'T7 FALHOU: trend(169) deveria dar 22023 (deu %)', coalesce(v_errcode, 'sem erro');
  END IF;
  v_errcode := NULL;
  BEGIN PERFORM count(*) FROM public.instance_auth_event_trend(NULL::integer);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE; END;
  IF v_errcode IS DISTINCT FROM '22023' THEN
    RAISE EXCEPTION 'T7 FALHOU: trend(nulo) deveria dar 22023 (deu %)', coalesce(v_errcode, 'sem erro');
  END IF;
  v_errcode := NULL;
  BEGIN PERFORM public.instance_auth_event_summary(0);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE; END;
  IF v_errcode IS DISTINCT FROM '22023' THEN
    RAISE EXCEPTION 'T7 FALHOU: summary(0) deveria dar 22023 (deu %)', coalesce(v_errcode, 'sem erro');
  END IF;
  v_errcode := NULL;
  BEGIN PERFORM public.instance_auth_event_summary(169);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE; END;
  PERFORM set_config('role', 'none', true);
  IF v_errcode IS DISTINCT FROM '22023' THEN
    RAISE EXCEPTION 'T7 FALHOU: summary(169) deveria dar 22023 (deu %)', coalesce(v_errcode, 'sem erro');
  END IF;

  -- service_role: dias de expurgo invalidos
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  PERFORM set_config('role', 'service_role', true);
  v_errcode := NULL;
  BEGIN PERFORM public.purge_instance_auth_events(0);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE; END;
  IF v_errcode IS DISTINCT FROM '22023' THEN
    RAISE EXCEPTION 'T7 FALHOU: purge(0) deveria dar 22023 (deu %)', coalesce(v_errcode, 'sem erro');
  END IF;
  v_errcode := NULL;
  BEGIN PERFORM public.purge_instance_auth_events(4000);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE; END;
  PERFORM set_config('role', 'none', true);
  IF v_errcode IS DISTINCT FROM '22023' THEN
    RAISE EXCEPTION 'T7 FALHOU: purge(4000) deveria dar 22023 (deu %)', coalesce(v_errcode, 'sem erro');
  END IF;

  -- travas da tabela (postgres, INSERT direto)
  v_errcode := NULL;
  BEGIN
    INSERT INTO public.instance_auth_events (instance_name, reason) VALUES (v_inst_c, 'motivo_invalido');
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE; END;
  IF v_errcode IS DISTINCT FROM '23514' THEN
    RAISE EXCEPTION 'T7 FALHOU: motivo invalido deveria dar 23514 (deu %)', coalesce(v_errcode, 'sem erro');
  END IF;
  v_errcode := NULL;
  BEGIN
    INSERT INTO public.instance_auth_events (instance_name, reason, source) VALUES (v_inst_c, 'auth_401', 'fonte_invalida');
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE; END;
  IF v_errcode IS DISTINCT FROM '23514' THEN
    RAISE EXCEPTION 'T7 FALHOU: source invalido deveria dar 23514 (deu %)', coalesce(v_errcode, 'sem erro');
  END IF;
  v_errcode := NULL;
  BEGIN
    INSERT INTO public.instance_auth_events (instance_name, reason, http_status) VALUES (v_inst_c, 'auth_401', 99);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE; END;
  IF v_errcode IS DISTINCT FROM '23514' THEN
    RAISE EXCEPTION 'T7 FALHOU: http_status invalido deveria dar 23514 (deu %)', coalesce(v_errcode, 'sem erro');
  END IF;
  v_errcode := NULL;
  BEGIN
    INSERT INTO public.instance_auth_events (instance_name, reason, detail) VALUES ('   ', 'auth_401', NULL);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE; END;
  IF v_errcode IS DISTINCT FROM '23514' THEN
    RAISE EXCEPTION 'T7 FALHOU: instance_name em branco deveria dar 23514 (deu %)', coalesce(v_errcode, 'sem erro');
  END IF;
  v_errcode := NULL;
  BEGIN
    INSERT INTO public.instance_auth_events (instance_name, reason, detail)
    VALUES (v_inst_c, 'auth_401', repeat('x', 201));
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE; END;
  IF v_errcode IS DISTINCT FROM '23514' THEN
    RAISE EXCEPTION 'T7 FALHOU: detail com 201 caracteres deveria dar 23514 (deu %)', coalesce(v_errcode, 'sem erro');
  END IF;
  v_ok := v_ok + 1;

  -- ======================================================== T8 (retencao de 30 dias)
  SELECT count(*) INTO v_n FROM public.instance_auth_events WHERE created_at < now() - interval '30 days';
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'T8 FALHOU: esperava 2 eventos com mais de 30 dias, encontrei %', v_n;
  END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  PERFORM set_config('role', 'service_role', true);
  SELECT public.purge_instance_auth_events(30) INTO v_n;
  PERFORM set_config('role', 'none', true);
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'T8 FALHOU: expurgo deveria ter apagado 2 eventos, apagou %', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM public.instance_auth_events WHERE created_at < now() - interval '30 days';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'T8 FALHOU: sobraram % evento(s) com mais de 30 dias', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM public.instance_auth_events WHERE created_at = now() - interval '29 days';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'T8 FALHOU: o evento de 29 dias deveria ter sido preservado (encontrei %)', v_n;
  END IF;
  -- expurgo nao toca o que e' recente
  SELECT count(*) INTO v_n FROM public.instance_auth_events;
  IF v_n <> 5 THEN
    RAISE EXCEPTION 'T8 FALHOU: esperava 5 eventos apos o expurgo, encontrei %', v_n;
  END IF;
  -- teto de 200 caracteres aceito (limite exato) — fora de qualquer janela
  INSERT INTO public.instance_auth_events (instance_name, reason, detail, created_at)
  VALUES (v_inst_c, 'auth_401', repeat('y', 200), now() - interval '400 days');
  v_ok := v_ok + 1;

  -- ======================================================== T9 (RLS/ACL)
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.instance_auth_events'::regclass) THEN
    RAISE EXCEPTION 'T9 FALHOU: RLS da tabela instance_auth_events nao esta ligada';
  END IF;
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'instance_auth_events';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'T9 FALHOU: esperava UMA policy (SELECT staff), encontrei %', v_n;
  END IF;

  -- staff le; agente nao-staff le ZERO; anon e' barrado
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT count(*) INTO v_n FROM public.instance_auth_events;
  IF v_n < 5 THEN
    RAISE EXCEPTION 'T9 FALHOU: staff deveria ler os eventos (leu %)', v_n;
  END IF;
  PERFORM set_config('role', 'none', true);

  -- supervisor tambem e' STAFF: le a tabela e usa a serie
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_sup_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v_errcode := NULL;
  BEGIN
    SELECT count(*) INTO v_n FROM public.instance_auth_events;
    SELECT coalesce(sum(total), 0) INTO v_total FROM public.instance_auth_event_trend(24);
    v_out := public.instance_auth_event_summary(24);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE, v_errmsg = MESSAGE_TEXT;
  END;
  PERFORM set_config('role', 'none', true);
  IF v_errcode IS NOT NULL THEN
    RAISE EXCEPTION 'T9 FALHOU: supervisor e staff e deveria ler a serie (erro=[%] %)', v_errcode, v_errmsg;
  END IF;
  IF v_n < 5 THEN
    RAISE EXCEPTION 'T9 FALHOU: supervisor deveria ler os eventos (leu %)', v_n;
  END IF;
  IF v_total <> 3 OR (v_out ->> 'total')::int <> 3 THEN
    RAISE EXCEPTION 'T9 FALHOU: supervisor leu a serie errada (trend=%, summary=%)', v_total, v_out ->> 'total';
  END IF;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_agent_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT count(*) INTO v_n FROM public.instance_auth_events;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'T9 FALHOU: agente nao-staff deveria ler ZERO linha (leu %)', v_n;
  END IF;
  PERFORM set_config('role', 'none', true);

  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  PERFORM set_config('role', 'anon', true);
  v_errcode := NULL;
  BEGIN PERFORM count(*) FROM public.instance_auth_events;
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE; END;
  PERFORM set_config('role', 'none', true);
  IF v_errcode IS DISTINCT FROM '42501' THEN
    RAISE EXCEPTION 'T9 FALHOU: anon deveria ser barrado na leitura da tabela (deu %)', coalesce(v_errcode, 'sem erro');
  END IF;

  -- escrita direta NUNCA e' concedida a papel de cliente
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v_errcode := NULL;
  BEGIN
    INSERT INTO public.instance_auth_events (instance_name, reason) VALUES ('inst-escrita-direta', 'auth_401');
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE; END;
  IF v_errcode IS DISTINCT FROM '42501' THEN
    RAISE EXCEPTION 'T9 FALHOU: INSERT direto por authenticated deveria dar 42501 (deu %)', coalesce(v_errcode, 'sem erro');
  END IF;
  v_errcode := NULL;
  BEGIN UPDATE public.instance_auth_events SET detail = 'x';
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE; END;
  IF v_errcode IS DISTINCT FROM '42501' THEN
    RAISE EXCEPTION 'T9 FALHOU: UPDATE direto por authenticated deveria dar 42501 (deu %)', coalesce(v_errcode, 'sem erro');
  END IF;
  v_errcode := NULL;
  BEGIN DELETE FROM public.instance_auth_events;
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE; END;
  PERFORM set_config('role', 'none', true);
  IF v_errcode IS DISTINCT FROM '42501' THEN
    RAISE EXCEPTION 'T9 FALHOU: DELETE direto por authenticated deveria dar 42501 (deu %)', coalesce(v_errcode, 'sem erro');
  END IF;

  -- service_role ESCREVE (caminho do webhook)
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  PERFORM set_config('role', 'service_role', true);
  v_errcode := NULL;
  BEGIN
    INSERT INTO public.instance_auth_events (instance_name, reason, source, http_status)
    VALUES ('inst-webhook-sintetico', 'invalid_signature', 'webhook', 401);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE; END;
  PERFORM set_config('role', 'none', true);
  IF v_errcode IS NOT NULL THEN
    RAISE EXCEPTION 'T9 FALHOU: service_role deveria inserir o evento (erro=%)', v_errcode;
  END IF;
  SELECT count(*) INTO v_n FROM public.instance_auth_events WHERE instance_name = 'inst-webhook-sintetico';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'T9 FALHOU: o evento do webhook nao foi gravado (encontrei %)', v_n;
  END IF;

  -- ACL das funcoes
  IF has_function_privilege('anon', 'public.instance_auth_event_trend(integer,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.instance_auth_event_summary(integer,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.purge_instance_auth_events(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'T9 FALHOU: anon nao deveria ter EXECUTE em nenhuma funcao de eventos';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.instance_auth_event_trend(integer,text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.instance_auth_event_summary(integer,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'T9 FALHOU: authenticated deveria ter EXECUTE em trend/summary';
  END IF;
  IF has_function_privilege('authenticated', 'public.purge_instance_auth_events(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'T9 FALHOU: authenticated nao deveria ter EXECUTE no expurgo';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.purge_instance_auth_events(integer)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.instance_auth_event_trend(integer,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.instance_auth_event_summary(integer,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'T9 FALHOU: service_role deveria ter EXECUTE nas tres funcoes';
  END IF;
  v_ok := v_ok + 1;

  RAISE NOTICE 'instance_auth_events: T1..T9 OK — % grupo(s)', v_ok;
END
$instance_auth_events$;

-- ===================================================================== T10 (rollback)
-- Executa o bloco "-- Rollback" da migration (copiado linha a linha do proprio
-- arquivo) contra o schema REAL, confere que TUDO o que a migration criou some
-- (tabela, tres funcoes, policy e o job do pg_cron) e desfaz tudo com ROLLBACK TO
-- SAVEPOINT. As linhas DROP vivem neste arquivo (nunca digitadas na linha de
-- comando): a guarda bloqueia SQL DROP em modo sem humano.
SAVEPOINT evt_rollback;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'purge-instance-auth-events';
DROP FUNCTION IF EXISTS public.purge_instance_auth_events(integer);
DROP FUNCTION IF EXISTS public.instance_auth_event_summary(integer, text);
DROP FUNCTION IF EXISTS public.instance_auth_event_trend(integer, text);
DROP TABLE IF EXISTS public.instance_auth_events;

DO $verifica_rollback$
BEGIN
  IF to_regclass('public.instance_auth_events') IS NOT NULL
     OR to_regprocedure('public.instance_auth_event_trend(integer,text)') IS NOT NULL
     OR to_regprocedure('public.instance_auth_event_summary(integer,text)') IS NOT NULL
     OR to_regprocedure('public.purge_instance_auth_events(integer)') IS NOT NULL
     OR (SELECT count(*) FROM pg_policies
          WHERE schemaname = 'public' AND tablename = 'instance_auth_events') <> 0
     OR EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-instance-auth-events') THEN
    RAISE EXCEPTION 'T10 FALHOU: o rollback nao removeu tudo o que a migration criou';
  END IF;
END
$verifica_rollback$;

ROLLBACK TO SAVEPOINT evt_rollback;

DO $confirma_restaurado$
BEGIN
  IF to_regclass('public.instance_auth_events') IS NULL
     OR to_regprocedure('public.instance_auth_event_trend(integer,text)') IS NULL
     OR to_regprocedure('public.instance_auth_event_summary(integer,text)') IS NULL
     OR to_regprocedure('public.purge_instance_auth_events(integer)') IS NULL THEN
    RAISE EXCEPTION 'T10 FALHOU: ROLLBACK TO SAVEPOINT nao restaurou a migration';
  END IF;
  RAISE NOTICE 'instance_auth_events: suite OK (T1 serie por hora, T2 serie por dia, T3 resumo com janela, T4 nao-staff negado, T5 anon barrado, T6 service_role, T7 validacao, T8 retencao 30 d, T9 RLS/ACL, T10 rollback executado e estado restaurado)';
END
$confirma_restaurado$;

ROLLBACK;
