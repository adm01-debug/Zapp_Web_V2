-- training_score_rpc.sql — prova do cartão t_48369edd (achado R2-AUTH-037).
--
-- O QUE SE PROVA AQUI
--   O Modo Treinamento gravava a nota calculada no cliente (TrainingMode.tsx) num
--   UPDATE direto em public.training_sessions. A policy "Users can manage own
--   training sessions" permite UPDATE em QUALQUER coluna da própria sessão: um
--   usuário authenticated que chamasse a API direto (fora da tela) virava a nota
--   em 100 e fechava a própria avaliação de desempenho. A nota do cliente não pode
--   ser a fonte da verdade.
--
--   Depois desta migration:
--     1) a nota é CALCULADA no banco (public.calculate_training_score, porte fiel
--        do avaliarTreinamento do TypeScript) a partir das respostas JÁ gravadas;
--     2) só a RPC public.complete_training_session(uuid) grava score/status/
--        completed_at, e só na sessão de quem chama (ou de admin/supervisor);
--     3) o gatilho trg_training_sessions_nota_so_por_rpc barra a escrita direta de
--        score e a conclusão da sessão por qualquer papel de cliente, sem tirar
--        nenhum GRANT nem policy (o caminho oficial de servidor segue aberto).
--
-- COMO RODAR (banco local do cartão, banco descartável da tarefa:
--   hermes-db-migrar supabase/migrations/20261015180324_training_score_rpc.sql
--   zapp-db-local psql . v2-261015145803c3 < supabase/tests/training_score_rpc.sql
-- O arquivo é uma transação única que termina em ROLLBACK: nada fica gravado.
-- BLOCO 2 é o VERMELHO ANTES (sem o gatilho, o dono forja a nota e conclui a
-- sessão na própria cara da API) e BLOCO 8 executa o Rollback da migration de
-- verdade, conferindo que ele derruba os objetos e que o ROLLBACK final devolve o
-- banco ao estado da migration.

\set ON_ERROR_STOP on

BEGIN;

-- ============================================================================
-- BLOCO 0 — pré-condições: a migration está aplicada e a tabela continua como era
-- ============================================================================
DO $$
BEGIN
  IF to_regprocedure('public.calculate_training_score(jsonb)') IS NULL
     OR to_regprocedure('public.complete_training_session(uuid)') IS NULL
     OR to_regprocedure('public.prevent_client_training_score()') IS NULL THEN
    RAISE EXCEPTION '[FALHA] a migration 20261015180324_training_score_rpc não está aplicada';
  END IF;

  IF to_regclass('public.training_sessions') IS NULL THEN
    RAISE EXCEPTION '[FALHA] public.training_sessions não existe';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.training_sessions'::regclass) THEN
    RAISE EXCEPTION '[FALHA] RLS desligada em training_sessions';
  END IF;

  -- As policies originais NÃO foram tocadas (o cartão não pede mudança de acesso).
  IF (SELECT count(*) FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'training_sessions') < 4 THEN
    RAISE EXCEPTION '[FALHA] policy de training_sessions desapareceu';
  END IF;

  -- Uso legítimo preservado: a tabela continua com UPDATE para o cliente; quem
  -- decide coluna a coluna é o gatilho.
  IF NOT has_table_privilege('authenticated', 'public.training_sessions', 'UPDATE') THEN
    RAISE EXCEPTION '[FALHA] tiraram o UPDATE de tabela do authenticated (mudança fora do pedido)';
  END IF;
  IF NOT has_table_privilege('anon', 'public.training_sessions', 'SELECT') THEN
    RAISE EXCEPTION '[FALHA] tiraram o SELECT de tabela do anon (mudança fora do pedido)';
  END IF;
END
$$;

-- ============================================================================
-- BLOCO 1 — contrato de forma: definer, search_path fixo, ACL e gatilho
-- ============================================================================
DO $$
DECLARE
  v_cfg text;
BEGIN
  IF NOT (SELECT p.prosecdef FROM pg_proc p
           WHERE p.oid = 'public.complete_training_session(uuid)'::regprocedure) THEN
    RAISE EXCEPTION '[FALHA] complete_training_session não é SECURITY DEFINER';
  END IF;
  IF (SELECT p.prosecdef FROM pg_proc p
       WHERE p.oid = 'public.calculate_training_score(jsonb)'::regprocedure) THEN
    RAISE EXCEPTION '[FALHA] o motor de nota não deveria ser SECURITY DEFINER';
  END IF;

  -- search_path fixo nas três funções novas (nada de resolver nome no search_path do chamador).
  FOREACH v_cfg IN ARRAY ARRAY['public.calculate_training_score(jsonb)',
                               'public.complete_training_session(uuid)',
                               'public.prevent_client_training_score()'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p
                    WHERE p.oid = v_cfg::regprocedure
                      AND p.proconfig @> ARRAY['search_path=public, pg_temp']) THEN
      RAISE EXCEPTION '[FALHA] % sem search_path fixo', v_cfg;
    END IF;
  END LOOP;

  -- ACL: o cliente chama só a RPC; o motor de nota é interno; anon não chama nada.
  IF NOT has_function_privilege('authenticated', 'public.complete_training_session(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION '[FALHA] authenticated sem EXECUTE em complete_training_session';
  END IF;
  IF has_function_privilege('anon', 'public.complete_training_session(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION '[FALHA] anon com EXECUTE em complete_training_session';
  END IF;
  IF has_function_privilege('authenticated', 'public.calculate_training_score(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION '[FALHA] authenticated com EXECUTE no motor de nota (devia ser interno)';
  END IF;

  -- Gatilho: BEFORE INSERT OR UPDATE (tgtype = 2 | 4 | 16), apontando para a função certa.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
     WHERE t.tgrelid = 'public.training_sessions'::regclass
       AND t.tgname = 'trg_training_sessions_nota_so_por_rpc'
       AND NOT t.tgisinternal
       AND t.tgenabled = 'O'
       AND t.tgtype = (1 | 2 | 4 | 16)
       AND t.tgfoid = 'public.prevent_client_training_score()'::regprocedure) THEN
    RAISE EXCEPTION '[FALHA] gatilho trg_training_sessions_nota_so_por_rpc ausente ou fora do contrato';
  END IF;
END
$$;

-- ============================================================================
-- Fixtures — 2 agentes e 6 sessões (2 com a mesma conversa "ok" do vitest,
-- 3 respostas completas, 3 respostas só com detalhe e 1 sem resposta do atendente)
-- ============================================================================
DO $$
DECLARE
  v_uid_a   uuid := '11111111-1111-4111-8111-111111111111';
  v_uid_b   uuid := '22222222-2222-4222-8222-222222222222';
  v_id_a    uuid;
  v_id_b    uuid;
  v_ok      constant text := 'ok';
  v_completa constant text := 'Entendo a sua situação, desculpe pela demora. Vou verificar agora o rastreio do pedido e retorno com o prazo.';
  v_detalhe constant text[] := ARRAY[
    'Certo, registrei aqui o seu caso sobre o pedido que ainda não chegou e o prazo que o senhor combinou.',
    'Anotei o relato do senhor aqui no sistema e o histórico do pedido já está aberto nesta tela.',
    'Segue o resumo do atendimento com os dados do pedido que o senhor informou nesta conversa de hoje.'
  ];
BEGIN
  -- Os gatilhos de auth.users criam o profile e o papel de agente; nada de
  -- session_replication_role (o papel de conexão não é superusuário).
  INSERT INTO auth.users (id, email, raw_user_meta_data)
  VALUES (v_uid_a, 'agente.a@promobrindes.com.br', jsonb_build_object('name', 'Agente A (treinamento)')),
         (v_uid_b, 'agente.b@promobrindes.com.br', jsonb_build_object('name', 'Agente B (treinamento)'));

  SELECT id INTO v_id_a FROM public.profiles WHERE user_id = v_uid_a;
  SELECT id INTO v_id_b FROM public.profiles WHERE user_id = v_uid_b;

  IF v_id_a IS NULL OR v_id_b IS NULL THEN
    RAISE EXCEPTION '[FALHA] fixture: os perfis não foram criados pelos gatilhos de auth.users';
  END IF;

  INSERT INTO public.training_sessions (id, profile_id, scenario_name, messages, status, started_at)
  VALUES
    -- sA0: sessão do furo (BLOCO 2 forja a nota e conclui)
    ('aaaaaaaa-0000-4000-8000-000000000001', v_id_a, 'Reclamação de entrega',
     jsonb_build_array(jsonb_build_object('role','customer','content','Meu pedido não chegou.'),
                       jsonb_build_object('role','agent','content',v_ok),
                       jsonb_build_object('role','agent','content',v_ok),
                       jsonb_build_object('role','agent','content',v_ok)),
     'in_progress', now()),
    -- sA1: sessão do dono para o BLOCO 3 (escrita direta deve ser barrada)
    ('aaaaaaaa-0000-4000-8000-000000000002', v_id_a, 'Reclamação de entrega',
     jsonb_build_array(jsonb_build_object('role','agent','content',v_ok)),
     'in_progress', now()),
    -- sA2: três respostas completas -> nota 100 (mesmo vetor do vitest)
    ('aaaaaaaa-0000-4000-8000-000000000003', v_id_a, 'Reclamação de entrega',
     jsonb_build_array(jsonb_build_object('role','customer','content','Meu pedido não chegou.'),
                       jsonb_build_object('role','agent','content',v_completa),
                       jsonb_build_object('role','customer','content','E o prazo?'),
                       jsonb_build_object('role','agent','content',v_completa),
                       jsonb_build_object('role','customer','content','Certo.'),
                       jsonb_build_object('role','agent','content',v_completa)),
     'in_progress', now()),
    -- sA3: três respostas só com detalhe -> nota 60 (mesmo vetor do vitest)
    ('aaaaaaaa-0000-4000-8000-000000000004', v_id_a, 'Reclamação de entrega',
     jsonb_build_array(jsonb_build_object('role','agent','content',v_detalhe[1]),
                       jsonb_build_object('role','agent','content',v_detalhe[2]),
                       jsonb_build_object('role','agent','content',v_detalhe[3])),
     'in_progress', now()),
    -- sA4: nenhuma resposta do atendente -> nota 40
    ('aaaaaaaa-0000-4000-8000-000000000005', v_id_a, 'Reclamação de entrega',
     jsonb_build_array(jsonb_build_object('role','customer','content','Meu pedido não chegou.')),
     'in_progress', now()),
    -- sB1: sessão de OUTRO dono
    ('bbbbbbbb-0000-4000-8000-000000000001', v_id_b, 'Reclamação de entrega',
     jsonb_build_array(jsonb_build_object('role','agent','content',v_ok)),
     'in_progress', now());
END
$$;

-- ============================================================================
-- BLOCO 2 — VERMELHO ANTES: sem o gatilho, o cliente forja a nota e conclui a
-- própria sessão (é exatamente o furo R2-AUTH-037 que este cartão fecha)
-- ============================================================================
DROP TRIGGER trg_training_sessions_nota_so_por_rpc ON public.training_sessions;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
                  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);

DO $$
DECLARE
  v_score  integer;
  v_status text;
BEGIN
  -- O dono da sessão, pela policy, pode escrever QUALQUER coluna da própria linha.
  UPDATE public.training_sessions
     SET score = 100,
         feedback = 'nota forjada pelo cliente',
         status = 'completed',
         completed_at = now()
   WHERE id = 'aaaaaaaa-0000-4000-8000-000000000001';

  SELECT score, status INTO v_score, v_status
    FROM public.training_sessions
   WHERE id = 'aaaaaaaa-0000-4000-8000-000000000001';

  IF v_score IS DISTINCT FROM 100 OR v_status IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION '[FALHA] o teste de mutação não reproduziu o furo (score=%, status=%)', v_score, v_status;
  END IF;

  RAISE NOTICE 'VERMELHO ANTES confirmado: sem o gatilho, a nota do cliente (100) e a conclusão passam (furo R2-AUTH-037)';
END
$$;

RESET ROLE;

-- Devolve o gatilho (a migration é idempotente; aqui só o vínculo foi derrubado).
CREATE TRIGGER trg_training_sessions_nota_so_por_rpc
BEFORE INSERT OR UPDATE ON public.training_sessions
FOR EACH ROW EXECUTE FUNCTION public.prevent_client_training_score();

-- ============================================================================
-- BLOCO 3 — authenticated não escreve nota nem conclui sessão (nem a própria)
-- ============================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
                  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);

DO $$
BEGIN
  -- (a) grava nota numa sessão própria sem nota
  BEGIN
    UPDATE public.training_sessions SET score = 70
     WHERE id = 'aaaaaaaa-0000-4000-8000-000000000002';
    RAISE EXCEPTION '[FALHA] authenticated gravou a nota na própria sessão';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- (b) conclui a sessão sem passar pela RPC
  BEGIN
    UPDATE public.training_sessions SET status = 'completed', completed_at = now()
     WHERE id = 'aaaaaaaa-0000-4000-8000-000000000002';
    RAISE EXCEPTION '[FALHA] authenticated concluiu a própria sessão sem a RPC';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- (c) nasce a sessão já com nota
  BEGIN
    INSERT INTO public.training_sessions
      (id, profile_id, scenario_name, messages, score, status, started_at)
    VALUES ('aaaaaaaa-0000-4000-8000-000000000009',
            (SELECT id FROM public.profiles
              WHERE user_id = '11111111-1111-4111-8111-111111111111'),
            'Reclamação de entrega', '[]'::jsonb, 100, 'completed', now());
    RAISE EXCEPTION '[FALHA] authenticated inseriu sessão já com nota';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- (d) uso legítimo: o dono continua atualizando as mensagens da própria sessão
  UPDATE public.training_sessions
     SET messages = messages || jsonb_build_array(
           jsonb_build_object('role','customer','content','tudo bem'))
   WHERE id = 'aaaaaaaa-0000-4000-8000-000000000002';

  IF (SELECT jsonb_array_length(messages) FROM public.training_sessions
       WHERE id = 'aaaaaaaa-0000-4000-8000-000000000002') <> 2 THEN
    RAISE EXCEPTION '[FALHA] o gatilho barrou o uso legítimo (atualizar mensagens)';
  END IF;
END
$$;

-- ============================================================================
-- BLOCO 4 — o dono usa a RPC: paridade com o TypeScript, estado gravado e
-- idempotência (mesma conversa -> mesma nota; completed_at não é reescrito)
-- ============================================================================
DO $$
DECLARE
  v_res     jsonb;
  v_score   integer;
  v_fb      text;
  v_status  text;
  v_comp    timestamptz;
  v_comp2   timestamptz;
BEGIN
  -- (a) três respostas completas -> 100, o mesmo texto do vitest
  v_res := public.complete_training_session('aaaaaaaa-0000-4000-8000-000000000003');
  IF (v_res->>'score')::integer <> 100
     OR v_res->>'feedback' <> 'Excelente! Respostas completas, com empatia e próximo passo claro.' THEN
    RAISE EXCEPTION '[FALHA] vetor completo: esperado 100/Excelente, veio %', v_res;
  END IF;

  SELECT score, feedback, status, completed_at INTO v_score, v_fb, v_status, v_comp
    FROM public.training_sessions
   WHERE id = 'aaaaaaaa-0000-4000-8000-000000000003';

  IF v_score <> 100 OR v_status <> 'completed' OR v_comp IS NULL
     OR v_fb <> 'Excelente! Respostas completas, com empatia e próximo passo claro.' THEN
    RAISE EXCEPTION '[FALHA] a RPC não gravou o estado completo (score=%, status=%, fb=%)', v_score, v_status, v_fb;
  END IF;

  -- (b) idempotente: chamar de novo dá o mesmo resultado e não reescreve completed_at
  PERFORM pg_sleep(0.01);
  v_res := public.complete_training_session('aaaaaaaa-0000-4000-8000-000000000003');
  SELECT completed_at INTO v_comp2 FROM public.training_sessions
   WHERE id = 'aaaaaaaa-0000-4000-8000-000000000003';
  IF (v_res->>'score')::integer <> 100 OR v_comp2 IS DISTINCT FROM v_comp THEN
    RAISE EXCEPTION '[FALHA] a RPC não é idempotente (completed_at reescrito)';
  END IF;

  -- (c) três respostas só com detalhe -> 60, com o texto do vitest
  v_res := public.complete_training_session('aaaaaaaa-0000-4000-8000-000000000004');
  IF (v_res->>'score')::integer <> 60
     OR v_res->>'feedback' <> 'Bom, mas faltou declarar o próximo passo e reconhecer a situação do cliente.' THEN
    RAISE EXCEPTION '[FALHA] vetor só-detalhe: esperado 60/Bom mas faltou, veio %', v_res;
  END IF;

  -- (d) nenhuma resposta do atendente -> 40, sem inventar critério
  v_res := public.complete_training_session('aaaaaaaa-0000-4000-8000-000000000005');
  IF (v_res->>'score')::integer <> 40
     OR v_res->>'feedback' <> 'Nenhuma resposta do atendente foi registrada nesta sessão.' THEN
    RAISE EXCEPTION '[FALHA] vetor sem resposta: esperado 40/sem resposta, veio %', v_res;
  END IF;

  RAISE NOTICE 'RPC verde: 100/60/40 iguais ao avaliarTreinamento do TypeScript, estado gravado e idempotência ok';
END
$$;

-- BLOCO 4b — entrada inválida no motor de nota: nada de exceção nem de nota inventada.
-- `messages` é jsonb livre: NULL, objeto e escalar não podem explodir a RPC nem virar nota.
-- O motor é interno (sem EXECUTE para authenticated), então esta parte roda como o dono da
-- conexão; a recusa de EXECUTE ao cliente já foi provada no BLOCO 1.
RESET ROLE;

DO $$
DECLARE
  v_entradas jsonb[] := ARRAY[NULL::jsonb, '{}'::jsonb, '[]'::jsonb, '"texto"'::jsonb, '42'::jsonb];
  v_entrada  jsonb;
  v_res      jsonb;
BEGIN
  FOREACH v_entrada IN ARRAY v_entradas LOOP
    v_res := public.calculate_training_score(v_entrada);
    IF (v_res->>'score')::integer <> 40
       OR v_res->>'feedback' <> 'Nenhuma resposta do atendente foi registrada nesta sessão.' THEN
      RAISE EXCEPTION '[FALHA] entrada inválida % devolveu %', v_entrada, v_res;
    END IF;
  END LOOP;
END
$$;

-- sessão com `messages` objeto (não array): o dono chama a RPC e ela não explode
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_res jsonb;
BEGIN
  UPDATE public.training_sessions SET messages = '{"role":"agent"}'::jsonb
   WHERE id = 'aaaaaaaa-0000-4000-8000-000000000005';
  v_res := public.complete_training_session('aaaaaaaa-0000-4000-8000-000000000005');
  IF (v_res->>'score')::integer <> 40 THEN
    RAISE EXCEPTION '[FALHA] messages objeto (não array) devolveu %', v_res;
  END IF;
END
$$;

-- ============================================================================
-- BLOCO 5 — sessão de outro dono e sessão inexistente: MESMA recusa, nada escrito
-- (sem oráculo de enumeração de id de sessão)
-- ============================================================================
DO $$
DECLARE
  v_msg_inexistente text;
  v_msg_alheia      text;
BEGIN
  BEGIN
    PERFORM public.complete_training_session('99999999-0000-4000-8000-000000000000');
    RAISE EXCEPTION '[FALHA] a RPC aceitou uma sessão inexistente';
  EXCEPTION WHEN insufficient_privilege THEN
    GET STACKED DIAGNOSTICS v_msg_inexistente = MESSAGE_TEXT;
  END;

  BEGIN
    PERFORM public.complete_training_session('bbbbbbbb-0000-4000-8000-000000000001');
    RAISE EXCEPTION '[FALHA] a RPC aceitou a sessão de outro dono';
  EXCEPTION WHEN insufficient_privilege THEN
    GET STACKED DIAGNOSTICS v_msg_alheia = MESSAGE_TEXT;
  END;

  IF v_msg_inexistente IS DISTINCT FROM v_msg_alheia THEN
    RAISE EXCEPTION '[FALHA] a RPC distingue sessão inexistente de sessão alheia (oráculo): "%" x "%"',
      v_msg_inexistente, v_msg_alheia;
  END IF;
END
$$;

RESET ROLE;

-- Como o dono não lê a sessão alheia (RLS), a conferência de que NADA foi escrito
-- é feita fora do papel de cliente.
DO $$
BEGIN
  IF (SELECT score FROM public.training_sessions
       WHERE id = 'bbbbbbbb-0000-4000-8000-000000000001') IS NOT NULL THEN
    RAISE EXCEPTION '[FALHA] a recusa escreveu a nota da sessão alheia';
  END IF;
  IF (SELECT status FROM public.training_sessions
       WHERE id = 'bbbbbbbb-0000-4000-8000-000000000001') <> 'in_progress' THEN
    RAISE EXCEPTION '[FALHA] a recusa concluiu a sessão alheia';
  END IF;
END
$$;

-- ============================================================================
-- BLOCO 6 — anon não executa nada disso
-- ============================================================================
SET LOCAL ROLE anon;

DO $$
BEGIN
  BEGIN
    PERFORM public.complete_training_session('aaaaaaaa-0000-4000-8000-000000000003');
    RAISE EXCEPTION '[FALHA] anon executou a RPC de conclusão';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    PERFORM public.calculate_training_score('[]'::jsonb);
    RAISE EXCEPTION '[FALHA] anon executou o motor de nota';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$$;

RESET ROLE;

-- ============================================================================
-- BLOCO 7 — o caminho oficial do servidor continua aberto (service_role escreve)
-- ============================================================================
SET LOCAL ROLE service_role;

DO $$
BEGIN
  UPDATE public.training_sessions
     SET score = 100, feedback = 'gravado pelo servidor', status = 'completed'
   WHERE id = 'aaaaaaaa-0000-4000-8000-000000000001';

  IF (SELECT score FROM public.training_sessions
       WHERE id = 'aaaaaaaa-0000-4000-8000-000000000001') <> 100 THEN
    RAISE EXCEPTION '[FALHA] o gatilho fechou o caminho do servidor (service_role)';
  END IF;
END
$$;

RESET ROLE;

-- ============================================================================
-- BLOCO 8 — o Rollback da migration roda de verdade e derruba os objetos
-- ============================================================================
DROP TRIGGER IF EXISTS trg_training_sessions_nota_so_por_rpc ON public.training_sessions;
DROP FUNCTION IF EXISTS public.prevent_client_training_score();
DROP FUNCTION IF EXISTS public.complete_training_session(uuid);
DROP FUNCTION IF EXISTS public.calculate_training_score(jsonb);

DO $$
BEGIN
  IF to_regprocedure('public.complete_training_session(uuid)') IS NOT NULL
     OR to_regprocedure('public.calculate_training_score(jsonb)') IS NOT NULL
     OR to_regprocedure('public.prevent_client_training_score()') IS NOT NULL
     OR EXISTS (SELECT 1 FROM pg_trigger
                 WHERE tgrelid = 'public.training_sessions'::regclass
                   AND tgname = 'trg_training_sessions_nota_so_por_rpc') THEN
    RAISE EXCEPTION '[FALHA] o Rollback da migration não derrubou tudo';
  END IF;
END
$$;

ROLLBACK;

-- Pós-rollback: nada do ensaio ficou no banco do conjunto (nem fixture, nem o
-- próprio ensaio de rollback) — a migration segue aplicada e íntegra.
DO $$
BEGIN
  IF to_regprocedure('public.complete_training_session(uuid)') IS NULL
     OR to_regprocedure('public.calculate_training_score(jsonb)') IS NULL
     OR NOT EXISTS (SELECT 1 FROM pg_trigger
                     WHERE tgrelid = 'public.training_sessions'::regclass
                       AND tgname = 'trg_training_sessions_nota_so_por_rpc') THEN
    RAISE EXCEPTION '[FALHA] o ROLLBACK final não devolveu o banco ao estado da migration';
  END IF;
  IF EXISTS (SELECT 1 FROM public.training_sessions
              WHERE id = 'aaaaaaaa-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION '[FALHA] fixture ficou gravada (o ensaio não era descartável)';
  END IF;
END
$$;

\echo 'training_score_rpc.sql: TUDO VERDE'
