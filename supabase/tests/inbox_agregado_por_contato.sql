-- Teste SQL da RPC public.get_inbox_contact_summaries (R2-INB-005 / item 84).
--
-- O que prova (o contrato que src/services/realtime.service.ts consome):
--   T1  contato NÃO visível ao chamador não volta no resultado (nem vaza metadado
--       por enumeração de UUID) — mesma trava de get_last_message_dates;
--   T2  a RPC recusa de fato a chamada como `anon` (permissão), e o `authenticated`
--       consegue chamar (controle positivo do GRANT);
--   T3  "não lida" conta mensagem com is_read NULO, igual ao cliente
--       (buildConversation: sender='contact' AND is_read IS NOT TRUE);
--   T4  desempate determinístico por id quando duas mensagens dividem created_at;
--   T5  contato visível SEM nenhuma mensagem não aparece (o cliente não infla a
--       inbox com conversa vazia);
--   T6  unread_count por contato é o agregado do banco, não a amostra global.
--
-- COMO RODAR (banco LOCAL da tarefa, nunca produção):
--   zapp-db-local psql . <conjunto> -v ON_ERROR_STOP=1 < supabase/tests/inbox_agregado_por_contato.sql
--
-- Cria dados SINTÉTICOS (usuários, perfis, contatos e mensagens) e desfaz tudo no
-- ROLLBACK final: não sobra linha no banco. Sem EXCEPTION = suíte verde.
BEGIN;

DO $inbox_summaries$
DECLARE
  -- usuários/perfis sintéticos (UUIDs só com hex; faixa 1/2/3/4 para leitura fácil)
  v_user_a        uuid := '11111111-1111-1111-1111-1111111111a1';
  v_user_b        uuid := '11111111-1111-1111-1111-1111111111b2';
  v_profile_a     uuid;
  v_profile_b     uuid;
  v_contact_vis   uuid := '33333333-3333-3333-3333-3333333333c1';
  v_contact_oculto uuid := '33333333-3333-3333-3333-3333333333c2';
  v_contact_vazio uuid := '33333333-3333-3333-3333-3333333333c3';
  v_msg_m1        uuid := '44444444-4444-4444-4444-444444444401';
  v_msg_m2        uuid := '44444444-4444-4444-4444-444444444402';
  v_msg_m3        uuid := '44444444-4444-4444-4444-444444444403';
  v_msg_m4        uuid := '44444444-4444-4444-4444-444444444404';
  v_msg_m5        uuid := '44444444-4444-4444-4444-444444444405';
  v_t_base        timestamptz := '2026-10-05T12:00:00Z';
  v_ok            int := 0;
  v_linhas        int;
  v_unread        bigint;
  v_last_id       uuid;
  v_last_content  text;
  v_barrado       boolean;
  v_matou         boolean;
  v_rec           record;
BEGIN
  -- ---------------------------------------------------------------- dados
  INSERT INTO auth.users (id, email) VALUES
    (v_user_a, 'inbox-summaries-a@local.test'),
    (v_user_b, 'inbox-summaries-b@local.test');

  -- O gatilho on_auth_user_created já cria o perfil; o upsert cobre os dois mundos
  -- (gatilho presente ou não) e devolve o id real para amarrar os contatos.
  INSERT INTO public.profiles (user_id, name) VALUES
    (v_user_a, 'Agente A (sintetico)'),
    (v_user_b, 'Agente B (sintetico)')
  ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name;

  SELECT id INTO v_profile_a FROM public.profiles WHERE user_id = v_user_a;
  SELECT id INTO v_profile_b FROM public.profiles WHERE user_id = v_user_b;
  IF v_profile_a IS NULL OR v_profile_b IS NULL THEN
    RAISE EXCEPTION 'fixture invalida: perfil sintetico nao encontrado (% / %)', v_profile_a, v_profile_b;
  END IF;

  INSERT INTO public.contacts (id, name, phone, assigned_to) VALUES
    (v_contact_vis,    'Contato A visivel',   '5511000000841', v_profile_a),
    (v_contact_oculto, 'Contato B oculto',    '5511000000842', v_profile_b),
    (v_contact_vazio,  'Contato A sem msgs',  '5511000000843', v_profile_a);

  -- m1: contato, is_read NULO  -> CONTA como não lida (T3)
  -- m2: contato, is_read false -> conta
  -- m3: agent,   is_read true  -> NÃO conta
  -- m4: contato, is_read true  -> não conta; divide created_at com m5 (T4)
  -- m5: contato, is_read NULO  -> conta; maior id no empate -> última mensagem
  INSERT INTO public.messages (id, contact_id, sender, content, message_type, is_read, created_at) VALUES
    (v_msg_m1, v_contact_vis, 'contact', 'm1 nao lida (nulo)',  'text', NULL,  v_t_base - interval '2 hours'),
    (v_msg_m2, v_contact_vis, 'contact', 'm2 nao lida',         'text', false, v_t_base - interval '1 hour'),
    (v_msg_m3, v_contact_vis, 'agent',   'm3 do agente',        'text', true,  v_t_base - interval '30 minutes'),
    (v_msg_m4, v_contact_vis, 'contact', 'm4 lida (empate id)', 'text', true,  v_t_base),
    (v_msg_m5, v_contact_vis, 'contact', 'm5 nao lida (empate)', 'text', NULL, v_t_base);

  -- m4 e m5 foram criadas com o mesmo carimbo; o desempate tem de cair no maior id
  IF v_msg_m4 > v_msg_m5 THEN
    RAISE EXCEPTION 'fixture invalida: o id de m4 (%) nao e menor que o de m5 (%)', v_msg_m4, v_msg_m5;
  END IF;

  -- ---------------------------------------------------------------- T1
  -- Como A, pedindo o contato oculto junto com o visível: só o visível volta.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_a)::text, true);
  SELECT count(*) INTO v_linhas
    FROM public.get_inbox_contact_summaries(ARRAY[v_contact_vis, v_contact_oculto]);
  IF v_linhas <> 1 THEN
    RAISE EXCEPTION 'T1 FALHOU: esperava 1 linha (contato visivel) e veio % linha(s)', v_linhas;
  END IF;

  SELECT count(*) INTO v_linhas
    FROM public.get_inbox_contact_summaries(ARRAY[v_contact_vis, v_contact_oculto])
   WHERE contact_id = v_contact_vis;
  IF v_linhas <> 1 THEN
    RAISE EXCEPTION 'T1 FALHOU: a linha devolvida nao e do contato visivel';
  END IF;

  SELECT count(*) INTO v_linhas
    FROM public.get_inbox_contact_summaries(ARRAY[v_contact_oculto]);
  IF v_linhas <> 0 THEN
    RAISE EXCEPTION 'T1 FALHOU: contato de outro agente vazou (% linha(s))', v_linhas;
  END IF;

  SELECT count(*) INTO v_linhas
    FROM public.get_inbox_contact_summaries(ARRAY[v_contact_vis])
   WHERE contact_id <> v_contact_vis;
  IF v_linhas <> 0 THEN
    RAISE EXCEPTION 'T1 FALHOU: a RPC devolveu contato fora do pedido';
  END IF;
  v_ok := v_ok + 1;

  -- Como B, o contato de A (visível para A) NÃO aparece.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_b)::text, true);
  SELECT count(*) INTO v_linhas
    FROM public.get_inbox_contact_summaries(ARRAY[v_contact_vis]);
  IF v_linhas <> 0 THEN
    RAISE EXCEPTION 'T1 FALHOU: a visibilidade do chamador B nao foi respeitada (% linha(s))', v_linhas;
  END IF;

  -- ---------------------------------------------------------------- T3/T4/T6
  -- Volta como A: agregado por contato do contato visível.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_a)::text, true);
  SELECT unread_count, last_message_id, last_message_content
    INTO v_unread, v_last_id, v_last_content
    FROM public.get_inbox_contact_summaries(ARRAY[v_contact_vis]);

  -- T3 (is_read nulo conta) + T6 (agregado do banco: m1, m2 e m5 = 3 não lidas)
  IF v_unread <> 3 THEN
    RAISE EXCEPTION 'T3/T6 FALHOU: esperava unread_count=3 (m1 nulo, m2 false, m5 nulo), veio %', v_unread;
  END IF;
  v_ok := v_ok + 1;

  -- T4 (desempate por id no mesmo created_at -> m5)
  IF v_last_id <> v_msg_m5 OR v_last_content <> 'm5 nao lida (empate)' THEN
    RAISE EXCEPTION 'T4 FALHOU: esperava ultima mensagem m5 (%) e veio % (%)',
      v_msg_m5, v_last_id, v_last_content;
  END IF;
  v_ok := v_ok + 1;

  -- ---------------------------------------------------------------- T5
  -- Contato visível e sem mensagem: nenhuma linha (não infla a inbox).
  SELECT count(*) INTO v_linhas
    FROM public.get_inbox_contact_summaries(ARRAY[v_contact_vazio]);
  IF v_linhas <> 0 THEN
    RAISE EXCEPTION 'T5 FALHOU: contato visivel sem mensagem devolveu % linha(s)', v_linhas;
  END IF;
  v_ok := v_ok + 1;

  -- ---------------------------------------------------------------- T2
  -- Flags de ACL (postgres enxerga os GRANTs): anon/PUBLIC sem EXECUTE,
  -- authenticated e service_role com EXECUTE.
  IF has_function_privilege('anon', 'public.get_inbox_contact_summaries(uuid[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'T2 FALHOU: anon com EXECUTE na RPC';
  END IF;
  IF has_function_privilege('authenticated', 'public.get_inbox_contact_summaries(uuid[])', 'EXECUTE') = false THEN
    RAISE EXCEPTION 'T2 FALHOU: authenticated SEM EXECUTE na RPC';
  END IF;
  IF has_function_privilege('service_role', 'public.get_inbox_contact_summaries(uuid[])', 'EXECUTE') = false THEN
    RAISE EXCEPTION 'T2 FALHOU: service_role SEM EXECUTE na RPC';
  END IF;

  -- A prova funcional: como anon a chamada é barrada de verdade.
  PERFORM set_config('role', 'anon', true);
  v_barrado := false;
  BEGIN
    PERFORM 1 FROM public.get_inbox_contact_summaries(ARRAY[v_contact_vis]);
  EXCEPTION WHEN insufficient_privilege THEN
    v_barrado := true;
  END;
  PERFORM set_config('role', 'none', true);
  IF v_barrado = false THEN
    RAISE EXCEPTION 'T2 FALHOU: anon conseguiu chamar a RPC';
  END IF;

  -- Controle positivo: como authenticated a RPC responde (GRANT correto).
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_a)::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v_matou := false;
  BEGIN
    SELECT count(*) INTO v_linhas
      FROM public.get_inbox_contact_summaries(ARRAY[v_contact_vis]);
  EXCEPTION WHEN OTHERS THEN
    v_matou := true;
  END;
  PERFORM set_config('role', 'none', true);
  IF v_matou OR v_linhas <> 1 THEN
    RAISE EXCEPTION 'T2 FALHOU: authenticated nao conseguiu chamar a RPC (erro=%, linhas=%)',
      v_matou, v_linhas;
  END IF;
  v_ok := v_ok + 1;

  RAISE NOTICE 'inbox_agregado_por_contato: suite OK (T1 visibilidade, T2 ACL anon/authenticated, T3 is_read nulo, T4 desempate por id, T5 contato sem mensagem, T6 agregado) — % grupo(s) verificado(s)', v_ok;
END $inbox_summaries$;

ROLLBACK;
