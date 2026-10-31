-- MATRIZ RLS TENANT A×B — TESTES
-- Usa SET LOCAL dentro de BEGIN/ROLLBACK

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

-- T-17: user_b SELECT email_threads tenant B (isolamento positivo)
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

-- T-20: total messages não afetado (verificação de integridade)
RESET app.current_user_id;
SELECT 'T-20-integrity' as test, 'INFO' as result, count(*)||' msgs total no banco (esperado 3)' as detail FROM messages;

ROLLBACK;
