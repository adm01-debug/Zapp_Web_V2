-- supabase/tests/xp_ledger_eventos_reais.sql
-- Cartao t_c09e53ad (workersql) — livro de XP imutavel e XP por evento real
-- concedido no servidor.
--
-- DEFEITO (antes): nao existia registro POR QUE um ponto foi dado (so o total em
--   agent_stats.xp) e nada impedia o MESMO evento (retry de status, reabertura)
--   de pontuar duas vezes. Nao havia tabela xp_ledger nem rotina interna
--   public.grant_xp_internal — este arquivo falha por relacao/funcao inexistente.
--
-- CORRECAO (depois): migration 20261015194340_xp_ledger_eventos_reais.sql
--   1) public.xp_ledger imutavel: indice unico (reason, ref_id) = idempotencia
--      por EVENTO de origem; RLS de leitura (agente ve o proprio, admin/
--      supervisor ve tudo); sem DML pelo cliente (ACL + gatilho de imutabilidade).
--   2) public.grant_xp_internal(profile_id, amount, reason, ref_id): rotina
--      interna SECURITY DEFINER, EXECUTE fechado ao cliente, que grava no ledger
--      e soma em agent_stats.xp na rotina atomica (FOR UPDATE, calculate_level,
--      cap de 500/chamada).
--   3) Os gatilhos EXISTENTES concedem: +20 por conversa encerrada
--      (conversation_closed, ref_id = closure) e +10 na primeira resposta dentro
--      do SLA (first_response_in_sla, ref_id = conversation_sla.id), lida de
--      conversation_sla.first_response_breached.
--
-- PROVA (T1..T8):
--   T1 ACL de grant_xp_internal: anon/authenticated/service_role = false, PUBLIC = false.
--   T2 chamada direta como authenticated devolve 42501 (a barreira e a ACL).
--   T3 ACL de xp_ledger: authenticated so SELECT, anon nada.
--   T4 evento real de encerramento -> +20 XP e 1 lancamento; o MESMO evento de
--      origem repetido NAO duplica XP nem lancamento (idempotencia).
--   T5 primeira resposta DENTRO do SLA -> +10 XP; FORA do SLA -> nada.
--   T6 RLS como PAPEL REAL (authenticated + JWT sintetico em request.jwt.claims):
--      agente ve so o proprio lancamento, admin ve tudo, outro agente ve so o seu.
--   T7 livro imutavel: UPDATE e DELETE recusados (P0001) para todo mundo.
--   T8 falha forcada na rotina de XP: o encerramento ENTRA mesmo assim e o XP nao e somado.
--
-- Roda como postgres num banco descartavel, numa transacao revertida no fim:
-- idempotente, sem efeito colateral. Uso:
--   zapp-db-local psql . <copia> < supabase/tests/xp_ledger_eventos_reais.sql

\set ON_ERROR_STOP on

BEGIN;

-- ============================ fixture ============================
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users (id) VALUES
  ('b1000000-0000-0000-0000-000000000001'),
  ('b1000000-0000-0000-0000-000000000002'),
  ('b1000000-0000-0000-0000-000000000003')
  ON CONFLICT (id) DO NOTHING;
SET LOCAL session_replication_role = origin;

INSERT INTO public.profiles (id, user_id, name) VALUES
  ('b0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'Agente A'),
  ('b0000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000002', 'Agente B'),
  ('b0000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000003', 'Admin C');

INSERT INTO public.user_roles (user_id, role)
  VALUES ('b1000000-0000-0000-0000-000000000003', 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.contacts (id, name, phone, conversation_status, assigned_to) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'Contato 1', '5511900000001', 'open',
   'b0000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000002', 'Contato 2', '5511900000002', 'open',
   'b0000000-0000-0000-0000-000000000002');

INSERT INTO public.agent_stats (profile_id, messages_sent, messages_received,
                                current_streak, best_streak, xp, level, achievements_count)
  VALUES ('b0000000-0000-0000-0000-000000000001', 0, 0, 0, 0, 0, 1, 0),
         ('b0000000-0000-0000-0000-000000000002', 0, 0, 0, 0, 0, 1, 0)
  ON CONFLICT (profile_id) DO UPDATE
    SET messages_sent = 0, messages_received = 0, current_streak = 0,
        best_streak = 0, xp = 0, level = 1, achievements_count = 0;

-- =================== T1/T2: rotina interna fechada ===================
DO $$
DECLARE
  v_fn    text := 'public.grant_xp_internal(uuid,integer,text,uuid)';
  v_pub   boolean;
  v_state text;
  v_msg   text;
BEGIN
  IF has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'T1 FALHOU: authenticated tem EXECUTE em %', v_fn;
  END IF;
  IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'T1 FALHOU: anon tem EXECUTE em %', v_fn;
  END IF;
  IF has_function_privilege('service_role', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'T1 FALHOU: service_role tem EXECUTE em %', v_fn;
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM aclexplode((SELECT proacl FROM pg_proc WHERE oid = v_fn::regprocedure)) a
    WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
  ) INTO v_pub;
  IF v_pub THEN
    RAISE EXCEPTION 'T1 FALHOU: PUBLIC tem EXECUTE em %', v_fn;
  END IF;
  RAISE NOTICE 'T1 OK: grant_xp_internal -> anon=false authenticated=false service_role=false PUBLIC=false';

  -- T2: a barreira e a ACL, nao a guarda de negocio
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.grant_xp_internal('b0000000-0000-0000-0000-000000000001'::uuid, 10,
                                     'first_response_in_sla', gen_random_uuid());
    RAISE EXCEPTION 'T2 FALHOU: grant_xp_internal executou como authenticated';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    IF v_state <> '42501' OR v_msg NOT LIKE '%permission denied for function%' THEN
      RAISE EXCEPTION 'T2 FALHOU: esperado 42501/permission denied, veio % (%)', v_state, v_msg;
    END IF;
    RAISE NOTICE 'T2 OK: authenticated -> % - %', v_state, v_msg;
  END;
  RESET ROLE;
END $$;

-- ======================= T3: ACL de xp_ledger =======================
DO $$
BEGIN
  IF NOT has_table_privilege('authenticated', 'public.xp_ledger', 'SELECT') THEN
    RAISE EXCEPTION 'T3 FALHOU: authenticated sem SELECT em xp_ledger';
  END IF;
  IF has_table_privilege('authenticated', 'public.xp_ledger', 'INSERT')
     OR has_table_privilege('authenticated', 'public.xp_ledger', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.xp_ledger', 'DELETE') THEN
    RAISE EXCEPTION 'T3 FALHOU: authenticated tem DML em xp_ledger';
  END IF;
  IF has_table_privilege('anon', 'public.xp_ledger', 'SELECT') THEN
    RAISE EXCEPTION 'T3 FALHOU: anon le xp_ledger';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.xp_ledger'::regclass) THEN
    RAISE EXCEPTION 'T3 FALHOU: xp_ledger sem RLS ligada';
  END IF;
  RAISE NOTICE 'T3 OK: xp_ledger -> authenticated so SELECT, anon nada, RLS ligada';
END $$;

-- ============ T4: +20 na conversa encerrada, sem duplicar ============
DO $$
DECLARE
  v_a        uuid := 'b0000000-0000-0000-0000-000000000001';
  v_c1       uuid := 'c0000000-0000-0000-0000-000000000001';
  v_closure  uuid;
  v_xp       bigint;
  v_xp_antes bigint;
  v_ledger   bigint;
  v_ach      bigint;
  v_amt      integer;
  v_cnt      int;
BEGIN
  INSERT INTO public.conversation_closures (contact_id, closed_by, close_reason)
    VALUES (v_c1, v_a, 'teste xp ledger')
    RETURNING id INTO v_closure;

  -- O evento real rodou: o ledger tem o lancamento e o XP bate com o ledger +
  -- premios de conquista (o marco de resolucao v_resolved=1 concede
  -- LEAST(100,1)=1 de recompensa, contabilizada em agent_achievements.xp_earned).
  SELECT coalesce(sum(amount),0) INTO v_ledger
    FROM public.xp_ledger WHERE profile_id = v_a;
  SELECT coalesce(sum(xp_earned),0) INTO v_ach
    FROM public.agent_achievements WHERE profile_id = v_a;
  SELECT xp INTO v_xp FROM public.agent_stats WHERE profile_id = v_a;
  IF v_ledger <> 20 THEN
    RAISE EXCEPTION 'T4 FALHOU: ledger=% apos encerrar (esperado 20)', v_ledger;
  END IF;
  IF v_xp <> v_ledger + v_ach THEN
    RAISE EXCEPTION 'T4 FALHOU: xp=% != ledger % + conquistas %', v_xp, v_ledger, v_ach;
  END IF;
  v_xp_antes := v_xp;

  SELECT count(*), max(amount) INTO v_cnt, v_amt
    FROM public.xp_ledger
   WHERE profile_id = v_a AND reason = 'conversation_closed' AND ref_id = v_closure;
  IF v_cnt <> 1 OR v_amt <> 20 THEN
    RAISE EXCEPTION 'T4 FALHOU: lancamentos=% amount=% (esperado 1/20)', v_cnt, v_amt;
  END IF;

  -- o MESMO evento de origem roda de novo (closed_by volta a NULL e e reatribuido)
  UPDATE public.conversation_closures SET closed_by = NULL WHERE id = v_closure;
  UPDATE public.conversation_closures SET closed_by = v_a  WHERE id = v_closure;

  SELECT xp INTO v_xp FROM public.agent_stats WHERE profile_id = v_a;
  IF v_xp <> v_xp_antes THEN
    RAISE EXCEPTION 'T4 FALHOU: XP duplicado no mesmo evento (% -> %; esperado %)',
      v_xp_antes, v_xp, v_xp_antes;
  END IF;
  SELECT count(*) INTO v_cnt FROM public.xp_ledger WHERE profile_id = v_a;
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'T4 FALHOU: lancamentos=% apos repetir (esperado 1)', v_cnt;
  END IF;

  RAISE NOTICE 'T4 OK: +20 na closure % (xp=% = ledger 20 + conquista %), repeticao nao duplica (1 lancamento)',
    v_closure, v_xp, v_ach;
END $$;

-- ============ T5: +10 na 1a resposta no SLA; fora do SLA, nada ============
DO $$
DECLARE
  v_a     uuid := 'b0000000-0000-0000-0000-000000000001';
  v_b     uuid := 'b0000000-0000-0000-0000-000000000002';
  v_c1    uuid := 'c0000000-0000-0000-0000-000000000001';
  v_c2    uuid := 'c0000000-0000-0000-0000-000000000002';
  v_sla   uuid;
  v_xp    bigint;
  v_ledger bigint;
  v_ach   bigint;
  v_cnt   int;
  v_breach boolean;
BEGIN
  -- DENTRO do SLA: cliente fala ha 1 min, agente A responde agora (prazo = 5 min)
  INSERT INTO public.messages (contact_id, sender, content, message_type, status, created_at)
    VALUES (v_c1, 'contact', 'oi', 'text', 'received', now() - interval '1 minute');
  INSERT INTO public.messages (contact_id, sender, content, message_type, agent_id, status,
                               created_at, status_updated_at)
    VALUES (v_c1, 'agent', 'ola', 'text', v_a, 'sent', now() - interval '30 seconds', now());

  SELECT id, first_response_breached INTO v_sla, v_breach
    FROM public.conversation_sla WHERE contact_id = v_c1 AND first_response_at IS NOT NULL;
  IF v_sla IS NULL OR v_breach IS DISTINCT FROM FALSE THEN
    RAISE EXCEPTION 'T5 FALHOU: SLA de % nao registrado dentro do prazo (breached=%)', v_c1, v_breach;
  END IF;

  SELECT coalesce(sum(amount),0) INTO v_ledger
    FROM public.xp_ledger WHERE profile_id = v_a;
  SELECT coalesce(sum(xp_earned),0) INTO v_ach
    FROM public.agent_achievements WHERE profile_id = v_a;
  SELECT xp INTO v_xp FROM public.agent_stats WHERE profile_id = v_a;
  IF v_ledger <> 30 THEN
    RAISE EXCEPTION 'T5 FALHOU: ledger=% apos 1a resposta no SLA (esperado 30: 20+10)', v_ledger;
  END IF;
  IF v_xp <> v_ledger + v_ach THEN
    RAISE EXCEPTION 'T5 FALHOU: xp=% != ledger % + conquistas %', v_xp, v_ledger, v_ach;
  END IF;
  SELECT count(*) INTO v_cnt FROM public.xp_ledger
   WHERE profile_id = v_a AND reason = 'first_response_in_sla' AND ref_id = v_sla;
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'T5 FALHOU: lancamentos de 1a resposta=% (esperado 1)', v_cnt;
  END IF;

  -- FORA do SLA: cliente falou ha 10 min, agente B responde agora
  INSERT INTO public.messages (contact_id, sender, content, message_type, status, created_at)
    VALUES (v_c2, 'contact', 'oi', 'text', 'received', now() - interval '10 minutes');
  INSERT INTO public.messages (contact_id, sender, content, message_type, agent_id, status,
                               created_at, status_updated_at)
    VALUES (v_c2, 'agent', 'ola', 'text', v_b, 'sent', now() - interval '5 seconds', now());

  SELECT first_response_breached INTO v_breach
    FROM public.conversation_sla WHERE contact_id = v_c2 AND first_response_at IS NOT NULL;
  IF v_breach IS NOT TRUE THEN
    RAISE EXCEPTION 'T5 FALHOU: SLA de % deveria estar estourado (breached=%)', v_c2, v_breach;
  END IF;

  SELECT xp INTO v_xp FROM public.agent_stats WHERE profile_id = v_b;
  IF v_xp <> 0 THEN
    RAISE EXCEPTION 'T5 FALHOU: xp=% apos resposta FORA do SLA (esperado 0)', v_xp;
  END IF;
  SELECT count(*) INTO v_cnt FROM public.xp_ledger WHERE profile_id = v_b;
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION 'T5 FALHOU: lancamentos=% para resposta fora do SLA (esperado 0)', v_cnt;
  END IF;

  RAISE NOTICE 'T5 OK: dentro do SLA +10 (ledger A=% = 20+10, xp reconciliado com ledger+conquistas, sla=%), fora do SLA +0 (xp B=0)', v_ledger, v_sla;
END $$;

-- ============ T6: RLS de leitura com PAPEL REAL ============
DO $$
DECLARE
  v_a       uuid := 'b0000000-0000-0000-0000-000000000001';
  v_b       uuid := 'b0000000-0000-0000-0000-000000000002';
  v_ua      uuid := 'b1000000-0000-0000-0000-000000000001';  -- auth.users de A
  v_ub      uuid := 'b1000000-0000-0000-0000-000000000002';  -- auth.users de B
  v_adm     uuid := 'b1000000-0000-0000-0000-000000000003';
  v_total   int;
  v_proprio int;
BEGIN
  -- admin cria um lancamento para o agente B (para haver linha de outro agente),
  -- via evento real: encerramento de conversa do contato 2.
  INSERT INTO public.conversation_closures (contact_id, closed_by, close_reason)
    VALUES ('c0000000-0000-0000-0000-000000000002', v_b, 'teste rls');
  SELECT count(*) INTO v_total FROM public.xp_ledger;
  IF v_total <> 3 THEN
    RAISE EXCEPTION 'T6 preparo FALHOU: lancamentos=% (esperado 3)', v_total;
  END IF;

  -- agente A: ve so os 2 proprios
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', v_ua::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*), count(*) FILTER (WHERE profile_id = v_a)
    INTO v_total, v_proprio FROM public.xp_ledger;
  RESET ROLE;
  IF v_total <> 2 OR v_proprio <> 2 THEN
    RAISE EXCEPTION 'T6 FALHOU agente A: viu % linhas (% proprias; esperado 2/2)', v_total, v_proprio;
  END IF;
  RAISE NOTICE 'T6 OK agente A: ve 2 de 3 (so o proprio livro)';

  -- admin: ve tudo
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', v_adm::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_total FROM public.xp_ledger;
  RESET ROLE;
  IF v_total <> 3 THEN
    RAISE EXCEPTION 'T6 FALHOU admin: viu % linhas (esperado 3)', v_total;
  END IF;
  RAISE NOTICE 'T6 OK admin: ve as 3 linhas';

  -- agente B: ve so a sua
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', v_ub::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*), count(*) FILTER (WHERE profile_id = v_b)
    INTO v_total, v_proprio FROM public.xp_ledger;
  RESET ROLE;
  IF v_total <> 1 OR v_proprio <> 1 THEN
    RAISE EXCEPTION 'T6 FALHOU agente B: viu % linhas (% proprias; esperado 1/1)', v_total, v_proprio;
  END IF;
  RAISE NOTICE 'T6 OK agente B: ve 1 de 3';
END $$;

-- ============ T7: livro imutavel (nem o dono edita/apaga) ============
DO $$
DECLARE
  v_id    uuid;
  v_state text;
BEGIN
  SELECT id INTO v_id FROM public.xp_ledger LIMIT 1;

  BEGIN
    UPDATE public.xp_ledger SET amount = 999 WHERE id = v_id;
    RAISE EXCEPTION 'T7 FALHOU: UPDATE em xp_ledger foi aceito';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
    IF v_state <> 'P0001' THEN
      RAISE EXCEPTION 'T7 FALHOU UPDATE: esperado P0001, veio %', v_state;
    END IF;
  END;

  BEGIN
    DELETE FROM public.xp_ledger WHERE id = v_id;
    RAISE EXCEPTION 'T7 FALHOU: DELETE em xp_ledger foi aceito';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
    IF v_state <> 'P0001' THEN
      RAISE EXCEPTION 'T7 FALHOU DELETE: esperado P0001, veio %', v_state;
    END IF;
  END;

  IF (SELECT count(*) FROM public.xp_ledger WHERE id = v_id) <> 1 THEN
    RAISE EXCEPTION 'T7 FALHOU: lancamento sumiu';
  END IF;
  RAISE NOTICE 'T7 OK: UPDATE e DELETE recusados (livro imutavel)';
END $$;

-- ============ T8: falha de gamificacao NAO derruba o encerramento ============
DO $$
DECLARE
  v_a    uuid := 'b0000000-0000-0000-0000-000000000001';
  v_c3   uuid := 'c0000000-0000-0000-0000-000000000003';
  v_pend int;
BEGIN
  INSERT INTO public.contacts (id, name, phone, conversation_status, assigned_to)
    VALUES (v_c3, 'Contato 3', '5511900000003', 'open', v_a);

  -- forca a falha DENTRO da rotina de XP: todo INSERT no ledger viola o CHECK
  ALTER TABLE public.xp_ledger ADD CONSTRAINT xp_ledger_teste_forca
    CHECK (amount <> amount) NOT VALID;

  INSERT INTO public.conversation_closures (contact_id, closed_by, close_reason)
    VALUES (v_c3, v_a, 'teste falha de gamificacao');

  IF NOT EXISTS (SELECT 1 FROM public.conversation_closures WHERE contact_id = v_c3) THEN
    RAISE EXCEPTION 'T8 FALHOU: a falha de gamificacao derrubou o encerramento';
  END IF;

  ALTER TABLE public.xp_ledger DROP CONSTRAINT xp_ledger_teste_forca;

  SELECT count(*) INTO v_pend FROM public.xp_ledger WHERE profile_id = v_a;
  IF v_pend <> 2 THEN
    RAISE EXCEPTION 'T8 FALHOU: ledger de A=% (esperado 2: nada novo entrou com a rotina falhando)', v_pend;
  END IF;

  RAISE NOTICE 'T8 OK: closure entrou com a rotina de XP falhando; XP nao somado (ledger A=2)';
END $$;

ROLLBACK;

\echo 'XP LEDGER EVENTOS REAIS: OK'
