-- ==============================================================
-- S11: Matriz RLS Multi-tenant — Script de Teste Local
-- Projeto: tnnnlkbymytvtqngbbqh (ZAPP WEB V2)
-- Execução: Postgres local com as migrations do repo aplicadas
--   scripts/db-audit/replay-local.sh  →  psql zapp_s11_final < este_arquivo.sql
-- NÃO EXECUTAR EM PRODUÇÃO (BEGIN bloqueado no MCP — 0A000)
-- ==============================================================

-- Pré-requisitos:
--   1. Duas organizações semeadas: org_a e org_b
--   2. Dois usuários: user_a (membro de org_a) e user_b (membro de org_b)
--   3. Dados de org_a visíveis por RLS para user_a mas não para user_b

\set ON_ERROR_STOP on

DO $setup$
DECLARE
  v_org_a   uuid := '00000000-0000-4000-a000-aaaaaaaaaaaa';
  v_org_b   uuid := '00000000-0000-4000-b000-bbbbbbbbbbbb';
  v_user_a  uuid := '11111111-1111-4000-a000-aaaaaaaaaaaa';
  v_user_b  uuid := '22222222-2222-4000-b000-bbbbbbbbbbbb';
  v_dept_a  uuid := '33333333-3333-4000-a000-aaaaaaaaaaaa';
  v_dept_b  uuid := '44444444-4444-4000-b000-bbbbbbbbbbbb';
BEGIN
  -- Inserir usuários mock em auth.users
  INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES
    (v_user_a, 'user_a@test.local', jsonb_build_object('organization_id', v_org_a), '{}', now(), now()),
    (v_user_b, 'user_b@test.local', jsonb_build_object('organization_id', v_org_b), '{}', now(), now())
  ON CONFLICT DO NOTHING;

  -- Inserir profiles mock
  INSERT INTO profiles (id, organization_id, name, created_at)
  VALUES
    (v_user_a, v_org_a, 'User A', now()),
    (v_user_b, v_org_b, 'User B', now())
  ON CONFLICT DO NOTHING;

  -- Inserir departamentos
  INSERT INTO departments (id, organization_id, name, created_at)
  VALUES
    (v_dept_a, v_org_a, 'Dept A', now()),
    (v_dept_b, v_org_b, 'Dept B', now())
  ON CONFLICT DO NOTHING;

  -- Inserir convite do dept_a (pertence ao tenant A)
  INSERT INTO department_invites (id, department_id, email, token, created_by, created_at)
  VALUES
    ('aaaaaaaa-0000-4000-a000-aaaaaaaaaaaa', v_dept_a, 'convite@a.local', 'tok_a', v_user_a, now())
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Setup: org_a=%, org_b=%, user_a=%, user_b=%, dept_a=%, dept_b=%',
    v_org_a, v_org_b, v_user_a, v_user_b, v_dept_a, v_dept_b;
END;
$setup$;

-- ==============================================================
-- BLOCO DE TESTES — executar cada caso em transação separada
-- Convenção de resultado:
--   OK     = comportamento correto (isolamento funcionando)
--   VULN   = isolamento quebrado (bug de RLS)
--   SKIP   = caso não aplicável nesta versão do schema
-- ==============================================================

-- C1: Tenant B faz SELECT em contacts de Tenant A → esperado 0 linhas (PROTEGIDO)
DO $c1$
DECLARE
  v_user_b  uuid := '22222222-2222-4000-b000-bbbbbbbbbbbb';
  v_org_a   uuid := '00000000-0000-4000-a000-aaaaaaaaaaaa';
  v_count   int;
  v_jwt     json;
BEGIN
  v_jwt := json_build_object(
    'sub', v_user_b::text,
    'role', 'authenticated',
    'app_metadata', json_build_object('organization_id', '00000000-0000-4000-b000-bbbbbbbbbbbb')
  );

  BEGIN
    PERFORM set_config('request.jwt.claims', v_jwt::text, true);
    PERFORM set_config('role', 'authenticated', true);

    SELECT count(*) INTO v_count
    FROM contacts
    WHERE organization_id = v_org_a;

    IF v_count = 0 THEN
      RAISE NOTICE 'C1 (contacts SELECT cross-tenant): OK — 0 linhas (PROTEGIDO)';
    ELSE
      RAISE NOTICE 'C1 (contacts SELECT cross-tenant): VULN — % linhas visíveis para user_b', v_count;
    END IF;

    ROLLBACK;
  END;
END;
$c1$;

-- C2: Tenant B faz SELECT em messages de Tenant A → esperado 0 linhas (PROTEGIDO)
DO $c2$
DECLARE
  v_user_b  uuid := '22222222-2222-4000-b000-bbbbbbbbbbbb';
  v_org_a   uuid := '00000000-0000-4000-a000-aaaaaaaaaaaa';
  v_count   int;
  v_jwt     json;
BEGIN
  v_jwt := json_build_object(
    'sub', v_user_b::text,
    'role', 'authenticated',
    'app_metadata', json_build_object('organization_id', '00000000-0000-4000-b000-bbbbbbbbbbbb')
  );

  BEGIN
    PERFORM set_config('request.jwt.claims', v_jwt::text, true);
    PERFORM set_config('role', 'authenticated', true);

    SELECT count(*) INTO v_count
    FROM messages m
    JOIN contacts c ON c.id = m.contact_id
    WHERE c.organization_id = v_org_a;

    IF v_count = 0 THEN
      RAISE NOTICE 'C2 (messages SELECT cross-tenant via contact_id): OK — 0 linhas (PROTEGIDO)';
    ELSE
      RAISE NOTICE 'C2 (messages SELECT cross-tenant): VULN — % linhas visíveis para user_b', v_count;
    END IF;

    ROLLBACK;
  END;
END;
$c2$;

-- C3a: Tenant B DELETE em department_invites de Tenant A — policy OLD (USING true)
DO $c3a$
DECLARE
  v_user_b  uuid := '22222222-2222-4000-b000-bbbbbbbbbbbb';
  v_invite  uuid := 'aaaaaaaa-0000-4000-a000-aaaaaaaaaaaa';
  v_deleted int;
  v_jwt     json;
BEGIN
  v_jwt := json_build_object(
    'sub', v_user_b::text,
    'role', 'authenticated',
    'app_metadata', json_build_object('organization_id', '00000000-0000-4000-b000-bbbbbbbbbbbb')
  );

  BEGIN
    PERFORM set_config('request.jwt.claims', v_jwt::text, true);
    PERFORM set_config('role', 'authenticated', true);

    DELETE FROM department_invites WHERE id = v_invite;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    IF v_deleted = 0 THEN
      RAISE NOTICE 'C3a (dept_invites DELETE cross-tenant, policy ATUAL): OK — 0 linhas deletadas (PROTEGIDO)';
    ELSE
      RAISE NOTICE 'C3a (dept_invites DELETE cross-tenant, policy ATUAL): VULN — % convites deletados por user_b', v_deleted;
    END IF;

    ROLLBACK;
  END;
END;
$c3a$;

-- C3b: Tenant B INSERT em department_invites com dept_id de Tenant A — policy OLD (WITH CHECK true)
DO $c3b$
DECLARE
  v_user_b  uuid := '22222222-2222-4000-b000-bbbbbbbbbbbb';
  v_dept_a  uuid := '33333333-3333-4000-a000-aaaaaaaaaaaa';
  v_inserted int;
  v_jwt     json;
BEGIN
  v_jwt := json_build_object(
    'sub', v_user_b::text,
    'role', 'authenticated',
    'app_metadata', json_build_object('organization_id', '00000000-0000-4000-b000-bbbbbbbbbbbb')
  );

  BEGIN
    PERFORM set_config('request.jwt.claims', v_jwt::text, true);
    PERFORM set_config('role', 'authenticated', true);

    BEGIN
      INSERT INTO department_invites (id, department_id, email, token, created_by)
      VALUES (gen_random_uuid(), v_dept_a, 'spam@b.local', 'tok_spam', v_user_b);
      GET DIAGNOSTICS v_inserted = ROW_COUNT;

      IF v_inserted = 0 THEN
        RAISE NOTICE 'C3b (dept_invites INSERT cross-tenant): OK — INSERT rejeitado (PROTEGIDO)';
      ELSE
        RAISE NOTICE 'C3b (dept_invites INSERT cross-tenant): VULN — user_b inseriu em dept de tenant A';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'C3b (dept_invites INSERT cross-tenant): OK — INSERT bloqueado por exception (PROTEGIDO): %', SQLERRM;
    END;

    ROLLBACK;
  END;
END;
$c3b$;

-- C4: Anon acessa qualquer tabela com RLS → esperado 0 linhas ou exception
DO $c4$
DECLARE
  v_count int;
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
    PERFORM set_config('role', 'anon', true);

    SELECT count(*) INTO v_count FROM contacts;

    IF v_count = 0 THEN
      RAISE NOTICE 'C4 (anon → contacts SELECT): OK — 0 linhas (PROTEGIDO)';
    ELSE
      RAISE NOTICE 'C4 (anon → contacts SELECT): VULN — % linhas visíveis para anon', v_count;
    END IF;

    ROLLBACK;
  END;
END;
$c4$;

-- C5: Tenant B SELECT em departments de Tenant A → esperado 0 linhas
DO $c5$
DECLARE
  v_user_b  uuid := '22222222-2222-4000-b000-bbbbbbbbbbbb';
  v_org_a   uuid := '00000000-0000-4000-a000-aaaaaaaaaaaa';
  v_count   int;
  v_jwt     json;
BEGIN
  v_jwt := json_build_object(
    'sub', v_user_b::text,
    'role', 'authenticated',
    'app_metadata', json_build_object('organization_id', '00000000-0000-4000-b000-bbbbbbbbbbbb')
  );

  BEGIN
    PERFORM set_config('request.jwt.claims', v_jwt::text, true);
    PERFORM set_config('role', 'authenticated', true);

    SELECT count(*) INTO v_count FROM departments WHERE organization_id = v_org_a;

    IF v_count = 0 THEN
      RAISE NOTICE 'C5 (departments SELECT cross-tenant): OK — 0 linhas (PROTEGIDO)';
    ELSE
      RAISE NOTICE 'C5 (departments SELECT cross-tenant): VULN — % departamentos visíveis para user_b', v_count;
    END IF;

    ROLLBACK;
  END;
END;
$c5$;

-- C6: Tenant B UPDATE em contacts de Tenant A → esperado 0 linhas modificadas
DO $c6$
DECLARE
  v_user_b  uuid := '22222222-2222-4000-b000-bbbbbbbbbbbb';
  v_org_a   uuid := '00000000-0000-4000-a000-aaaaaaaaaaaa';
  v_updated int;
  v_jwt     json;
BEGIN
  v_jwt := json_build_object(
    'sub', v_user_b::text,
    'role', 'authenticated',
    'app_metadata', json_build_object('organization_id', '00000000-0000-4000-b000-bbbbbbbbbbbb')
  );

  BEGIN
    PERFORM set_config('request.jwt.claims', v_jwt::text, true);
    PERFORM set_config('role', 'authenticated', true);

    UPDATE contacts SET name = 'HACKED' WHERE organization_id = v_org_a;
    GET DIAGNOSTICS v_updated = ROW_COUNT;

    IF v_updated = 0 THEN
      RAISE NOTICE 'C6 (contacts UPDATE cross-tenant): OK — 0 linhas modificadas (PROTEGIDO)';
    ELSE
      RAISE NOTICE 'C6 (contacts UPDATE cross-tenant): VULN — % contatos modificados por user_b', v_updated;
    END IF;

    ROLLBACK;
  END;
END;
$c6$;

-- C7: Tenant B DELETE em contacts de Tenant A → esperado 0 linhas deletadas
DO $c7$
DECLARE
  v_user_b  uuid := '22222222-2222-4000-b000-bbbbbbbbbbbb';
  v_org_a   uuid := '00000000-0000-4000-a000-aaaaaaaaaaaa';
  v_deleted int;
  v_jwt     json;
BEGIN
  v_jwt := json_build_object(
    'sub', v_user_b::text,
    'role', 'authenticated',
    'app_metadata', json_build_object('organization_id', '00000000-0000-4000-b000-bbbbbbbbbbbb')
  );

  BEGIN
    PERFORM set_config('request.jwt.claims', v_jwt::text, true);
    PERFORM set_config('role', 'authenticated', true);

    DELETE FROM contacts WHERE organization_id = v_org_a;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    IF v_deleted = 0 THEN
      RAISE NOTICE 'C7 (contacts DELETE cross-tenant): OK — 0 linhas deletadas (PROTEGIDO)';
    ELSE
      RAISE NOTICE 'C7 (contacts DELETE cross-tenant): VULN — % contatos deletados por user_b', v_deleted;
    END IF;

    ROLLBACK;
  END;
END;
$c7$;

-- C8: Tenant A lê os próprios dados (controle positivo) → esperado >= 0 linhas (NÃO bloqueado)
DO $c8$
DECLARE
  v_user_a  uuid := '11111111-1111-4000-a000-aaaaaaaaaaaa';
  v_org_a   uuid := '00000000-0000-4000-a000-aaaaaaaaaaaa';
  v_count   int;
  v_jwt     json;
BEGIN
  v_jwt := json_build_object(
    'sub', v_user_a::text,
    'role', 'authenticated',
    'app_metadata', json_build_object('organization_id', v_org_a::text)
  );

  BEGIN
    PERFORM set_config('request.jwt.claims', v_jwt::text, true);
    PERFORM set_config('role', 'authenticated', true);

    SELECT count(*) INTO v_count FROM contacts WHERE organization_id = v_org_a;

    RAISE NOTICE 'C8 (contacts SELECT mesmo tenant): CONTROLE — user_a vê % contatos do próprio tenant', v_count;

    ROLLBACK;
  END;
END;
$c8$;

-- C9: Tenant B INSERT em contacts com organization_id de Tenant A (WITH CHECK)
DO $c9$
DECLARE
  v_user_b  uuid := '22222222-2222-4000-b000-bbbbbbbbbbbb';
  v_org_a   uuid := '00000000-0000-4000-a000-aaaaaaaaaaaa';
  v_inserted int;
  v_jwt     json;
BEGIN
  v_jwt := json_build_object(
    'sub', v_user_b::text,
    'role', 'authenticated',
    'app_metadata', json_build_object('organization_id', '00000000-0000-4000-b000-bbbbbbbbbbbb')
  );

  BEGIN
    PERFORM set_config('request.jwt.claims', v_jwt::text, true);
    PERFORM set_config('role', 'authenticated', true);

    BEGIN
      INSERT INTO contacts (id, organization_id, name, phone, created_at)
      VALUES (gen_random_uuid(), v_org_a, 'Injected', '+5511999990000', now());
      GET DIAGNOSTICS v_inserted = ROW_COUNT;

      IF v_inserted = 0 THEN
        RAISE NOTICE 'C9 (contacts INSERT cross-tenant): OK — INSERT rejeitado silenciosamente (PROTEGIDO)';
      ELSE
        RAISE NOTICE 'C9 (contacts INSERT cross-tenant): VULN — user_b inseriu contato em org_a';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'C9 (contacts INSERT cross-tenant): OK — INSERT bloqueado por policy: %', SQLERRM;
    END;

    ROLLBACK;
  END;
END;
$c9$;

-- C10: Anon acessa messages → esperado 0 linhas
DO $c10$
DECLARE
  v_count int;
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
    PERFORM set_config('role', 'anon', true);

    SELECT count(*) INTO v_count FROM messages;

    IF v_count = 0 THEN
      RAISE NOTICE 'C10 (anon → messages SELECT): OK — 0 linhas (PROTEGIDO)';
    ELSE
      RAISE NOTICE 'C10 (anon → messages SELECT): VULN — % mensagens visíveis para anon', v_count;
    END IF;

    ROLLBACK;
  END;
END;
$c10$;

-- ==============================================================
-- Resumo esperado (banco com migrations atuais, S3-01/S3-02 NÃO corrigidas):
--   C1  → OK (contacts isolado por org)
--   C2  → OK (messages isolado via contact)
--   C3a → VULN (dept_invites DELETE USING true — S3-01)
--   C3b → VULN (dept_invites INSERT WITH CHECK true — S3-02)
--   C4  → OK (anon bloqueado)
--   C5  → OK (departments isolado por org)
--   C6  → OK (contacts UPDATE bloqueado cross-tenant)
--   C7  → OK (contacts DELETE bloqueado cross-tenant)
--   C8  → CONTROLE (user_a vê próprios dados — esperado)
--   C9  → OK (contacts INSERT WITH CHECK bloqueia org cruzada)
--   C10 → OK (messages anon bloqueado)
--
-- Após PR #2186 (migrations 20261026100300):
--   C3a → OK (dept_invites DELETE restringido por department_id ownership)
--   C3b → OK (dept_invites INSERT restringido por department_id ownership)
-- ==============================================================
