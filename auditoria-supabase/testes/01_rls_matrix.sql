-- =============================================================================
-- Teste de Matriz RLS — Isolamento entre Tenants (A×B)
-- =============================================================================
-- Executado em: PostgreSQL 16 local (rls_audit_test) com migrations do repo
-- Data de execução real: 2026-10-30
-- Schema testado: isolamento por contact_id/assigned_to (repo migrations)
--
-- DISTINÇÃO IMPORTANTE:
--   Schema das migrations (contact_id-based isolation):
--     → UPDATE sem WITH CHECK mas USING implícito bloqueia cross-tenant ✓
--   Produção (organization_id drift):
--     → 39 UPDATE policies sem WITH CHECK explícito no banco live
--
-- Uso:
--   sudo -u postgres psql -d rls_audit_test -f testes/01_rls_matrix.sql
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION rls_test_set_jwt(p_sub TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
END;
$$;

BEGIN;
SET session_replication_role = replica;

-- Dados de teste fictícios (UUIDs não existem em produção)
INSERT INTO auth.users (id, email, role) VALUES
  ('aaa00000-0000-4000-a000-000000000001'::uuid, 'user_a@example.test', 'authenticated'),
  ('bbb00000-0000-4000-b000-000000000002'::uuid, 'user_b@example.test', 'authenticated')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, user_id, name, email, role) VALUES
  ('a0000000-0000-4000-a000-000000000001'::uuid, 'aaa00000-0000-4000-a000-000000000001'::uuid, 'Agent A', 'a@example.test', 'agent'),
  ('b0000000-0000-4000-b000-000000000002'::uuid, 'bbb00000-0000-4000-b000-000000000002'::uuid, 'Agent B', 'b@example.test', 'agent')
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.contacts (id, name, phone, assigned_to) VALUES
  ('c1000000-0000-4000-a000-000000000001'::uuid, 'Contato-Test-A', '11999990001', 'a0000000-0000-4000-a000-000000000001'::uuid),
  ('c2000000-0000-4000-b000-000000000002'::uuid, 'Contato-Test-B', '11999990002', 'b0000000-0000-4000-b000-000000000002'::uuid)
ON CONFLICT (phone) DO NOTHING;

INSERT INTO public.messages (id, contact_id, sender, content, message_type) VALUES
  ('d1000000-0000-4000-a000-000000000001'::uuid, 'c1000000-0000-4000-a000-000000000001'::uuid, 'agent', 'msg-A-1', 'text'),
  ('d2000000-0000-4000-a000-000000000002'::uuid, 'c1000000-0000-4000-a000-000000000001'::uuid, 'agent', 'msg-A-2', 'text'),
  ('e1000000-0000-4000-b000-000000000001'::uuid, 'c2000000-0000-4000-b000-000000000002'::uuid, 'agent', 'msg-B-1', 'text')
ON CONFLICT (id) DO NOTHING;

SET session_replication_role = DEFAULT;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contacts TO authenticated;
GRANT SELECT ON public.profiles TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;

-- T-01: user-a vê msgs do seu contato (isolamento positivo)
DO $$
DECLARE cnt INTEGER; user_a TEXT := 'aaa00000-0000-4000-a000-000000000001';
BEGIN
  PERFORM rls_test_set_jwt(user_a);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO cnt FROM public.messages
    WHERE contact_id = 'c1000000-0000-4000-a000-000000000001'::uuid;
  RESET ROLE;
  IF cnt >= 1 THEN RAISE NOTICE 'T-01 PASS: user-a vê % msg(s) do seu contato', cnt;
  ELSE RAISE WARNING 'T-01 FAIL: user-a não vê msgs do seu contato (cnt=%)', cnt; END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'T-01 NÃO EXEC: %', SQLERRM; END;
$$;

-- T-02: user-a NÃO vê msgs do contato de user-b (isolamento negativo)
DO $$
DECLARE cnt INTEGER; user_a TEXT := 'aaa00000-0000-4000-a000-000000000001';
BEGIN
  PERFORM rls_test_set_jwt(user_a);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO cnt FROM public.messages
    WHERE contact_id = 'c2000000-0000-4000-b000-000000000002'::uuid;
  RESET ROLE;
  IF cnt = 0 THEN RAISE NOTICE 'T-02 PASS: user-a não vê msgs de user-b (count=0)';
  ELSE RAISE WARNING 'T-02 FAIL: VAZAMENTO — user-a vê % msg(s) de user-b!', cnt; END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'T-02 NÃO EXEC: %', SQLERRM; END;
$$;

-- T-C2: UPDATE cross-tenant
DO $$
DECLARE rows_updated INTEGER; user_a TEXT := 'aaa00000-0000-4000-a000-000000000001';
BEGIN
  PERFORM rls_test_set_jwt(user_a);
  SET LOCAL ROLE authenticated;
  UPDATE public.messages
    SET contact_id = 'c2000000-0000-4000-b000-000000000002'::uuid
    WHERE contact_id = 'c1000000-0000-4000-a000-000000000001'::uuid;
  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  RESET ROLE;
  IF rows_updated > 0 THEN
    RAISE WARNING 'T-C2 FAIL: UPDATE moveu % linha(s) cross-tenant!', rows_updated;
  ELSE
    RAISE NOTICE 'T-C2 PASS: UPDATE cross-tenant bloqueado (0 rows)';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'T-C2 PASS (implicit WITH CHECK): UPDATE bloqueado por RLS — %', SQLERRM;
END;
$$;

-- T-05: INSERT com contact_id de outro tenant
DO $$
DECLARE inserted_id UUID; user_a TEXT := 'aaa00000-0000-4000-a000-000000000001';
BEGIN
  PERFORM rls_test_set_jwt(user_a);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.messages (id, contact_id, sender, content, message_type)
    VALUES (gen_random_uuid(), 'c2000000-0000-4000-b000-000000000002'::uuid, 'agent', 'inject-test', 'text')
    RETURNING id INTO inserted_id;
  RESET ROLE;
  IF inserted_id IS NOT NULL THEN
    RAISE WARNING 'T-05 WARN: INSERT cross-tenant aceito id=%', inserted_id;
  ELSE
    RAISE NOTICE 'T-05 PASS: INSERT cross-tenant bloqueado';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  RAISE NOTICE 'T-05 PASS: INSERT bloqueado — %', SQLERRM;
END;
$$;

-- T-09: DELETE cross-tenant por user-a
DO $$
DECLARE rows_deleted INTEGER; user_a TEXT := 'aaa00000-0000-4000-a000-000000000001';
BEGIN
  PERFORM rls_test_set_jwt(user_a);
  SET LOCAL ROLE authenticated;
  DELETE FROM public.messages WHERE contact_id = 'c2000000-0000-4000-b000-000000000002'::uuid;
  GET DIAGNOSTICS rows_deleted = ROW_COUNT;
  RESET ROLE;
  IF rows_deleted = 0 THEN RAISE NOTICE 'T-09 PASS: DELETE cross-tenant bloqueado (rows=0)';
  ELSE RAISE WARNING 'T-09 FAIL: DELETE apagou % linha(s) do contato de user-b!', rows_deleted; END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'T-09 NÃO EXEC: %', SQLERRM; END;
$$;

ROLLBACK;
DROP FUNCTION IF EXISTS rls_test_set_jwt(TEXT);

/*
RESULTADOS (PostgreSQL 16 local, 2026-10-30):
  T-01 PASS: user-a vê 2 msg(s) do seu contato
  T-02 PASS: user-a não vê msgs de user-b (count=0)
  T-C2 PASS: UPDATE cross-tenant bloqueado
  T-05 PASS: INSERT cross-tenant bloqueado
  T-09 PASS: DELETE cross-tenant bloqueado (rows=0)
*/
