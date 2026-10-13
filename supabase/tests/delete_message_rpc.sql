-- delete_message_rpc — RPC REAL public.delete_message (cartao t_cfa99af7).
--
-- O QUE PROVA. A superficie minima do Supabase e criada a mao aqui (roles
-- anon/authenticated/service_role, schema auth com auth.uid(), as tabelas
-- profiles/user_roles/agent_visibility_grants/contacts/queue_members/messages e
-- os helpers canonicos copiados das migrations reais citadas em cada um). O
-- ARTEFATO sob teste (public.delete_message) vem do ARQUIVO REAL da migration,
-- aplicado via \i. Papel de usuario sempre por SET LOCAL ROLE, nunca superusuario:
--   T1 agente apaga a PROPRIA mensagem -> true; is_deleted=true, deleted_by=profile,
--      deleted_at preenchido e content ORIGINAL intacto;
--   T2 chamar de novo e idempotente -> false, content segue intacto;
--   T3 agente NAO apaga mensagem de colega -> 42501 message_not_deletable;
--   T4 agente NAO apaga mensagem do cliente (agent_id NULL) -> idem;
--   T5 agente NAO apaga mensagem de contato que nao ve -> idem;
--   T6 id inexistente responde IGUAL (sem oraculo) -> 42501 message_not_deletable;
--   T7 admin/supervisor apaga a de colega -> true e content preservado;
--   T8 anon NAO executa a RPC (ACL) -> permission denied / 42501;
--   T9 service_role NAO executa a RPC (ACL) -> permission denied / 42501;
--   T10 grants/colunas: authenticated executa, anon nao; deleted_by/deleted_at existem.
--
-- COMO RODA. Em Postgres descartavel; tudo numa transacao que termina em ROLLBACK
-- (idempotente, zero efeito colateral):
--   docker run --rm -d --name zapp-v2-delmsg-$$ -v "$PWD:/repo:ro" \
--     -e POSTGRES_PASSWORD=test_only postgres:17-alpine
--   docker exec -i zapp-v2-delmsg-$$ psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
--     -v mig=/repo/supabase/migrations/20261013230001_delete_message_rpc.sql \
--     < supabase/tests/delete_message_rpc.sql
-- VERMELHO esperado sem a migration: o mesmo comando com -v sem_migration=1 falha
-- no T1 (funcao public.delete_message inexistente).

\set ON_ERROR_STOP on

\if :{?sem_migration}
\else
  \if :{?mig}
  \else
    \set mig 'supabase/migrations/20261013230001_delete_message_rpc.sql'
  \endif
\endif

BEGIN;

-- ---------------------------------------------------------------------------
-- Superficie minima a mao (forma ANTERIOR a migration: sem a RPC, sem as colunas)
-- ---------------------------------------------------------------------------
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  )::text $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

CREATE TABLE public.profiles (
  id      uuid PRIMARY KEY,
  user_id uuid UNIQUE,
  role    text NOT NULL
);
CREATE TABLE public.user_roles (
  user_id uuid NOT NULL,
  role    text NOT NULL
);
CREATE TABLE public.agent_visibility_grants (
  agent_id         uuid NOT NULL,
  can_see_agent_id uuid NOT NULL
);
CREATE TABLE public.contacts (
  id          uuid PRIMARY KEY,
  assigned_to uuid,
  queue_id    uuid
);
CREATE TABLE public.queue_members (
  queue_id   uuid NOT NULL,
  profile_id uuid NOT NULL,
  is_active  boolean NOT NULL DEFAULT true
);

-- public.messages na forma ANTERIOR: sem deleted_by/deleted_at.
CREATE TABLE public.messages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id   uuid,
  sender       text,
  content      text NOT NULL,
  message_type text,
  media_url    text,
  agent_id     uuid,
  external_id  text,
  status       text,
  is_read      boolean NOT NULL DEFAULT false,
  is_deleted   boolean,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;

-- Helpers canonicos copiados das migrations REAIS (ambiente da RPC, nao o alvo):
-- get_profile_id_for_user / get_visible_agent_ids / is_contact_visible_to_user de
-- 20260909200000_harden_inbox_contact_authorization.sql;
-- is_admin_or_supervisor de 20251215025014_fcc5bc79-...sql.
CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin', 'supervisor')
  ) $$;

CREATE FUNCTION public.get_profile_id_for_user(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT profile.id
  FROM public.profiles AS profile
  WHERE _user_id = auth.uid()
    AND profile.user_id = _user_id
  LIMIT 1; $$;

CREATE FUNCTION public.get_visible_agent_ids(_user_id uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT profile.id
  FROM public.profiles AS profile
  WHERE _user_id = auth.uid()
    AND profile.user_id = _user_id
  UNION
  SELECT visibility.can_see_agent_id
  FROM public.agent_visibility_grants AS visibility
  JOIN public.profiles AS viewer ON viewer.id = visibility.agent_id
  WHERE _user_id = auth.uid()
    AND viewer.user_id = _user_id
    AND EXISTS (
      SELECT 1 FROM public.user_roles AS role_assignment
      WHERE role_assignment.user_id = _user_id
        AND role_assignment.role = 'special_agent'
    ); $$;

CREATE FUNCTION public.is_contact_visible_to_user(_contact_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT _user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.contacts AS contact
      WHERE contact.id = _contact_id
        AND (
          public.is_admin_or_supervisor(_user_id)
          OR contact.assigned_to IN (SELECT public.get_visible_agent_ids(_user_id))
          OR EXISTS (
            SELECT 1 FROM public.queue_members AS member
            WHERE member.queue_id = contact.queue_id
              AND member.profile_id = public.get_profile_id_for_user(_user_id)
              AND member.is_active = true
          )
        )
    ); $$;

-- ---------------------------------------------------------------------------
-- Fixtures (inseridos como postgres, ANTES da RPC existir)
-- ---------------------------------------------------------------------------
INSERT INTO public.profiles(id, user_id, role) VALUES
  ('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','agent'),
  ('10000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000002','agent'),
  ('10000000-0000-0000-0000-000000000003','a3000000-0000-0000-0000-000000000003','admin');
INSERT INTO public.user_roles(user_id, role) VALUES
  ('a3000000-0000-0000-0000-000000000003','admin');
INSERT INTO public.contacts(id, assigned_to, queue_id) VALUES
  ('c1000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000001'),
  ('c2000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','f2000000-0000-0000-0000-000000000002');
INSERT INTO public.queue_members(queue_id, profile_id, is_active) VALUES
  ('f1000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001', true);

INSERT INTO public.messages(id, contact_id, sender, content, message_type, agent_id, status) VALUES
  ('00000001-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001','agent',
   'texto original do agente','text','10000000-0000-0000-0000-000000000001','sent'),
  ('00000002-0000-0000-0000-000000000002','c1000000-0000-0000-0000-000000000001','agent',
   'texto do colega','text','10000000-0000-0000-0000-000000000002','sent'),
  ('00000003-0000-0000-0000-000000000003','c1000000-0000-0000-0000-000000000001','contact',
   'texto do cliente','text',NULL,'received'),
  ('00000004-0000-0000-0000-000000000004','c2000000-0000-0000-0000-000000000002','agent',
   'texto em contato de outro setor','text','10000000-0000-0000-0000-000000000001','sent');

-- ---------------------------------------------------------------------------
-- Migration sob teste (o arquivo real do repositorio)
-- ---------------------------------------------------------------------------
\if :{?sem_migration}
\else
\i :mig
\endif

-- ---------------------------------------------------------------------------
-- T1 — agente apaga a PROPRIA mensagem: rastro gravado, content intacto
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_ok boolean; v_row public.messages%ROWTYPE;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','a1000000-0000-0000-0000-000000000001','role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  v_ok := public.delete_message('00000001-0000-0000-0000-000000000001');
  RESET ROLE;
  IF v_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'T1 FALHOU: agente nao conseguiu apagar a propria mensagem (retorno %)', v_ok;
  END IF;
  SELECT * INTO v_row FROM public.messages WHERE id = '00000001-0000-0000-0000-000000000001';
  IF v_row.is_deleted IS NOT TRUE THEN
    RAISE EXCEPTION 'T1 FALHOU: is_deleted nao ficou true';
  END IF;
  IF v_row.deleted_by IS DISTINCT FROM '10000000-0000-0000-0000-000000000001' THEN
    RAISE EXCEPTION 'T1 FALHOU: deleted_by=%, esperado o profile do agente', v_row.deleted_by;
  END IF;
  IF v_row.deleted_at IS NULL THEN
    RAISE EXCEPTION 'T1 FALHOU: deleted_at nao foi preenchido';
  END IF;
  IF v_row.content IS DISTINCT FROM 'texto original do agente' THEN
    RAISE EXCEPTION 'T1 FALHOU: content foi alterado para % (o original devia ser preservado)', v_row.content;
  END IF;
  RAISE NOTICE 'T1 OK: apagou a propria; rastro gravado e content original preservado';
END $$;

-- ---------------------------------------------------------------------------
-- T2 — idempotente: segunda chamada devolve false e nao toca no original
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_ok boolean; v_content text;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','a1000000-0000-0000-0000-000000000001','role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  v_ok := public.delete_message('00000001-0000-0000-0000-000000000001');
  RESET ROLE;
  SELECT content INTO v_content FROM public.messages WHERE id = '00000001-0000-0000-0000-000000000001';
  IF v_ok IS NOT FALSE THEN
    RAISE EXCEPTION 'T2 FALHOU: segunda chamada devolveu % (esperado false)', v_ok;
  END IF;
  IF v_content IS DISTINCT FROM 'texto original do agente' THEN
    RAISE EXCEPTION 'T2 FALHOU: content mudou na chamada idempotente (%)', v_content;
  END IF;
  RAISE NOTICE 'T2 OK: chamada repetida e idempotente (false, original intacto)';
END $$;

-- ---------------------------------------------------------------------------
-- T3..T6 — o agente NAO apaga o que nao e dele: colega, cliente, contato que
--           nao ve e id inexistente respondem TODOS igual (42501 sem oraculo)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','a1000000-0000-0000-0000-000000000001','role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  BEGIN
    PERFORM public.delete_message('00000002-0000-0000-0000-000000000002'); -- colega
    RAISE EXCEPTION 'T3 FALHOU: agente apagou mensagem de colega';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'message_not_deletable' THEN
      RAISE EXCEPTION 'T3 FALHOU: erro inesperado (%)', SQLERRM;
    END IF;
  END;

  BEGIN
    PERFORM public.delete_message('00000003-0000-0000-0000-000000000003'); -- cliente
    RAISE EXCEPTION 'T4 FALHOU: agente apagou mensagem recebida do contato';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'message_not_deletable' THEN
      RAISE EXCEPTION 'T4 FALHOU: erro inesperado (%)', SQLERRM;
    END IF;
  END;

  BEGIN
    PERFORM public.delete_message('00000004-0000-0000-0000-000000000004'); -- fora de visibilidade
    RAISE EXCEPTION 'T5 FALHOU: agente apagou mensagem de contato que nao ve';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'message_not_deletable' THEN
      RAISE EXCEPTION 'T5 FALHOU: erro inesperado (%)', SQLERRM;
    END IF;
  END;

  BEGIN
    PERFORM public.delete_message('99999999-0000-0000-0000-000000000999'); -- inexistente
    RAISE EXCEPTION 'T6 FALHOU: id inexistente nao foi recusado';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'message_not_deletable' THEN
      RAISE EXCEPTION 'T6 FALHOU: inexistente respondeu diferente (%)', SQLERRM;
    END IF;
  END;

  RESET ROLE;
  RAISE NOTICE 'T3-T6 OK: colega, cliente, fora de visibilidade e inexistente respondem igual (sem oraculo)';
END $$;

-- estado intacto apos as recusas
DO $$
DECLARE v_c text; v_d text; v_del boolean;
BEGIN
  SELECT content, sender, is_deleted INTO v_c, v_d, v_del
    FROM public.messages WHERE id = '00000002-0000-0000-0000-000000000002';
  IF v_c <> 'texto do colega' OR v_d <> 'agent' OR v_del IS NOT NULL THEN
    RAISE EXCEPTION 'T3 colateral: mensagem do colega foi tocada (content=%, is_deleted=%)', v_c, v_del;
  END IF;
  SELECT content INTO v_c FROM public.messages WHERE id = '00000003-0000-0000-0000-000000000003';
  IF v_c <> 'texto do cliente' THEN
    RAISE EXCEPTION 'T4 colateral: mensagem do cliente foi tocada (%)', v_c;
  END IF;
  SELECT content INTO v_c FROM public.messages WHERE id = '00000004-0000-0000-0000-000000000004';
  IF v_c <> 'texto em contato de outro setor' THEN
    RAISE EXCEPTION 'T5 colateral: mensagem fora de visibilidade foi tocada (%)', v_c;
  END IF;
  RAISE NOTICE 'OK: as recusas nao alteraram nenhuma linha';
END $$;

-- ---------------------------------------------------------------------------
-- T7 — admin apaga a mensagem de colega; content original preservado
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_ok boolean; v_row public.messages%ROWTYPE;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','a3000000-0000-0000-0000-000000000003','role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  v_ok := public.delete_message('00000002-0000-0000-0000-000000000002');
  RESET ROLE;
  IF v_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'T7 FALHOU: admin nao conseguiu apagar (retorno %)', v_ok;
  END IF;
  SELECT * INTO v_row FROM public.messages WHERE id = '00000002-0000-0000-0000-000000000002';
  IF v_row.deleted_by IS DISTINCT FROM '10000000-0000-0000-0000-000000000003' THEN
    RAISE EXCEPTION 'T7 FALHOU: deleted_by=%, esperado o profile do admin', v_row.deleted_by;
  END IF;
  IF v_row.content IS DISTINCT FROM 'texto do colega' THEN
    RAISE EXCEPTION 'T7 FALHOU: content foi alterado para %', v_row.content;
  END IF;
  RAISE NOTICE 'T7 OK: admin apagou a de colega; deleted_by=admin e content original preservado';
END $$;

-- ---------------------------------------------------------------------------
-- T8/T9 — anon e service_role NAO executam a RPC (ACL negada por padrao)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM public.delete_message('00000003-0000-0000-0000-000000000003');
    RAISE EXCEPTION 'T8 FALHOU: anon executou delete_message';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'T8 OK: anon recusado (%)', SQLERRM;
  END;
  RESET ROLE;

  SET LOCAL ROLE service_role;
  BEGIN
    PERFORM public.delete_message('00000003-0000-0000-0000-000000000003');
    RAISE EXCEPTION 'T9 FALHOU: service_role executou delete_message';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'T9 OK: service_role recusado (%)', SQLERRM;
  END;
  RESET ROLE;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','a1000000-0000-0000-0000-000000000001','role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.delete_message(NULL);
    RAISE EXCEPTION 'T10 FALHOU: id nulo foi aceito';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'message_not_deletable' THEN
      RAISE EXCEPTION 'T10 FALHOU: id nulo respondeu diferente (%)', SQLERRM;
    END IF;
  END;
  RESET ROLE;

  -- T10b: autenticado sem profile (JWT sem 'sub' correspondente) nao apaga nada.
  PERFORM set_config('request.jwt.claims', json_build_object('sub','deadbeef-0000-0000-0000-000000000000','role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.delete_message('00000003-0000-0000-0000-000000000003');
    RAISE EXCEPTION 'T10b FALHOU: chamador sem profile executou delete_message';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'not_authenticated' THEN
      RAISE EXCEPTION 'T10b FALHOU: sem profile respondeu diferente (%)', SQLERRM;
    END IF;
  END;
  RESET ROLE;
  RAISE NOTICE 'T10 OK: id nulo recusado igual aos demais; chamador sem profile recusado (not_authenticated)';
END $$;

-- ---------------------------------------------------------------------------
-- T11 — ACL e colunas: authenticated executa, anon nao; rastro existe
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_ex text;
BEGIN
  IF NOT has_function_privilege('authenticated', 'public.delete_message(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'T11 FALHOU: authenticated deveria executar delete_message';
  END IF;
  IF has_function_privilege('anon', 'public.delete_message(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'T11 FALHOU: anon nao deveria executar delete_message';
  END IF;
  IF has_function_privilege('service_role', 'public.delete_message(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'T11 FALHOU: service_role nao deveria executar delete_message';
  END IF;
  SELECT string_agg(column_name, ',') INTO v_ex
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'messages'
     AND column_name IN ('deleted_by', 'deleted_at');
  IF v_ex IS NULL OR (position('deleted_by' in v_ex) = 0) OR (position('deleted_at' in v_ex) = 0) THEN
    RAISE EXCEPTION 'T11 FALHOU: colunas de rastro ausentes (%)', v_ex;
  END IF;
  RAISE NOTICE 'T11 OK: ACL (authenticated executa; anon/service_role nao) e colunas de rastro presentes';
END $$;

DO $$
BEGIN
  RAISE NOTICE 'delete_message_rpc: TODAS as assercoes passaram (T1-T11)';
END $$;

ROLLBACK;
