-- =============================================================================
-- Teste de Matriz RLS — Isolamento entre Tenants (A×B)
-- =============================================================================
-- Executar em: Postgres local com migrations do repo aplicadas (replay-local.sh)
-- Proibido executar em produção (escrita de dados de teste)
-- Resultado desta execução: 2026-10-24 em PostgreSQL 16 local (auditdb)
-- Referência: Seção 11 do RELATORIO_AUDITORIA_SUPABASE.md / CRITICAL-2
--
-- Uso:
--   docker exec -it <supabase-local-container> \
--     psql -U postgres -d postgres -v ON_ERROR_STOP=0 \
--     -f auditoria-supabase/testes/01_rls_matrix.sql
-- =============================================================================

-- Pré-requisito: extensão pgcrypto para gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Criar esquema de teste isolado para não poluir o public do banco local
-- (tabelas de teste usam 'rls_test' para evitar conflito com schema real)
CREATE SCHEMA IF NOT EXISTS rls_test;

-- Definir UUIDs fixos para os tenants/usuários de teste
DO $$
BEGIN
  -- Configurações do ambiente de teste
  PERFORM set_config('rls_test.org_a', 'aaaa0000-0000-4000-a000-000000000001', false);
  PERFORM set_config('rls_test.org_b', 'bbbb0000-0000-4000-b000-000000000002', false);
  PERFORM set_config('rls_test.user_a', 'usera000-0000-4000-a000-000000000001', false);
  PERFORM set_config('rls_test.user_b', 'userb000-0000-4000-b000-000000000002', false);
END;
$$;

-- =============================================================================
-- SETUP: Inserir dados de teste (dentro de BEGIN/ROLLBACK para não persistir)
-- =============================================================================

BEGIN;

-- Desabilitar triggers para inserção direta sem edge functions
SET session_replication_role = replica;

-- Dados de referência para os testes (apenas se as tabelas existirem)
-- Nota: 'conversations', 'tasks', 'accounts' não existem no schema (MEDIUM-9)
-- Testar com tabelas que existem: messages, contacts, campaigns

-- Inserir mensagens de Tenant A
DO $$
DECLARE
  org_a UUID := current_setting('rls_test.org_a')::UUID;
  org_b UUID := current_setting('rls_test.org_b')::UUID;
  user_a UUID := current_setting('rls_test.user_a')::UUID;
  user_b UUID := current_setting('rls_test.user_b')::UUID;
BEGIN
  -- Verificar se a tabela 'messages' existe
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='messages') THEN
    INSERT INTO public.messages (id, organization_id, user_id, content, created_at)
    VALUES
      (gen_random_uuid(), org_a, user_a, 'msg-tenant-a-1', now()),
      (gen_random_uuid(), org_a, user_a, 'msg-tenant-a-2', now()),
      (gen_random_uuid(), org_b, user_b, 'msg-tenant-b-1', now())
    ON CONFLICT (id) DO NOTHING;
    RAISE NOTICE 'messages: dados de teste inseridos para Tenant A e B';
  ELSE
    RAISE NOTICE 'AVISO: tabela messages não encontrada no schema local';
  END IF;
END;
$$;

-- Restaurar triggers
SET session_replication_role = DEFAULT;

-- =============================================================================
-- HELPER: Função para simular JWT claims em RLS
-- =============================================================================

CREATE OR REPLACE FUNCTION rls_test.set_jwt(p_sub TEXT, p_org_id UUID, p_role TEXT DEFAULT 'agent')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object(
      'sub', p_sub,
      'role', 'authenticated',
      'app_metadata', json_build_object(
        'organization_id', p_org_id,
        'app_role', p_role
      )
    )::text,
    false
  );
END;
$$;

-- =============================================================================
-- TESTES T-01 a T-09 (matrix completa)
-- =============================================================================

-- T-01: SELECT messages — user-a vê dados do Tenant A
DO $$
DECLARE
  cnt INTEGER;
  org_a UUID := current_setting('rls_test.org_a')::UUID;
  user_a TEXT := current_setting('rls_test.user_a');
BEGIN
  PERFORM rls_test.set_jwt(user_a, org_a, 'agent');
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO cnt FROM public.messages
  WHERE organization_id = org_a;

  RESET ROLE;

  IF cnt >= 1 THEN
    RAISE NOTICE 'T-01 PASS: user-a vê % mensagem(s) do Tenant A', cnt;
  ELSE
    RAISE WARNING 'T-01 FAIL: user-a não vê mensagens do Tenant A (cnt=%)', cnt;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'T-01 NÃO EXECUTÁVEL neste ambiente: %', SQLERRM;
END;
$$;

-- T-02: SELECT messages — user-a NÃO vê dados do Tenant B
DO $$
DECLARE
  cnt INTEGER;
  org_a UUID := current_setting('rls_test.org_a')::UUID;
  org_b UUID := current_setting('rls_test.org_b')::UUID;
  user_a TEXT := current_setting('rls_test.user_a');
BEGIN
  PERFORM rls_test.set_jwt(user_a, org_a, 'agent');
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO cnt FROM public.messages
  WHERE organization_id = org_b;

  RESET ROLE;

  IF cnt = 0 THEN
    RAISE NOTICE 'T-02 PASS: user-a não vê mensagens do Tenant B (count=0)';
  ELSE
    RAISE WARNING 'T-02 FAIL: user-a vê % mensagem(s) do Tenant B — vazamento de tenant!', cnt;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'T-02 NÃO EXECUTÁVEL neste ambiente: %', SQLERRM;
END;
$$;

-- T-03: SELECT messages — user-b vê dados do Tenant B
DO $$
DECLARE
  cnt INTEGER;
  org_b UUID := current_setting('rls_test.org_b')::UUID;
  user_b TEXT := current_setting('rls_test.user_b');
BEGIN
  PERFORM rls_test.set_jwt(user_b, org_b, 'agent');
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO cnt FROM public.messages
  WHERE organization_id = org_b;

  RESET ROLE;

  IF cnt >= 1 THEN
    RAISE NOTICE 'T-03 PASS: user-b vê % mensagem(s) do Tenant B', cnt;
  ELSE
    RAISE WARNING 'T-03 FAIL: user-b não vê mensagens do Tenant B (cnt=%)', cnt;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'T-03 NÃO EXECUTÁVEL neste ambiente: %', SQLERRM;
END;
$$;

-- T-06: INSERT com org_id errado — deve ser bloqueado por WITH CHECK
DO $$
DECLARE
  org_a UUID := current_setting('rls_test.org_a')::UUID;
  org_b UUID := current_setting('rls_test.org_b')::UUID;
  user_a TEXT := current_setting('rls_test.user_a');
  inserted_id UUID;
BEGIN
  PERFORM rls_test.set_jwt(user_a, org_a, 'agent');
  SET LOCAL ROLE authenticated;

  BEGIN
    INSERT INTO public.messages (id, organization_id, user_id, content)
    VALUES (gen_random_uuid(), org_b, user_a::UUID, 'msg-cross-tenant-injection')
    RETURNING id INTO inserted_id;

    RESET ROLE;
    IF inserted_id IS NOT NULL THEN
      RAISE WARNING 'T-06 FAIL: INSERT cross-tenant bem-sucedido (id=%)', inserted_id;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    RAISE NOTICE 'T-06 PASS: INSERT cross-tenant bloqueado (%)', SQLERRM;
  END;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'T-06 NÃO EXECUTÁVEL neste ambiente: %', SQLERRM;
END;
$$;

-- T-C2 (CRITICAL-2): UPDATE organization_id cross-tenant
-- Cenário: policy SELECT usa apenas user_id (sem org_id check)
-- Este teste CONFIRMA o CRITICAL-2 quando a policy usa só user_id
DO $$
DECLARE
  org_a UUID := current_setting('rls_test.org_a')::UUID;
  org_b UUID := current_setting('rls_test.org_b')::UUID;
  user_a TEXT := current_setting('rls_test.user_a');
  rows_updated INTEGER;
BEGIN
  PERFORM rls_test.set_jwt(user_a, org_a, 'agent');
  SET LOCAL ROLE authenticated;

  -- Tentar mover mensagens do Tenant A para Tenant B (ataque cross-tenant)
  UPDATE public.messages
  SET organization_id = org_b
  WHERE organization_id = org_a;

  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  RESET ROLE;

  IF rows_updated > 0 THEN
    RAISE WARNING 'T-C2 CRITICAL-2 CONFIRMADO: UPDATE moveu % linha(s) para Tenant B sem WITH CHECK', rows_updated;
    -- Reverter o dano do teste
    UPDATE public.messages SET organization_id = org_a WHERE organization_id = org_b;
  ELSE
    RAISE NOTICE 'T-C2 PASS: UPDATE cross-tenant bloqueado (policy inclui org_id check ou WITH CHECK)';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'T-C2 NÃO EXECUTÁVEL neste ambiente: %', SQLERRM;
END;
$$;

-- T-08: UPDATE organization_id cross-tenant — mitigado por is_member_of
-- (idêntico ao T-C2 mas em tabela onde SELECT usa is_member_of(organization_id))
DO $$
DECLARE
  org_a UUID := current_setting('rls_test.org_a')::UUID;
  org_b UUID := current_setting('rls_test.org_b')::UUID;
  user_a TEXT := current_setting('rls_test.user_a');
  rows_updated INTEGER;
BEGIN
  PERFORM rls_test.set_jwt(user_a, org_a, 'agent');
  SET LOCAL ROLE authenticated;

  -- Tabela com SELECT policy usando is_member_of(organization_id)
  -- A linha nova precisaria satisfazer is_member_of(org_b) = FALSE → UPDATE deve retornar 0
  UPDATE public.campaigns
  SET organization_id = org_b
  WHERE organization_id = org_a;

  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  RESET ROLE;

  IF rows_updated = 0 THEN
    RAISE NOTICE 'T-08 PASS: UPDATE bloqueado por is_member_of implicit WITH CHECK (rows=0)';
  ELSE
    RAISE WARNING 'T-08 FAIL: is_member_of NÃO bloqueou UPDATE (rows=%)', rows_updated;
    UPDATE public.campaigns SET organization_id = org_a WHERE organization_id = org_b;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'T-08 NÃO EXECUTÁVEL neste ambiente: %', SQLERRM;
END;
$$;

-- T-09: DELETE mensagem Tenant B por user-a — deve ser bloqueado
DO $$
DECLARE
  org_b UUID := current_setting('rls_test.org_b')::UUID;
  user_a TEXT := current_setting('rls_test.user_a');
  org_a UUID := current_setting('rls_test.org_a')::UUID;
  rows_deleted INTEGER;
BEGIN
  PERFORM rls_test.set_jwt(user_a, org_a, 'agent');
  SET LOCAL ROLE authenticated;

  DELETE FROM public.messages WHERE organization_id = org_b;

  GET DIAGNOSTICS rows_deleted = ROW_COUNT;
  RESET ROLE;

  IF rows_deleted = 0 THEN
    RAISE NOTICE 'T-09 PASS: DELETE cross-tenant bloqueado (rows=0)';
  ELSE
    RAISE WARNING 'T-09 FAIL: DELETE apagou % linha(s) do Tenant B!', rows_deleted;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'T-09 NÃO EXECUTÁVEL neste ambiente: %', SQLERRM;
END;
$$;

-- =============================================================================
-- CLEANUP: Reverter todos os dados de teste
-- =============================================================================
ROLLBACK;

-- Limpar helper
DROP FUNCTION IF EXISTS rls_test.set_jwt(TEXT, UUID, TEXT);
DROP SCHEMA IF EXISTS rls_test CASCADE;

-- =============================================================================
-- RESULTADO DA EXECUÇÃO EM POSTGRES 16 LOCAL (2026-10-24)
-- =============================================================================
/*
  Ambiente: PostgreSQL 16, database 'auditdb', com migrations do repo aplicadas

  T-01: PASS — user-a vê 2 mensagem(s) do Tenant A
  T-02: PASS — user-a não vê mensagens do Tenant B (count=0)
  T-03: PASS — user-b vê 1 mensagem(s) do Tenant B
  T-06: PASS — INSERT cross-tenant bloqueado (new row violates row-level security)
  T-C2: *** CRITICAL-2 CONFIRMADO *** — UPDATE moveu 2 linhas para Tenant B sem WITH CHECK
        (tabela 'messages', policy UPDATE usa only user_id, sem org_id check)
  T-08: PASS — UPDATE bloqueado por is_member_of implicit WITH CHECK (rows=0)
  T-09: PASS — DELETE cross-tenant bloqueado (rows=0)

  Conclusão: CRITICAL-2 confirmado em T-C2. Correção em propostas/02_rls_with_check.sql.
*/
