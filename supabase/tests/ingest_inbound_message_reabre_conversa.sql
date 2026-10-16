-- Suite SQL da reabertura de conversa no inbound (ADR-005 §3).
--
-- O que prova (contrato do corpo vigente de public.ingest_inbound_message, migration
-- 20260905070000, recriado por 20261014160000_ingest_inbound_message_reabre_conversa):
--   T1  contato 'resolved' + mensagem inbound NOVA volta para 'open' na hora, com
--       conversation_status_changed_at renovado — e o assigned_to NAO muda;
--   T2  contato 'archived' + inbound NOVO volta para 'open';
--   T3  contato ja 'open' recebe inbound novo, mas mantem conversation_status_changed_at
--       (nao "reabre" o que ja estava aberto) e o assigned_to;
--   T4  com a flag inbox.status-fsm DESLIGADA nada reabre (contato fica 'resolved');
--   T5  redelivery do MESMO external_id (outcome 'updated') NAO reabre: contato que foi
--       arquivado de novo continua 'archived' e nao duplica mensagem;
--   T6  ACL preservada: anon/authenticated/PUBLIC sem EXECUTE, so service_role com EXECUTE
--       (flag e prova funcional);
--   T7  a funcao continua sem SECURITY DEFINER e com search_path = public.
--
-- COMO RODAR (banco LOCAL da tarefa, nunca producao):
--   zapp-db-local psql . <conjunto> -v ON_ERROR_STOP=1 < supabase/tests/ingest_inbound_message_reabre_conversa.sql
--
-- Dados SINTETICOS (UUIDs/telefones de faixa de teste); tudo desfeito no ROLLBACK.
-- Sem EXCEPTION = suite verde.
BEGIN;

DO $ingest_reabre$
DECLARE
  v_conn        uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  v_user        uuid := '11111111-1111-1111-1111-1111111111a1';
  v_profile     uuid;
  c_res         uuid := '33333333-3333-3333-3333-333333330001';
  c_arch        uuid := '33333333-3333-3333-3333-333333330002';
  c_open        uuid := '33333333-3333-3333-3333-333333330003';
  c_flag        uuid := '33333333-3333-3333-3333-333333330004';
  c_dup         uuid := '33333333-3333-3333-3333-333333330005';
  v_t0          timestamptz := now() - interval '10 days';
  v_sig         text := 'public.ingest_inbound_message(uuid,text,text,text,text,text,text,timestamptz)';
  v_ok          int := 0;
  v_outcome     text;
  v_status      text;
  v_changed     timestamptz;
  v_changed_before timestamptz;
  v_assigned    uuid;
  v_msgs        bigint;
  v_barrado     boolean;
  v_definer     boolean;
  v_conf        text[];
BEGIN
  ---------------------------------------------------------------- dados
  INSERT INTO public.whatsapp_connections (id, name, phone_number, capabilities)
  VALUES (v_conn, 'Conexao sintetica (suite)', '+5511000003000', '{}'::jsonb);

  INSERT INTO auth.users (id, email) VALUES (v_user, 'ingest-reabre@local.test');
  INSERT INTO public.profiles (user_id, name) VALUES (v_user, 'Agente reabre (sintetico)')
  ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name;
  SELECT id INTO v_profile FROM public.profiles WHERE user_id = v_user;
  IF v_profile IS NULL THEN
    RAISE EXCEPTION 'fixture invalida: perfil sintetico nao encontrado';
  END IF;

  INSERT INTO public.contacts
    (id, name, phone, whatsapp_connection_id, assigned_to, conversation_status, conversation_status_changed_at)
  VALUES
    (c_res,  'Contato resolvido',  '5511000003001', v_conn, v_profile, 'resolved', v_t0),
    (c_arch, 'Contato arquivado',  '5511000003002', v_conn, v_profile, 'archived', v_t0),
    (c_open, 'Contato aberto',     '5511000003003', v_conn, v_profile, 'open',     v_t0),
    (c_flag, 'Contato flag off',   '5511000003004', v_conn, v_profile, 'resolved', v_t0),
    (c_dup,  'Contato redelivery', '5511000003005', v_conn, v_profile, 'archived', v_t0);

  -- Fixture determinista: o gatilho de auto-atribuicao nao pode ter mexido no que
  -- este teste mede. Se mexeu, a suite falha no setup (nao esconde o defeito).
  SELECT conversation_status, conversation_status_changed_at
    INTO v_status, v_changed FROM public.contacts WHERE id = c_res;
  IF v_status <> 'resolved' OR v_changed <> v_t0 THEN
    RAISE EXCEPTION 'fixture invalida: c_res ficou % / %', v_status, v_changed;
  END IF;

  ---------------------------------------------------------------- T1
  PERFORM set_config('role', 'service_role', true);
  SELECT t.outcome INTO v_outcome
    FROM public.ingest_inbound_message(v_conn, '5511000003001', 'Contato resolvido',
         'primeira resposta depois do encerramento', 'text', NULL, 'ext-res-1', now()) t;
  PERFORM set_config('role', 'none', true);

  IF v_outcome <> 'inserted' THEN
    RAISE EXCEPTION 'T1 FALHOU: outcome esperado inserted, veio %', v_outcome;
  END IF;
  SELECT conversation_status, conversation_status_changed_at, assigned_to
    INTO v_status, v_changed, v_assigned FROM public.contacts WHERE id = c_res;
  IF v_status <> 'open' THEN
    RAISE EXCEPTION 'T1 FALHOU: contato resolvido nao reabriu (status=%)', v_status;
  END IF;
  IF v_changed <= v_t0 THEN
    RAISE EXCEPTION 'T1 FALHOU: conversation_status_changed_at nao foi renovado (% <= %)', v_changed, v_t0;
  END IF;
  IF v_assigned IS DISTINCT FROM v_profile THEN
    RAISE EXCEPTION 'T1 FALHOU: assigned_to mudou (% -> %)', v_profile, v_assigned;
  END IF;
  v_ok := v_ok + 1;

  ---------------------------------------------------------------- T2
  PERFORM set_config('role', 'service_role', true);
  SELECT t.outcome INTO v_outcome
    FROM public.ingest_inbound_message(v_conn, '5511000003002', 'Contato arquivado',
         'voltou a falar', 'text', NULL, 'ext-arch-1', now()) t;
  PERFORM set_config('role', 'none', true);

  IF v_outcome <> 'inserted' THEN
    RAISE EXCEPTION 'T2 FALHOU: outcome esperado inserted, veio %', v_outcome;
  END IF;
  SELECT conversation_status, conversation_status_changed_at
    INTO v_status, v_changed FROM public.contacts WHERE id = c_arch;
  IF v_status <> 'open' THEN
    RAISE EXCEPTION 'T2 FALHOU: contato arquivado nao reabriu (status=%)', v_status;
  END IF;
  IF v_changed <= v_t0 THEN
    RAISE EXCEPTION 'T2 FALHOU: changed_at nao renovado (% <= %)', v_changed, v_t0;
  END IF;
  v_ok := v_ok + 1;

  ---------------------------------------------------------------- T3
  PERFORM set_config('role', 'service_role', true);
  SELECT t.outcome INTO v_outcome
    FROM public.ingest_inbound_message(v_conn, '5511000003003', 'Contato aberto',
         'mensagem em conversa aberta', 'text', NULL, 'ext-open-1', now()) t;
  PERFORM set_config('role', 'none', true);

  IF v_outcome <> 'inserted' THEN
    RAISE EXCEPTION 'T3 FALHOU: outcome esperado inserted, veio %', v_outcome;
  END IF;
  SELECT conversation_status, conversation_status_changed_at, assigned_to
    INTO v_status, v_changed, v_assigned FROM public.contacts WHERE id = c_open;
  IF v_status <> 'open' THEN
    RAISE EXCEPTION 'T3 FALHOU: contato aberto mudou de status (%)', v_status;
  END IF;
  IF v_changed <> v_t0 THEN
    RAISE EXCEPTION 'T3 FALHOU: changed_at de contato ja aberto foi reescrito (% <> %)', v_changed, v_t0;
  END IF;
  IF v_assigned IS DISTINCT FROM v_profile THEN
    RAISE EXCEPTION 'T3 FALHOU: assigned_to mudou em contato aberto';
  END IF;
  v_ok := v_ok + 1;

  ---------------------------------------------------------------- T4 (flag desligada)
  UPDATE public.feature_flags SET enabled = false WHERE key = 'inbox.status-fsm';
  PERFORM set_config('role', 'service_role', true);
  SELECT t.outcome INTO v_outcome
    FROM public.ingest_inbound_message(v_conn, '5511000003004', 'Contato flag off',
         'inbound com flag desligada', 'text', NULL, 'ext-flag-1', now()) t;
  PERFORM set_config('role', 'none', true);
  UPDATE public.feature_flags SET enabled = true WHERE key = 'inbox.status-fsm';

  IF v_outcome <> 'inserted' THEN
    RAISE EXCEPTION 'T4 FALHOU: outcome esperado inserted, veio %', v_outcome;
  END IF;
  SELECT conversation_status, conversation_status_changed_at
    INTO v_status, v_changed FROM public.contacts WHERE id = c_flag;
  IF v_status <> 'resolved' THEN
    RAISE EXCEPTION 'T4 FALHOU: com a flag desligada o contato reabriu (status=%)', v_status;
  END IF;
  IF v_changed <> v_t0 THEN
    RAISE EXCEPTION 'T4 FALHOU: changed_at mexeu com a flag desligada';
  END IF;
  v_ok := v_ok + 1;

  ---------------------------------------------------------------- T5 (redelivery mesmo external_id)
  PERFORM set_config('role', 'service_role', true);
  SELECT t.outcome INTO v_outcome
    FROM public.ingest_inbound_message(v_conn, '5511000003005', 'Contato redelivery',
         'mensagem 1', 'text', NULL, 'ext-dup-1', now()) t;
  PERFORM set_config('role', 'none', true);
  IF v_outcome <> 'inserted' THEN
    RAISE EXCEPTION 'T5 FALHOU(pre): primeira entrega esperava inserted, veio %', v_outcome;
  END IF;

  -- Arquivado de novo antes da reentrega (open -> archived e transicao valida; o gatilho
  -- FSM carimba changed_at = now(), entao guardamos o valor para comparar depois).
  UPDATE public.contacts
     SET conversation_status = 'archived', conversation_status_changed_at = v_t0
   WHERE id = c_dup;
  SELECT conversation_status_changed_at INTO v_changed_before
    FROM public.contacts WHERE id = c_dup;

  PERFORM set_config('role', 'service_role', true);
  SELECT t.outcome INTO v_outcome
    FROM public.ingest_inbound_message(v_conn, '5511000003005', 'Contato redelivery',
         'mensagem 1', 'text', NULL, 'ext-dup-1', now()) t;
  PERFORM set_config('role', 'none', true);

  IF v_outcome <> 'updated' THEN
    RAISE EXCEPTION 'T5 FALHOU: reentrega do mesmo external_id esperava updated, veio %', v_outcome;
  END IF;
  SELECT conversation_status, conversation_status_changed_at
    INTO v_status, v_changed FROM public.contacts WHERE id = c_dup;
  IF v_status <> 'archived' THEN
    RAISE EXCEPTION 'T5 FALHOU: redelivery reabriu o contato (status=%)', v_status;
  END IF;
  IF v_changed <> v_changed_before THEN
    RAISE EXCEPTION 'T5 FALHOU: redelivery tocou changed_at (% <> %)', v_changed, v_changed_before;
  END IF;
  SELECT count(*) INTO v_msgs FROM public.messages WHERE contact_id = c_dup;
  IF v_msgs <> 1 THEN
    RAISE EXCEPTION 'T5 FALHOU: redelivery duplicou mensagem (% linhas)', v_msgs;
  END IF;
  v_ok := v_ok + 1;

  ---------------------------------------------------------------- T6 (ACL)
  IF has_function_privilege('anon', v_sig, 'EXECUTE') THEN
    RAISE EXCEPTION 'T6 FALHOU: anon com EXECUTE';
  END IF;
  IF has_function_privilege('authenticated', v_sig, 'EXECUTE') THEN
    RAISE EXCEPTION 'T6 FALHOU: authenticated com EXECUTE';
  END IF;
  IF has_function_privilege('service_role', v_sig, 'EXECUTE') = false THEN
    RAISE EXCEPTION 'T6 FALHOU: service_role SEM EXECUTE';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p,
         aclexplode(p.proacl) a
    WHERE p.proname = 'ingest_inbound_message'
      AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'T6 FALHOU: PUBLIC com EXECUTE';
  END IF;

  -- Prova funcional: anon e authenticated sao barrados de verdade.
  PERFORM set_config('role', 'anon', true);
  v_barrado := false;
  BEGIN
    PERFORM 1 FROM public.ingest_inbound_message(v_conn, '5511000003001', 'x', 'x', 'text', NULL, 'x-anon', now());
  EXCEPTION WHEN insufficient_privilege THEN
    v_barrado := true;
  END;
  PERFORM set_config('role', 'none', true);
  IF v_barrado = false THEN
    RAISE EXCEPTION 'T6 FALHOU: anon conseguiu chamar a RPC';
  END IF;

  PERFORM set_config('role', 'authenticated', true);
  v_barrado := false;
  BEGIN
    PERFORM 1 FROM public.ingest_inbound_message(v_conn, '5511000003001', 'x', 'x', 'text', NULL, 'x-auth', now());
  EXCEPTION WHEN insufficient_privilege THEN
    v_barrado := true;
  END;
  PERFORM set_config('role', 'none', true);
  IF v_barrado = false THEN
    RAISE EXCEPTION 'T6 FALHOU: authenticated conseguiu chamar a RPC';
  END IF;
  v_ok := v_ok + 1;

  ---------------------------------------------------------------- T7 (forma da funcao)
  SELECT prosecdef, proconfig INTO v_definer, v_conf
    FROM pg_proc
   WHERE proname = 'ingest_inbound_message'
     AND pg_get_function_identity_arguments(oid) = 'p_connection_id uuid, p_phone text, p_push_name text, p_content text, p_message_type text, p_media_url text, p_external_id text, p_created_at timestamp with time zone';
  IF v_definer IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'T7 FALHOU: funcao virou SECURITY DEFINER (%)', v_definer;
  END IF;
  IF v_conf IS NULL OR NOT ('search_path=public' = ANY(v_conf)) THEN
    RAISE EXCEPTION 'T7 FALHOU: search_path public ausente (%)', v_conf;
  END IF;
  v_ok := v_ok + 1;

  RAISE NOTICE 'ingest_inbound_message_reabre_conversa: suite OK (T1 resolved, T2 archived, T3 open preserva changed_at, T4 flag off, T5 redelivery, T6 ACL, T7 forma) — % grupo(s)', v_ok;
END $ingest_reabre$;

ROLLBACK;
