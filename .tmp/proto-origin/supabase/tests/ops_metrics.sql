-- ============================================================================
-- ops_metrics — RPC de métricas operacionais (cartão, item de banco)
--
-- DEFEITO QUE ESTE TESTE TRAVA: não existia RPC única para o painel de
-- Operações. Ele precisava de volume de ENTRADA/SAÍDA/FALHA por conexão e de
-- ESPERA (média e p95) por fila, numa janela móvel (24/168/720 h), com o
-- caminho de leitura fechado a agente comum — e os números batendo com a
-- contagem direta nas tabelas.
--
-- VERMELHO ANTES / VERDE DEPOIS (o caminho do banco já tem a migration
-- aplicada pelo runner; a prova vermelha é feita fora, antes de aplicá-la):
--   * SEM a migration: `select public.ops_metrics(24)` -> 42883
--     (function does not exist). Reproduzível: DROP FUNCTION e chamar de novo.
--   * COM a migration: esta suíte fica verde.
--   E o próprio recorte fica embutido: se a migration não estivesse aplicada,
--   T1 receberia 42883 em vez de 42501 e a suíte QUEBRARIA (não passa por
--   engano). T9 desfaz a função DENTRO da transação e confirma que ela some.
--
-- O QUE PROVA (critério de pronto do cartão):
--   T1 anon — chamada negada (EXECUTE revogado de PUBLIC/anon, 42501);
--   T2 authenticated sem claims — negado (auth.uid() nulo -> 42501);
--   T3 agente comum (authenticated, role 'agent') — negado (staff_required, 42501);
--   T4 staff (authenticated, role 'admin') — autorizado e devolve jsonb;
--   T5 janela inválida (48) — recusada com 22023 (só 24/168/720);
--   T6 volume 24 h — entrada/saída/falha por conexão batem com a contagem
--      DIRETA nas tabelas; mensagem deletada e mensagem fora da janela ficam
--      de fora;
--   T7 espera 24 h — média e p95 por fila batem com o valor esperado; conversa
--      sem resposta e conversa fora da janela ficam de fora;
--   T8 janela 168 h — inclui o que a de 24 h excluía (prova o recorte da janela);
--   T9 rollback — o DROP FUNCTION do cabeçalho da migration roda e derruba a RPC.
--
-- PAPEL REAL: as asserções de permissão rodam com `SET LOCAL ROLE`
-- (anon / authenticated) + request.jwt.claims sintético — nunca como postgres,
-- que tem EXECUTE e BYPASSRLS e não exerceria nada.
--
-- ZERO EFEITO COLATERAL: tudo numa transação que termina em ROLLBACK; os
-- fixtures entram com session_replication_role=replica (sem gatilhos/FK) e
-- saem junto com o ROLLBACK.
--
-- COMO RODA (RAIZ do repositório, contra o banco local da tarefa):
--   zapp-db-local psql . <nome-do-conjunto> < supabase/tests/ops_metrics.sql
-- (a migration precisa estar aplicada antes: o runner do banco a aplica)
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- ---------------------------------------------------------------------------
-- Fixtures determinísticos (nada de produção)
-- ---------------------------------------------------------------------------
SET LOCAL session_replication_role = replica;

INSERT INTO auth.users (id) VALUES
  ('a0a00000-0000-4000-8000-000000000001'),
  ('a0a00000-0000-4000-8000-000000000002');

INSERT INTO public.user_roles (user_id, role) VALUES
  ('a0a00000-0000-4000-8000-000000000001', 'admin'),
  ('a0a00000-0000-4000-8000-000000000002', 'agent');

INSERT INTO public.whatsapp_connections (id, name, phone_number, capabilities) VALUES
  ('c00a0000-0000-4000-8000-000000000001', 'Conexao A', '5500000000001', '{}'::jsonb),
  ('c00b0000-0000-4000-8000-000000000002', 'Conexao B', '5500000000002', '{}'::jsonb);

INSERT INTO public.queues (id, name, color) VALUES
  ('d0000000-0000-4000-8000-000000000001', 'Fila Um', '#111111'),
  ('d0000000-0000-4000-8000-000000000002', 'Fila Dois', '#222222');

INSERT INTO public.contacts (id, name, phone, conversation_status, is_lid_legacy, queue_id) VALUES
  ('e0000000-0000-4000-8000-000000000001', 'C1', '5500000000011', 'open', false, 'd0000000-0000-4000-8000-000000000001'),
  ('e0000000-0000-4000-8000-000000000002', 'C2', '5500000000012', 'open', false, 'd0000000-0000-4000-8000-000000000001'),
  ('e0000000-0000-4000-8000-000000000003', 'C3', '5500000000013', 'open', false, 'd0000000-0000-4000-8000-000000000001'),
  ('e0000000-0000-4000-8000-000000000004', 'C4', '5500000000014', 'open', false, 'd0000000-0000-4000-8000-000000000001'),
  ('e0000000-0000-4000-8000-000000000005', 'C5', '5500000000015', 'open', false, 'd0000000-0000-4000-8000-000000000001'),
  ('e0000000-0000-4000-8000-000000000006', 'C6', '5500000000016', 'open', false, 'd0000000-0000-4000-8000-000000000001'),
  ('e0000000-0000-4000-8000-000000000007', 'C7', '5500000000017', 'open', false, 'd0000000-0000-4000-8000-000000000002');

-- Volume (janela 24 h = created_at agora-30min; janela 168 h inclui a linha "old")
INSERT INTO public.messages
  (id, contact_id, whatsapp_connection_id, sender, content, message_type, status, is_deleted, is_edited, delivery_attempt_count, created_at, updated_at)
VALUES
  -- Conexao A: 3 entrada, 2 saida OK, 1 saida FALHA
  ('f0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000001','c00a0000-0000-4000-8000-000000000001','contact','i1','text','delivered',false,false,0, now() - interval '30 minutes', now()),
  ('f0000000-0000-4000-8000-000000000002','e0000000-0000-4000-8000-000000000001','c00a0000-0000-4000-8000-000000000001','contact','i2','text','delivered',false,false,0, now() - interval '29 minutes', now()),
  ('f0000000-0000-4000-8000-000000000003','e0000000-0000-4000-8000-000000000001','c00a0000-0000-4000-8000-000000000001','contact','i3','text','delivered',false,false,0, now() - interval '28 minutes', now()),
  ('f0000000-0000-4000-8000-000000000004','e0000000-0000-4000-8000-000000000001','c00a0000-0000-4000-8000-000000000001','agent','o1','text','sent',false,false,0, now() - interval '27 minutes', now()),
  ('f0000000-0000-4000-8000-000000000005','e0000000-0000-4000-8000-000000000001','c00a0000-0000-4000-8000-000000000001','agent','o2','text','sent',false,false,0, now() - interval '26 minutes', now()),
  ('f0000000-0000-4000-8000-000000000006','e0000000-0000-4000-8000-000000000001','c00a0000-0000-4000-8000-000000000001','agent','fail','text','failed',false,false,1, now() - interval '25 minutes', now()),
  -- Conexao A: deletada -> nao conta
  ('f0000000-0000-4000-8000-000000000007','e0000000-0000-4000-8000-000000000001','c00a0000-0000-4000-8000-000000000001','agent','del','text','sent',true,false,0, now() - interval '24 minutes', now()),
  -- Conexao B: 1 entrada na janela de 24h
  ('f0000000-0000-4000-8000-000000000008','e0000000-0000-4000-8000-000000000001','c00b0000-0000-4000-8000-000000000002','contact','b1','text','delivered',false,false,0, now() - interval '23 minutes', now()),
  -- Conexao B: 25 h atras -> fora de 24h, dentro de 168h
  ('f0000000-0000-4000-8000-000000000009','e0000000-0000-4000-8000-000000000001','c00b0000-0000-4000-8000-000000000002','contact','b-old','text','delivered',false,false,0, now() - interval '25 hours', now());

-- Espera por fila (conversation_sla)
INSERT INTO public.conversation_sla (id, contact_id, first_message_at, first_response_at) VALUES
  ('aa000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000001', now() - interval '2 hours',                     now() - interval '2 hours' + interval '60 seconds'),
  ('aa000000-0000-4000-8000-000000000002','e0000000-0000-4000-8000-000000000002', now() - interval '2 hours',                     now() - interval '2 hours' + interval '120 seconds'),
  ('aa000000-0000-4000-8000-000000000003','e0000000-0000-4000-8000-000000000003', now() - interval '2 hours',                     now() - interval '2 hours' + interval '300 seconds'),
  ('aa000000-0000-4000-8000-000000000004','e0000000-0000-4000-8000-000000000004', now() - interval '2 hours',                     now() - interval '2 hours' + interval '600 seconds'),
  ('aa000000-0000-4000-8000-000000000005','e0000000-0000-4000-8000-000000000005', now() - interval '2 hours',                     NULL),
  ('aa000000-0000-4000-8000-000000000006','e0000000-0000-4000-8000-000000000006', now() - interval '26 hours',                    now() - interval '26 hours' + interval '240 seconds'),
  ('aa000000-0000-4000-8000-000000000007','e0000000-0000-4000-8000-000000000007', now() - interval '2 hours',                     now() - interval '2 hours' + interval '30 seconds');

SET LOCAL session_replication_role = origin;

-- ---------------------------------------------------------------------------
-- T1 anon negado
-- ---------------------------------------------------------------------------
\echo 'T1: anon NAO executa ops_metrics (EXECUTE revogado)'
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM public.ops_metrics(24);
    RAISE EXCEPTION 'T1 FALHOU: anon executou ops_metrics';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'T1 OK: anon negado (42501)';
  END;
END $$;
RESET ROLE;

-- ---------------------------------------------------------------------------
-- T2 authenticated sem claims (auth.uid() nulo) negado
-- ---------------------------------------------------------------------------
\echo 'T2: authenticated sem claims NAO executa (not_authenticated)'
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '', true);
DO $$
BEGIN
  BEGIN
    PERFORM public.ops_metrics(24);
    RAISE EXCEPTION 'T2 FALHOU: sessao sem auth.uid() executou ops_metrics';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'T2 OK: sem auth.uid() negado (42501)';
  END;
END $$;
RESET ROLE;

-- ---------------------------------------------------------------------------
-- T3 agente comum negado (staff_required)
-- ---------------------------------------------------------------------------
\echo 'T3: agente comum NAO executa ops_metrics (staff_required)'
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub','a0a00000-0000-4000-8000-000000000002')::text, true);
DO $$
BEGIN
  BEGIN
    PERFORM public.ops_metrics(24);
    RAISE EXCEPTION 'T3 FALHOU: agente comum executou ops_metrics';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'T3 OK: agente comum negado (staff_required, 42501)';
  END;
END $$;
RESET ROLE;

-- ---------------------------------------------------------------------------
-- T4 staff autorizado + T5 janela invalida + T6/T7 volume 24h + T8 168h
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub','a0a00000-0000-4000-8000-000000000001')::text, true);

\echo 'T4: staff executa e recebe jsonb'
\echo 'T5: janela 48 h e recusada (22023)'
\echo 'T6: volume 24 h por conexao bate com a contagem direta'
\echo 'T7: espera 24 h por fila bate com a media/p95 esperados'
\echo 'T8: janela 168 h inclui o que a de 24 h excluia'
DO $$
DECLARE
  v24 jsonb;
  v168 jsonb;
  v_conn_a jsonb;
  v_conn_b jsonb;
  v_queue_1 jsonb;
  v_queue_2 jsonb;
  v_direct_a_in int;
  v_direct_a_out int;
  v_direct_a_fail int;
BEGIN
  v24 := public.ops_metrics(24);
  IF v24 IS NULL OR jsonb_typeof(v24) <> 'object' THEN
    RAISE EXCEPTION 'T4 FALHOU: ops_metrics(24) nao devolveu objeto jsonb';
  END IF;
  IF (v24->>'window_hours')::int <> 24 THEN
    RAISE EXCEPTION 'T4 FALHOU: window_hours = %', v24->>'window_hours';
  END IF;
  RAISE NOTICE 'T4 OK: jsonb com window_hours=24';

  BEGIN
    PERFORM public.ops_metrics(48);
    RAISE EXCEPTION 'T5 FALHOU: janela 48 h foi aceita';
  EXCEPTION WHEN invalid_parameter_value THEN
    RAISE NOTICE 'T5 OK: janela 48 h recusada (22023)';
  END;

  -- contagem DIRETA (sem passar pela RPC)
  SELECT count(*) FILTER (WHERE sender = 'contact'),
         count(*) FILTER (WHERE sender = 'agent'),
         count(*) FILTER (WHERE sender = 'agent' AND status = 'failed')
    INTO v_direct_a_in, v_direct_a_out, v_direct_a_fail
    FROM public.messages
   WHERE whatsapp_connection_id = 'c00a0000-0000-4000-8000-000000000001'
     AND created_at >= now() - interval '24 hours'
     AND COALESCE(is_deleted, false) = false;

  SELECT e INTO v_conn_a FROM jsonb_array_elements(v24->'connections') e
   WHERE (e->>'connection_id') = 'c00a0000-0000-4000-8000-000000000001';
  SELECT e INTO v_conn_b FROM jsonb_array_elements(v24->'connections') e
   WHERE (e->>'connection_id') = 'c00b0000-0000-4000-8000-000000000002';

  IF v_conn_a IS NULL OR v_conn_b IS NULL THEN
    RAISE EXCEPTION 'T6 FALHOU: conexoes esperadas ausentes no retorno';
  END IF;
  -- o banco local já vem semeado: pode haver OUTRAS conexões na janela. Exijo
  -- apenas que as duas das fixtures estejam (checado acima) e que não falte
  -- nenhuma delas.
  IF jsonb_array_length(v24->'connections') < 2 THEN
    RAISE EXCEPTION 'T6 FALHOU: esperava ao menos 2 conexoes, achei %', jsonb_array_length(v24->'connections');
  END IF;
  IF (v_conn_a->>'incoming')::int <> 3 OR (v_conn_a->>'outgoing')::int <> 3 OR (v_conn_a->>'failed')::int <> 1 THEN
    RAISE EXCEPTION 'T6 FALHOU: Conexao A = % (esperado in=3 out=3 fail=1)', v_conn_a;
  END IF;
  IF (v_conn_a->>'incoming')::int <> v_direct_a_in
     OR (v_conn_a->>'outgoing')::int <> v_direct_a_out
     OR (v_conn_a->>'failed')::int <> v_direct_a_fail THEN
    RAISE EXCEPTION 'T6 FALHOU: RPC e contagem direta divergem em A (rpc=% direto in=% out=% fail=%)',
      v_conn_a, v_direct_a_in, v_direct_a_out, v_direct_a_fail;
  END IF;
  IF (v_conn_b->>'incoming')::int <> 1 OR (v_conn_b->>'outgoing')::int <> 0 OR (v_conn_b->>'failed')::int <> 0 THEN
    RAISE EXCEPTION 'T6 FALHOU: Conexao B = % (esperado in=1 out=0 fail=0)', v_conn_b;
  END IF;
  RAISE NOTICE 'T6 OK: A in=3 out=3 fail=1 / B in=1 out=0 fail=0 (bate com contagem direta; deletada e antiga fora)';

  SELECT e INTO v_queue_1 FROM jsonb_array_elements(v24->'queues') e
   WHERE (e->>'queue_id') = 'd0000000-0000-4000-8000-000000000001';
  SELECT e INTO v_queue_2 FROM jsonb_array_elements(v24->'queues') e
   WHERE (e->>'queue_id') = 'd0000000-0000-4000-8000-000000000002';
  IF v_queue_1 IS NULL OR v_queue_2 IS NULL THEN
    RAISE EXCEPTION 'T7 FALHOU: filas esperadas ausentes no retorno';
  END IF;
  IF jsonb_array_length(v24->'queues') < 2 THEN
    RAISE EXCEPTION 'T7 FALHOU: esperava ao menos 2 filas, achei %', jsonb_array_length(v24->'queues');
  END IF;
  IF (v_queue_1->>'answered')::int <> 4
     OR (v_queue_1->>'avg_wait_seconds')::numeric <> 270.00
     OR (v_queue_1->>'p95_wait_seconds')::numeric <> 555.00 THEN
    RAISE EXCEPTION 'T7 FALHOU: Fila Um = % (esperado answered=4 avg=270.00 p95=555.00)', v_queue_1;
  END IF;
  IF (v_queue_2->>'answered')::int <> 1
     OR (v_queue_2->>'avg_wait_seconds')::numeric <> 30.00
     OR (v_queue_2->>'p95_wait_seconds')::numeric <> 30.00 THEN
    RAISE EXCEPTION 'T7 FALHOU: Fila Dois = % (esperado answered=1 avg=30.00 p95=30.00)', v_queue_2;
  END IF;
  RAISE NOTICE 'T7 OK: Fila Um answered=4 avg=270.00 p95=555.00 / Fila Dois answered=1 avg=30.00 p95=30.00 (sem resposta e antiga fora)';

  v168 := public.ops_metrics(168);
  SELECT e INTO v_conn_b FROM jsonb_array_elements(v168->'connections') e
   WHERE (e->>'connection_id') = 'c00b0000-0000-4000-8000-000000000002';
  SELECT e INTO v_queue_1 FROM jsonb_array_elements(v168->'queues') e
   WHERE (e->>'queue_id') = 'd0000000-0000-4000-8000-000000000001';
  IF v_conn_b IS NULL OR (v_conn_b->>'incoming')::int <> 2 THEN
    RAISE EXCEPTION 'T8 FALHOU: em 168 h a Conexao B deveria ter in=2, veio %', v_conn_b;
  END IF;
  IF v_queue_1 IS NULL OR (v_queue_1->>'answered')::int <> 5 THEN
    RAISE EXCEPTION 'T8 FALHOU: em 168 h a Fila Um deveria ter answered=5, veio %', v_queue_1;
  END IF;
  RAISE NOTICE 'T8 OK: 168 h inclui a mensagem de 25 h e a conversa de 26 h';
END $$;
RESET ROLE;

-- ---------------------------------------------------------------------------
-- T9 rollback executavel
-- ---------------------------------------------------------------------------
\echo 'T9: o DROP FUNCTION do rollback roda e derruba a RPC'
DROP FUNCTION IF EXISTS public.ops_metrics(integer);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub','a0a00000-0000-4000-8000-000000000001')::text, true);
DO $$
BEGIN
  BEGIN
    PERFORM public.ops_metrics(24);
    RAISE EXCEPTION 'T9 FALHOU: ops_metrics sobreviveu ao rollback';
  EXCEPTION WHEN undefined_function THEN
    RAISE NOTICE 'T9 OK: rollback (DROP FUNCTION) suficiente';
  END;
END $$;
RESET ROLE;

ROLLBACK;
\echo 'SUITE VERDE: ops_metrics'
