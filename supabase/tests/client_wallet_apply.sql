-- Teste SQL da RPC public.apply_client_wallet (cartão t_d155d152).
--
-- O que prova (o contrato da carteira de clientes em public.client_wallet_rules):
--   T1  contato SEM assigned_to recebe o agente da primeira regra ATIVA que casa a
--       conexão, por prioridade: R1 (prio 50) vence a regra curinga (prio 5);
--   T2  idempotência: a segunda chamada devolve NULL, não mexe em assigned_to e não
--       duplica o evento de auditoria;
--   T3  contato JÁ atribuído nunca é reatribuído (devolve NULL e não audita);
--   T4  prioridade entre regras da MESMA conexão: a de prioridade maior vence e a
--       regra INATIVA (is_active = false) é ignorada;
--   T5  a conexão do contato decide: regra de outra conexão não casa, a regra sem
--       conexão (curinga) casa;
--   T6  regra cujo agente está INATIVO é pulada e o contato recebe a próxima regra
--       ativa; quando só há regra com agente inativo, o contato fica SEM atribuição;
--   T7  a atribuição entra em public.conversation_events (event_type
--       'wallet_assignment') na MESMA transação, com performed_by = perfil de quem
--       chamou (NULL quando é o backend);
--   T8  permissão: sem EXECUTE para anon/PUBLIC; com EXECUTE para authenticated e
--       service_role; agente comum (authenticated NÃO staff) é barrado pela guarda
--       (42501) e o contato não é atribuído; admin (staff) e backend atribuem;
--   T9  entrada inválida: contato inexistente devolve NULL (sem erro) e
--       p_contact_id NULL levanta 22023;
--   T0  controle do caminho JÁ existente: o gatilho BEFORE INSERT
--       on_contact_created_auto_assign atribui no INSERT (prova que a regra já era
--       consultada nesse caminho — o que a RPC acrescenta é a chamada avulsa, a
--       checagem de agente ativo e a auditoria).
--
-- COMO RODAR (banco LOCAL da tarefa, nunca produção):
--   zapp-db-local psql . cwlt-2610151831 -v ON_ERROR_STOP=1 < supabase/tests/client_wallet_apply.sql
--
-- Cria dados SINTÉTICOS (usuários, perfis, conexões, fila, contatos e regras) e desfaz
-- tudo no ROLLBACK final: não sobra linha no banco. Sem EXCEPTION = suíte verde.
BEGIN;

DO $client_wallet_apply$
DECLARE
  -- usuários/profis/auth sintéticos (UUIDs só com hex)
  v_u_admin    uuid := '11111111-1111-1111-1111-1111111111a1';
  v_u_agent    uuid := '11111111-1111-1111-1111-1111111111a2';
  v_u_agent_b  uuid := '11111111-1111-1111-1111-1111111111a3';
  v_u_inativo  uuid := '11111111-1111-1111-1111-1111111111a4';
  v_p_admin    uuid;
  v_p_agent    uuid;
  v_p_agent_b  uuid;
  v_p_inativo  uuid;

  v_q      uuid := '22222222-2222-2222-2222-2222222222f1';
  v_c1     uuid := '22222222-2222-2222-2222-2222222222c1';
  v_c2     uuid := '22222222-2222-2222-2222-2222222222c2';
  v_c3     uuid := '22222222-2222-2222-2222-2222222222c3';
  v_c4     uuid := '22222222-2222-2222-2222-2222222222c4';
  v_c5     uuid := '22222222-2222-2222-2222-2222222222c5';

  v_ct0    uuid := '33333333-3333-3333-3333-333333333330';
  v_ct1    uuid := '33333333-3333-3333-3333-333333333331';
  v_ct2    uuid := '33333333-3333-3333-3333-333333333332';
  v_ct3    uuid := '33333333-3333-3333-3333-333333333333';
  v_ct4    uuid := '33333333-3333-3333-3333-333333333334';
  v_ct5    uuid := '33333333-3333-3333-3333-333333333335';
  v_ct6    uuid := '33333333-3333-3333-3333-333333333336';
  v_ct7    uuid := '33333333-3333-3333-3333-333333333337';
  v_ct8    uuid := '33333333-3333-3333-3333-333333333338';
  v_ct_fantasma uuid := '99999999-9999-9999-9999-999999999999';

  v_ret        uuid;
  v_ok         int := 0;
  v_linhas     int;
  v_perf       uuid;
  v_assigned   uuid;
  v_matou      boolean;
  v_errcode    text;
BEGIN
  -- ------------------------------------------------------------------ dados
  INSERT INTO auth.users (id, email) VALUES
    (v_u_admin,   'carteira-admin@local.test'),
    (v_u_agent,   'carteira-agente@local.test'),
    (v_u_agent_b, 'carteira-agente-b@local.test'),
    (v_u_inativo, 'carteira-inativo@local.test');

  -- O gatilho on_auth_user_created já cria o perfil; o upsert cobre os dois mundos.
  INSERT INTO public.profiles (user_id, name, is_active) VALUES
    (v_u_admin,   'Admin carteira (sintetico)',  true),
    (v_u_agent,   'Agente carteira (sintetico)', true),
    (v_u_agent_b, 'Agente B carteira (sint.)',   true),
    (v_u_inativo, 'Agente inativo (sintetico)',  false)
  ON CONFLICT (user_id) DO UPDATE
    SET name = EXCLUDED.name, is_active = EXCLUDED.is_active;

  SELECT id INTO v_p_admin   FROM public.profiles WHERE user_id = v_u_admin;
  SELECT id INTO v_p_agent   FROM public.profiles WHERE user_id = v_u_agent;
  SELECT id INTO v_p_agent_b FROM public.profiles WHERE user_id = v_u_agent_b;
  SELECT id INTO v_p_inativo FROM public.profiles WHERE user_id = v_u_inativo;
  IF v_p_admin IS NULL OR v_p_agent IS NULL OR v_p_agent_b IS NULL OR v_p_inativo IS NULL THEN
    RAISE EXCEPTION 'fixture invalida: perfil sintetico nao encontrado';
  END IF;

  -- staff: a guarda da RPC usa public.is_admin_or_supervisor(auth.uid())
  INSERT INTO public.user_roles (user_id, role) VALUES (v_u_admin, 'admin')
  ON CONFLICT DO NOTHING;

  -- Fila sem membro ativo: impede que o gatilho on_contact_queue_auto_assign
  -- (BEFORE INSERT em contacts) atribua alguém por conta própria no INSERT.
  INSERT INTO public.queues (id, name, color, is_active, priority)
  VALUES (v_q, 'Fila sintetica t_d155d152', '#000000', true, 0);

  INSERT INTO public.whatsapp_connections (id, name, phone_number, status) VALUES
    (v_c1, 'Conexao 1 (sint.)', '5511000000001', 'connected'),
    (v_c2, 'Conexao 2 (sint.)', '5511000000002', 'connected'),
    (v_c3, 'Conexao 3 (sint.)', '5511000000003', 'connected'),
    (v_c4, 'Conexao 4 (sint.)', '5511000000004', 'connected'),
    (v_c5, 'Conexao 5 (sint.)', '5511000000005', 'connected');

  -- Contatos ANTES das regras: o gatilho de carteira não tem o que aplicar ainda,
  -- então todos nascem exatamente no estado que cada teste precisa.
  INSERT INTO public.contacts (id, name, phone, queue_id, whatsapp_connection_id, assigned_to) VALUES
    (v_ct1, 'Contato ct1 sem atribuicao', '5511970000001', v_q, v_c1, NULL),
    (v_ct2, 'Contato ct2 ja atribuido',   '5511970000002', v_q, v_c1, v_p_agent_b),
    (v_ct3, 'Contato ct3 prioridade',     '5511970000003', v_q, v_c2, NULL),
    (v_ct4, 'Contato ct4 curinga',        '5511970000004', v_q, v_c3, NULL),
    (v_ct5, 'Contato ct5 so inativa',     '5511970000005', v_q, v_c5, NULL),
    (v_ct6, 'Contato ct6 pula inativa',   '5511970000006', v_q, v_c4, NULL),
    (v_ct7, 'Contato ct7 da guarda',      '5511970000007', v_q, v_c1, NULL),
    (v_ct8, 'Contato ct8 do backend',     '5511970000008', v_q, v_c1, NULL);

  -- Regras da carteira (prioridades distintas para não haver empate dependente de
  -- created_at):
  INSERT INTO public.client_wallet_rules (name, agent_id, whatsapp_connection_id, priority, is_active) VALUES
    ('R1 conexao 1 -> agente',            v_p_agent,   v_c1, 50, true),   -- ct1
    ('R2 conexao 2 -> admin (prio alta)', v_p_admin,   v_c2, 70, true),   -- ct3 vence
    ('R3 conexao 2 -> agente B (prio baixa)', v_p_agent_b, v_c2, 10, true),
    ('R4 curinga -> agente B',            v_p_agent_b, NULL,  5, true),   -- ct4
    ('R5 conexao 3 -> agente inativo',    v_p_inativo, v_c3, 90, true),   -- ct4: pulada
    ('R6 conexao 4 -> agente inativo',    v_p_inativo, v_c4, 90, true),   -- ct6: pulada
    ('R7 conexao 4 -> agente',            v_p_agent,   v_c4, 20, true),   -- ct6
    ('R8 conexao 5 -> agente inativo',    v_p_inativo, v_c5,  0, true),   -- ct5: nada a fazer
    ('R9 conexao 2 INATIVA -> admin',     v_p_admin,   v_c2, 99, false);  -- ignorada

  -- ------------------------------------------------------------- T1b (preparo)
  -- Envelhece o updated_at dos contatos do teste. O gatilho de updated_at grava
  -- now(), que é FIXO dentro da transação: sem envelhecer, não dá para distinguir
  -- quem a RPC tocou. O gatilho é desligado só neste ato de preparo — e AQUI, ainda
  -- como postgres (dono da tabela), porque trocar de papel vem logo abaixo.
  ALTER TABLE public.contacts DISABLE TRIGGER update_contacts_updated_at;
  UPDATE public.contacts SET updated_at = now() - interval '2 days'
   WHERE id IN (v_ct1, v_ct2, v_ct3, v_ct4, v_ct5, v_ct6, v_ct7, v_ct8);
  ALTER TABLE public.contacts ENABLE TRIGGER update_contacts_updated_at;

  -- Identidade de backend: service_role COM o claim e COM o papel de banco. É a
  -- identidade que os guards de public.contacts exigem para gravar; a RPC recusa
  -- qualquer outra (o caso "sem identidade" está no T8).
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  PERFORM set_config('role', 'service_role', true);

  -- ----------------------------------------------------------------- T1
  v_ret := public.apply_client_wallet(v_ct1);
  IF v_ret IS DISTINCT FROM v_p_agent THEN
    RAISE EXCEPTION 'T1 FALHOU: retorno % (esperado %)', v_ret, v_p_agent;
  END IF;
  SELECT assigned_to INTO v_assigned FROM public.contacts WHERE id = v_ct1;
  IF v_assigned IS DISTINCT FROM v_p_agent THEN
    RAISE EXCEPTION 'T1 FALHOU: assigned_to = % (esperado %)', v_assigned, v_p_agent;
  END IF;
  -- T1b: o UPDATE da RPC toca UMA linha (WHERE id = p_contact_id). O gatilho de
  -- updated_at sobe a data SÓ do contato atribuído: se o UPDATE fosse em massa, os
  -- oito contatos do teste apareceriam com data nova e este IF reprovaria.
  SELECT count(*) INTO v_linhas FROM public.contacts
   WHERE id IN (v_ct1, v_ct2, v_ct3, v_ct4, v_ct5, v_ct6, v_ct7, v_ct8)
     AND updated_at > now() - interval '1 day';
  IF v_linhas <> 1 THEN
    RAISE EXCEPTION 'T1 FALHOU: % contato(s) com updated_at novo (esperado 1)', v_linhas;
  END IF;
  IF (SELECT updated_at FROM public.contacts WHERE id = v_ct1) <= now() - interval '1 day' THEN
    RAISE EXCEPTION 'T1 FALHOU: contato atribuido ficou com updated_at antigo';
  END IF;
  v_ok := v_ok + 1;

  -- ----------------------------------------------------------------- T2
  v_ret := public.apply_client_wallet(v_ct1);
  IF v_ret IS NOT NULL THEN
    RAISE EXCEPTION 'T2 FALHOU: segunda chamada devolveu % (esperado NULL)', v_ret;
  END IF;
  SELECT count(*) INTO v_linhas FROM public.conversation_events
   WHERE contact_id = v_ct1 AND event_type = 'wallet_assignment';
  IF v_linhas <> 1 THEN
    RAISE EXCEPTION 'T2 FALHOU: % evento(s) de auditoria (esperado 1)', v_linhas;
  END IF;
  v_ok := v_ok + 1;

  -- ----------------------------------------------------------------- T3
  v_ret := public.apply_client_wallet(v_ct2);
  IF v_ret IS NOT NULL THEN
    RAISE EXCEPTION 'T3 FALHOU: contato ja atribuido devolveu % (esperado NULL)', v_ret;
  END IF;
  SELECT assigned_to INTO v_assigned FROM public.contacts WHERE id = v_ct2;
  IF v_assigned IS DISTINCT FROM v_p_agent_b THEN
    RAISE EXCEPTION 'T3 FALHOU: assigned_to mudou para % (esperado %)', v_assigned, v_p_agent_b;
  END IF;
  SELECT count(*) INTO v_linhas FROM public.conversation_events
   WHERE contact_id = v_ct2 AND event_type = 'wallet_assignment';
  IF v_linhas <> 0 THEN
    RAISE EXCEPTION 'T3 FALHOU: contato ja atribuido gerou % evento(s)', v_linhas;
  END IF;
  v_ok := v_ok + 1;

  -- ----------------------------------------------------------------- T4
  v_ret := public.apply_client_wallet(v_ct3);
  IF v_ret IS DISTINCT FROM v_p_admin THEN
    RAISE EXCEPTION 'T4 FALHOU: prioridade/inatividade ignoradas, retorno % (esperado %)',
      v_ret, v_p_admin;
  END IF;
  v_ok := v_ok + 1;

  -- ----------------------------------------------------------------- T5 + T6 (curinga vence só depois de pular a regra inativa)
  v_ret := public.apply_client_wallet(v_ct4);
  IF v_ret IS DISTINCT FROM v_p_agent_b THEN
    RAISE EXCEPTION 'T5/T6 FALHOU: retorno % (esperado % pelo curinga apos pular agente inativo)',
      v_ret, v_p_agent_b;
  END IF;
  v_ok := v_ok + 1;

  -- T6b: só existe regra com agente inativo -> contato continua sem atribuição.
  -- O curinga R4 (agente ativo, sem conexão) casa com QUALQUER contato e seria a
  -- próxima regra ativa escolhida; desliga-se aqui, na ordem do teste (ROLLBACK desfaz).
  UPDATE public.client_wallet_rules SET is_active = false WHERE name = 'R4 curinga -> agente B';
  v_ret := public.apply_client_wallet(v_ct5);
  IF v_ret IS NOT NULL THEN
    RAISE EXCEPTION 'T6 FALHOU: regra de agente inativo atribuiu % (esperado NULL)', v_ret;
  END IF;
  SELECT assigned_to INTO v_assigned FROM public.contacts WHERE id = v_ct5;
  IF v_assigned IS NOT NULL THEN
    RAISE EXCEPTION 'T6 FALHOU: contato ficou com assigned_to = %', v_assigned;
  END IF;
  SELECT count(*) INTO v_linhas FROM public.conversation_events
   WHERE contact_id = v_ct5 AND event_type = 'wallet_assignment';
  IF v_linhas <> 0 THEN
    RAISE EXCEPTION 'T6 FALHOU: atribuicao inexistente gerou % evento(s)', v_linhas;
  END IF;

  -- T6c: regra inativa (is_active = false) de prioridade 99 não decide nada
  v_ret := public.apply_client_wallet(v_ct6);
  IF v_ret IS DISTINCT FROM v_p_agent THEN
    RAISE EXCEPTION 'T6 FALHOU: retorno % no ct6 (esperado %; R6 inativa/inativa-agente e R7)',
      v_ret, v_p_agent;
  END IF;
  v_ok := v_ok + 1;

  -- ----------------------------------------------------------------- T7
  SELECT performed_by INTO v_perf FROM public.conversation_events
   WHERE contact_id = v_ct1 AND event_type = 'wallet_assignment';
  IF v_perf IS NOT NULL THEN
    RAISE EXCEPTION 'T7 FALHOU: chamada de backend gravou performed_by = % (esperado NULL)', v_perf;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.conversation_events
     WHERE contact_id = v_ct3 AND event_type = 'wallet_assignment'
       AND to_agent_id = v_p_admin
       AND metadata->>'source' = 'client_wallet'
  ) THEN
    RAISE EXCEPTION 'T7 FALHOU: evento de auditoria do ct3 ausente ou incompleto';
  END IF;
  v_ok := v_ok + 1;

  -- ----------------------------------------------------------------- T9
  v_ret := public.apply_client_wallet(v_ct_fantasma);
  IF v_ret IS NOT NULL THEN
    RAISE EXCEPTION 'T9 FALHOU: contato inexistente devolveu % (esperado NULL)', v_ret;
  END IF;
  v_matou := false;
  BEGIN
    PERFORM public.apply_client_wallet(NULL);
  EXCEPTION WHEN OTHERS THEN
    v_matou := true; v_errcode := SQLSTATE;
  END;
  IF NOT v_matou OR v_errcode <> '22023' THEN
    RAISE EXCEPTION 'T9 FALHOU: p_contact_id NULL nao levantou 22023 (matou=%, sqlstate=%)',
      v_matou, v_errcode;
  END IF;
  v_ok := v_ok + 1;

  -- ----------------------------------------------------------------- T0
  -- Contato novo, com as regras já no lugar: quem atribui é o gatilho de INSERT.
  INSERT INTO public.contacts (id, name, phone, queue_id, whatsapp_connection_id)
  VALUES (v_ct0, 'Contato ct0 novo (gatilho)', '5511970000010', v_q, v_c1);
  SELECT assigned_to INTO v_assigned FROM public.contacts WHERE id = v_ct0;
  IF v_assigned IS DISTINCT FROM v_p_agent THEN
    RAISE EXCEPTION 'T0 FALHOU: contato novo ficou com assigned_to = % (esperado %)', v_assigned, v_p_agent;
  END IF;
  IF (SELECT count(*) FROM public.conversation_events
        WHERE contact_id = v_ct0 AND event_type = 'wallet_assignment') <> 0 THEN
    RAISE EXCEPTION 'T0: o gatilho de INSERT passou a auditar (o cartao nao pediu isso)';
  END IF;
  v_ok := v_ok + 1;

  -- ----------------------------------------------------------------- T8
  -- ACL: nega por padrão, libera só authenticated e service_role.
  IF has_function_privilege('anon', 'public.apply_client_wallet(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'T8 FALHOU: anon com EXECUTE na RPC';
  END IF;
  IF has_function_privilege('public', 'public.apply_client_wallet(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'T8 FALHOU: PUBLIC com EXECUTE na RPC';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.apply_client_wallet(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'T8 FALHOU: authenticated SEM EXECUTE na RPC';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.apply_client_wallet(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'T8 FALHOU: service_role SEM EXECUTE na RPC';
  END IF;

  -- anon: barrado pelo GRANT
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_u_agent, 'role', 'anon')::text, true);
  PERFORM set_config('role', 'anon', true);
  v_matou := false; v_errcode := NULL;
  BEGIN
    PERFORM public.apply_client_wallet(v_ct7);
  EXCEPTION WHEN OTHERS THEN
    v_matou := true; v_errcode := SQLSTATE;
  END;
  PERFORM set_config('role', 'none', true);
  IF NOT v_matou OR v_errcode <> '42501' THEN
    RAISE EXCEPTION 'T8 FALHOU: anon nao foi barrado (matou=%, sqlstate=%)', v_matou, v_errcode;
  END IF;
  IF (SELECT assigned_to FROM public.contacts WHERE id = v_ct7) IS NOT NULL THEN
    RAISE EXCEPTION 'T8 FALHOU: a chamada anon atribuiu o ct7';
  END IF;

  -- authenticated NÃO staff: tem EXECUTE, mas a guarda da função barra
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_u_agent, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v_matou := false; v_errcode := NULL;
  BEGIN
    v_ret := public.apply_client_wallet(v_ct7);
  EXCEPTION WHEN OTHERS THEN
    v_matou := true; v_errcode := SQLSTATE;
  END;
  PERFORM set_config('role', 'none', true);
  IF NOT v_matou OR v_errcode <> '42501' THEN
    RAISE EXCEPTION 'T8 FALHOU: agente comum (nao staff) nao foi barrado (matou=%, sqlstate=%)',
      v_matou, v_errcode;
  END IF;
  IF (SELECT assigned_to FROM public.contacts WHERE id = v_ct7) IS NOT NULL
     OR EXISTS (SELECT 1 FROM public.conversation_events
                 WHERE contact_id = v_ct7 AND event_type = 'wallet_assignment') THEN
    RAISE EXCEPTION 'T8 FALHOU: a tentativa do agente comum mexeu no contato/auditoria';
  END IF;

  -- authenticated staff (admin): atribui e audita com performed_by = perfil do caller
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_u_admin, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v_ret := public.apply_client_wallet(v_ct7);
  PERFORM set_config('role', 'none', true);
  IF v_ret IS DISTINCT FROM v_p_agent THEN
    RAISE EXCEPTION 'T8 FALHOU: staff devolveu % (esperado %)', v_ret, v_p_agent;
  END IF;
  SELECT performed_by INTO v_perf FROM public.conversation_events
   WHERE contact_id = v_ct7 AND event_type = 'wallet_assignment';
  IF v_perf IS DISTINCT FROM v_p_admin THEN
    RAISE EXCEPTION 'T8 FALHOU: performed_by = % (esperado perfil do admin %)', v_perf, v_p_admin;
  END IF;

  -- backend de verdade (service_role com claim E papel de banco): atribui
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  PERFORM set_config('role', 'service_role', true);
  v_ret := public.apply_client_wallet(v_ct8);
  PERFORM set_config('role', 'none', true);
  IF v_ret IS DISTINCT FROM v_p_agent THEN
    RAISE EXCEPTION 'T8 FALHOU: backend devolveu % (esperado %)', v_ret, v_p_agent;
  END IF;

  -- contexto SEM identidade (postgres cru, sem claim de service_role): 42501 ANTES de
  -- qualquer escrita — mesma barreira que os guards de public.contacts já impõem.
  PERFORM set_config('request.jwt.claims', '{}', true);
  v_matou := false; v_errcode := NULL;
  BEGIN
    PERFORM public.apply_client_wallet(v_ct8);
  EXCEPTION WHEN OTHERS THEN
    v_matou := true; v_errcode := SQLSTATE;
  END;
  IF NOT v_matou OR v_errcode <> '42501' THEN
    RAISE EXCEPTION 'T8 FALHOU: contexto sem identidade nao foi barrado (matou=%, sqlstate=%)',
      v_matou, v_errcode;
  END IF;
  v_ok := v_ok + 1;

  RAISE NOTICE 'client_wallet_apply: suite OK (T0 gatilho de INSERT, T1 regra/prioridade, T2 idempotencia, T3 nao reatribui, T4 prioridade+regra inativa, T5/T6 conexao+agente inativo, T7 auditoria, T8 ACL/GUARDA, T9 entrada invalida) — % grupo(s) verificado(s)', v_ok;
END $client_wallet_apply$;

ROLLBACK;
