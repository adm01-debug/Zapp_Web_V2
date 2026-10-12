-- supabase/tests/gamification_revoke_client_rpcs.sql
-- Cartao: revogar EXECUTE das RPCs de gamificacao nao usadas pelo cliente.
--
-- DEFEITO (antes): a migration 20260930113613 concede EXECUTE em
--   add_agent_xp, grant_agent_achievement, increment_agent_messages e
--   update_agent_streak ao papel authenticated. Qualquer agente logado podia
--   inflar as proprias estatisticas por chamada direta a /rest/v1/rpc/* sem
--   passar por nenhum fluxo de negocio.
--
-- CORRECAO (depois): 20261012233536_gamification_revoke_client_rpcs.sql revoga
--   EXECUTE de PUBLIC, anon e authenticated e mantem somente service_role.
--
-- PROVA:
--   T1: ACL por funcao (has_function_privilege + aclexplode para PUBLIC):
--       anon=false, authenticated=false, PUBLIC=false, service_role=true.
--   T2: chamada direta como authenticated devolve 42501
--       ('permission denied for function') -- a barreira e a ACL, nao a guarda.
--   T3: um evento real (mensagem enviada pelo agente) continua pontuando
--       streak e conquista de marco/XP pela rotina interna SECURITY DEFINER,
--       sem depender do RPC publico revogado.
--
-- Roda como postgres em um banco descartavel (transacao revertida no fim; sem
-- side effect). Uso:
--   zapp-db-local psql . <copia> < supabase/tests/gamification_revoke_client_rpcs.sql

\set ON_ERROR_STOP on

BEGIN;

-- ============================ fixture ============================
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users (id) VALUES ('a1000000-0000-0000-0000-000000000001')
  ON CONFLICT (id) DO NOTHING;
SET LOCAL session_replication_role = origin;

INSERT INTO public.profiles (id, user_id, name)
  VALUES ('a0000000-0000-0000-0000-000000000001',
          'a1000000-0000-0000-0000-000000000001', 'Teste Revoce Cliente');
INSERT INTO public.contacts (id, name, phone, conversation_status, assigned_to)
  VALUES ('c0000000-0000-0000-0000-000000000001', 'Contato Teste',
          '5511900000000', 'open', 'a0000000-0000-0000-0000-000000000001');
-- 9 mensagens enviadas: a proxima cai no marco de 10 (streak + conquista + XP).
-- ON CONFLICT: um gatilho de criacao de perfil pode ja ter inserido a linha.
INSERT INTO public.agent_stats (profile_id, messages_sent, messages_received,
                                current_streak, best_streak, xp, level, achievements_count)
  VALUES ('a0000000-0000-0000-0000-000000000001', 9, 0, 0, 0, 0, 1, 0)
  ON CONFLICT (profile_id) DO UPDATE
    SET messages_sent = 9, messages_received = 0, current_streak = 0,
        best_streak = 0, xp = 0, level = 1, achievements_count = 0;

-- ==================== T1: ACL das 4 funcoes ====================
DO $$
DECLARE
  v_fn  text;
  v_fns text[] := ARRAY[
    'public.add_agent_xp(uuid,integer)',
    'public.grant_agent_achievement(uuid,text,text,text,integer)',
    'public.increment_agent_messages(uuid,text)',
    'public.update_agent_streak(uuid,boolean)'
  ];
  v_pub boolean;
BEGIN
  FOREACH v_fn IN ARRAY v_fns LOOP
    IF has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'T1 FALHOU: authenticated ainda tem EXECUTE em %', v_fn;
    END IF;
    IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'T1 FALHOU: anon ainda tem EXECUTE em %', v_fn;
    END IF;
    IF NOT has_function_privilege('service_role', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'T1 FALHOU: service_role perdeu EXECUTE em %', v_fn;
    END IF;
    SELECT EXISTS (
      SELECT 1 FROM aclexplode((SELECT proacl FROM pg_proc WHERE oid = v_fn::regprocedure)) a
      WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
    ) INTO v_pub;
    IF v_pub THEN
      RAISE EXCEPTION 'T1 FALHOU: PUBLIC ainda tem EXECUTE em %', v_fn;
    END IF;
    RAISE NOTICE 'T1 OK: % -> anon=false authenticated=false PUBLIC=false service_role=true', v_fn;
  END LOOP;
END $$;

-- ============ T3: gatilho continua pontuando (postgres) ============
DO $$
DECLARE
  v_uuid   uuid := 'a0000000-0000-0000-0000-000000000001';
  v_cont   uuid := 'c0000000-0000-0000-0000-000000000001';
  v_sent   bigint;
  v_streak int;
  v_best   int;
  v_xp     bigint;
  v_ach    int;
  v_cnt    int;
BEGIN
  INSERT INTO public.messages (contact_id, sender, content, message_type, agent_id, status)
    VALUES (v_cont, 'agent', 'teste marco 10', 'text', v_uuid, 'sending');

  SELECT messages_sent, current_streak, best_streak, xp, achievements_count
    INTO v_sent, v_streak, v_best, v_xp, v_ach
    FROM public.agent_stats WHERE profile_id = v_uuid;
  SELECT count(*) INTO v_cnt
    FROM public.agent_achievements
    WHERE profile_id = v_uuid AND achievement_type = 'message_milestone'
      AND achievement_name = '10 Mensagens';

  IF v_sent <> 10 THEN RAISE EXCEPTION 'T3 FALHOU: messages_sent=% (esperado 10)', v_sent; END IF;
  IF v_streak <> 1 THEN RAISE EXCEPTION 'T3 FALHOU: current_streak=% (esperado 1)', v_streak; END IF;
  IF v_best <> 1 THEN RAISE EXCEPTION 'T3 FALHOU: best_streak=% (esperado 1)', v_best; END IF;
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'T3 FALHOU: conquista message_milestone ausente'; END IF;
  IF v_xp <> 1 THEN RAISE EXCEPTION 'T3 FALHOU: xp=% (esperado 1)', v_xp; END IF;
  IF v_ach <> 1 THEN RAISE EXCEPTION 'T3 FALHOU: achievements_count=% (esperado 1)', v_ach; END IF;
  RAISE NOTICE 'T3 OK: sent=10 streak=1 best=1 conquista=1 xp=1 achievements=1';
END $$;

-- ===== T2: chamada direta como authenticated deve dar 42501 =====
DO $$
DECLARE
  v_uuid  uuid := 'a0000000-0000-0000-0000-000000000001';
  v_state text;
  v_msg   text;
BEGIN
  SET LOCAL ROLE authenticated;

  BEGIN
    PERFORM public.add_agent_xp(v_uuid, 9999);
    RAISE EXCEPTION 'T2 FALHOU: add_agent_xp executou como authenticated';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    IF v_state <> '42501' OR v_msg NOT LIKE '%permission denied for function%' THEN
      RAISE EXCEPTION 'T2 FALHOU add_agent_xp: esperado 42501/permission denied, veio % (%)', v_state, v_msg;
    END IF;
    RAISE NOTICE 'T2 OK add_agent_xp: % - %', v_state, v_msg;
  END;

  BEGIN
    PERFORM public.grant_agent_achievement(v_uuid, 'message_milestone', 'x', 'y', 5);
    RAISE EXCEPTION 'T2 FALHOU: grant_agent_achievement executou como authenticated';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    IF v_state <> '42501' OR v_msg NOT LIKE '%permission denied for function%' THEN
      RAISE EXCEPTION 'T2 FALHOU grant_agent_achievement: esperado 42501/permission denied, veio % (%)', v_state, v_msg;
    END IF;
    RAISE NOTICE 'T2 OK grant_agent_achievement: % - %', v_state, v_msg;
  END;

  BEGIN
    PERFORM public.increment_agent_messages(v_uuid, 'sent');
    RAISE EXCEPTION 'T2 FALHOU: increment_agent_messages executou como authenticated';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    IF v_state <> '42501' OR v_msg NOT LIKE '%permission denied for function%' THEN
      RAISE EXCEPTION 'T2 FALHOU increment_agent_messages: esperado 42501/permission denied, veio % (%)', v_state, v_msg;
    END IF;
    RAISE NOTICE 'T2 OK increment_agent_messages: % - %', v_state, v_msg;
  END;

  BEGIN
    PERFORM public.update_agent_streak(v_uuid, true);
    RAISE EXCEPTION 'T2 FALHOU: update_agent_streak executou como authenticated';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    IF v_state <> '42501' OR v_msg NOT LIKE '%permission denied for function%' THEN
      RAISE EXCEPTION 'T2 FALHOU update_agent_streak: esperado 42501/permission denied, veio % (%)', v_state, v_msg;
    END IF;
    RAISE NOTICE 'T2 OK update_agent_streak: % - %', v_state, v_msg;
  END;
END $$;

ROLLBACK;

\echo 'GAMIFICATION REVOKE CLIENT RPCS: OK'
