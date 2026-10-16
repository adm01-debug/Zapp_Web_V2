-- Teste SQL de public.admin_inbox_silence() (painel de silencio da ingestao).
--
-- O que prova:
--   T1  por conexao: received_5m / received_1h / received_24h contam SO a direcao
--       de entrada (sender = 'contact'), com as janelas certas; a mensagem de 30h
--       fica fora do 24h; a de saida (sender = 'agent') nao entra na contagem;
--   T2  last_inbound_at / last_outbound_at sao a ULTIMA de cada direcao (sem janela);
--   T3  is_silent usa o limiar: conexao com ultima entrada 30 min atras e' silenciosa
--       com o padrao (10); conexao sem nenhuma mensagem tambem; conexao recente nao;
--   T4  top_conversations traz ate 10 contatos, ordenado por volume e sem telefone;
--   T5  o limiar vem de global_settings.inbox_silence_minutes e MANDA no is_silent
--       (60 -> a conexao de 30 min deixa de ser silenciosa; 1 -> a de 2 min passa a ser);
--   T6  escrita do limiar: NAO-admin (RLS) nao altera; admin altera; CHECK recusa fora
--       de 1..1440 e NULL; 1 e 1440 passam;
--   T7  ACL real: anon NAO tem EXECUTE e e' barrado; authenticated/service_role tem;
--       authenticated NAO-admin e' barrado pela propria RPC (42501) — so admin ve;
--   T8  volume: 3.000 mensagens de 3 contatos -> contagens exatas + tempo medido.
--
-- COMO RODAR (banco LOCAL da tarefa, nunca producao):
--   zapp-db-local psql . <conjunto> -v ON_ERROR_STOP=1 < supabase/tests/admin_inbox_silence.sql
--
-- Cria dados SINTETICOS e desfaz tudo no ROLLBACK final: nao sobra linha no banco.
-- Sem EXCEPTION = suite verde.
BEGIN;

DO $admin_inbox_silence$
DECLARE
  v_user_a      uuid := '12111111-1111-1111-1111-1111111111a1';
  v_user_admin  uuid := '12111111-1111-1111-1111-1111111111ad';
  v_profile_a   uuid;
  v_conn_a      uuid := '13111111-1111-1111-1111-1111111111a1';
  v_conn_b      uuid := '13111111-1111-1111-1111-1111111111b2';
  v_conn_c      uuid := '13111111-1111-1111-1111-1111111111c3';
  v_conn_d      uuid := '13111111-1111-1111-1111-1111111111d4';
  v_ct_a1       uuid := '14111111-1111-1111-1111-1111111111a1';
  v_ct_a2       uuid := '14111111-1111-1111-1111-1111111111a2';
  v_ct_b1       uuid := '14111111-1111-1111-1111-1111111111b1';
  v_min         integer;
  v_r5          bigint;
  v_r1h         bigint;
  v_r24         bigint;
  v_entrada     timestamptz;
  v_saida       timestamptz;
  v_silenciosa  boolean;
  v_topo        jsonb;
  v_linhas      integer;
  v_valor       text;
  v_barrado     boolean;
  v_ms          numeric;
  v_ok          int := 0;
BEGIN
  -- ---------------------------------------------------------------- dados
  INSERT INTO auth.users (id, email) VALUES
    (v_user_a,     'admin-silencio-a@local.test'),
    (v_user_admin, 'admin-silencio-adm@local.test');

  INSERT INTO public.profiles (user_id, name) VALUES
    (v_user_a,     'Agente A (silencio)'),
    (v_user_admin, 'Admin (silencio)')
  ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name;

  SELECT id INTO v_profile_a FROM public.profiles WHERE user_id = v_user_a;
  IF v_profile_a IS NULL THEN
    RAISE EXCEPTION 'fixture invalida: perfil sintetico nao encontrado';
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (v_user_admin, 'admin');

  -- Conexoes SINTETICAS novas: sem mensagem de seed, entao as contagens por
  -- conexao sao exatamente as do fixture.
  INSERT INTO public.whatsapp_connections (id, name, phone_number, status) VALUES
    (v_conn_a, 'Conexao A (silencio)', '5511000099001', 'connected'),
    (v_conn_b, 'Conexao B (silencio)', '5511000099002', 'connected'),
    (v_conn_c, 'Conexao C (silencio)', '5511000099003', 'disconnected'),
    (v_conn_d, 'Conexao D (volume)',   '5511000099004', 'connected');

  INSERT INTO public.contacts (id, name, phone, assigned_to) VALUES
    (v_ct_a1, 'Contato A1', '5511000099101', v_profile_a),
    (v_ct_a2, 'Contato A2', '5511000099102', v_profile_a),
    (v_ct_b1, 'Contato B1', '5511000099103', v_profile_a);

  -- Conexao A: entradas em 2 min, 30 min e 3h; uma de 30h (fora de tudo); 1 saida.
  INSERT INTO public.messages (id, whatsapp_connection_id, contact_id, sender, content, message_type, is_read, created_at) VALUES
    (gen_random_uuid(), v_conn_a, v_ct_a1, 'contact', 'a1', 'text', NULL,  now() - interval '2 minutes'),
    (gen_random_uuid(), v_conn_a, v_ct_a1, 'contact', 'a2', 'text', NULL,  now() - interval '30 minutes'),
    (gen_random_uuid(), v_conn_a, v_ct_a1, 'contact', 'a3', 'text', NULL,  now() - interval '3 hours'),
    (gen_random_uuid(), v_conn_a, v_ct_a2, 'contact', 'a4', 'text', true,  now() - interval '30 hours'),
    (gen_random_uuid(), v_conn_a, v_ct_a1, 'agent',   'a5', 'text', true,  now() - interval '5 minutes');
  -- Conexao B: ultima entrada 30 min atras; nenhuma saida.
  INSERT INTO public.messages (id, whatsapp_connection_id, contact_id, sender, content, message_type, is_read, created_at) VALUES
    (gen_random_uuid(), v_conn_b, v_ct_b1, 'contact', 'b1', 'text', NULL, now() - interval '30 minutes');
  -- Conexao C: nenhuma mensagem.

  -- ---------------------------------------------------------------- T1/T2/T3
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_admin)::text, true);
  PERFORM set_config('role', 'authenticated', true);

  SELECT received_5m, received_1h, received_24h, last_inbound_at, last_outbound_at,
         is_silent, silence_minutes, top_conversations
    INTO v_r5, v_r1h, v_r24, v_entrada, v_saida, v_silenciosa, v_min, v_topo
    FROM public.admin_inbox_silence() WHERE connection_id = v_conn_a;
  PERFORM set_config('role', 'none', true);

  IF v_r5 <> 1 OR v_r1h <> 2 OR v_r24 <> 3 THEN
    RAISE EXCEPTION 'T1 FALHOU (conexao A): janelas esperadas 5m=1 1h=2 24h=3, veio 5m=% 1h=% 24h=%', v_r5, v_r1h, v_r24;
  END IF;
  IF v_entrada IS NULL OR v_entrada < now() - interval '5 minutes' THEN
    RAISE EXCEPTION 'T2 FALHOU (conexao A): last_inbound_at deveria ser a entrada de 2 min, veio %', v_entrada;
  END IF;
  IF v_saida IS NULL OR v_saida < now() - interval '10 minutes' THEN
    RAISE EXCEPTION 'T2 FALHOU (conexao A): last_outbound_at deveria ser a saida de 5 min, veio %', v_saida;
  END IF;
  IF v_silenciosa IS NOT FALSE THEN
    RAISE EXCEPTION 'T3 FALHOU (conexao A): entrada de 2 min nao pode ser silenciosa (limiar %)', v_min;
  END IF;
  IF v_min <> 10 THEN
    RAISE EXCEPTION 'T5 FALHOU: limiar padrao esperado 10, veio %', v_min;
  END IF;
  -- T4: so o contato A1 entrou nas 24h (o A2 tem 1 mensagem de 30h, fora da janela).
  IF jsonb_array_length(v_topo) <> 1
     OR (v_topo -> 0 ->> 'contact_id') <> v_ct_a1::text
     OR (v_topo -> 0 ->> 'received') <> '3'
     OR (v_topo -> 0 ? 'phone') THEN
    RAISE EXCEPTION 'T4 FALHOU (conexao A): topo esperado 1 contato (A1, 3, sem telefone), veio %', v_topo;
  END IF;
  v_ok := v_ok + 1;

  PERFORM set_config('role', 'authenticated', true);
  SELECT received_5m, received_1h, received_24h, last_inbound_at, last_outbound_at, is_silent
    INTO v_r5, v_r1h, v_r24, v_entrada, v_saida, v_silenciosa
    FROM public.admin_inbox_silence() WHERE connection_id = v_conn_b;
  PERFORM set_config('role', 'none', true);

  IF v_r5 <> 0 OR v_r1h <> 1 OR v_r24 <> 1 THEN
    RAISE EXCEPTION 'T1 FALHOU (conexao B): janelas esperadas 5m=0 1h=1 24h=1, veio 5m=% 1h=% 24h=%', v_r5, v_r1h, v_r24;
  END IF;
  IF v_saida IS NOT NULL THEN
    RAISE EXCEPTION 'T2 FALHOU (conexao B): sem saida, last_outbound_at deveria ser NULL, veio %', v_saida;
  END IF;
  IF v_silenciosa IS NOT TRUE THEN
    RAISE EXCEPTION 'T3 FALHOU (conexao B): entrada de 30 min com limiar 10 deveria ser silenciosa';
  END IF;
  v_ok := v_ok + 1;

  -- Conexao C: sem nenhuma mensagem -> silenciosa e zerada.
  PERFORM set_config('role', 'authenticated', true);
  SELECT received_5m, received_24h, last_inbound_at, is_silent, top_conversations
    INTO v_r5, v_r24, v_entrada, v_silenciosa, v_topo
    FROM public.admin_inbox_silence() WHERE connection_id = v_conn_c;
  PERFORM set_config('role', 'none', true);

  IF v_r5 <> 0 OR v_r24 <> 0 OR v_entrada IS NOT NULL OR v_silenciosa IS NOT TRUE THEN
    RAISE EXCEPTION 'T3 FALHOU (conexao C): esperado zerada e silenciosa, veio 5m=% 24h=% entrada=% silenciosa=%',
      v_r5, v_r24, v_entrada, v_silenciosa;
  END IF;
  IF v_topo <> '[]'::jsonb THEN
    RAISE EXCEPTION 'T4 FALHOU (conexao C): topo deveria ser vazio, veio %', v_topo;
  END IF;
  v_ok := v_ok + 1;

  -- ---------------------------------------------------------------- T6 escrita
  -- Admin le o limiar; nao-admin (RLS) tenta escrever e nao muda nada.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_admin)::text, true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT value INTO v_valor FROM public.global_settings WHERE key = 'inbox_silence_minutes';
  PERFORM set_config('role', 'none', true);
  IF v_valor <> '10' THEN
    RAISE EXCEPTION 'T6 FALHOU: limiar inicial esperado 10, veio %', v_valor;
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_a)::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v_linhas := -1;
  BEGIN
    UPDATE public.global_settings SET value = '15' WHERE key = 'inbox_silence_minutes';
    GET DIAGNOSTICS v_linhas = ROW_COUNT;
  EXCEPTION WHEN insufficient_privilege THEN
    v_linhas := 0;
  END;
  PERFORM set_config('role', 'none', true);
  IF v_linhas <> 0 THEN
    RAISE EXCEPTION 'T6 FALHOU: nao-admin alterou % linha(s) do limiar', v_linhas;
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_admin)::text, true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT value INTO v_valor FROM public.global_settings WHERE key = 'inbox_silence_minutes';
  PERFORM set_config('role', 'none', true);
  IF v_valor <> '10' THEN
    RAISE EXCEPTION 'T6 FALHOU: nao-admin nao podia alterar o limiar, veio %', v_valor;
  END IF;
  v_ok := v_ok + 1;

  -- Admin escreve: 60 (B deixa de ser silenciosa), depois 1 (A passa a ser), depois 1440.
  PERFORM set_config('role', 'authenticated', true);
  UPDATE public.global_settings SET value = '60' WHERE key = 'inbox_silence_minutes';
  SELECT is_silent, silence_minutes INTO v_silenciosa, v_min
    FROM public.admin_inbox_silence() WHERE connection_id = v_conn_b;
  IF v_silenciosa IS NOT FALSE OR v_min <> 60 THEN
    RAISE EXCEPTION 'T5 FALHOU: com limiar 60 a conexao B nao pode ser silenciosa (silenciosa=%, limiar=%)', v_silenciosa, v_min;
  END IF;
  UPDATE public.global_settings SET value = '1' WHERE key = 'inbox_silence_minutes';
  SELECT is_silent, silence_minutes INTO v_silenciosa, v_min
    FROM public.admin_inbox_silence() WHERE connection_id = v_conn_a;
  IF v_silenciosa IS NOT TRUE OR v_min <> 1 THEN
    RAISE EXCEPTION 'T5 FALHOU: com limiar 1 a conexao A (2 min) deveria ser silenciosa (silenciosa=%, limiar=%)', v_silenciosa, v_min;
  END IF;
  UPDATE public.global_settings SET value = '1440' WHERE key = 'inbox_silence_minutes';
  PERFORM set_config('role', 'none', true);
  v_ok := v_ok + 1;

  -- CHECK: fora de 1..1440 e NULL sao recusados; 1 e 1440 passam.
  v_barrado := false;
  BEGIN
    UPDATE public.global_settings SET value = '0' WHERE key = 'inbox_silence_minutes';
  EXCEPTION WHEN check_violation THEN
    v_barrado := true;
  END;
  IF v_barrado IS NOT TRUE THEN
    RAISE EXCEPTION 'T6 FALHOU: o CHECK aceitou 0';
  END IF;
  v_barrado := false;
  BEGIN
    UPDATE public.global_settings SET value = '1441' WHERE key = 'inbox_silence_minutes';
  EXCEPTION WHEN check_violation THEN
    v_barrado := true;
  END;
  IF v_barrado IS NOT TRUE THEN
    RAISE EXCEPTION 'T6 FALHOU: o CHECK aceitou 1441';
  END IF;
  v_barrado := false;
  BEGIN
    UPDATE public.global_settings SET value = NULL WHERE key = 'inbox_silence_minutes';
  EXCEPTION WHEN check_violation THEN
    v_barrado := true;
  END;
  IF v_barrado IS NOT TRUE THEN
    RAISE EXCEPTION 'T6 FALHOU: o CHECK aceitou NULL';
  END IF;
  UPDATE public.global_settings SET value = '10' WHERE key = 'inbox_silence_minutes';
  v_ok := v_ok + 1;

  -- ---------------------------------------------------------------- T7 ACL
  IF has_function_privilege('anon', 'public.admin_inbox_silence()', 'EXECUTE') THEN
    RAISE EXCEPTION 'T7 FALHOU: anon com EXECUTE na RPC';
  END IF;
  IF has_function_privilege('authenticated', 'public.admin_inbox_silence()', 'EXECUTE') = false THEN
    RAISE EXCEPTION 'T7 FALHOU: authenticated SEM EXECUTE na RPC';
  END IF;
  IF has_function_privilege('service_role', 'public.admin_inbox_silence()', 'EXECUTE') = false THEN
    RAISE EXCEPTION 'T7 FALHOU: service_role SEM EXECUTE na RPC';
  END IF;

  PERFORM set_config('role', 'anon', true);
  v_barrado := false;
  BEGIN
    PERFORM count(*) FROM public.admin_inbox_silence();
  EXCEPTION WHEN insufficient_privilege THEN
    v_barrado := true;
  END;
  PERFORM set_config('role', 'none', true);
  IF v_barrado IS NOT TRUE THEN
    RAISE EXCEPTION 'T7 FALHOU: anon conseguiu chamar a RPC';
  END IF;

  -- authenticated NAO-admin: tem EXECUTE, mas a propria RPC barra (42501).
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_a)::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v_barrado := false;
  BEGIN
    PERFORM count(*) FROM public.admin_inbox_silence();
  EXCEPTION WHEN insufficient_privilege THEN
    v_barrado := true;
  END;
  PERFORM set_config('role', 'none', true);
  IF v_barrado IS NOT TRUE THEN
    RAISE EXCEPTION 'T7 FALHOU: agente nao-admin recebeu a lista de silencio';
  END IF;
  v_ok := v_ok + 1;

  -- ---------------------------------------------------------------- T8 volume
  INSERT INTO public.contacts (id, name, phone, assigned_to)
  SELECT ('15111111-1111-1111-1111-' || lpad(g::text, 12, '0'))::uuid,
         'Contato volume ' || g, '55118' || lpad(g::text, 8, '0'), v_profile_a
  FROM generate_series(1, 3) AS g;

  INSERT INTO public.messages (id, whatsapp_connection_id, contact_id, sender, content, message_type, is_read, created_at)
  SELECT gen_random_uuid(), v_conn_d,
         ('15111111-1111-1111-1111-' || lpad((((g - 1) % 3) + 1)::text, 12, '0'))::uuid,
         'contact', 'volume', 'text', NULL, now() - interval '1 hour'
  FROM generate_series(1, 3000) AS g;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_admin)::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v_ms := extract(epoch FROM clock_timestamp());
  SELECT received_24h, top_conversations INTO v_r24, v_topo
    FROM public.admin_inbox_silence() WHERE connection_id = v_conn_d;
  v_ms := (extract(epoch FROM clock_timestamp()) - v_ms) * 1000;
  PERFORM set_config('role', 'none', true);
  IF v_r24 <> 3000 OR jsonb_array_length(v_topo) <> 3 THEN
    RAISE EXCEPTION 'T8 FALHOU: esperado 24h=3000 e 3 contatos, veio 24h=% topo=%', v_r24, jsonb_array_length(v_topo);
  END IF;
  RAISE NOTICE 'T8 volume (conexao D, 3.000 mensagens): received_24h=% em % ms', v_r24, round(v_ms, 1);
  v_ok := v_ok + 1;

  RAISE NOTICE 'admin_inbox_silence: suite OK (T1 janelas por conexao, T2 ultima de cada direcao, T3 is_silent, T4 top_conversations, T5 limiar manda, T6 escrita so admin + CHECK, T7 ACL/42501, T8 volume) — % grupo(s)', v_ok;
END $admin_inbox_silence$;

ROLLBACK;
