-- ============================================================================
-- contact_purchases_rls_author.sql — prova do cartão t_b361e512 (workersql).
--
-- DEFEITO (public.contact_purchases, RLS por dono): as quatro policies de
-- 20260409222809 olham SÓ a visibilidade do contato e nunca `created_by`. Com
-- isso, qualquer agente que enxergue o contato:
--   (a) grava compra EM NOME DE OUTRO (`created_by` = perfil de um terceiro);
--   (b) troca `contact_id` de uma compra existente para OUTRO contato (o
--       registro sai do histórico do contato original);
--   (c) APAGA compra registrada por outro agente do mesmo contato.
--
-- O QUE ESTE ARQUIVO PROVA
--   BLOCO 0 — pré-condições: migration aplicada, RLS ligada, nenhuma policy de
--             anon, GRANT de tabela intacto.
--   BLOCO 2 — como AGENTE A: enxerga só as compras dos contatos dele, nada do
--             contato de B nem do contato sem responsável.
--   BLOCO 3 — INSERT: grava no próprio nome; sem `created_by` o gatilho preenche
--             com o perfil do chamador (a tela pode omitir o campo); em nome de
--             OUTRO é NEGADO (42501), inclusive para admin; contato invisível é
--             NEGADO.
--   BLOCO 4 — UPDATE: valor da própria compra passa; trocar `created_by` ou
--             `contact_id` é RECUSADO (23514) para agente E para admin; admin
--             continua editando valor de compra registrada por outra pessoa
--             (nenhum acesso legítimo foi tirado).
--   BLOCO 5 — DELETE: o autor apaga o que registrou; apagar compra de OUTRO
--             agente (mesmo contato) apaga 0 linhas; compra de autor desconhecido
--             (legado) sai do alcance do agente; admin apaga qualquer uma.
--   BLOCO 5.7 — SUPERVISOR (papel real): grava e apaga compra de contato que não
--             é dele e é barrado ao gravar em nome de outro.
--   BLOCO 6 — anon: nada lê, nada grava.
--   BLOCO 7 — caminho de servidor (service_role, sem JWT): continua gravando
--             (Edge/cron não foram afetados).
--   BLOCO 8 — ROLLBACK DE VERDADE: executa, verbatim, o bloco `-- Rollback` do
--             cabeçalho da migration; confere que função e gatilhos sumiram, que
--             a policy de INSERT voltou ao texto antigo (sem `created_by`) e que o DEFEITO VOLTA
--             (A grava em nome de B e apaga compra de B). É o vermelho-antes:
--             sem o conserto, os BLOCOS 3.6 e 5.2 teriam este resultado.
--
-- COMO RODAR (banco local da tarefa, schema REAL, como papel real):
--   zapp-db-local psql . cprls < supabase/tests/contact_purchases_rls_author.sql
--   (a migration entra antes, no mesmo banco, por hermes-db-migrar ou
--    `zapp-db-local psql . cprls < supabase/migrations/<ts>_contact_purchases_rls_author.sql`)
-- Toda asserção de RLS roda com SET LOCAL ROLE authenticated/anon/service_role +
-- JWT sintético em request.jwt.claims — nunca como postgres. O arquivo é uma
-- transação única que termina em ROLLBACK: nada fica gravado.
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- ============================================================================
-- BLOCO 0 — pré-condições
-- ============================================================================
DO $$
BEGIN
  IF to_regprocedure('public.guard_contact_purchase_identity()') IS NULL THEN
    RAISE EXCEPTION '[FALHA] a migration de conserto não está aplicada: guard_contact_purchase_identity() ausente';
  END IF;

  IF to_regprocedure('public.get_profile_id_for_user(uuid)') IS NULL
     OR to_regprocedure('public.is_contact_visible_to_user(uuid, uuid)') IS NULL
     OR to_regprocedure('public.is_admin_or_supervisor(uuid)') IS NULL THEN
    RAISE EXCEPTION '[FALHA] predicados de visibilidade/administração ausentes no banco';
  END IF;

  IF to_regclass('public.contact_purchases') IS NULL THEN
    RAISE EXCEPTION '[FALHA] public.contact_purchases não existe';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.contact_purchases'::regclass) THEN
    RAISE EXCEPTION '[FALHA] RLS desligada em contact_purchases';
  END IF;

  -- os dois gatilhos de identidade, um por operação
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgrelid = 'public.contact_purchases'::regclass
                    AND tgname = 'guard_contact_purchase_identity_insert'
                    AND NOT tgisinternal) THEN
    RAISE EXCEPTION '[FALHA] gatilho guard_contact_purchase_identity_insert ausente';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgrelid = 'public.contact_purchases'::regclass
                    AND tgname = 'guard_contact_purchase_identity_update'
                    AND NOT tgisinternal) THEN
    RAISE EXCEPTION '[FALHA] gatilho guard_contact_purchase_identity_update ausente';
  END IF;

  -- o gatilho de updated_at da 20260409020732 continua vivo
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgrelid = 'public.contact_purchases'::regclass
                    AND tgname = 'update_contact_purchases_updated_at'
                    AND NOT tgisinternal) THEN
    RAISE EXCEPTION '[FALHA] gatilho update_contact_purchases_updated_at desapareceu';
  END IF;

  -- policy de INSERT agora olha o autor
  IF (SELECT with_check FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'contact_purchases'
         AND policyname = 'Agents can insert purchases for assigned contacts') NOT LIKE '%created_by%' THEN
    RAISE EXCEPTION '[FALHA] policy de INSERT não exige created_by do chamador';
  END IF;

  -- policy de DELETE agora olha o autor
  IF (SELECT qual FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'contact_purchases'
         AND policyname = 'Agents can delete purchases for assigned contacts') NOT LIKE '%created_by%' THEN
    RAISE EXCEPTION '[FALHA] policy de DELETE não exige created_by do chamador';
  END IF;

  -- nenhuma policy para anon (o cartão não amplia acesso)
  IF EXISTS (SELECT 1 FROM pg_policies
              WHERE schemaname = 'public' AND tablename = 'contact_purchases'
                AND roles::text LIKE '%anon%') THEN
    RAISE EXCEPTION '[FALHA] contact_purchases ganhou policy para anon';
  END IF;

  -- GRANT de tabela intacto: o cliente continua podendo tentar (a RLS é a barreira)
  IF NOT (has_table_privilege('authenticated', 'public.contact_purchases', 'SELECT')
          AND has_table_privilege('authenticated', 'public.contact_purchases', 'INSERT')
          AND has_table_privilege('authenticated', 'public.contact_purchases', 'UPDATE')
          AND has_table_privilege('authenticated', 'public.contact_purchases', 'DELETE')) THEN
    RAISE EXCEPTION '[FALHA] GRANT de contact_purchases para authenticated foi alterado';
  END IF;

  RAISE NOTICE '[PASS] BLOCO 0 — migration aplicada, RLS ligada, policies de autor no lugar, sem anon';
END $$;

-- ============================================================================
-- BLOCO 1 — fixtures (como postgres; o agente A é dono do contato c1 e c1b)
-- ============================================================================
SET LOCAL session_replication_role = replica;

INSERT INTO auth.users (id) VALUES
  ('11111111-1111-1111-1111-1111111111a1'),  -- A: agente, dono de c1/c1b
  ('11111111-1111-1111-1111-1111111111b1'),  -- B: agente, dono de c2
  ('11111111-1111-1111-1111-1111111111c1'),  -- C: admin
  ('11111111-1111-1111-1111-1111111111d1');  -- D: supervisor

INSERT INTO public.profiles (id, user_id, name) VALUES
  ('22222222-2222-2222-2222-2222222222a1', '11111111-1111-1111-1111-1111111111a1', 'AGENTE A'),
  ('22222222-2222-2222-2222-2222222222b1', '11111111-1111-1111-1111-1111111111b1', 'AGENTE B'),
  ('22222222-2222-2222-2222-2222222222c1', '11111111-1111-1111-1111-1111111111c1', 'ADMIN C'),
  ('22222222-2222-2222-2222-2222222222d1', '11111111-1111-1111-1111-1111111111d1', 'SUPERVISOR D');

INSERT INTO public.user_roles (user_id, role) VALUES
  ('11111111-1111-1111-1111-1111111111a1', 'agent'),
  ('11111111-1111-1111-1111-1111111111b1', 'agent'),
  ('11111111-1111-1111-1111-1111111111c1', 'admin'),
  ('11111111-1111-1111-1111-1111111111d1', 'supervisor');

SET LOCAL session_replication_role = origin;

INSERT INTO public.contacts (id, name, phone, assigned_to) VALUES
  ('33333333-3333-3333-3333-3333333333c1', 'Contato 1 (A)',     '+5500000000001', '22222222-2222-2222-2222-2222222222a1'),
  ('33333333-3333-3333-3333-3333333333c2', 'Contato 1b (A)',    '+5500000000002', '22222222-2222-2222-2222-2222222222a1'),
  ('33333333-3333-3333-3333-3333333333c3', 'Contato 2 (B)',     '+5500000000003', '22222222-2222-2222-2222-2222222222b1'),
  ('33333333-3333-3333-3333-3333333333c4', 'Contato 3 (ninguém)','+5500000000004', NULL);

INSERT INTO public.contact_purchases (id, contact_id, title, amount, created_by) VALUES
  ('44444444-4444-4444-4444-4444444444a1', '33333333-3333-3333-3333-3333333333c1', 'compra do A em c1',      100.00, '22222222-2222-2222-2222-2222222222a1'),
  ('44444444-4444-4444-4444-4444444444e1', '33333333-3333-3333-3333-3333333333c1', 'compra legada sem autor', 90.00, NULL),
  ('44444444-4444-4444-4444-4444444444b1', '33333333-3333-3333-3333-3333333333c3', 'compra do B em c2',      200.00, '22222222-2222-2222-2222-2222222222b1'),
  ('44444444-4444-4444-4444-4444444444d1', '33333333-3333-3333-3333-3333333333c1', 'apagável do A',           10.00, '22222222-2222-2222-2222-2222222222a1'),
  ('44444444-4444-4444-4444-4444444444d2', '33333333-3333-3333-3333-3333333333c1', 'apagável do B',           20.00, '22222222-2222-2222-2222-2222222222b1'),
  ('44444444-4444-4444-4444-4444444444d3', '33333333-3333-3333-3333-3333333333c1', 'apagável sem autor',      30.00, NULL),
  ('44444444-4444-4444-4444-4444444444f1', '33333333-3333-3333-3333-3333333333c4', 'compra em contato órfão', 40.00, '22222222-2222-2222-2222-2222222222b1'),
  ('44444444-4444-4444-4444-4444444444f2', '33333333-3333-3333-3333-3333333333c1', 'alvo do rollback',        50.00, '22222222-2222-2222-2222-2222222222b1');

-- ============================================================================
-- BLOCO 2 — leitura como AGENTE A: só os contatos dele
-- ============================================================================
DO $$
DECLARE
  v_n     integer;
  v_leak  integer;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-1111111111a1","role":"authenticated"}', true);
  SET LOCAL ROLE authenticated;

  IF current_user <> 'authenticated' THEN
    RAISE EXCEPTION '[FALHA] o papel real não pegou: current_user=%', current_user;
  END IF;

  SELECT count(*) INTO v_n FROM public.contact_purchases;
  IF v_n <> 6 THEN
    RAISE EXCEPTION '[FALHA] A deveria ver as 6 compras de c1, viu %', v_n;
  END IF;

  SELECT count(*) INTO v_leak FROM public.contact_purchases
   WHERE id IN ('44444444-4444-4444-4444-4444444444b1',  -- c2, de B
                '44444444-4444-4444-4444-4444444444f1'); -- c4, sem responsável
  IF v_leak <> 0 THEN
    RAISE EXCEPTION '[FALHA] A enxergou compra de contato que não é dele (% linhas)', v_leak;
  END IF;

  RESET ROLE;
  RAISE NOTICE '[PASS] BLOCO 2 — A vê 6 compras do contato dele e nenhuma de fora';
END $$;

-- ============================================================================
-- BLOCO 3 — INSERT: autor é quem grava
-- ============================================================================
DO $$
DECLARE
  v_n       integer;
  v_author  uuid;
  v_antes   integer;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-1111111111a1","role":"authenticated"}', true);
  SET LOCAL ROLE authenticated;

  -- 3.1 no próprio nome: passa
  INSERT INTO public.contact_purchases (id, contact_id, title, amount, created_by)
  VALUES ('55555555-5555-5555-5555-5555555555a1', '33333333-3333-3333-3333-3333333333c1',
          'minha compra', 11.00, '22222222-2222-2222-2222-2222222222a1');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN
    RAISE EXCEPTION '[FALHA] A não conseguiu registrar a própria compra (linhas=%)', v_n;
  END IF;

  -- 3.2 sem created_by (a tela pode omitir): o gatilho preenche com o perfil do chamador
  INSERT INTO public.contact_purchases (id, contact_id, title, amount)
  VALUES ('55555555-5555-5555-5555-5555555555a2', '33333333-3333-3333-3333-3333333333c1',
          'minha compra sem autor explícito', 12.00)
  RETURNING created_by INTO v_author;
  IF v_author IS DISTINCT FROM '22222222-2222-2222-2222-2222222222a1'::uuid THEN
    RAISE EXCEPTION '[FALHA] created_by não foi preenchido com o perfil do chamador (%)', v_author;
  END IF;

  SELECT count(*) INTO v_antes FROM public.contact_purchases;

  -- 3.3 em nome de OUTRO: negado (42501) e nada gravado
  BEGIN
    INSERT INTO public.contact_purchases (id, contact_id, title, amount, created_by)
    VALUES ('55555555-5555-5555-5555-5555555555a3', '33333333-3333-3333-3333-3333333333c1',
            'compra em nome do B', 13.00, '22222222-2222-2222-2222-2222222222b1');
    RAISE EXCEPTION '[FALHA] A gravou compra EM NOME DO B — o defeito continua';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  -- 3.4 contato que não é dele: negado
  BEGIN
    INSERT INTO public.contact_purchases (id, contact_id, title, amount, created_by)
    VALUES ('55555555-5555-5555-5555-5555555555a4', '33333333-3333-3333-3333-3333333333c3',
            'compra no contato do B', 14.00, '22222222-2222-2222-2222-2222222222a1');
    RAISE EXCEPTION '[FALHA] A gravou compra no contato de B';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  SELECT count(*) INTO v_n FROM public.contact_purchases;
  IF v_n <> v_antes THEN
    RAISE EXCEPTION '[FALHA] INSERT negado deixou linha para trás (antes=%, depois=%)', v_antes, v_n;
  END IF;

  RESET ROLE;
  RAISE NOTICE '[PASS] BLOCO 3 — A grava no próprio nome, autor nulo é preenchido, nome de outro é negado';
END $$;

-- 3.5/3.6 — o admin também não grava em nome de outro
DO $$
DECLARE
  v_n integer;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-1111111111c1","role":"authenticated"}', true);
  SET LOCAL ROLE authenticated;

  -- 3.5 admin grava no próprio nome: passa
  INSERT INTO public.contact_purchases (id, contact_id, title, amount, created_by)
  VALUES ('55555555-5555-5555-5555-5555555555c1', '33333333-3333-3333-3333-3333333333c1',
          'compra do admin', 21.00, '22222222-2222-2222-2222-2222222222c1');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN
    RAISE EXCEPTION '[FALHA] admin não conseguiu registrar a própria compra (linhas=%)', v_n;
  END IF;

  -- 3.6 admin em nome de outro: negado
  BEGIN
    INSERT INTO public.contact_purchases (id, contact_id, title, amount, created_by)
    VALUES ('55555555-5555-5555-5555-5555555555c2', '33333333-3333-3333-3333-3333333333c1',
            'admin em nome do A', 22.00, '22222222-2222-2222-2222-2222222222a1');
    RAISE EXCEPTION '[FALHA] admin gravou compra EM NOME DO A';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  RESET ROLE;
  RAISE NOTICE '[PASS] BLOCO 3.5/3.6 — admin grava no próprio nome e é barrado ao usar nome de outro';
END $$;

-- ============================================================================
-- BLOCO 4 — UPDATE: valor passa, identidade não muda
-- ============================================================================
DO $$
DECLARE
  v_n integer;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-1111111111a1","role":"authenticated"}', true);
  SET LOCAL ROLE authenticated;

  -- 4.1 valor da própria compra: passa
  UPDATE public.contact_purchases SET amount = 111.00
   WHERE id = '44444444-4444-4444-4444-4444444444a1';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN
    RAISE EXCEPTION '[FALHA] A não conseguiu editar o valor da própria compra (linhas=%)', v_n;
  END IF;

  -- 4.2 reafirmar o próprio autor não é mudança: passa
  UPDATE public.contact_purchases SET created_by = '22222222-2222-2222-2222-2222222222a1'
   WHERE id = '44444444-4444-4444-4444-4444444444a1';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN
    RAISE EXCEPTION '[FALHA] reafirmar o próprio autor foi barrado (linhas=%)', v_n;
  END IF;

  -- 4.3 assumir compra legada sem autor: recusado (autor é imutável)
  BEGIN
    UPDATE public.contact_purchases SET created_by = '22222222-2222-2222-2222-2222222222a1'
     WHERE id = '44444444-4444-4444-4444-4444444444e1';
    RAISE EXCEPTION '[FALHA] A assumiu compra sem autor (created_by mudou)';
  EXCEPTION
    WHEN check_violation THEN NULL;
    WHEN insufficient_privilege THEN NULL;
  END;

  -- 4.4 mover a compra para outro contato visível: recusado
  BEGIN
    UPDATE public.contact_purchases SET contact_id = '33333333-3333-3333-3333-3333333333c2'
     WHERE id = '44444444-4444-4444-4444-4444444444a1';
    RAISE EXCEPTION '[FALHA] A moveu a compra para outro contato';
  EXCEPTION
    WHEN check_violation THEN NULL;
    WHEN insufficient_privilege THEN NULL;
  END;

  -- 4.5 mover a compra para contato fora do alcance dele: recusado
  BEGIN
    UPDATE public.contact_purchases SET contact_id = '33333333-3333-3333-3333-3333333333c4'
     WHERE id = '44444444-4444-4444-4444-4444444444a1';
    RAISE EXCEPTION '[FALHA] A moveu a compra para contato que não é dele';
  EXCEPTION
    WHEN check_violation THEN NULL;
    WHEN insufficient_privilege THEN NULL;
  END;

  -- a compra continua no contato original, com o valor novo e o mesmo autor
  IF NOT EXISTS (SELECT 1 FROM public.contact_purchases
                  WHERE id = '44444444-4444-4444-4444-4444444444a1'
                    AND contact_id = '33333333-3333-3333-3333-3333333333c1'
                    AND amount = 111.00
                    AND created_by = '22222222-2222-2222-2222-2222222222a1') THEN
    RAISE EXCEPTION '[FALHA] a compra do A foi alterada de identidade por um caminho negado';
  END IF;

  RESET ROLE;
  RAISE NOTICE '[PASS] BLOCO 4 — UPDATE de valor passa; trocar autor ou contato é recusado';
END $$;

-- 4.6/4.7 — admin: edita valor alheio (não é regressão), não troca identidade
DO $$
DECLARE
  v_n integer;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-1111111111c1","role":"authenticated"}', true);
  SET LOCAL ROLE authenticated;

  -- 4.6 admin edita o valor de compra registrada pelo B: passa (nenhum acesso legítimo caiu)
  UPDATE public.contact_purchases SET amount = 222.00
   WHERE id = '44444444-4444-4444-4444-4444444444b1';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN
    RAISE EXCEPTION '[FALHA] regressão: admin perdeu acesso de UPDATE em compra de outro autor (linhas=%)', v_n;
  END IF;

  -- 4.7 admin trocando o autor: recusado
  BEGIN
    UPDATE public.contact_purchases SET created_by = '22222222-2222-2222-2222-2222222222c1'
     WHERE id = '44444444-4444-4444-4444-4444444444b1';
    RAISE EXCEPTION '[FALHA] admin trocou o autor da compra';
  EXCEPTION
    WHEN check_violation THEN NULL;
    WHEN insufficient_privilege THEN NULL;
  END;

  -- 4.8 admin trocando o contato: recusado
  BEGIN
    UPDATE public.contact_purchases SET contact_id = '33333333-3333-3333-3333-3333333333c1'
     WHERE id = '44444444-4444-4444-4444-4444444444b1';
    RAISE EXCEPTION '[FALHA] admin moveu a compra de contato';
  EXCEPTION
    WHEN check_violation THEN NULL;
    WHEN insufficient_privilege THEN NULL;
  END;

  RESET ROLE;
  RAISE NOTICE '[PASS] BLOCO 4.6/4.7/4.8 — admin edita valor alheio e não troca autor nem contato';
END $$;

-- ============================================================================
-- BLOCO 5 — DELETE: o autor ou o admin
-- ============================================================================
DO $$
DECLARE
  v_n integer;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-1111111111a1","role":"authenticated"}', true);
  SET LOCAL ROLE authenticated;

  -- 5.1 o autor apaga o que registrou
  DELETE FROM public.contact_purchases WHERE id = '44444444-4444-4444-4444-4444444444d1';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN
    RAISE EXCEPTION '[FALHA] A não conseguiu apagar a própria compra (linhas=%)', v_n;
  END IF;

  -- 5.2 compra de OUTRO agente no mesmo contato: 0 linhas (era o defeito)
  DELETE FROM public.contact_purchases WHERE id = '44444444-4444-4444-4444-4444444444d2';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 0 THEN
    RAISE EXCEPTION '[FALHA] A apagou compra registrada pelo B (linhas=%) — o defeito continua', v_n;
  END IF;

  -- 5.3 compra legada sem autor: só admin
  DELETE FROM public.contact_purchases WHERE id = '44444444-4444-4444-4444-4444444444d3';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 0 THEN
    RAISE EXCEPTION '[FALHA] A apagou compra de autor desconhecido (linhas=%)', v_n;
  END IF;

  -- 5.4 contato que não é dele: 0 linhas
  DELETE FROM public.contact_purchases WHERE id = '44444444-4444-4444-4444-4444444444b1';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 0 THEN
    RAISE EXCEPTION '[FALHA] A apagou compra de contato que não é dele (linhas=%)', v_n;
  END IF;

  RESET ROLE;
  RAISE NOTICE '[PASS] BLOCO 5 — A apaga só o que registrou';
END $$;

DO $$
DECLARE
  v_n integer;
BEGIN
  -- 5.5 admin apaga qualquer uma
  PERFORM set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-1111111111c1","role":"authenticated"}', true);
  SET LOCAL ROLE authenticated;

  DELETE FROM public.contact_purchases WHERE id = '44444444-4444-4444-4444-4444444444d2';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN
    RAISE EXCEPTION '[FALHA] admin não apagou compra de outro autor (linhas=%)', v_n;
  END IF;

  RESET ROLE;
  RAISE NOTICE '[PASS] BLOCO 5.5 — admin apaga qualquer compra';
END $$;

DO $$
DECLARE
  v_n integer;
BEGIN
  -- 5.6 B é o autor de uma compra num contato que ele NÃO enxerga: 0 linhas
  PERFORM set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-1111111111b1","role":"authenticated"}', true);
  SET LOCAL ROLE authenticated;

  DELETE FROM public.contact_purchases WHERE id = '44444444-4444-4444-4444-4444444444f1';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 0 THEN
    RAISE EXCEPTION '[FALHA] B apagou compra de contato que não enxerga (linhas=%)', v_n;
  END IF;

  RESET ROLE;
  RAISE NOTICE '[PASS] BLOCO 5.6 — autor sem visibilidade do contato não apaga';
END $$;

-- ============================================================================
-- BLOCO 5.7 — SUPERVISOR (papel real, cai em is_admin_or_supervisor): grava e
-- apaga compra de contato que não é dele e continua barrado em nome de outro
-- ============================================================================
DO $$
DECLARE
  v_n integer;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-1111111111d1","role":"authenticated"}', true);
  SET LOCAL ROLE authenticated;

  IF current_user <> 'authenticated' THEN
    RAISE EXCEPTION '[FALHA] esperava rodar como authenticated, rodou como %', current_user;
  END IF;

  -- 5.7.1 grava no PRÓPRIO nome num contato que não é dele (c2 é do B)
  INSERT INTO public.contact_purchases (id, contact_id, title, created_by)
  VALUES ('44444444-4444-4444-4444-4444444444aa', '33333333-3333-3333-3333-3333333333c3',
          'compra pelo supervisor', '22222222-2222-2222-2222-2222222222d1');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN
    RAISE EXCEPTION '[FALHA] supervisor deveria gravar compra no próprio nome (linhas=%)', v_n;
  END IF;

  -- 5.7.2 ... e NÃO grava em nome de outro
  BEGIN
    INSERT INTO public.contact_purchases (id, contact_id, title, created_by)
    VALUES ('44444444-4444-4444-4444-4444444444ab', '33333333-3333-3333-3333-3333333333c3',
            'em nome do A (supervisor)', '22222222-2222-2222-2222-2222222222a1');
    RAISE EXCEPTION '[FALHA] supervisor gravou compra em nome de outro';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  -- 5.7.3 edita valor de compra alheia (sem regressão de acesso)
  UPDATE public.contact_purchases SET amount = 77.70
   WHERE id = '44444444-4444-4444-4444-4444444444f1';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN
    RAISE EXCEPTION '[FALHA] supervisor deveria editar valor de compra alheia (linhas=%)', v_n;
  END IF;

  -- 5.7.4 ... mas não troca o autor
  BEGIN
    UPDATE public.contact_purchases SET created_by = '22222222-2222-2222-2222-2222222222d1'
     WHERE id = '44444444-4444-4444-4444-4444444444f1';
    RAISE EXCEPTION '[FALHA] supervisor trocou o autor da compra';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;

  -- 5.7.5 apaga compra alheia
  DELETE FROM public.contact_purchases WHERE id = '44444444-4444-4444-4444-4444444444f1';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN
    RAISE EXCEPTION '[FALHA] supervisor deveria apagar compra alheia (linhas=%)', v_n;
  END IF;

  RESET ROLE;
  RAISE NOTICE '[PASS] BLOCO 5.7 — supervisor grava e apaga compra de contato alheio e é barrado em nome de outro';
END $$;

-- ============================================================================
-- BLOCO 6 — anon: nada lê, nada grava
-- ============================================================================
DO $$
DECLARE
  v_n integer := 0;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  SET LOCAL ROLE anon;

  BEGIN
    SELECT count(*) INTO v_n FROM public.contact_purchases;
  EXCEPTION
    WHEN insufficient_privilege THEN v_n := 0;
  END;
  IF v_n <> 0 THEN
    RAISE EXCEPTION '[FALHA] anon leu % compras', v_n;
  END IF;

  BEGIN
    INSERT INTO public.contact_purchases (id, contact_id, title, created_by)
    VALUES ('66666666-6666-6666-6666-6666666666a1', '33333333-3333-3333-3333-3333333333c1',
            'anon gravando', '22222222-2222-2222-2222-2222222222a1');
    RAISE EXCEPTION '[FALHA] anon gravou compra';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    DELETE FROM public.contact_purchases WHERE id = '44444444-4444-4444-4444-4444444444f2';
    GET DIAGNOSTICS v_n = ROW_COUNT;
  EXCEPTION
    WHEN insufficient_privilege THEN v_n := 0;
  END;
  IF v_n <> 0 THEN
    RAISE EXCEPTION '[FALHA] anon apagou compra';
  END IF;

  RESET ROLE;
  RAISE NOTICE '[PASS] BLOCO 6 — anon não lê nem grava compras';
END $$;

-- ============================================================================
-- BLOCO 7 — caminho de servidor (service_role, sem JWT) continua gravando
-- ============================================================================
DO $$
DECLARE
  v_n integer;
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  SET LOCAL ROLE service_role;

  INSERT INTO public.contact_purchases (id, contact_id, title, created_by)
  VALUES ('77777777-7777-7777-7777-7777777777a1', '33333333-3333-3333-3333-3333333333c1',
          'compra do sistema sem autor', NULL);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN
    RAISE EXCEPTION '[FALHA] servidor não gravou compra sem autor (linhas=%)', v_n;
  END IF;

  INSERT INTO public.contact_purchases (id, contact_id, title, created_by)
  VALUES ('77777777-7777-7777-7777-7777777777a2', '33333333-3333-3333-3333-3333333333c1',
          'compra do sistema em nome do A', '22222222-2222-2222-2222-2222222222a1');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN
    RAISE EXCEPTION '[FALHA] servidor não gravou compra em nome de terceiro (linhas=%)', v_n;
  END IF;

  RESET ROLE;
  RAISE NOTICE '[PASS] BLOCO 7 — service_role (sem JWT) segue gravando como antes';
END $$;

-- ============================================================================
-- BLOCO 8 — ROLLBACK DE VERDADE (verbatim do cabeçalho da migration)
-- ============================================================================
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true);

drop trigger if exists guard_contact_purchase_identity_update on public.contact_purchases;
drop trigger if exists guard_contact_purchase_identity_insert on public.contact_purchases;
drop function if exists public.guard_contact_purchase_identity();
drop policy if exists "Agents can insert purchases for assigned contacts" on public.contact_purchases;
drop policy if exists "Agents can delete purchases for assigned contacts" on public.contact_purchases;
create policy "Agents can insert purchases for assigned contacts" on public.contact_purchases for insert to authenticated with check (is_contact_visible_to_user(contact_id, auth.uid()) or is_admin_or_supervisor(auth.uid()));
create policy "Agents can delete purchases for assigned contacts" on public.contact_purchases for delete to authenticated using (is_contact_visible_to_user(contact_id, auth.uid()) or is_admin_or_supervisor(auth.uid()));

DO $$
BEGIN
  IF to_regprocedure('public.guard_contact_purchase_identity()') IS NOT NULL THEN
    RAISE EXCEPTION '[FALHA] rollback não derrubou a função de guarda';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger
              WHERE tgrelid = 'public.contact_purchases'::regclass
                AND tgname LIKE 'guard_contact_purchase_identity%'
                AND NOT tgisinternal) THEN
    RAISE EXCEPTION '[FALHA] rollback não derrubou os gatilhos de identidade';
  END IF;
  IF (SELECT with_check FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'contact_purchases'
         AND policyname = 'Agents can insert purchases for assigned contacts') LIKE '%created_by%' THEN
    RAISE EXCEPTION '[FALHA] rollback não devolveu a policy de INSERT ao texto antigo';
  END IF;
  IF (SELECT qual FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'contact_purchases'
         AND policyname = 'Agents can delete purchases for assigned contacts') LIKE '%created_by%' THEN
    RAISE EXCEPTION '[FALHA] rollback não devolveu a policy de DELETE ao texto antigo';
  END IF;
  RAISE NOTICE '[PASS] BLOCO 8 — rollback derruba função, gatilhos e devolve as policies antigas';
END $$;

-- e o DEFEITO VOLTA (vermelho-antes): sem o conserto, A grava em nome de B e apaga compra de B
DO $$
DECLARE
  v_n integer;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-1111111111a1","role":"authenticated"}', true);
  SET LOCAL ROLE authenticated;

  INSERT INTO public.contact_purchases (id, contact_id, title, created_by)
  VALUES ('88888888-8888-8888-8888-8888888888a1', '33333333-3333-3333-3333-3333333333c1',
          'em nome do B sem o conserto', '22222222-2222-2222-2222-2222222222b1');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN
    RAISE EXCEPTION '[FALHA] o estado pré-conserto deveria aceitar compra em nome de outro (linhas=%)', v_n;
  END IF;

  DELETE FROM public.contact_purchases WHERE id = '44444444-4444-4444-4444-4444444444f2';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN
    RAISE EXCEPTION '[FALHA] o estado pré-conserto deveria aceitar apagar compra alheia (linhas=%)', v_n;
  END IF;

  RESET ROLE;
  RAISE NOTICE '[PASS] BLOCO 8 — sem o conserto, A grava em nome de B e apaga compra alheia: é o defeito que os BLOCOS 3.6 e 5.2 barram';
END $$;

ROLLBACK;
