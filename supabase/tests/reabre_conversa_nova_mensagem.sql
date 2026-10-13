-- Teste SQL da reabertura de conversa (R2-INB-035 / t_0d2e2dec).
-- Migration: supabase/migrations/20261013210003_reabre_conversa_com_nova_mensagem.sql
--
-- O que prova:
--   T1  mensagem do contato reabre conversa RESOLVED com responsável -> 'open',
--       grava UM evento 'reopen' com previous_status/destination;
--   T2  mensagem do contato reabre conversa ARQUIVADA sem responsável -> 'waiting'
--       (dois passos do FSM: archived -> open -> waiting, sem erro 23514);
--   T3  idempotência: contato já ativo não muda nem grava evento (mensagem nova
--       e chamada repetida da RPC);
--   T4  mensagem de AGENTE e mensagem com is_deleted=true NÃO reabrem;
--   T5  contato soft-deleted (deleted_at) NÃO reabre;
--   T6  RPC do botão: papéis, perfil ativo, visibilidade (mesmo erro para contato
--       inexistente e sem permissão), e o ator correto no evento; estado intacto
--       quando barrado;
--   T7  ATOMICIDADE: forçando o INSERT do evento a falhar, a mensagem e a mudança
--       de estado desfazem juntas (nada pela metade);
--   T8  ACL: reopen_conversation só para authenticated/service_role; o núcleo e o
--       gatilho sem EXECUTE para anon/authenticated/PUBLIC, e anon barrado de fato;
--   T9  entrada inválida: contact_id NULL -> 22023.
--
-- COMO RODAR (banco LOCAL da tarefa, nunca produção):
--   zapp-db-local psql . <conjunto> -v ON_ERROR_STOP=1 < supabase/tests/reabre_conversa_nova_mensagem.sql
--
-- Dados SINTÉTICOS; nada persiste (ROLLBACK final). Suíte verde = sem EXCEPTION.
BEGIN;

DO $reabre$
DECLARE
  v_user_a    uuid := '11111111-1111-1111-1111-1111111111a1';
  v_user_b    uuid := '11111111-1111-1111-1111-1111111111b2';
  v_user_x    uuid := '11111111-1111-1111-1111-1111111111c3';
  v_profile_a uuid;
  v_profile_b uuid;

  v_ok        int := 0;
  v_status    text;
  v_count     int;
  v_event     record;
  v_state     text;
  v_msg_id    uuid;
  v_reopened  boolean;
  v_profile_in_event uuid;

  v_msg_ok    uuid := '44444444-4444-4444-4444-444444444401';
  v_msg_arch  uuid := '44444444-4444-4444-4444-444444444402';
  v_msg_agent uuid := '44444444-4444-4444-4444-444444444403';
  v_msg_del   uuid := '44444444-4444-4444-4444-444444444404';
  v_msg_atom  uuid := '44444444-4444-4444-4444-444444444405';
BEGIN
  -- ---------------------------------------------------------------- fixtures
  INSERT INTO auth.users (id, email) VALUES
    (v_user_a, 'reabre-a@local.test'),
    (v_user_b, 'reabre-b@local.test'),
    (v_user_x, 'reabre-x@local.test');

  INSERT INTO public.profiles (user_id, name) VALUES
    (v_user_a, 'Agente A (sintetico)'),
    (v_user_b, 'Agente B (sintetico)'),
    (v_user_x, 'Sem permissao (sintetico)')
  ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name;

  SELECT id INTO v_profile_a FROM public.profiles WHERE user_id = v_user_a;
  SELECT id INTO v_profile_b FROM public.profiles WHERE user_id = v_user_b;
  IF v_profile_a IS NULL OR v_profile_b IS NULL THEN
    RAISE EXCEPTION 'fixture invalida: perfil sintetico nao encontrado';
  END IF;

  -- C1 resolved/atribuido A; C2 archived/sem responsavel; C3 resolved/A (RPC);
  -- C4 open/A; C5 resolved/A soft-deleted; C6 resolved/A (msg de agente);
  -- C7 resolved/A (msg deletada); C8 resolved/de B (invisivel a A); C9 resolved/A (atomicidade).
  INSERT INTO public.contacts (id, name, phone, assigned_to, conversation_status) VALUES
    ('33333333-3333-3333-3333-3333333333c1', 'C1 resolved c/ dono', '5511000000901', v_profile_a, 'resolved'),
    ('33333333-3333-3333-3333-3333333333c2', 'C2 archived s/ dono', '5511000000902', NULL,         'archived'),
    ('33333333-3333-3333-3333-3333333333c3', 'C3 resolved RPC',     '5511000000903', v_profile_a, 'resolved'),
    ('33333333-3333-3333-3333-3333333333c4', 'C4 ativo',            '5511000000904', v_profile_a, 'open'),
    ('33333333-3333-3333-3333-3333333333c5', 'C5 soft-deleted',     '5511000000905', v_profile_a, 'resolved'),
    ('33333333-3333-3333-3333-3333333333c6', 'C6 msg agente',       '5511000000906', v_profile_a, 'resolved'),
    ('33333333-3333-3333-3333-3333333333c7', 'C7 msg deletada',     '5511000000907', v_profile_a, 'resolved'),
    ('33333333-3333-3333-3333-3333333333c8', 'C8 de outro agente',  '5511000000908', v_profile_b, 'resolved'),
    ('33333333-3333-3333-3333-3333333333c9', 'C9 atomicidade',      '5511000000909', v_profile_a, 'resolved');

  UPDATE public.contacts SET deleted_at = now() WHERE id = '33333333-3333-3333-3333-3333333333c5';

  -- ---------------------------------------------------------------- T1/T2 (inbound do contato)
  PERFORM set_config('role', 'service_role', true);

  INSERT INTO public.messages (id, contact_id, sender, content, message_type)
    VALUES (v_msg_ok, '33333333-3333-3333-3333-3333333333c1', 'contact', 'cliente voltou', 'text');
  INSERT INTO public.messages (id, contact_id, sender, content, message_type)
    VALUES (v_msg_arch, '33333333-3333-3333-3333-3333333333c2', 'contact', 'cliente voltou sem dono', 'text');

  PERFORM set_config('role', 'none', true);

  SELECT conversation_status INTO v_status FROM public.contacts WHERE id = '33333333-3333-3333-3333-3333333333c1';
  IF v_status <> 'open' THEN
    RAISE EXCEPTION 'T1 FALHOU: C1 resolveu com responsavel deveria virar open e ficou %', v_status;
  END IF;
  SELECT count(*) INTO v_count FROM public.conversation_events
   WHERE contact_id = '33333333-3333-3333-3333-3333333333c1' AND event_type = 'reopen';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'T1 FALHOU: esperava 1 evento reopen e veio %', v_count;
  END IF;
  SELECT event_type, metadata ->> 'previous_status' AS prev, metadata ->> 'destination' AS dest
    INTO v_event FROM public.conversation_events
   WHERE contact_id = '33333333-3333-3333-3333-3333333333c1' AND event_type = 'reopen';
  IF v_event.prev <> 'resolved' OR v_event.dest <> 'open' THEN
    RAISE EXCEPTION 'T1 FALHOU: evento sem previous_status/destination corretos (%)', v_event;
  END IF;
  v_ok := v_ok + 1;

  SELECT conversation_status INTO v_status FROM public.contacts WHERE id = '33333333-3333-3333-3333-3333333333c2';
  IF v_status <> 'waiting' THEN
    RAISE EXCEPTION 'T2 FALHOU: C2 arquivado sem responsavel deveria virar waiting e ficou %', v_status;
  END IF;
  SELECT count(*) INTO v_count FROM public.conversation_events
   WHERE contact_id = '33333333-3333-3333-3333-3333333333c2' AND event_type = 'reopen';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'T2 FALHOU: esperava 1 evento reopen em C2 e veio %', v_count;
  END IF;
  v_ok := v_ok + 1;

  -- ---------------------------------------------------------------- T3 (no-op: já ativo)
  PERFORM set_config('role', 'service_role', true);
  INSERT INTO public.messages (id, contact_id, sender, content, message_type)
    VALUES ('44444444-4444-4444-4444-4444444444a1', '33333333-3333-3333-3333-3333333333c4', 'contact', 'msg em conversa ativa', 'text');
  PERFORM set_config('role', 'none', true);

  SELECT conversation_status INTO v_status FROM public.contacts WHERE id = '33333333-3333-3333-3333-3333333333c4';
  SELECT count(*) INTO v_count FROM public.conversation_events WHERE contact_id = '33333333-3333-3333-3333-3333333333c4';
  IF v_status <> 'open' OR v_count <> 0 THEN
    RAISE EXCEPTION 'T3 FALHOU: contato ativo mudou (status=%) ou gravou evento (%)', v_status, v_count;
  END IF;

  -- RPC repetida num contato já ativo: reopened=false, sem evento novo.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_a, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT reopened, conversation_status INTO v_reopened, v_status
    FROM public.reopen_conversation('33333333-3333-3333-3333-3333333333c4');
  PERFORM set_config('role', 'none', true);
  SELECT count(*) INTO v_count FROM public.conversation_events WHERE contact_id = '33333333-3333-3333-3333-3333333333c4';
  IF v_reopened IS DISTINCT FROM false OR v_status <> 'open' OR v_count <> 0 THEN
    RAISE EXCEPTION 'T3 FALHOU: no-op da RPC (reopened=%, status=%, eventos=%)', v_reopened, v_status, v_count;
  END IF;
  v_ok := v_ok + 1;

  -- ---------------------------------------------------------------- T4 (agente / deletada)
  PERFORM set_config('role', 'service_role', true);
  INSERT INTO public.messages (id, contact_id, sender, content, message_type)
    VALUES (v_msg_agent, '33333333-3333-3333-3333-3333333333c6', 'agent', 'resposta do agente', 'text');
  INSERT INTO public.messages (id, contact_id, sender, content, message_type, is_deleted)
    VALUES (v_msg_del, '33333333-3333-3333-3333-3333333333c7', 'contact', 'msg apagada', 'text', true);
  PERFORM set_config('role', 'none', true);

  SELECT conversation_status INTO v_status FROM public.contacts WHERE id = '33333333-3333-3333-3333-3333333333c6';
  SELECT count(*) INTO v_count FROM public.conversation_events WHERE contact_id = '33333333-3333-3333-3333-3333333333c6';
  IF v_status <> 'resolved' OR v_count <> 0 THEN
    RAISE EXCEPTION 'T4 FALHOU: mensagem de agente reabriu (status=%, eventos=%)', v_status, v_count;
  END IF;
  SELECT conversation_status INTO v_status FROM public.contacts WHERE id = '33333333-3333-3333-3333-3333333333c7';
  SELECT count(*) INTO v_count FROM public.conversation_events WHERE contact_id = '33333333-3333-3333-3333-3333333333c7';
  IF v_status <> 'resolved' OR v_count <> 0 THEN
    RAISE EXCEPTION 'T4 FALHOU: mensagem deletada reabriu (status=%, eventos=%)', v_status, v_count;
  END IF;
  v_ok := v_ok + 1;

  -- ---------------------------------------------------------------- T5 (soft-deleted)
  PERFORM set_config('role', 'service_role', true);
  INSERT INTO public.messages (id, contact_id, sender, content, message_type)
    VALUES ('44444444-4444-4444-4444-4444444444a5', '33333333-3333-3333-3333-3333333333c5', 'contact', 'msg em contato apagado', 'text');
  PERFORM set_config('role', 'none', true);

  SELECT conversation_status INTO v_status FROM public.contacts WHERE id = '33333333-3333-3333-3333-3333333333c5';
  SELECT count(*) INTO v_count FROM public.conversation_events WHERE contact_id = '33333333-3333-3333-3333-3333333333c5';
  IF v_status <> 'resolved' OR v_count <> 0 THEN
    RAISE EXCEPTION 'T5 FALHOU: contato soft-deleted reabriu (status=%, eventos=%)', v_status, v_count;
  END IF;
  v_ok := v_ok + 1;

  -- ---------------------------------------------------------------- T6 (RPC do botão)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_a, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT reopened, conversation_status INTO v_reopened, v_status
    FROM public.reopen_conversation('33333333-3333-3333-3333-3333333333c3');
  PERFORM set_config('role', 'none', true);
  IF v_reopened IS DISTINCT FROM true OR v_status <> 'open' THEN
    RAISE EXCEPTION 'T6 FALHOU: RPC nao reabriu C3 (reopened=%, status=%)', v_reopened, v_status;
  END IF;
  SELECT performed_by INTO v_profile_in_event FROM public.conversation_events
   WHERE contact_id = '33333333-3333-3333-3333-3333333333c3' AND event_type = 'reopen';
  IF v_profile_in_event IS DISTINCT FROM v_profile_a THEN
    RAISE EXCEPTION 'T6 FALHOU: performed_by do evento nao e o perfil do atendente (%)', v_profile_in_event;
  END IF;

  -- sem permissão (contato de outro) E inexistente: MESMO erro, estado intacto
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_x, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v_state := '';
  BEGIN
    PERFORM 1 FROM public.reopen_conversation('33333333-3333-3333-3333-3333333333c8');
    v_state := 'permitido';
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
  END;
  PERFORM set_config('role', 'none', true);
  IF v_state <> '42501' THEN
    RAISE EXCEPTION 'T6 FALHOU: sem permissao nao foi barrado (sqlstate=%)', v_state;
  END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_x, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v_state := '';
  BEGIN
    PERFORM 1 FROM public.reopen_conversation('00000000-0000-0000-0000-0000000000aa');
    v_state := 'permitido';
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
  END;
  PERFORM set_config('role', 'none', true);
  IF v_state <> '42501' THEN
    RAISE EXCEPTION 'T6 FALHOU: contato inexistente devolveu outro resultado (%) — oracle', v_state;
  END IF;
  SELECT conversation_status INTO v_status FROM public.contacts WHERE id = '33333333-3333-3333-3333-3333333333c8';
  IF v_status <> 'resolved' THEN
    RAISE EXCEPTION 'T6 FALHOU: contato barrado mudou de estado (%)', v_status;
  END IF;

  -- service_role em contato inexistente: contact_not_found (P0002), não 42501
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  PERFORM set_config('role', 'service_role', true);
  v_state := '';
  BEGIN
    PERFORM 1 FROM public.reopen_conversation('00000000-0000-0000-0000-0000000000aa');
    v_state := 'permitido';
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
  END;
  PERFORM set_config('role', 'none', true);
  IF v_state <> 'P0002' THEN
    RAISE EXCEPTION 'T6 FALHOU: service_role em inexistente devolveu %', v_state;
  END IF;
  v_ok := v_ok + 1;

  -- ---------------------------------------------------------------- T7 (atomicidade)
  CREATE OR REPLACE FUNCTION pg_temp.reabre_falha_evento()
  RETURNS trigger LANGUAGE plpgsql AS $f$
  BEGIN
    RAISE EXCEPTION 'falha forcada no insert do evento (T7)';
  END;
  $f$;
  CREATE TRIGGER trg_reabre_falha_evento
    BEFORE INSERT ON public.conversation_events
    FOR EACH ROW EXECUTE FUNCTION pg_temp.reabre_falha_evento();

  PERFORM set_config('role', 'service_role', true);
  BEGIN
    INSERT INTO public.messages (id, contact_id, sender, content, message_type)
      VALUES (v_msg_atom, '33333333-3333-3333-3333-3333333333c9', 'contact', 'msg com evento quebrado', 'text');
    RAISE EXCEPTION 'T7 FALHOU: a mensagem passou mesmo com o evento quebrado';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%passou mesmo com o evento quebrado%' THEN RAISE; END IF;
  END;
  PERFORM set_config('role', 'none', true);

  SELECT count(*) INTO v_count FROM public.messages WHERE id = v_msg_atom;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T7 FALHOU: mensagem persistiu apesar do evento quebrado';
  END IF;
  SELECT conversation_status INTO v_status FROM public.contacts WHERE id = '33333333-3333-3333-3333-3333333333c9';
  IF v_status <> 'resolved' THEN
    RAISE EXCEPTION 'T7 FALHOU: ATOMICIDADE VIOLADA — estado mudou sem o evento (%)', v_status;
  END IF;
  DROP TRIGGER trg_reabre_falha_evento ON public.conversation_events;
  v_ok := v_ok + 1;

  -- ---------------------------------------------------------------- T8 (ACL)
  IF has_function_privilege('anon', 'public.reopen_conversation(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'T8 FALHOU: anon com EXECUTE em reopen_conversation';
  END IF;
  IF has_function_privilege('authenticated', 'public.reopen_conversation(uuid)', 'EXECUTE') = false
     OR has_function_privilege('service_role', 'public.reopen_conversation(uuid)', 'EXECUTE') = false THEN
    RAISE EXCEPTION 'T8 FALHOU: authenticated/service_role sem EXECUTE em reopen_conversation';
  END IF;
  IF has_function_privilege('authenticated', 'public.reopen_conversation_core(uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.reopen_conversation_core(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'T8 FALHOU: nucleo interno executavel pelo cliente';
  END IF;
  IF has_function_privilege('authenticated', 'public.handle_inbound_message_reopen()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.handle_inbound_message_reopen()', 'EXECUTE') THEN
    RAISE EXCEPTION 'T8 FALHOU: funcao do gatilho executavel pelo cliente';
  END IF;
  IF exists (
       SELECT 1 FROM pg_proc p, aclexplode(p.proacl) g
        WHERE p.oid = 'public.reopen_conversation(uuid)'::regprocedure AND g.grantee = 0
     ) THEN
    RAISE EXCEPTION 'T8 FALHOU: EXECUTE aberto para PUBLIC';
  END IF;

  PERFORM set_config('role', 'anon', true);
  v_state := '';
  BEGIN
    PERFORM 1 FROM public.reopen_conversation('33333333-3333-3333-3333-3333333333c1');
    v_state := 'permitido';
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
  END;
  PERFORM set_config('role', 'none', true);
  IF v_state = 'permitido' THEN
    RAISE EXCEPTION 'T8 FALHOU: anon chamou reopen_conversation';
  END IF;
  v_ok := v_ok + 1;

  -- ---------------------------------------------------------------- T9 (entrada inválida)
  v_state := '';
  BEGIN
    PERFORM 1 FROM public.reopen_conversation_core(NULL, NULL);
    v_state := 'permitido';
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
  END;
  IF v_state <> '22023' THEN
    RAISE EXCEPTION 'T9 FALHOU: contact_id NULL no nucleo devolveu %', v_state;
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_a, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v_state := '';
  BEGIN
    PERFORM 1 FROM public.reopen_conversation(NULL);
    v_state := 'permitido';
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
  END;
  PERFORM set_config('role', 'none', true);
  IF v_state <> '22023' THEN
    RAISE EXCEPTION 'T9 FALHOU: contact_id NULL na RPC devolveu %', v_state;
  END IF;
  v_ok := v_ok + 1;

  RAISE NOTICE 'reabre_conversa_nova_mensagem: suite OK (T1 resolved->open, T2 archived->waiting, T3 no-op idempotente, T4 agente/deletada, T5 soft-deleted, T6 RPC/papeis/sem oracle, T7 atomicidade, T8 ACL, T9 entrada invalida) — % grupo(s) verificado(s)', v_ok;
END $reabre$;

ROLLBACK;
