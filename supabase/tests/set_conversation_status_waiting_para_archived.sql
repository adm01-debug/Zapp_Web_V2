-- Teste SQL de public.set_conversation_status — transicao waiting -> archived (ADR-005).
--
-- O que prova (o contrato que o front consome; aberto pelo cartao t_79ca0cf1):
--   T0  o GATILHO de banco public.enforce_conversation_status_transition ACEITA
--       waiting -> archived (a divergencia que originou o cartao);
--   T1  a RPC passa a PERMITIR waiting -> archived e grava
--       conversation_status_changed_at (o defeito: recusava com 'invalid transition');
--   T2  a autorizacao continua ANTES de qualquer efeito: chamador sem permissao
--       recebe 42501 'contact_not_authorized' e o estado fica INTACTO;
--   T3  o no-op idempotente (estado ja igual) sai silencioso SEM reescrever
--       conversation_status_changed_at (nenhum efeito colateral);
--   T4  archived -> open continua permitido;
--   T5  archived -> waiting e archived -> resolved CONTINUAM recusados;
--   T6  waiting -> resolved segue gravando conversation_closures, e a negacao por
--       falta de permissao nao deixa fechamento nenhum (autorizacao antes do efeito);
--   T7  contrato de ACL/assinatura preservado: unica sobrecarga (uuid,text,text),
--       anon sem EXECUTE, authenticated/service_role/postgres com EXECUTE.
--
-- COMO RODAR (banco LOCAL da tarefa, nunca producao):
--   zapp-db-local psql . <conjunto> -v ON_ERROR_STOP=1 < supabase/tests/set_conversation_status_waiting_para_archived.sql
--
-- Enforcamento exercido como PAPEL REAL: claims sinteticos em request.jwt.claims
-- (sub + role='authenticated') e set_config('role','authenticated') — o caminho do
-- PostgREST. O role 'authenticated' no claim impede o bypass de
-- is_privileged_contact_caller() (que so olha session_user quando nao ha claim).
-- Cria dados SINTETICOS e desfaz tudo no ROLLBACK final: nao sobra linha no banco.
-- Sem EXCEPTION nao tratada = suite verde.
BEGIN;

DO $set_status_waiting_archived$
DECLARE
  v_user_a       uuid := '11111111-1111-1111-1111-1111111111a1';
  v_user_b       uuid := '11111111-1111-1111-1111-1111111111b2';
  v_profile_a    uuid;
  v_profile_b    uuid;
  -- contatos sinteticos (faixa '5' para leitura facil)
  v_c_wait       uuid := '55555555-5555-5555-5555-5555555555d1'; -- waiting, de A (T1)
  v_c_wait2      uuid := '55555555-5555-5555-5555-5555555555d2'; -- waiting, de A (T2/T6b)
  v_c_open       uuid := '55555555-5555-5555-5555-5555555555d3'; -- open, de A (T6)
  v_c_arch       uuid := '55555555-5555-5555-5555-5555555555d4'; -- archived, de A (T3/T4)
  v_c_arch2      uuid := '55555555-5555-5555-5555-5555555555d5'; -- archived, de A (T5)
  v_c_trig       uuid := '55555555-5555-5555-5555-5555555555d6'; -- waiting, de A (T0)
  v_nonexist     uuid := '55555555-5555-5555-5555-5555555555d9';
  v_old_ts       timestamptz := '2026-10-01T00:00:00Z';
  v_ts_before    timestamptz;
  v_ts_after     timestamptz;
  v_upd_ant      timestamptz; -- updated_at do alvo, antes
  v_upd_dep      timestamptz; -- updated_at do alvo, depois
  v_upd_viz_ant  timestamptz; -- updated_at de um vizinho NAO tocado, antes
  v_upd_viz_dep  timestamptz; -- updated_at de um vizinho NAO tocado, depois
  v_status       text;
  v_closures     bigint;
  v_errcode      text;
  v_errmsg       text;
  v_ok           int := 0;
BEGIN
  -- ---------------------------------------------------------------- dados (postgres)
  INSERT INTO auth.users (id, email) VALUES
    (v_user_a, 'set-status-archived-a@local.test'),
    (v_user_b, 'set-status-archived-b@local.test');

  INSERT INTO public.profiles (user_id, name) VALUES
    (v_user_a, 'Agente A (sintetico)'),
    (v_user_b, 'Agente B (sintetico)')
  ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name;

  SELECT id INTO v_profile_a FROM public.profiles WHERE user_id = v_user_a;
  SELECT id INTO v_profile_b FROM public.profiles WHERE user_id = v_user_b;
  IF v_profile_a IS NULL OR v_profile_b IS NULL THEN
    RAISE EXCEPTION 'fixture invalida: perfil sintetico nao encontrado (% / %)', v_profile_a, v_profile_b;
  END IF;

  INSERT INTO public.contacts
    (id, name, phone, assigned_to, conversation_status,
     conversation_status_changed_at, updated_at)
  VALUES
    (v_c_wait,  'Contato A waiting',  '551190000001', v_profile_a, 'waiting',  v_old_ts, v_old_ts),
    (v_c_wait2, 'Contato A waiting2', '551190000002', v_profile_a, 'waiting',  v_old_ts, v_old_ts),
    (v_c_open,  'Contato A open',     '551190000003', v_profile_a, 'open',     v_old_ts, v_old_ts),
    (v_c_arch,  'Contato A archived', '551190000004', v_profile_a, 'archived', v_old_ts, v_old_ts),
    (v_c_arch2, 'Contato A archived2','551190000005', v_profile_a, 'archived', v_old_ts, v_old_ts),
    (v_c_trig,  'Contato A gatilho',  '551190000006', v_profile_a, 'waiting',  v_old_ts, v_old_ts);

  -- ---------------------------------------------------------------- T0 (gatilho aceita)
  -- UPDATE direto (sem a RPC): o gatilho FSM tem de aceitar waiting -> archived.
  UPDATE public.contacts SET conversation_status = 'archived' WHERE id = v_c_trig;
  SELECT conversation_status INTO v_status FROM public.contacts WHERE id = v_c_trig;
  IF v_status <> 'archived' THEN
    RAISE EXCEPTION 'T0 FALHOU: gatilho FSM nao aceitou waiting -> archived (estado=%)', v_status;
  END IF;
  v_ok := v_ok + 1;

  -- baseline: c_wait (alvo) e c_wait2 (vizinho NAO tocado) nasceram com updated_at no
  -- passado. Numa transacao NOW() e o inicio dela, entao provamos o avanco contra esse
  -- valor do passado; se a RPC tocasse o vizinho, o updated_at dele tambem avancaria.
  v_upd_ant     := v_old_ts;
  v_upd_viz_ant := v_old_ts;

  -- ---------------------------------------------------------------- T1 (waiting -> archived)
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user_a, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v_errcode := NULL;
  BEGIN
    PERFORM public.set_conversation_status(v_c_wait, 'archived');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE, v_errmsg = MESSAGE_TEXT;
  END;
  PERFORM set_config('role', 'none', true);

  IF v_errcode IS NOT NULL THEN
    RAISE EXCEPTION 'T1 FALHOU: waiting -> archived deveria ser permitido, mas deu erro [%] %',
      v_errcode, v_errmsg;
  END IF;
  SELECT conversation_status, conversation_status_changed_at
    INTO v_status, v_ts_before
    FROM public.contacts WHERE id = v_c_wait;
  IF v_status <> 'archived' THEN
    RAISE EXCEPTION 'T1 FALHOU: esperava archived e o contato ficou %', v_status;
  END IF;
  IF v_ts_before IS NULL OR v_ts_before <= v_old_ts THEN
    RAISE EXCEPTION 'T1 FALHOU: conversation_status_changed_at nao avancou (antes=%, depois=%)',
      v_old_ts, v_ts_before;
  END IF;
  -- updated_at (gatilho BEFORE UPDATE de contacts): so a linha alvo muda; o vizinho
  -- intocado fica com o mesmo carimbo — prova de que nao ha reescrita em massa.
  SELECT updated_at INTO v_upd_dep FROM public.contacts WHERE id = v_c_wait;
  SELECT updated_at INTO v_upd_viz_dep FROM public.contacts WHERE id = v_c_wait2;
  IF v_upd_dep <= v_upd_ant THEN
    RAISE EXCEPTION 'T1 FALHOU: updated_at do alvo nao avancou (antes=%, depois=%)',
      v_upd_ant, v_upd_dep;
  END IF;
  IF v_upd_viz_dep IS DISTINCT FROM v_upd_viz_ant THEN
    RAISE EXCEPTION 'T1 FALHOU: updated_at de contato NAO tocado mudou (antes=%, depois=%)',
      v_upd_viz_ant, v_upd_viz_dep;
  END IF;
  v_ok := v_ok + 1;

  -- ---------------------------------------------------------------- T2 (sem permissao, sem efeito)
  -- B nao e dono do contato de A e nao e admin -> 42501 e estado intacto.
  SELECT conversation_status_changed_at INTO v_ts_before
    FROM public.contacts WHERE id = v_c_wait2;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user_b, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v_errcode := NULL; v_errmsg := NULL;
  BEGIN
    PERFORM public.set_conversation_status(v_c_wait2, 'archived');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE, v_errmsg = MESSAGE_TEXT;
  END;
  PERFORM set_config('role', 'none', true);

  IF v_errcode <> '42501' OR v_errmsg <> 'contact_not_authorized' THEN
    RAISE EXCEPTION 'T2 FALHOU: esperava 42501 contact_not_authorized e veio [%] %',
      coalesce(v_errcode, 'sem erro'), coalesce(v_errmsg, '-');
  END IF;
  SELECT conversation_status, conversation_status_changed_at
    INTO v_status, v_ts_after FROM public.contacts WHERE id = v_c_wait2;
  IF v_status <> 'waiting' THEN
    RAISE EXCEPTION 'T2 FALHOU: estado mudou apesar da negacao (agora=%)', v_status;
  END IF;
  IF v_ts_after IS DISTINCT FROM v_ts_before THEN
    RAISE EXCEPTION 'T2 FALHOU: changed_at mudou apesar da negacao (antes=%, depois=%)',
      v_ts_before, v_ts_after;
  END IF;
  v_ok := v_ok + 1;

  -- ---------------------------------------------------------------- T3 (no-op nao reescreve)
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user_a, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v_errcode := NULL;
  BEGIN
    PERFORM public.set_conversation_status(v_c_arch, 'archived');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE, v_errmsg = MESSAGE_TEXT;
  END;
  PERFORM set_config('role', 'none', true);
  IF v_errcode IS NOT NULL THEN
    RAISE EXCEPTION 'T3 FALHOU: no-op deveria sair silencioso, deu erro [%] %', v_errcode, v_errmsg;
  END IF;
  v_ok := v_ok + 1;

  -- ---------------------------------------------------------------- T4 (archived -> open)
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user_a, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v_errcode := NULL;
  BEGIN
    PERFORM public.set_conversation_status(v_c_arch, 'open');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE, v_errmsg = MESSAGE_TEXT;
  END;
  PERFORM set_config('role', 'none', true);
  SELECT conversation_status INTO v_status FROM public.contacts WHERE id = v_c_arch;
  IF v_errcode IS NOT NULL OR v_status <> 'open' THEN
    RAISE EXCEPTION 'T4 FALHOU: archived -> open deveria continuar permitido (erro=[%] %, estado=%)',
      coalesce(v_errcode,'-'), coalesce(v_errmsg,'-'), v_status;
  END IF;
  v_ok := v_ok + 1;

  -- ---------------------------------------------------------------- T5 (recusas seguem)
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user_a, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v_errcode := NULL;
  BEGIN
    PERFORM public.set_conversation_status(v_c_arch2, 'waiting');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE, v_errmsg = MESSAGE_TEXT;
  END;
  IF v_errcode IS NULL OR v_errmsg NOT LIKE 'invalid transition%' THEN
    RAISE EXCEPTION 'T5 FALHOU: archived -> waiting deveria ser recusado (erro=[%] %)',
      coalesce(v_errcode,'sem erro'), coalesce(v_errmsg,'-');
  END IF;
  v_errcode := NULL;
  BEGIN
    PERFORM public.set_conversation_status(v_c_arch2, 'resolved');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE, v_errmsg = MESSAGE_TEXT;
  END;
  PERFORM set_config('role', 'none', true);
  IF v_errcode IS NULL OR v_errmsg NOT LIKE 'invalid transition%' THEN
    RAISE EXCEPTION 'T5 FALHOU: archived -> resolved deveria ser recusado (erro=[%] %)',
      coalesce(v_errcode,'sem erro'), coalesce(v_errmsg,'-');
  END IF;
  SELECT conversation_status INTO v_status FROM public.contacts WHERE id = v_c_arch2;
  IF v_status <> 'archived' THEN
    RAISE EXCEPTION 'T5 FALHOU: estado do contato mudou apesar da recusa (agora=%)', v_status;
  END IF;
  v_ok := v_ok + 1;

  -- ---------------------------------------------------------------- T6 (resolver grava fechamento)
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user_a, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v_errcode := NULL;
  BEGIN
    PERFORM public.set_conversation_status(v_c_open, 'resolved', 'resolvido no teste');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE, v_errmsg = MESSAGE_TEXT;
  END;
  PERFORM set_config('role', 'none', true);
  SELECT conversation_status INTO v_status FROM public.contacts WHERE id = v_c_open;
  SELECT count(*) INTO v_closures FROM public.conversation_closures WHERE contact_id = v_c_open;
  IF v_errcode IS NOT NULL OR v_status <> 'resolved' OR v_closures <> 1 THEN
    RAISE EXCEPTION 'T6 FALHOU: waiting/open -> resolved deveria gravar fechamento (erro=[%] %, estado=%, closures=%)',
      coalesce(v_errcode,'-'), coalesce(v_errmsg,'-'), v_status, v_closures;
  END IF;
  v_ok := v_ok + 1;

  -- ---------------------------------------------------------------- T6b (negacao nao deixa fechamento)
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user_b, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v_errcode := NULL;
  BEGIN
    PERFORM public.set_conversation_status(v_c_wait2, 'resolved');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE, v_errmsg = MESSAGE_TEXT;
  END;
  PERFORM set_config('role', 'none', true);
  SELECT count(*) INTO v_closures FROM public.conversation_closures WHERE contact_id = v_c_wait2;
  IF v_errcode <> '42501' OR v_closures <> 0 THEN
    RAISE EXCEPTION 'T6b FALHOU: negacao deveria ser 42501 sem fechamento (erro=[%] %, closures=%)',
      coalesce(v_errcode,'sem erro'), coalesce(v_errmsg,'-'), v_closures;
  END IF;
  v_ok := v_ok + 1;

  -- ---------------------------------------------------------------- T7 (ACL e assinatura)
  IF to_regprocedure('public.set_conversation_status(uuid,text,text)') IS NULL THEN
    RAISE EXCEPTION 'T7 FALHOU: assinatura (uuid,text,text) sumiu';
  END IF;
  IF (SELECT count(*) FROM pg_proc WHERE proname = 'set_conversation_status') <> 1 THEN
    RAISE EXCEPTION 'T7 FALHOU: sobrecarga inesperada de set_conversation_status';
  END IF;
  IF has_function_privilege('anon', 'public.set_conversation_status(uuid,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'T7 FALHOU: anon com EXECUTE na RPC';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.set_conversation_status(uuid,text,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.set_conversation_status(uuid,text,text)', 'EXECUTE')
     OR NOT has_function_privilege('postgres', 'public.set_conversation_status(uuid,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'T7 FALHOU: papel legitimo sem EXECUTE na RPC';
  END IF;
  -- anon barrado de fato na chamada
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user_a, 'role', 'anon')::text, true);
  PERFORM set_config('role', 'anon', true);
  v_errcode := NULL;
  BEGIN
    PERFORM public.set_conversation_status(v_c_wait, 'open');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE, v_errmsg = MESSAGE_TEXT;
  END;
  PERFORM set_config('role', 'none', true);
  IF v_errcode IS DISTINCT FROM '42501' THEN
    RAISE EXCEPTION 'T7 FALHOU: anon deveria ser barrado por permissao (erro=[%] %)',
      coalesce(v_errcode,'sem erro'), coalesce(v_errmsg,'-');
  END IF;
  v_ok := v_ok + 1;

  RAISE NOTICE 'set_conversation_status_waiting_para_archived: suite OK (T0 gatilho, T1 waiting->archived, T2 permissao sem efeito, T3 no-op, T4 archived->open, T5 recusas, T6 fechamento, T6b negacao sem fechamento, T7 ACL) — % grupo(s)', v_ok;
END $set_status_waiting_archived$;

ROLLBACK;
