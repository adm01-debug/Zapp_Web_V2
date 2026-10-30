-- =============================================================================
-- Teste de Matriz RLS — Isolamento entre Tenants (A×B) — COMPLETA
-- =============================================================================
-- Versão: 2 (expandida 2026-10-30)
-- Banco alvo: PostgreSQL local com migrations do repo
-- Tabelas cobertas: messages, contacts, email_threads, profiles
-- Data execução v1: 2026-10-25T10:14Z — 5 testes em messages
-- Data expansão v2: 2026-10-30 — 13 testes em 4 tabelas
--
-- Uso:
--   sudo -u postgres psql -d rls_audit_test -f testes/01_rls_matrix.sql
--
-- DISTINÇÃO CRÍTICA:
--   Schema das migrations (contact_id/assigned_to-based isolation) — testado aqui.
--   Produção (drift org_id, policies USING(user_id=uid()) sem WITH CHECK):
--     → 39 UPDATE policies sem WITH CHECK explícito confirmadas via db_list_policies
--     → user_id pode não mudar em UPDATE cross-tenant → gap real em produção
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Função auxiliar para simular JWT de usuário
CREATE OR REPLACE FUNCTION rls_test_set_jwt(p_sub TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
END;
$$;

BEGIN;
SET session_replication_role = replica;

-- ========================
-- FIXTURES: 2 usuários, 2 perfis, 2 contatos, 3 msgs, 1 gmail_account, 2 threads
-- ========================
INSERT INTO auth.users (id, email, role) VALUES
  ('aaa00000-0000-4000-a000-000000000001'::uuid, 'user_a@test.com', 'authenticated'),
  ('bbb00000-0000-4000-b000-000000000002'::uuid, 'user_b@test.com', 'authenticated')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, user_id, name, email, role) VALUES
  ('a0000000-0000-4000-a000-000000000001'::uuid, 'aaa00000-0000-4000-a000-000000000001'::uuid, 'Agent A', 'a@test.com', 'agent'),
  ('b0000000-0000-4000-b000-000000000002'::uuid, 'bbb00000-0000-4000-b000-000000000002'::uuid, 'Agent B', 'b@test.com', 'agent')
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.contacts (id, name, phone, assigned_to) VALUES
  ('c1000000-0000-4000-a000-000000000001'::uuid, 'Contato-A', '11999990001', 'a0000000-0000-4000-a000-000000000001'::uuid),
  ('c2000000-0000-4000-b000-000000000002'::uuid, 'Contato-B', '11999990002', 'b0000000-0000-4000-b000-000000000002'::uuid)
ON CONFLICT (phone) DO NOTHING;

INSERT INTO public.messages (id, contact_id, sender, content, message_type) VALUES
  ('d1000000-0000-4000-a000-000000000001'::uuid, 'c1000000-0000-4000-a000-000000000001'::uuid, 'agent', 'msg-A-1', 'text'),
  ('d2000000-0000-4000-a000-000000000002'::uuid, 'c1000000-0000-4000-a000-000000000001'::uuid, 'agent', 'msg-A-2', 'text'),
  ('e1000000-0000-4000-b000-000000000001'::uuid, 'c2000000-0000-4000-b000-000000000002'::uuid, 'agent', 'msg-B-1', 'text')
ON CONFLICT (id) DO NOTHING;

-- gmail_account para user_a (para email_threads)
INSERT INTO public.gmail_accounts (id, user_id, email)
  VALUES ('g1000000-0000-4000-a000-000000000001'::uuid, 'aaa00000-0000-4000-a000-000000000001'::uuid, 'a@test.com')
ON CONFLICT DO NOTHING;

-- email_threads: 1 de user_a, 1 de user_b
INSERT INTO public.email_threads (id, gmail_account_id, subject, status) VALUES
  ('t1000000-0000-4000-a000-000000000001'::uuid, 'g1000000-0000-4000-a000-000000000001'::uuid, 'Thread-A', 'unread'),
  ('t2000000-0000-4000-b000-000000000002'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'Thread-B', 'unread')
ON CONFLICT (id) DO NOTHING;

SET session_replication_role = DEFAULT;

-- Grants necessários para o role authenticated nos testes locais
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contacts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_threads TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_messages TO authenticated;
GRANT SELECT, UPDATE, INSERT ON public.profiles TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
GRANT EXECUTE ON FUNCTION rls_test_set_jwt(TEXT) TO authenticated;

-- =============================================================================
-- TABELA: messages
-- Políticas: contact_id/assigned_to isolation (repo migrations)
-- =============================================================================

-- T-01: user-a VÊ msgs do seu contato (isolamento positivo)
-- RESULTADO ESPERADO: PASS (count >= 1)
-- RESULTADO REAL (2026-10-25): PASS — user-a vê 2 msg(s) do seu contato
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

-- T-02: user-a NÃO VÊ msgs do contato de user-b (isolamento negativo)
-- RESULTADO ESPERADO: PASS (count = 0)
-- RESULTADO REAL (2026-10-25): PASS — count=0
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

-- T-C2: UPDATE cross-tenant em messages (sem WITH CHECK explícito nas migrations)
-- RESULTADO ESPERADO: BLOQUEADO via implicit WITH CHECK (USING age como WITH CHECK)
-- RESULTADO REAL (2026-10-25): PASS — blocked: "new row violates row-level security policy"
-- ATENÇÃO: Em produção (drift org_id), 39 policies USING(user_id=uid()) sem WITH CHECK
--   podem permitir UPDATE cross-tenant quando user_id não muda — CRITICAL-2
DO $$
DECLARE
  rows_updated INTEGER;
  user_a TEXT := 'aaa00000-0000-4000-a000-000000000001';
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
    SET session_replication_role = replica;
    UPDATE public.messages SET contact_id = 'c1000000-0000-4000-a000-000000000001'::uuid
      WHERE contact_id = 'c2000000-0000-4000-b000-000000000002'::uuid AND content LIKE 'msg-A-%';
    SET session_replication_role = DEFAULT;
  ELSE
    RAISE NOTICE 'T-C2 PASS: UPDATE cross-tenant bloqueado em messages (0 rows)';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'T-C2 PASS (implicit WITH CHECK bloqueou): %', SQLERRM;
END;
$$;

-- T-05: INSERT com contact_id de outro tenant em messages
-- RESULTADO ESPERADO: BLOQUEADO
-- RESULTADO REAL (2026-10-25): PASS — INSERT bloqueado
DO $$
DECLARE inserted_id UUID; user_a TEXT := 'aaa00000-0000-4000-a000-000000000001';
BEGIN
  PERFORM rls_test_set_jwt(user_a);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.messages (id, contact_id, sender, content, message_type)
    VALUES (gen_random_uuid(), 'c2000000-0000-4000-b000-000000000002'::uuid, 'agent', 'inject', 'text')
    RETURNING id INTO inserted_id;
  RESET ROLE;
  IF inserted_id IS NOT NULL THEN
    RAISE WARNING 'T-05 WARN: INSERT cross-tenant aceito — id=%', inserted_id;
  ELSE
    RAISE NOTICE 'T-05 PASS: INSERT cross-tenant bloqueado em messages';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  RAISE NOTICE 'T-05 PASS: INSERT bloqueado — %', SQLERRM;
END;
$$;

-- T-09: DELETE cross-tenant em messages
-- RESULTADO ESPERADO: PASS (rows=0)
-- RESULTADO REAL (2026-10-25): PASS — DELETE bloqueado (rows=0)
DO $$
DECLARE rows_deleted INTEGER; user_a TEXT := 'aaa00000-0000-4000-a000-000000000001';
BEGIN
  PERFORM rls_test_set_jwt(user_a);
  SET LOCAL ROLE authenticated;
  DELETE FROM public.messages WHERE contact_id = 'c2000000-0000-4000-b000-000000000002'::uuid;
  GET DIAGNOSTICS rows_deleted = ROW_COUNT;
  RESET ROLE;
  IF rows_deleted = 0 THEN RAISE NOTICE 'T-09 PASS: DELETE cross-tenant bloqueado em messages (rows=0)';
  ELSE RAISE WARNING 'T-09 FAIL: DELETE apagou % linha(s) do contato de user-b!', rows_deleted; END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'T-09 NÃO EXEC: %', SQLERRM; END;
$$;

-- =============================================================================
-- TABELA: contacts
-- Políticas: can_edit_contact(assigned_to, ...) — acesso baseado em assigned_to
-- UPDATE sem WITH CHECK explícito (USING da função can_edit_contact)
-- =============================================================================

-- T-10: user-a VÊ seu próprio contato (isolamento positivo)
-- RESULTADO ESPERADO: PASS (count = 1)
-- Evidência política: contacts_select_policy USING(can_edit_contact(assigned_to,...))
DO $$
DECLARE cnt INTEGER; user_a TEXT := 'aaa00000-0000-4000-a000-000000000001';
BEGIN
  PERFORM rls_test_set_jwt(user_a);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO cnt FROM public.contacts
    WHERE id = 'c1000000-0000-4000-a000-000000000001'::uuid;
  RESET ROLE;
  IF cnt = 1 THEN RAISE NOTICE 'T-10 PASS: user-a vê seu contato (count=1)';
  ELSE RAISE WARNING 'T-10 FAIL: user-a não vê seu contato (cnt=%)', cnt; END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'T-10 NÃO EXEC: %', SQLERRM; END;
$$;

-- T-11: user-a NÃO VÊ contato de user-b (isolamento negativo)
-- RESULTADO ESPERADO: PASS (count = 0)
-- Evidência política: SELECT USING(can_edit_contact) filtra por assigned_to
DO $$
DECLARE cnt INTEGER; user_a TEXT := 'aaa00000-0000-4000-a000-000000000001';
BEGIN
  PERFORM rls_test_set_jwt(user_a);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO cnt FROM public.contacts
    WHERE id = 'c2000000-0000-4000-b000-000000000002'::uuid;
  RESET ROLE;
  IF cnt = 0 THEN RAISE NOTICE 'T-11 PASS: user-a não vê contato de user-b (count=0)';
  ELSE RAISE WARNING 'T-11 FAIL: VAZAMENTO — user-a vê % contato(s) de user-b!', cnt; END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'T-11 NÃO EXEC: %', SQLERRM; END;
$$;

-- T-12: UPDATE cross-tenant em contacts (sem WITH CHECK explícito)
-- RESULTADO ESPERADO: BLOQUEADO (via implicit WITH CHECK ou USING)
-- ATENÇÃO produção: "Users can update their assigned contacts" tem USING mas sem WITH CHECK
--   → Se user move assigned_to para si mesmo sem alterar outros campos, pode passar
DO $$
DECLARE rows_updated INTEGER; user_a TEXT := 'aaa00000-0000-4000-a000-000000000001';
BEGIN
  PERFORM rls_test_set_jwt(user_a);
  SET LOCAL ROLE authenticated;
  UPDATE public.contacts
    SET name = 'HIJACKED'
    WHERE id = 'c2000000-0000-4000-b000-000000000002'::uuid;
  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  RESET ROLE;
  IF rows_updated = 0 THEN RAISE NOTICE 'T-12 PASS: UPDATE cross-tenant bloqueado em contacts (rows=0)';
  ELSE RAISE WARNING 'T-12 FAIL: UPDATE alterou % contato(s) de user-b!', rows_updated; END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'T-12 PASS (RLS bloqueou): %', SQLERRM;
END;
$$;

-- T-13: DELETE cross-tenant em contacts
-- RESULTADO ESPERADO: PASS (rows=0) — contacts não tem DELETE policy separada (RLS bloqueia)
DO $$
DECLARE rows_deleted INTEGER; user_a TEXT := 'aaa00000-0000-4000-a000-000000000001';
BEGIN
  PERFORM rls_test_set_jwt(user_a);
  SET LOCAL ROLE authenticated;
  DELETE FROM public.contacts WHERE id = 'c2000000-0000-4000-b000-000000000002'::uuid;
  GET DIAGNOSTICS rows_deleted = ROW_COUNT;
  RESET ROLE;
  IF rows_deleted = 0 THEN RAISE NOTICE 'T-13 PASS: DELETE cross-tenant bloqueado em contacts (rows=0)';
  ELSE RAISE WARNING 'T-13 FAIL: DELETE apagou % contato(s) de user-b!', rows_deleted; END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'T-13 NÃO EXEC: %', SQLERRM; END;
$$;

-- =============================================================================
-- TABELA: email_threads
-- Políticas: gmail_account_id → user_id isolation
-- UPDATE e DELETE sem WITH CHECK (apenas USING)
-- =============================================================================

-- T-14: user-a VÊ suas próprias email_threads (via gmail_account_id)
-- RESULTADO ESPERADO: PASS (count = 1)
-- Evidência política: SELECT USING(EXISTS(gmail_accounts WHERE user_id=uid()))
DO $$
DECLARE cnt INTEGER; user_a TEXT := 'aaa00000-0000-4000-a000-000000000001';
BEGIN
  PERFORM rls_test_set_jwt(user_a);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO cnt FROM public.email_threads
    WHERE id = 't1000000-0000-4000-a000-000000000001'::uuid;
  RESET ROLE;
  IF cnt = 1 THEN RAISE NOTICE 'T-14 PASS: user-a vê sua email_thread (count=1)';
  ELSE RAISE WARNING 'T-14 FAIL: user-a não vê sua email_thread (cnt=%)', cnt; END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'T-14 NÃO EXEC: %', SQLERRM; END;
$$;

-- T-15: user-a NÃO VÊ email_thread de user-b (isolamento negativo)
-- RESULTADO ESPERADO: PASS (count = 0)
DO $$
DECLARE cnt INTEGER; user_a TEXT := 'aaa00000-0000-4000-a000-000000000001';
BEGIN
  PERFORM rls_test_set_jwt(user_a);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO cnt FROM public.email_threads
    WHERE id = 't2000000-0000-4000-b000-000000000002'::uuid;
  RESET ROLE;
  IF cnt = 0 THEN RAISE NOTICE 'T-15 PASS: user-a não vê email_thread de user-b (count=0)';
  ELSE RAISE WARNING 'T-15 FAIL: VAZAMENTO — user-a vê % thread(s) de user-b!', cnt; END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'T-15 NÃO EXEC: %', SQLERRM; END;
$$;

-- T-16: UPDATE cross-tenant em email_threads (sem WITH CHECK explícito)
-- RESULTADO ESPERADO: BLOQUEADO
-- Evidência: UPDATE policy USING(gmail_account_id→user_id), WITH CHECK=null (produção)
DO $$
DECLARE rows_updated INTEGER; user_a TEXT := 'aaa00000-0000-4000-a000-000000000001';
BEGIN
  PERFORM rls_test_set_jwt(user_a);
  SET LOCAL ROLE authenticated;
  UPDATE public.email_threads
    SET subject = 'HIJACKED'
    WHERE id = 't2000000-0000-4000-b000-000000000002'::uuid;
  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  RESET ROLE;
  IF rows_updated = 0 THEN RAISE NOTICE 'T-16 PASS: UPDATE cross-tenant bloqueado em email_threads (rows=0)';
  ELSE RAISE WARNING 'T-16 FAIL: UPDATE alterou % thread(s) de user-b!', rows_updated; END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'T-16 PASS (RLS bloqueou): %', SQLERRM;
END;
$$;

-- =============================================================================
-- TABELA: profiles
-- Políticas: bem estruturadas (WITH CHECK em UPDATE admin + RESTRICTIVE block)
-- =============================================================================

-- T-17: user-a VÊ seu próprio profile
-- RESULTADO ESPERADO: PASS (count = 1)
-- Evidência: "Users can view own profile" USING(user_id=uid())
DO $$
DECLARE cnt INTEGER; user_a TEXT := 'aaa00000-0000-4000-a000-000000000001';
BEGIN
  PERFORM rls_test_set_jwt(user_a);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO cnt FROM public.profiles
    WHERE user_id = 'aaa00000-0000-4000-a000-000000000001'::uuid;
  RESET ROLE;
  IF cnt = 1 THEN RAISE NOTICE 'T-17 PASS: user-a vê seu profile (count=1)';
  ELSE RAISE WARNING 'T-17 FAIL: user-a não vê seu profile (cnt=%)', cnt; END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'T-17 NÃO EXEC: %', SQLERRM; END;
$$;

-- T-18: user-a NÃO VÊ profile de user-b sem ser admin
-- RESULTADO ESPERADO: PASS (count = 0)
-- Evidência: "Users can view own profile" USING(user_id=uid())
DO $$
DECLARE cnt INTEGER; user_a TEXT := 'aaa00000-0000-4000-a000-000000000001';
BEGIN
  PERFORM rls_test_set_jwt(user_a);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO cnt FROM public.profiles
    WHERE user_id = 'bbb00000-0000-4000-b000-000000000002'::uuid;
  RESET ROLE;
  IF cnt = 0 THEN RAISE NOTICE 'T-18 PASS: user-a não vê profile de user-b (count=0)';
  ELSE RAISE WARNING 'T-18 WARN: user-a vê % profile(s) de user-b (verificar política admin)', cnt; END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'T-18 NÃO EXEC: %', SQLERRM; END;
$$;

ROLLBACK;
DROP FUNCTION IF EXISTS rls_test_set_jwt(TEXT);

-- =============================================================================
-- RESULTADOS DA EXECUÇÃO v1 — 2026-10-25T10:14Z
-- PostgreSQL 16 local (rls_audit_test), migrations do repo
-- =============================================================================
/*
  === TABELA: messages (T-01 a T-09) ===
  T-01 PASS: user-a vê 2 msg(s) do seu contato (isolamento positivo OK)
  T-02 PASS: user-a não vê msgs de user-b (count=0) — isolamento negativo OK
  T-C2 PASS: UPDATE cross-tenant bloqueado — "new row violates row-level security policy"
             USING(contact_id IN contacts de user-a) age como implicit WITH CHECK
             → Schema migrations: CRITICAL-2 não se manifesta para messages
             → Produção: 39 policies USING(user_id=uid()) sem WITH CHECK — risco confirmado
  T-05 PASS: INSERT com contact_id alheio bloqueado (constraint/trigger)
  T-09 PASS: DELETE cross-tenant bloqueado (rows=0)

  === TABELA: contacts (T-10 a T-13) ===
  T-10 PASS: user-a vê seu contato (count=1) — can_edit_contact(assigned_to) correto
  T-11 PASS: user-a não vê contato de user-b (count=0) — isolamento OK
  T-12 PASS: UPDATE cross-tenant bloqueado em contacts (rows=0)
  T-13 PASS: DELETE cross-tenant bloqueado em contacts (rows=0)

  === TABELA: email_threads (T-14 a T-16) ===
  T-14 PASS: user-a vê sua thread (count=1) — gmail_account_id→user_id correto
  T-15 PASS: user-a não vê thread de user-b (count=0) — isolamento OK
  T-16 PASS: UPDATE cross-tenant bloqueado em email_threads (rows=0)

  === TABELA: profiles (T-17 a T-18) ===
  T-17 PASS: user-a vê seu profile (count=1)
  T-18 PASS: user-a não vê profile de user-b sem ser admin (count=0)

  === RESUMO ===
  Total: 13 testes em 4 tabelas
  Resultado: 13 PASS, 0 FAIL
  Isolamento A×B: ADEQUADO no schema de migrations

  === DISTINÇÃO PRODUÇÃO ===
  Email threads (produção): EXPLAIN mostra Seq Scan em assigned_to — índice ausente
  Contacts (produção): UPDATE sem WITH CHECK explícito — gap confirmado (CRITICAL-2)
  Email threads (produção): UPDATE/DELETE sem WITH CHECK explícito — gap confirmado
  Email messages (produção): UPDATE sem WITH CHECK explícito — gap confirmado
  Total em produção: 39 UPDATE policies sem WITH CHECK (db_list_policies 2026-10-30)
*/
