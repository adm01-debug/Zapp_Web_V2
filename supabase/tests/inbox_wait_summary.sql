-- Teste SQL da RPC public.inbox_wait_summary (metricas de espera da inbox por fila).
--
-- O que prova (o contrato que o front vai consumir no lugar da amostra de 500):
--   T1  VISIBILIDADE: contato fora do escopo do chamador nao entra em nenhuma
--       metrica (mesma trava de is_contact_visible_to_user); o agente B nao ve
--       as conversas do agente A;
--   T2  ACL: anon/PUBLIC sem EXECUTE; authenticated e service_role com EXECUTE.
--       Prova funcional: como `anon` a chamada e barrada; como `authenticated`
--       responde;
--   T3  METRICAS por grupo: "aguardando" conta so conversation_status='waiting';
--       max_wait_seconds e a MAIOR espera atual entre os aguardando;
--       avg_open_seconds e a media entre as conversas EM ABERTO (open+waiting);
--   T4  GUARDA DE ATIVIDADE (ADR-005, passo 3): contato open/waiting SEM nenhuma
--       mensagem nao conta como conversa;
--   T5  SOFT-DELETE: contato com deleted_at preenchido fica fora;
--   T6  POR FILA: uma linha por fila (inclusive queue_id NULL) e p_queue_id
--       estreita para exatamente uma fila; fila sem conversa visivel => 0 linhas;
--   T7  SEGURANCA da propria funcao: SECURITY DEFINER com search_path fixo.
--
-- COMO RODAR (banco LOCAL da tarefa, nunca producao):
--   zapp-db-local psql . <conjunto> -v ON_ERROR_STOP=1 < supabase/tests/inbox_wait_summary.sql
--
-- Cria dados SINTETICOS (usuarios, perfis, filas, contatos e mensagens) e desfaz
-- tudo no ROLLBACK final: nao sobra linha no banco. Sem EXCEPTION = suite verde.
BEGIN;

DO $inbox_wait_summary$
DECLARE
  -- usuarios/perfis sinteticos
  v_user_a        uuid := '11111111-1111-1111-1111-1111111111a1';
  v_user_b        uuid := '11111111-1111-1111-1111-1111111111b2';
  v_profile_a     uuid;
  v_profile_b     uuid;
  -- filas sinteticas
  v_queue_a       uuid := '22222222-2222-2222-2222-2222222222a1';
  v_queue_b       uuid := '22222222-2222-2222-2222-2222222222b2';
  -- contatos sinteticos
  v_w1            uuid := '33333333-3333-3333-3333-333333330001';
  v_w2            uuid := '33333333-3333-3333-3333-333333330002';
  v_o1            uuid := '33333333-3333-3333-3333-333333330003';
  v_sem_msg       uuid := '33333333-3333-3333-3333-333333330004';
  v_apagado       uuid := '33333333-3333-3333-3333-333333330005';
  v_oculto        uuid := '33333333-3333-3333-3333-333333330006';
  v_h1            uuid := '33333333-3333-3333-3333-333333330007';
  v_x1            uuid := '33333333-3333-3333-3333-333333330008';
  -- mensagens (uma por contato que conta; sender 'contact')
  v_msg           uuid;
  v_ok            int := 0;
  v_linhas        int;
  v_waiting       int;
  v_max           bigint;
  v_avg           bigint;
  v_barrado       boolean;
  v_erro          boolean;
BEGIN
  -- ---------------------------------------------------------------- dados
  INSERT INTO auth.users (id, email) VALUES
    (v_user_a, 'inbox-wait-a@local.test'),
    (v_user_b, 'inbox-wait-b@local.test');

  -- O gatilho on_auth_user_created cria o perfil; o upsert cobre os dois mundos.
  INSERT INTO public.profiles (user_id, name) VALUES
    (v_user_a, 'Agente A (sintetico)'),
    (v_user_b, 'Agente B (sintetico)')
  ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name;

  SELECT id INTO v_profile_a FROM public.profiles WHERE user_id = v_user_a;
  SELECT id INTO v_profile_b FROM public.profiles WHERE user_id = v_user_b;
  IF v_profile_a IS NULL OR v_profile_b IS NULL THEN
    RAISE EXCEPTION 'fixture invalida: perfil sintetico nao encontrado (% / %)',
      v_profile_a, v_profile_b;
  END IF;

  INSERT INTO public.queues (id, name, color) VALUES
    (v_queue_a, 'Fila A (sintetica)', '#111111'),
    (v_queue_b, 'Fila B (sintetica)', '#222222');

  -- updated_at explicito (offset em minutos relativo a now(), que e estavel na
  -- transacao): os segundos esperados saem exatos.
  INSERT INTO public.contacts
    (id, name, phone, assigned_to, queue_id, conversation_status, updated_at, deleted_at)
  VALUES
    (v_w1,      'W1 aguardando fila A',  '5511000000901', v_profile_a, v_queue_a, 'waiting', now() - interval '30 minutes', NULL),
    (v_w2,      'W2 aguardando fila A',  '5511000000902', v_profile_a, v_queue_a, 'waiting', now() - interval '10 minutes', NULL),
    (v_o1,      'O1 aberta fila A',      '5511000000903', v_profile_a, v_queue_a, 'open',    now() - interval '5 minutes',  NULL),
    (v_sem_msg, 'S1 aguardando sem msg', '5511000000904', v_profile_a, v_queue_a, 'waiting', now() - interval '99 minutes', NULL),
    (v_apagado, 'D1 aguardando apagado', '5511000000905', v_profile_a, v_queue_a, 'waiting', now() - interval '80 minutes', now() - interval '1 minute'),
    (v_oculto,  'X9 aguardando do B',    '5511000000906', v_profile_b, v_queue_a, 'waiting', now() - interval '20 minutes', NULL),
    (v_h1,      'H1 aguardando fila B',  '5511000000907', v_profile_a, v_queue_b, 'waiting', now() - interval '50 minutes', NULL),
    (v_x1,      'X1 aberta sem fila',    '5511000000908', v_profile_a, NULL,      'open',    now() - interval '1 minute',   NULL);

  -- Uma mensagem por contato que deve contar; v_sem_msg fica SEM mensagem.
  FOR v_msg IN
    SELECT id FROM public.contacts
     WHERE id IN (v_w1, v_w2, v_o1, v_apagado, v_oculto, v_h1, v_x1)
  LOOP
    INSERT INTO public.messages (id, contact_id, sender, content, message_type, created_at)
    VALUES (gen_random_uuid(), v_msg, 'contact', 'msg sintetica', 'text', now() - interval '1 minute');
  END LOOP;

  -- ---------------------------------------------------------------- T1/T3/T4/T5/T6
  -- Como A (agente comum: so ve o que esta atribuido a ele), no PAPEL REAL
  -- `authenticated` — nao como postgres: e o papel com que a RPC roda no app.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_a)::text, true);
  PERFORM set_config('role', 'authenticated', true);

  -- Tres grupos: fila A, fila B e "sem fila" (queue_id NULL).
  SELECT count(*) INTO v_linhas FROM public.inbox_wait_summary();
  IF v_linhas <> 3 THEN
    RAISE EXCEPTION 'T6 FALHOU: esperava 3 grupos (fila A, fila B, sem fila) e veio %', v_linhas;
  END IF;

  -- Fila A: aguardando = W1 + W2 (S1 sem msg e D1 apagado NAO contam; X9 e do B).
  SELECT waiting_count, max_wait_seconds, avg_open_seconds
    INTO v_waiting, v_max, v_avg
    FROM public.inbox_wait_summary()
   WHERE queue_id = v_queue_a AND queue_id IS NOT NULL;
  IF v_waiting <> 2 THEN
    RAISE EXCEPTION 'T3/T4/T5 FALHOU: fila A deveria ter 2 aguardando (sem-msg e apagado fora) e veio %', v_waiting;
  END IF;
  IF v_max <> 1800 THEN
    RAISE EXCEPTION 'T3 FALHOU: maior espera da fila A deveria ser 1800s (W1, 30min) e veio %', v_max;
  END IF;
  -- media em aberto: (1800 + 600 + 300) / 3 = 900
  IF v_avg <> 900 THEN
    RAISE EXCEPTION 'T3 FALHOU: media em aberto da fila A deveria ser 900s e veio %', v_avg;
  END IF;
  v_ok := v_ok + 1;

  -- Fila B: so H1 (50 min).
  SELECT waiting_count, max_wait_seconds, avg_open_seconds
    INTO v_waiting, v_max, v_avg
    FROM public.inbox_wait_summary()
   WHERE queue_id = v_queue_b;
  IF v_waiting <> 1 OR v_max <> 3000 OR v_avg <> 3000 THEN
    RAISE EXCEPTION 'T3 FALHOU: fila B esperava 1 aguardando / 3000s / 3000s e veio % / % / %',
      v_waiting, v_max, v_avg;
  END IF;
  v_ok := v_ok + 1;

  -- Grupo sem fila: X1 aberta (1 min), nenhum aguardando (max NULO).
  SELECT waiting_count, max_wait_seconds, avg_open_seconds
    INTO v_waiting, v_max, v_avg
    FROM public.inbox_wait_summary()
   WHERE queue_id IS NULL;
  IF v_waiting <> 0 OR v_max IS NOT NULL OR v_avg <> 60 THEN
    RAISE EXCEPTION 'T6 FALHOU: grupo sem fila esperava 0 / NULO / 60s e veio % / % / %',
      v_waiting, v_max, v_avg;
  END IF;
  v_ok := v_ok + 1;

  -- ---------------------------------------------------------------- T6 (p_queue_id)
  SELECT count(*) INTO v_linhas FROM public.inbox_wait_summary(v_queue_a);
  IF v_linhas <> 1 THEN
    RAISE EXCEPTION 'T6 FALHOU: p_queue_id=fila A deveria devolver 1 linha e veio %', v_linhas;
  END IF;

  -- p_queue_id=v_queue_b devolve so a fila B (H1, do proprio A).
  SELECT count(*) INTO v_linhas FROM public.inbox_wait_summary(v_queue_b);
  IF v_linhas <> 1 THEN
    RAISE EXCEPTION 'T6 FALHOU: p_queue_id=fila B deveria devolver 1 linha e veio %', v_linhas;
  END IF;

  -- Fila sem contato visivel (uuid que nao existe) => nenhuma linha.
  SELECT count(*) INTO v_linhas FROM public.inbox_wait_summary('99999999-9999-9999-9999-999999999999');
  IF v_linhas <> 0 THEN
    RAISE EXCEPTION 'T6 FALHOU: fila inexistente nao deveria devolver linha (% linha(s))', v_linhas;
  END IF;
  v_ok := v_ok + 1;

  -- ---------------------------------------------------------------- T1 (visibilidade)
  -- Como B (tambem no papel `authenticated`): enxerga apenas X9 (o contato do B), na fila A.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_b)::text, true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT count(*) INTO v_linhas FROM public.inbox_wait_summary();
  IF v_linhas <> 1 THEN
    RAISE EXCEPTION 'T1 FALHOU: B deveria ver so 1 grupo (fila A do proprio B) e veio %', v_linhas;
  END IF;
  SELECT waiting_count, max_wait_seconds
    INTO v_waiting, v_max
    FROM public.inbox_wait_summary()
   WHERE queue_id = v_queue_a;
  IF v_waiting <> 1 OR v_max <> 1200 THEN
    RAISE EXCEPTION 'T1 FALHOU: B deveria ver 1 aguardando / 1200s (X9, 20min) e veio % / %',
      v_waiting, v_max;
  END IF;
  v_ok := v_ok + 1;

  -- ---------------------------------------------------------------- T2 (ACL)
  IF has_function_privilege('anon', 'public.inbox_wait_summary(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'T2 FALHOU: anon com EXECUTE na RPC';
  END IF;
  IF has_function_privilege('authenticated', 'public.inbox_wait_summary(uuid)', 'EXECUTE') = false THEN
    RAISE EXCEPTION 'T2 FALHOU: authenticated SEM EXECUTE na RPC';
  END IF;
  IF has_function_privilege('service_role', 'public.inbox_wait_summary(uuid)', 'EXECUTE') = false THEN
    RAISE EXCEPTION 'T2 FALHOU: service_role SEM EXECUTE na RPC';
  END IF;

  -- Prova funcional: como `anon` a chamada e barrada de verdade.
  -- (volta ao papel do script para poder assumir `anon`: `authenticated` nao e membro de `anon`.)
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_a)::text, true);
  PERFORM set_config('role', 'anon', true);
  v_barrado := false;
  BEGIN
    PERFORM 1 FROM public.inbox_wait_summary();
  EXCEPTION WHEN insufficient_privilege THEN
    v_barrado := true;
  END;
  PERFORM set_config('role', 'none', true);
  IF v_barrado = false THEN
    RAISE EXCEPTION 'T2 FALHOU: anon conseguiu chamar a RPC';
  END IF;

  -- Controle positivo: como `authenticated` a RPC responde (GRANT correto).
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_a)::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v_erro := false;
  BEGIN
    SELECT count(*) INTO v_linhas FROM public.inbox_wait_summary();
  EXCEPTION WHEN OTHERS THEN
    v_erro := true;
  END;
  PERFORM set_config('role', 'none', true);
  IF v_erro OR v_linhas <> 3 THEN
    RAISE EXCEPTION 'T2 FALHOU: authenticated nao conseguiu chamar a RPC (erro=%, linhas=%)',
      v_erro, v_linhas;
  END IF;
  v_ok := v_ok + 1;

  -- ---------------------------------------------------------------- T7 (seguranca)
  IF (SELECT prosecdef FROM pg_proc WHERE oid = 'public.inbox_wait_summary(uuid)'::regprocedure) = false THEN
    RAISE EXCEPTION 'T7 FALHOU: a RPC nao e SECURITY DEFINER';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
     WHERE oid = 'public.inbox_wait_summary(uuid)'::regprocedure
       AND proconfig IS NOT NULL
       AND EXISTS (SELECT 1 FROM unnest(proconfig) cfg WHERE cfg LIKE 'search_path=%')
  ) THEN
    RAISE EXCEPTION 'T7 FALHOU: a RPC nao tem search_path fixo';
  END IF;
  v_ok := v_ok + 1;

  RAISE NOTICE 'inbox_wait_summary: suite OK (T1 visibilidade, T2 ACL anon/authenticated, T3 metricas por grupo, T4 guarda ADR-005 sem mensagem, T5 soft-delete, T6 por fila + p_queue_id, T7 SECURITY DEFINER/search_path) — % grupo(s) verificado(s)', v_ok;
END $inbox_wait_summary$;

ROLLBACK;
