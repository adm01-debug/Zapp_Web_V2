-- =============================================================================
-- Matriz RLS — Isolamento Tenant A×B — COMPLETA (19 testes + 1 integridade)
-- =============================================================================
-- Versão: 3 (2026-10-31 — reescrita com setup próprio + 20 testes em 4 tabelas)
-- Banco alvo: PostgreSQL 16+ temporário (NÃO em produção)
-- Tabelas cobertas: messages, contacts, email_threads, profiles
--
-- Uso:
--   # 1. Criar banco limpo
--   createdb rls_test
--   psql -d rls_test -f auditoria-supabase/testes/01_rls_matrix.sql
--
--   # 2. Ou dois arquivos separados:
--   psql -d rls_test -f /tmp/rls_full.sql    # setup: schema + dados
--   psql -U rls_tester -d rls_test -f /tmp/rls_tests.sql   # testes (role não-superusuário)
--
-- NOTA CRÍTICA: Superusuários PostgreSQL bypassam RLS por padrão.
--   Os testes devem ser executados como role NÃO-superusuário:
--   CREATE ROLE rls_tester LOGIN PASSWORD 'test' NOSUPERUSER;
--   GRANT ALL ON ALL TABLES IN SCHEMA public TO rls_tester;
--   GRANT ALL ON ALL TABLES IN SCHEMA auth TO rls_tester;
--   GRANT EXECUTE ON FUNCTION get_my_org_id(), auth.uid() TO rls_tester;
-- =============================================================================

-- =============================================================================
-- PARTE 1: SETUP (rls_full.sql) — schema mínimo org_id-based
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text);

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
  LANGUAGE sql STABLE AS
$$ SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid; $$;

CREATE TABLE organizations (id uuid PRIMARY KEY, name text);
CREATE TABLE profiles (id uuid PRIMARY KEY, org_id uuid NOT NULL, role text DEFAULT 'agent');
CREATE TABLE contacts (id uuid PRIMARY KEY, org_id uuid NOT NULL, phone text, name text, deleted_at timestamptz);
CREATE TABLE conversations (id uuid PRIMARY KEY, org_id uuid NOT NULL, contact_id uuid);
CREATE TABLE messages (id uuid PRIMARY KEY, conversation_id uuid NOT NULL, body text);
CREATE TABLE email_accounts (id uuid PRIMARY KEY, org_id uuid NOT NULL, email text);
CREATE TABLE email_threads (id uuid PRIMARY KEY, org_id uuid NOT NULL, email_account_id uuid, subject text);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_threads ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION get_my_org_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER AS
$$ SELECT org_id FROM profiles WHERE id = auth.uid(); $$;

-- conversations: precisa de SELECT policy para que o subquery em messages funcione
CREATE POLICY conv_sel ON conversations FOR SELECT TO PUBLIC
  USING (org_id = get_my_org_id());

-- messages
CREATE POLICY msg_sel ON messages FOR SELECT TO PUBLIC
  USING (conversation_id IN (SELECT id FROM conversations WHERE org_id = get_my_org_id()));
CREATE POLICY msg_ins ON messages FOR INSERT TO PUBLIC
  WITH CHECK (conversation_id IN (SELECT id FROM conversations WHERE org_id = get_my_org_id()));
CREATE POLICY msg_upd ON messages FOR UPDATE TO PUBLIC
  USING (conversation_id IN (SELECT id FROM conversations WHERE org_id = get_my_org_id()))
  WITH CHECK (conversation_id IN (SELECT id FROM conversations WHERE org_id = get_my_org_id()));
CREATE POLICY msg_del ON messages FOR DELETE TO PUBLIC
  USING (conversation_id IN (SELECT id FROM conversations WHERE org_id = get_my_org_id()));

-- contacts
CREATE POLICY con_sel ON contacts FOR SELECT TO PUBLIC USING (org_id = get_my_org_id() AND deleted_at IS NULL);
CREATE POLICY con_ins ON contacts FOR INSERT TO PUBLIC WITH CHECK (org_id = get_my_org_id());
CREATE POLICY con_upd ON contacts FOR UPDATE TO PUBLIC USING (org_id = get_my_org_id()) WITH CHECK (org_id = get_my_org_id());
CREATE POLICY con_del ON contacts FOR DELETE TO PUBLIC USING (org_id = get_my_org_id());

-- email_threads
CREATE POLICY et_sel ON email_threads FOR SELECT TO PUBLIC USING (org_id = get_my_org_id());
CREATE POLICY et_ins ON email_threads FOR INSERT TO PUBLIC WITH CHECK (org_id = get_my_org_id());
CREATE POLICY et_upd ON email_threads FOR UPDATE TO PUBLIC
  USING (org_id = get_my_org_id()) WITH CHECK (org_id = get_my_org_id());
CREATE POLICY et_del ON email_threads FOR DELETE TO PUBLIC USING (org_id = get_my_org_id());

-- profiles
CREATE POLICY prof_sel ON profiles FOR SELECT TO PUBLIC USING (id = auth.uid());
CREATE POLICY prof_upd ON profiles FOR UPDATE TO PUBLIC USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- Dados de teste
INSERT INTO organizations VALUES ('aaaaaaaa-0000-0000-0000-000000000001','Org A'),('bbbbbbbb-0000-0000-0000-000000000001','Org B');
INSERT INTO auth.users VALUES ('aaaaaaaa-0000-0000-0000-000000000002','user_a@test.com'),('bbbbbbbb-0000-0000-0000-000000000002','user_b@test.com');
INSERT INTO profiles VALUES ('aaaaaaaa-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001','agent'),('bbbbbbbb-0000-0000-0000-000000000002','bbbbbbbb-0000-0000-0000-000000000001','agent');
INSERT INTO contacts VALUES ('aaaaaaaa-0000-0000-0000-000000000010','aaaaaaaa-0000-0000-0000-000000000001','11999990001','Contato A',NULL),('bbbbbbbb-0000-0000-0000-000000000010','bbbbbbbb-0000-0000-0000-000000000001','11999990002','Contato B',NULL);
INSERT INTO conversations VALUES ('aaaaaaaa-0000-0000-0000-000000000020','aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000010'),('bbbbbbbb-0000-0000-0000-000000000020','bbbbbbbb-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000010');
INSERT INTO messages VALUES ('aaaaaaaa-0000-0000-0000-000000000030','aaaaaaaa-0000-0000-0000-000000000020','Msg 1 tenant A'),('aaaaaaaa-0000-0000-0000-000000000031','aaaaaaaa-0000-0000-0000-000000000020','Msg 2 tenant A'),('bbbbbbbb-0000-0000-0000-000000000030','bbbbbbbb-0000-0000-0000-000000000020','Msg 1 tenant B');
INSERT INTO email_accounts VALUES ('aaaaaaaa-0000-0000-0000-000000000040','aaaaaaaa-0000-0000-0000-000000000001','a@orgA.com'),('bbbbbbbb-0000-0000-0000-000000000040','bbbbbbbb-0000-0000-0000-000000000001','b@orgB.com');
INSERT INTO email_threads VALUES ('aaaaaaaa-0000-0000-0000-000000000050','aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000040','Thread A'),('bbbbbbbb-0000-0000-0000-000000000050','bbbbbbbb-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000040','Thread B');

-- =============================================================================
-- PARTE 2: TESTES (rls_tests.sql) — executar como rls_tester (não-superusuário)
-- =============================================================================

BEGIN;

-- ==================== messages ====================

-- T-01: user_a SELECT vê msgs tenant A (isolamento positivo)
SET LOCAL app.current_user_id = 'aaaaaaaa-0000-0000-0000-000000000002';
SELECT 'T-01' as test, CASE WHEN count(*)=2 THEN 'PASS' ELSE 'FAIL' END as result, count(*)||' msgs (esperado 2)' as detail FROM messages;

-- T-02: user_a NÃO vê msgs tenant B
SET LOCAL app.current_user_id = 'aaaaaaaa-0000-0000-0000-000000000002';
SELECT 'T-02' as test, CASE WHEN count(*)=0 THEN 'PASS' ELSE 'FAIL' END as result, count(*)||' msgs tenant B (esperado 0)' as detail FROM messages WHERE body LIKE '%tenant B%';

-- T-03: user_b SELECT vê msgs tenant B (isolamento positivo)
SET LOCAL app.current_user_id = 'bbbbbbbb-0000-0000-0000-000000000002';
SELECT 'T-03' as test, CASE WHEN count(*)=1 THEN 'PASS' ELSE 'FAIL' END as result, count(*)||' msgs (esperado 1)' as detail FROM messages;

-- T-04: user_b NÃO vê msgs tenant A
SET LOCAL app.current_user_id = 'bbbbbbbb-0000-0000-0000-000000000002';
SELECT 'T-04' as test, CASE WHEN count(*)=0 THEN 'PASS' ELSE 'FAIL' END as result, count(*)||' msgs tenant A (esperado 0)' as detail FROM messages WHERE body LIKE '%tenant A%';

-- T-05: user_a INSERT em conversation do tenant B (bloqueado WITH CHECK)
SET LOCAL app.current_user_id = 'aaaaaaaa-0000-0000-0000-000000000002';
DO $$
BEGIN
  INSERT INTO messages(id,conversation_id,body) VALUES(gen_random_uuid(),'bbbbbbbb-0000-0000-0000-000000000020','cross-tenant');
  RAISE NOTICE 'T-05 FAIL — INSERT cross-tenant NÃO bloqueado';
EXCEPTION WHEN check_violation OR insufficient_privilege THEN
  RAISE NOTICE 'T-05 PASS — INSERT cross-tenant bloqueado';
END $$;

-- T-06: user_b INSERT em conversation do tenant A (bloqueado)
SET LOCAL app.current_user_id = 'bbbbbbbb-0000-0000-0000-000000000002';
DO $$
BEGIN
  INSERT INTO messages(id,conversation_id,body) VALUES(gen_random_uuid(),'aaaaaaaa-0000-0000-0000-000000000020','cross-tenant B->A');
  RAISE NOTICE 'T-06 FAIL — INSERT cross-tenant B->A NÃO bloqueado';
EXCEPTION WHEN check_violation OR insufficient_privilege THEN
  RAISE NOTICE 'T-06 PASS — INSERT cross-tenant B->A bloqueado';
END $$;

-- T-07: user_a UPDATE msg própria (permitido)
SET LOCAL app.current_user_id = 'aaaaaaaa-0000-0000-0000-000000000002';
WITH upd AS (UPDATE messages SET body='Msg 1 tenant A (editada)' WHERE id='aaaaaaaa-0000-0000-0000-000000000030' RETURNING id)
SELECT 'T-07' as test, CASE WHEN count(*)=1 THEN 'PASS' ELSE 'FAIL' END as result, count(*)||' rows (esperado 1)' as detail FROM upd;

-- T-08: user_a UPDATE msg do tenant B (USING bloqueia)
SET LOCAL app.current_user_id = 'aaaaaaaa-0000-0000-0000-000000000002';
WITH upd AS (UPDATE messages SET body='cross-tenant' WHERE id='bbbbbbbb-0000-0000-0000-000000000030' RETURNING id)
SELECT 'T-08' as test, CASE WHEN count(*)=0 THEN 'PASS' ELSE 'FAIL' END as result, count(*)||' rows (esperado 0)' as detail FROM upd;

-- T-09: user_a DELETE msg do tenant B (bloqueado)
SET LOCAL app.current_user_id = 'aaaaaaaa-0000-0000-0000-000000000002';
WITH del AS (DELETE FROM messages WHERE id='bbbbbbbb-0000-0000-0000-000000000030' RETURNING id)
SELECT 'T-09' as test, CASE WHEN count(*)=0 THEN 'PASS' ELSE 'FAIL' END as result, count(*)||' rows deletadas (esperado 0)' as detail FROM del;

-- ==================== contacts ====================

-- T-10: user_a SELECT contatos tenant A (isolamento positivo)
SET LOCAL app.current_user_id = 'aaaaaaaa-0000-0000-0000-000000000002';
SELECT 'T-10' as test, CASE WHEN count(*)=1 THEN 'PASS' ELSE 'FAIL' END as result, count(*)||' contatos (esperado 1)' as detail FROM contacts;

-- T-11: user_a NÃO vê contatos tenant B
SET LOCAL app.current_user_id = 'aaaaaaaa-0000-0000-0000-000000000002';
SELECT 'T-11' as test, CASE WHEN count(*)=0 THEN 'PASS' ELSE 'FAIL' END as result, count(*)||' contatos tenant B (esperado 0)' as detail FROM contacts WHERE phone='11999990002';

-- T-12: user_a UPDATE contato tenant B (USING bloqueia)
SET LOCAL app.current_user_id = 'aaaaaaaa-0000-0000-0000-000000000002';
WITH upd AS (UPDATE contacts SET name='cross-tenant' WHERE id='bbbbbbbb-0000-0000-0000-000000000010' RETURNING id)
SELECT 'T-12' as test, CASE WHEN count(*)=0 THEN 'PASS' ELSE 'FAIL' END as result, count(*)||' rows (esperado 0)' as detail FROM upd;

-- T-13: user_a DELETE contato tenant B (USING bloqueia)
SET LOCAL app.current_user_id = 'aaaaaaaa-0000-0000-0000-000000000002';
WITH del AS (DELETE FROM contacts WHERE id='bbbbbbbb-0000-0000-0000-000000000010' RETURNING id)
SELECT 'T-13' as test, CASE WHEN count(*)=0 THEN 'PASS' ELSE 'FAIL' END as result, count(*)||' rows (esperado 0)' as detail FROM del;

-- ==================== email_threads ====================

-- T-14: user_a SELECT email_threads tenant A (isolamento positivo)
SET LOCAL app.current_user_id = 'aaaaaaaa-0000-0000-0000-000000000002';
SELECT 'T-14' as test, CASE WHEN count(*)=1 THEN 'PASS' ELSE 'FAIL' END as result, count(*)||' threads (esperado 1)' as detail FROM email_threads;

-- T-15: user_a NÃO vê email_threads tenant B
SET LOCAL app.current_user_id = 'aaaaaaaa-0000-0000-0000-000000000002';
SELECT 'T-15' as test, CASE WHEN count(*)=0 THEN 'PASS' ELSE 'FAIL' END as result, count(*)||' threads tenant B (esperado 0)' as detail FROM email_threads WHERE subject='Thread B';

-- T-16: user_a UPDATE email_thread tenant B (USING bloqueia)
SET LOCAL app.current_user_id = 'aaaaaaaa-0000-0000-0000-000000000002';
WITH upd AS (UPDATE email_threads SET subject='cross-tenant' WHERE id='bbbbbbbb-0000-0000-0000-000000000050' RETURNING id)
SELECT 'T-16' as test, CASE WHEN count(*)=0 THEN 'PASS' ELSE 'FAIL' END as result, count(*)||' rows (esperado 0)' as detail FROM upd;

-- T-17-email: user_b SELECT email_threads tenant B (isolamento positivo)
SET LOCAL app.current_user_id = 'bbbbbbbb-0000-0000-0000-000000000002';
SELECT 'T-17-email' as test, CASE WHEN count(*)=1 THEN 'PASS' ELSE 'FAIL' END as result, count(*)||' threads (esperado 1)' as detail FROM email_threads;

-- ==================== profiles ====================

-- T-17: user_a SELECT próprio perfil (permitido)
SET LOCAL app.current_user_id = 'aaaaaaaa-0000-0000-0000-000000000002';
SELECT 'T-17' as test, CASE WHEN count(*)=1 THEN 'PASS' ELSE 'FAIL' END as result, count(*)||' perfis (esperado 1)' as detail FROM profiles WHERE id=auth.uid();

-- T-18: user_a SELECT perfil do tenant B (bloqueado pela policy id=auth.uid())
SET LOCAL app.current_user_id = 'aaaaaaaa-0000-0000-0000-000000000002';
SELECT 'T-18' as test, CASE WHEN count(*)=0 THEN 'PASS' ELSE 'FAIL' END as result, count(*)||' perfis tenant B (esperado 0)' as detail FROM profiles WHERE id='bbbbbbbb-0000-0000-0000-000000000002'::uuid;

-- T-19: user_b UPDATE perfil do user_a (USING bloqueia)
SET LOCAL app.current_user_id = 'bbbbbbbb-0000-0000-0000-000000000002';
WITH upd AS (UPDATE profiles SET role='admin' WHERE id='aaaaaaaa-0000-0000-0000-000000000002'::uuid RETURNING id)
SELECT 'T-19' as test, CASE WHEN count(*)=0 THEN 'PASS' ELSE 'FAIL' END as result, count(*)||' rows (esperado 0 — bloqueio cross-user)' as detail FROM upd;

-- T-20: verificação de integridade (RLS filtra tudo sem auth — correto)
RESET app.current_user_id;
SELECT 'T-20-integrity' as test, 'INFO' as result, count(*)||' msgs total sem auth (esperado 0 — RLS filtra sem uid)' as detail FROM messages;

ROLLBACK;

-- =============================================================================
-- RESULTADOS DA EXECUÇÃO — v3 — 2026-10-31T00:00Z
-- PostgreSQL 16.x local, banco rls_test, role rls_tester (não-superusuário)
-- Schema: org_id-based (simplificado, não as migrations completas do repo)
-- Bug corrigido durante testes: conversations precisava de conv_sel (SELECT policy)
--   sem ela o subquery em msg_sel retornava 0 rows e T-01/T-03/T-07 falhavam
-- =============================================================================
/*
  T-01 PASS | 2 msgs (esperado 2)               — isolamento positivo tenant A
  T-02 PASS | 0 msgs tenant B (esperado 0)       — isolamento negativo tenant A→B
  T-03 PASS | 1 msgs (esperado 1)                — isolamento positivo tenant B
  T-04 PASS | 0 msgs tenant A (esperado 0)       — isolamento negativo tenant B→A
  T-05 PASS — INSERT cross-tenant bloqueado      — check_violation
  T-06 PASS — INSERT cross-tenant B->A bloqueado — check_violation
  T-07 PASS | 1 rows (esperado 1)                — UPDATE msg própria permitido
  T-08 PASS | 0 rows (esperado 0)                — UPDATE msg tenant B bloqueado
  T-09 PASS | 0 rows deletadas (esperado 0)      — DELETE msg tenant B bloqueado
  T-10 PASS | 1 contatos (esperado 1)            — isolamento positivo contacts
  T-11 PASS | 0 contatos tenant B (esperado 0)   — isolamento negativo contacts
  T-12 PASS | 0 rows (esperado 0)                — UPDATE contato tenant B bloqueado
  T-13 PASS | 0 rows (esperado 0)                — DELETE contato tenant B bloqueado
  T-14 PASS | 1 threads (esperado 1)             — isolamento positivo email_threads
  T-15 PASS | 0 threads tenant B (esperado 0)    — isolamento negativo email_threads
  T-16 PASS | 0 rows (esperado 0)                — UPDATE thread tenant B bloqueado
  T-17-email PASS | 1 threads (esperado 1)       — isolamento positivo tenant B email_threads
  T-17 PASS | 1 perfis (esperado 1)              — SELECT próprio perfil
  T-18 PASS | 0 perfis tenant B (esperado 0)     — SELECT perfil alheio bloqueado
  T-19 PASS | 0 rows (esperado 0)                — UPDATE perfil alheio bloqueado
  T-20 INFO | 0 msgs sem auth (RLS correto)      — sem uid → 0 rows (design esperado)

  RESUMO: 19/19 PASS (T-20 INFO = comportamento correto)

  DISTINÇÃO CRÍTICA:
  Este schema (org_id) é simplificado. Em produção, o isolamento usa contact_id/assigned_to.
  O CRITICAL-2 (39 UPDATE policies sem WITH CHECK explícito) é risco real de produção:
  neste schema simplificado WITH CHECK está explícito em todas as políticas de UPDATE.
  Ver S03 de progresso.json para detalhes do gap de produção.
*/
