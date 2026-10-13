-- Teste SQL da RPC public.queue_goal_metrics(integer) — PLT-2026-1 body pivot: / 1,12,
-- paridade V3 batch 2 (metricas de meta de fila).
--
-- O que prova (contrato que a tela de metas de fila consome):
--   T1  como admin, as metricas REAIS por fila batem: aguardando (mesma definicao de
--       QueueService.fetchWaitingCounts), espera media (queue_positions.entered_at),
--       taxa de atribuicao (atribuidas / recebidas no periodo) e mensagens pendentes;
--   T2  fila SEM meta devolve as colunas de meta em NULL (nao inventa meta) e taxa real;
--   T3  fila inativa nao aparece; fila com contato resolvido/arquivado nao conta aguardando;
--   T4  AGENTE comum (authenticated sem papel admin/supervisor) e NEGADO (42501);
--   T5  anon e negado no ACL — nem entra no corpo da funcao;
--   T6  periodo invalido (0) e recusado (22023);
--   T7  ACL: EXECUTE so para authenticated/service_role, nunca anon/PUBLIC.
--
-- COMO RODAR (banco LOCAL da tarefa, nunca producao):
--   zapp-db-local psql . <conjunto> -v ON_ERROR_STOP=1 < supabase/tests/queue_goal_metrics.sql
--
-- Cria dados SINTETICOS (usuarios, perfis, filas, metas, contatos, mensagens e posicoes)
-- e desfaz tudo no ROLLBACK final: nao sobra linha no banco. Sem EXCEPTION = suite verde.
BEGIN;

INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'admin.meta@test.local',  '', now(), now(), now()),
  ('00000000-0000-0000-0000-0000000000b2', 'authenticated', 'authenticated', 'agente.meta@test.local', '', now(), now(), now());

-- handle_new_user cria o profile; o upsert cobre os dois mundos (gatilho presente ou nao).
INSERT INTO public.profiles (user_id, name) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'Admin Meta (sintetico)'),
  ('00000000-0000-0000-0000-0000000000b2', 'Agente Meta (sintetico)')
ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name;

CREATE TEMP TABLE t_meta_ids ON COMMIT DROP AS
SELECT (SELECT id FROM public.profiles WHERE user_id = '00000000-0000-0000-0000-0000000000a1') AS admin_profile,
       (SELECT id FROM public.profiles WHERE user_id = '00000000-0000-0000-0000-0000000000b2') AS agente_profile;

-- So o admin tem papel; o agente NAO (agente comum).
INSERT INTO public.user_roles (user_id, role) VALUES ('00000000-0000-0000-0000-0000000000a1', 'admin');

INSERT INTO public.queues (id, name, color, is_active) VALUES
  ('00000000-0000-0000-0000-0000000000d1', 'Fila Com Meta', '#22c55e', true),
  ('00000000-0000-0000-0000-0000000000d2', 'Fila Sem Meta', '#3b82f6', true),
  ('00000000-0000-0000-0000-0000000000d3', 'Fila Inativa',  '#ef4444', false),
  ('00000000-0000-0000-0000-0000000000d4', 'Fila Sem Recebidas', '#a855f7', true);

INSERT INTO public.queue_goals (queue_id, max_waiting_contacts, max_avg_wait_minutes, min_assignment_rate, max_messages_pending, alerts_enabled)
VALUES ('00000000-0000-0000-0000-0000000000d1', 5, 10, 80, 3, true);

-- Fila A: 5 recebidas no periodo (e001..e005, inclui a resolvida), 3 atribuidas -> taxa 60.0
--   cA4 (e004) fica AGUARDANDO (com posicao de fila) e cA6 (e006) fica AGUARDANDO mas fora do periodo.
-- Fila B: 1 recebida e atribuida -> taxa 100.0, nada aguardando.
INSERT INTO public.contacts (id, name, phone, conversation_status, assigned_to, queue_id, created_at) VALUES
  ('00000000-0000-0000-0000-00000000e001', 'A atribuido 1', '+55000000a01', 'open', (SELECT admin_profile FROM t_meta_ids), '00000000-0000-0000-0000-0000000000d1', now() - interval '2 hours'),
  ('00000000-0000-0000-0000-00000000e002', 'A atribuido 2', '+55000000a02', 'open', (SELECT admin_profile FROM t_meta_ids), '00000000-0000-0000-0000-0000000000d1', now() - interval '2 hours'),
  ('00000000-0000-0000-0000-00000000e003', 'A atribuido 3', '+55000000a03', 'open', (SELECT admin_profile FROM t_meta_ids), '00000000-0000-0000-0000-0000000000d1', now() - interval '2 hours'),
  ('00000000-0000-0000-0000-00000000e004', 'A aguardando', '+55000000a04', 'open', NULL, '00000000-0000-0000-0000-0000000000d1', now() - interval '2 hours'),
  ('00000000-0000-0000-0000-00000000e006', 'A aguardando antigo', '+55000000a06', 'waiting', NULL, '00000000-0000-0000-0000-0000000000d1', now() - interval '30 days'),
  ('00000000-0000-0000-0000-00000000e005', 'A resolvido (nao aguarda)', '+55000000a05', 'resolved', NULL, '00000000-0000-0000-0000-0000000000d1', now() - interval '2 hours'),
  ('00000000-0000-0000-0000-00000000e011', 'B atribuido', '+55000000b11', 'open', (SELECT admin_profile FROM t_meta_ids), '00000000-0000-0000-0000-0000000000d2', now() - interval '1 hour'),
  ('00000000-0000-0000-0000-00000000e007', 'D aguardando antigo', '+55000000d07', 'open', NULL, '00000000-0000-0000-0000-0000000000d4', now() - interval '30 days');

-- cA4 entrou na fila ha 10 minutos -> sera a unica base da espera media.
INSERT INTO public.queue_positions (id, contact_id, queue_id, position, entered_at) VALUES
  ('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000e004', '00000000-0000-0000-0000-0000000000d1', 1, now() - interval '10 minutes');

-- Pendentes de A = 1 (m1). m2 lida, m3 do agente, m4 deletada nao contam.
INSERT INTO public.messages (id, contact_id, sender, content, message_type, is_read, is_deleted) VALUES
  ('00000000-0000-0000-0000-000000000091', '00000000-0000-0000-0000-00000000e004', 'contact', 'm1 pendente',   'text', NULL,  false),
  ('00000000-0000-0000-0000-000000000092', '00000000-0000-0000-0000-00000000e004', 'contact', 'm2 lida',       'text', true,  false),
  ('00000000-0000-0000-0000-000000000093', '00000000-0000-0000-0000-00000000e004', 'agent',   'm3 do agente',  'text', NULL,  false),
  ('00000000-0000-0000-0000-000000000094', '00000000-0000-0000-0000-00000000e011', 'contact', 'm4 deletada',   'text', NULL,  true);

-- ===== T1/T2/T3: metricas reais como admin ==================================
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
DO $$
DECLARE
  v_qA uuid := '00000000-0000-0000-0000-0000000000d1';
  v_qB uuid := '00000000-0000-0000-0000-0000000000d2';
  v_qC uuid := '00000000-0000-0000-0000-0000000000d3';
  v_qD uuid := '00000000-0000-0000-0000-0000000000d4';
  v_linhas int;
  v_a record;
  v_b record;
  v_d record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.queue_goal_metrics() WHERE queue_id = v_qA)
     OR NOT EXISTS (SELECT 1 FROM public.queue_goal_metrics() WHERE queue_id = v_qB) THEN
    RAISE EXCEPTION 'T3 FALHOU: as filas ativas com/sem meta nao vieram no resultado';
  END IF;
  IF EXISTS (SELECT 1 FROM public.queue_goal_metrics() WHERE queue_id = v_qC) THEN
    RAISE EXCEPTION 'T3 FALHOU: fila inativa apareceu no resultado';
  END IF;

  SELECT * INTO v_a FROM public.queue_goal_metrics() WHERE queue_id = v_qA;
  IF v_a.waiting_contacts <> 2 THEN
    RAISE EXCEPTION 'T1 FALHOU: aguardando de A = % (esperava 2; resolvido nao conta, antigo conta)', v_a.waiting_contacts;
  END IF;
  IF v_a.avg_wait_minutes IS NULL OR v_a.avg_wait_minutes < 9.5 OR v_a.avg_wait_minutes > 10.5 THEN
    RAISE EXCEPTION 'T1 FALHOU: espera media de A = % (esperava ~10)', v_a.avg_wait_minutes;
  END IF;
  IF v_a.assignment_rate <> 60.0 THEN
    RAISE EXCEPTION 'T1 FALHOU: taxa de A = % (esperava 60.0 = 3/5)', v_a.assignment_rate;
  END IF;
  IF v_a.messages_pending <> 1 THEN
    RAISE EXCEPTION 'T1 FALHOU: pendentes de A = % (esperava 1)', v_a.messages_pending;
  END IF;
  IF v_a.max_waiting_contacts <> 5 OR v_a.max_avg_wait_minutes <> 10
     OR v_a.min_assignment_rate <> 80 OR v_a.max_messages_pending <> 3
     OR v_a.alerts_enabled IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'T1 FALHOU: metas de A vieram erradas (% / % / % / % / %)',
      v_a.max_waiting_contacts, v_a.max_avg_wait_minutes, v_a.min_assignment_rate,
      v_a.max_messages_pending, v_a.alerts_enabled;
  END IF;
  RAISE NOTICE 'T1 OK: A -> aguardando=2 espera~10 taxa=60.0 pendentes=1 metas=5/10/80/3';

  SELECT * INTO v_b FROM public.queue_goal_metrics() WHERE queue_id = v_qB;
  IF v_b.waiting_contacts <> 0 OR v_b.messages_pending <> 0 THEN
    RAISE EXCEPTION 'T2 FALHOU: B devia estar vazia (aguardando=%, pendentes=%)', v_b.waiting_contacts, v_b.messages_pending;
  END IF;
  IF v_b.avg_wait_minutes IS NOT NULL THEN
    RAISE EXCEPTION 'T2 FALHOU: B sem posicao de fila devia ter espera NULL e veio %', v_b.avg_wait_minutes;
  END IF;
  IF v_b.assignment_rate <> 100.0 THEN
    RAISE EXCEPTION 'T2 FALHOU: taxa de B = % (esperava 100.0)', v_b.assignment_rate;
  END IF;
  IF v_b.max_waiting_contacts IS NOT NULL OR v_b.max_avg_wait_minutes IS NOT NULL
     OR v_b.min_assignment_rate IS NOT NULL OR v_b.max_messages_pending IS NOT NULL
     OR v_b.alerts_enabled IS NOT NULL THEN
    RAISE EXCEPTION 'T2 FALHOU: fila sem meta devolveu meta (nao podia)';
  END IF;
  RAISE NOTICE 'T2 OK: fila sem meta -> metas NULL, taxa real 100.0';

  -- T8: fila com aguardando mas SEM conversa recebida no periodo -> taxa NULL (nao 0
  -- e nunca divisao por zero).
  SELECT * INTO v_d FROM public.queue_goal_metrics() WHERE queue_id = v_qD;
  IF v_d.waiting_contacts <> 1 THEN
    RAISE EXCEPTION 'T8 FALHOU: aguardando de D = % (esperava 1; fora do periodo ainda aguarda)', v_d.waiting_contacts;
  END IF;
  IF v_d.assignment_rate IS NOT NULL THEN
    RAISE EXCEPTION 'T8 FALHOU: taxa de D = % (recebidas no periodo = 0 -> NULL)', v_d.assignment_rate;
  END IF;
  RAISE NOTICE 'T8 OK: denominador 0 -> taxa NULL (sem divisao por zero)';
END $$;

-- ===== T6: periodo invalido =================================================
DO $$
BEGIN
  BEGIN
    PERFORM 1 FROM public.queue_goal_metrics(0);
    RAISE EXCEPTION 'T6 FALHOU: p_days=0 passou';
  EXCEPTION WHEN others THEN
    IF sqlerrm LIKE '%passou%' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'T6 OK: periodo invalido recusado';
END $$;

-- ===== T4: agente comum NEGADO ==============================================
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}';
DO $$
BEGIN
  BEGIN
    PERFORM 1 FROM public.queue_goal_metrics();
    RAISE EXCEPTION 'T4 FALHOU: agente comum leu as metricas';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'T4 OK: agente comum negado (42501)';
  WHEN others THEN
    IF sqlerrm LIKE '%agente comum leu%' THEN RAISE; END IF;
    RAISE EXCEPTION 'T4 FALHOU: erro inesperado para agente comum: % (%)', sqlerrm, sqlstate;
  END;
END $$;

-- ===== T5: anon negado no ACL (nem entra no corpo) ==========================
DO $$
DECLARE v_negado boolean := false;
BEGIN
  IF NOT pg_has_role(current_user, 'anon', 'MEMBER') THEN
    -- Contexto (ex.: service_role) que nao pode assumir o papel anon: o ACL e
    -- provado por has_function_privilege no T7.
    RAISE NOTICE 'T5: papel atual nao pode assumir anon; ACL coberto no T7';
    RETURN;
  END IF;
  BEGIN
    EXECUTE 'set local role anon';
    PERFORM 1 FROM public.queue_goal_metrics();
  EXCEPTION WHEN insufficient_privilege THEN
    v_negado := true;
  END;
  EXECUTE 'reset role';
  IF NOT v_negado THEN
    RAISE EXCEPTION 'T5 FALHOU: anon conseguiu chamar a RPC';
  END IF;
  RAISE NOTICE 'T5 OK: anon negado no ACL antes do corpo';
END $$;

-- ===== T7: ACL exata ========================================================
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.queue_goal_metrics(integer)', 'EXECUTE')
     OR EXISTS (
       SELECT 1 FROM pg_proc p, aclexplode(p.proacl) g
        WHERE p.oid = 'public.queue_goal_metrics(integer)'::regprocedure AND g.grantee = 0
     ) THEN
    RAISE EXCEPTION 'T7 FALHOU: EXECUTE aberto para anon/PUBLIC';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.queue_goal_metrics(integer)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.queue_goal_metrics(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'T7 FALHOU: EXECUTE faltando para authenticated/service_role';
  END IF;
  RAISE NOTICE 'T7 OK: EXECUTE restrito a authenticated + service_role';
END $$;

ROLLBACK;
