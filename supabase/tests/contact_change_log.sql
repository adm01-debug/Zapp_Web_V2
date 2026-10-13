-- ============================================================================
-- Trilha de alteracao de contato (contact_change_log) — prova de escrita,
-- de NAO-VAZAMENTO de PII, de isolamento por visibilidade e de rollback.
--
-- Prova que a migration 20261013051916_contact_change_log.sql faz o que promete
-- sob os PAPEIS REAIS (`authenticated` com JWT, `anon`, `service_role`) e nao
-- mais do que promete:
--   * toda edicao relevante de `contacts` gera EXATAMENTE uma linha, com o ATOR
--     certo (`performed_by` = auth.uid(), `performed_by_profile` resolvido);
--   * `campos` traz SO OS NOMES dos campos alterados — telefone, e-mail e notas
--     NUNCA aparecem como valor (prova anti-PII);
--   * UPDATE que mexe apenas em coluna fora da lista branca NAO gera linha;
--   * soft-delete e restore viram operacoes proprias, nao `update` generico;
--   * INSERT de contato gera `insert` com os campos preenchidos;
--   * a tabela e append-only: `authenticated` nao tem INSERT/UPDATE/DELETE
--     (REVOKE) e a RLS ainda nega por cima;
--   * a LEITURA segue a visibilidade do contato (is_contact_visible_to_user):
--     quem nao enxerga o contato nao ve NENHUMA linha dele; `anon` ve zero;
--     admin ve tudo;
--   * a funcao do gatilho e SECURITY DEFINER, com search_path fixo e SEM EXECUTE
--     para ninguem por assinatura (o gatilho nao passa por checagem de EXECUTE);
--   * o BLOCO DE ROLLBACK do cabecalho roda, derruba os objetos, e a migration
--     reaplica (idempotencia).
--
-- Como rodar (PostgreSQL 17 descartavel, UM arquivo, UMA transacao com ROLLBACK):
--   docker run --rm -d --name pg-contact-change-log -e POSTGRES_PASSWORD=t postgres:17-alpine
--   docker exec -i pg-contact-change-log psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
--     -v mig_dir="$PWD/supabase/migrations" \
--     -f - < supabase/tests/contact_change_log.sql
--   (sem `-v mig_dir`, assume `supabase/migrations`)
--
-- VERMELHO (o teste falha quando a protecao nao esta la): acrescente `-v sem_guarda=1`.
--   Com sem_guarda o gatilho e derrubado DENTRO da transacao — nada persiste
--   porque o arquivo termina em ROLLBACK, e a primeira assercao de escrita falha.
-- ============================================================================

\set ON_ERROR_STOP on
\if :{?mig_dir}
\else
  \set mig_dir supabase/migrations
\endif

BEGIN;

-- ── Superficie minima do ambiente (a peca auditada vem da migration logo abaixo) ──
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  ), '')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  )::text $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid(), auth.role() TO anon, authenticated, service_role;

-- `contacts` com a FORMA real das colunas da lista branca (+ internas de proposito).
CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text NOT NULL,
  email text,
  avatar_url text,
  assigned_to uuid,
  whatsapp_connection_id uuid,
  tags text[],
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  nickname text,
  surname text,
  job_title text,
  company text,
  queue_id uuid,
  contact_type text,
  ai_priority text,
  ai_sentiment text,
  channel_type text,
  channel_connection_id uuid,
  group_category text,
  lead_score integer,
  risk_score integer,
  lead_origin text,
  consent_status text,
  avatar_fetch_attempted_at timestamptz,
  conversation_status text NOT NULL DEFAULT 'open',
  conversation_status_changed_at timestamptz,
  is_lid_legacy boolean NOT NULL DEFAULT false,
  postal_code text,
  address text,
  address_number text,
  neighborhood text,
  city text,
  state text,
  latitude double precision,
  longitude double precision,
  deleted_at timestamptz,
  ai_projection_updated_at timestamptz,
  ai_projection_analysis_id uuid
);
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  name text NOT NULL
);
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role text NOT NULL
);
CREATE TABLE public.agent_visibility_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL,
  can_see_agent_id uuid NOT NULL
);
CREATE TABLE public.queue_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.contacts, public.profiles, public.user_roles,
  public.agent_visibility_grants, public.queue_members
  TO authenticated, service_role;

-- ── Predicado de visibilidade REAL, verbatim de 20260909200000 (+ deps) ──────
CREATE FUNCTION public.get_profile_id_for_user(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT profile.id FROM public.profiles AS profile
  WHERE _user_id = auth.uid() AND profile.user_id = _user_id LIMIT 1; $$;

CREATE FUNCTION public.get_visible_agent_ids(_user_id uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT profile.id FROM public.profiles AS profile
  WHERE _user_id = auth.uid() AND profile.user_id = _user_id
  UNION
  SELECT visibility.can_see_agent_id
  FROM public.agent_visibility_grants AS visibility
  JOIN public.profiles AS viewer ON viewer.id = visibility.agent_id
  WHERE _user_id = auth.uid() AND viewer.user_id = _user_id
    AND EXISTS (SELECT 1 FROM public.user_roles AS role_assignment
                 WHERE role_assignment.user_id = _user_id
                   AND role_assignment.role = 'special_agent'); $$;

CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles
                  WHERE user_id = _user_id AND role IN ('admin','supervisor')); $$;

CREATE FUNCTION public.is_contact_visible_to_user(_contact_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT _user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.contacts AS contact
      WHERE contact.id = _contact_id
        AND (
          public.is_admin_or_supervisor(_user_id)
          OR contact.assigned_to IN (SELECT public.get_visible_agent_ids(_user_id))
          OR EXISTS (SELECT 1 FROM public.queue_members AS member
                      WHERE member.queue_id = contact.queue_id
                        AND member.profile_id = public.get_profile_id_for_user(_user_id)
                        AND member.is_active = true)
        )); $$;

GRANT EXECUTE ON FUNCTION
  public.get_profile_id_for_user(uuid), public.get_visible_agent_ids(uuid),
  public.is_admin_or_supervisor(uuid), public.is_contact_visible_to_user(uuid, uuid)
  TO authenticated, service_role;

-- ── Fixtures ────────────────────────────────────────────────────────────────
INSERT INTO public.profiles (id, user_id, name) VALUES
  ('a0000000-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-11111111111a', 'ADMIN'),
  ('b0000000-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-22222222222b', 'AGENTE B'),
  ('c0000000-0000-0000-0000-00000000000c', '33333333-3333-3333-3333-33333333333c', 'AGENTE C');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('11111111-1111-1111-1111-11111111111a', 'admin'),
  ('22222222-2222-2222-2222-22222222222b', 'agent'),
  ('33333333-3333-3333-3333-33333333333c', 'agent');
-- c1 e do agente B; c2 e do agente C. Logo B nao enxerga c2 e C nao enxerga c1.
INSERT INTO public.contacts (id, name, phone, assigned_to) VALUES
  ('d1000000-0000-0000-0000-000000000001', 'Contato Um', '5511911110000', 'b0000000-0000-0000-0000-00000000000b'),
  ('d2000000-0000-0000-0000-000000000002', 'Contato Dois', '5511922220000', 'c0000000-0000-0000-0000-00000000000c');

-- ── A PECA AUDITADA, verbatim da migration real ─────────────────────────────
\echo '── aplicando a migration REAL (tabela + RLS + funcao SECURITY DEFINER + gatilho) ──'
\i :mig_dir/20261013051916_contact_change_log.sql

-- ── Modo vermelho: a correcao ausente ──────────────────────────────────────
\if :{?sem_guarda}
  DROP TRIGGER IF EXISTS trg_contact_change_log ON public.contacts;
  \echo '  [sem_guarda] o gatilho trg_contact_change_log foi derrubado DENTRO da transacao'
\endif

-- ── Helper de assercao ─────────────────────────────────────────────────────
CREATE FUNCTION pg_temp.espera(p_label text, p_atual text, p_esperado text) RETURNS void
LANGUAGE plpgsql AS $h$
BEGIN
  IF p_atual IS DISTINCT FROM p_esperado THEN
    RAISE EXCEPTION 'FALHOU [%]: esperado [%], obtido [%]', p_label, p_esperado, p_atual;
  END IF;
  RAISE NOTICE 'PASS [%] -> %', p_label, p_atual;
END $h$;

-- ============================================================================
-- E. ESTRUTURA: tabela, RLS, funcao, gatilho, policies, ACL
-- ============================================================================
SELECT pg_temp.espera('E.1 tabela existe e e append-only (identidade na PK)',
  (SELECT count(*)::text FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'contact_change_log' AND c.relkind = 'r'), '1');
SELECT pg_temp.espera('E.2 RLS ligada',
  (SELECT relrowsecurity::text FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'contact_change_log'), 'true');
SELECT pg_temp.espera('E.3 as 4 colunas do pedido existem (contact_id, operation, campos, performed_by)',
  (SELECT count(*)::text FROM pg_attribute a
     JOIN pg_class c ON c.oid = a.attrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'contact_change_log'
      AND a.attname IN ('contact_id','operation','campos','performed_by')
      AND a.attnum > 0 AND NOT a.attisdropped), '4');
SELECT pg_temp.espera('E.4 campos e text[]',
  (SELECT format_type(a.atttypid, a.atttypmod) FROM pg_attribute a
     JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'contact_change_log' AND a.attname = 'campos'),
  'text[]');
SELECT pg_temp.espera('E.5 contact_id sem FK (a trilha sobrevive ao contato)',
  (SELECT count(*)::text FROM pg_constraint
    WHERE conrelid = 'public.contact_change_log'::regclass AND contype = 'f'), '0');
SELECT pg_temp.espera('E.6 funcao do gatilho e SECURITY DEFINER',
  (SELECT prosecdef::text FROM pg_proc WHERE oid = 'public.log_contact_change()'::regprocedure), 'true');
SELECT pg_temp.espera('E.7 search_path fixo (public, pg_temp)',
  (SELECT array_to_string(proconfig, ',') FROM pg_proc WHERE oid = 'public.log_contact_change()'::regprocedure),
  'search_path=public, pg_temp');
SELECT pg_temp.espera('E.8 PUBLIC sem EXECUTE na funcao',
  (SELECT (NOT EXISTS (SELECT 1 FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                        WHERE p.oid = 'public.log_contact_change()'::regprocedure
                          AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'))::text), 'true');
SELECT pg_temp.espera('E.9 anon sem EXECUTE', has_function_privilege('anon','public.log_contact_change()','EXECUTE')::text, 'false');
SELECT pg_temp.espera('E.10 authenticated sem EXECUTE', has_function_privilege('authenticated','public.log_contact_change()','EXECUTE')::text, 'false');
SELECT pg_temp.espera('E.11 service_role sem EXECUTE', has_function_privilege('service_role','public.log_contact_change()','EXECUTE')::text, 'false');
SELECT pg_temp.espera('E.12 gatilho e AFTER INSERT OR UPDATE (e nao DELETE/INSTEAD)',
  (SELECT (((tgtype & 2) = 0) AND ((tgtype & 4) = 4) AND ((tgtype & 16) = 16)
           AND ((tgtype & 8) = 0) AND ((tgtype & 64) = 0))::text
     FROM pg_trigger WHERE tgname = 'trg_contact_change_log'), 'true');
SELECT pg_temp.espera('E.13 gatilho e FOR EACH ROW (nao statement)',
  (SELECT ((tgtype & 1) = 1)::text FROM pg_trigger WHERE tgname = 'trg_contact_change_log'), 'true');
SELECT pg_temp.espera('E.14 nenhuma policy para anon (zero linhas)',
  (SELECT count(*)::text FROM pg_policies WHERE schemaname = 'public'
     AND tablename = 'contact_change_log' AND 'anon' = any(roles)), '0');
SELECT pg_temp.espera('E.15 uma unica policy de SELECT, e para authenticated',
  (SELECT count(*)::text FROM pg_policies WHERE schemaname = 'public'
     AND tablename = 'contact_change_log' AND cmd = 'SELECT'), '1');
SELECT pg_temp.espera('E.16 a policy de SELECT usa a visibilidade do contato',
  (SELECT (position('is_contact_visible_to_user' in coalesce(qual, '')) > 0)::text
     FROM pg_policies WHERE schemaname = 'public' AND tablename = 'contact_change_log' AND cmd = 'SELECT'), 'true');

-- ============================================================================
-- W. ESCRITA: uma linha por alteracao, ator correto, sem valor de PII
-- ============================================================================
SET LOCAL ROLE authenticated;
DO $j$ BEGIN PERFORM set_config('request.jwt.claims',
  json_build_object('sub', '22222222-2222-2222-2222-22222222222b')::text, true); END $j$;
-- edicao multi-campo (1 linha, 3 campos)
UPDATE public.contacts SET name = 'Contato Um Editado', phone = '5511988887777',
       email = 'pii-nao-pode-vazar@example.test' WHERE id = 'd1000000-0000-0000-0000-000000000001';
-- edicao so de coluna fora da lista branca (0 linhas)
UPDATE public.contacts SET ai_projection_updated_at = now() WHERE id = 'd1000000-0000-0000-0000-000000000001';
-- soft-delete e restore
UPDATE public.contacts SET deleted_at = now() WHERE id = 'd1000000-0000-0000-0000-000000000001';
UPDATE public.contacts SET deleted_at = null WHERE id = 'd1000000-0000-0000-0000-000000000001';
-- nascimento de contato (com nota secreta, que NUNCA deve entrar na trilha)
INSERT INTO public.contacts (id, name, phone, notes, assigned_to)
  VALUES ('d3000000-0000-0000-0000-000000000003', 'Contato Tres', '5511933330000',
          'NOTA-SECRETA-NAO-VAZAR', 'b0000000-0000-0000-0000-00000000000b');
RESET ROLE;

SELECT pg_temp.espera('W.1 a edicao multi-campo gerou UMA linha',
  (SELECT count(*)::text FROM public.contact_change_log
    WHERE contact_id = 'd1000000-0000-0000-0000-000000000001' AND operation = 'update'), '1');
SELECT pg_temp.espera('W.2 ator e o uid do JWT',
  (SELECT performed_by::text FROM public.contact_change_log
    WHERE contact_id = 'd1000000-0000-0000-0000-000000000001' AND operation = 'update'),
  '22222222-2222-2222-2222-22222222222b');
SELECT pg_temp.espera('W.3 performed_by_profile resolvido',
  (SELECT performed_by_profile::text FROM public.contact_change_log
    WHERE contact_id = 'd1000000-0000-0000-0000-000000000001' AND operation = 'update'),
  'b0000000-0000-0000-0000-00000000000b');
SELECT pg_temp.espera('W.4 campos tem os 3 nomes alterados (name, phone, email)',
  (SELECT array_to_string(campos, ',') FROM public.contact_change_log
    WHERE contact_id = 'd1000000-0000-0000-0000-000000000001' AND operation = 'update'),
  'email,name,phone');
SELECT pg_temp.espera('W.5 UPDATE so de ai_projection_updated_at NAO gerou linha',
  (SELECT count(*)::text FROM public.contact_change_log
    WHERE contact_id = 'd1000000-0000-0000-0000-000000000001' AND 'ai_projection_updated_at' = any(campos)), '0');
SELECT pg_temp.espera('W.6 soft-delete vira operacao propria',
  (SELECT operation FROM public.contact_change_log
    WHERE contact_id = 'd1000000-0000-0000-0000-000000000001' AND operation = 'soft_delete'), 'soft_delete');
SELECT pg_temp.espera('W.7 restore vira operacao propria',
  (SELECT operation FROM public.contact_change_log
    WHERE contact_id = 'd1000000-0000-0000-0000-000000000001' AND operation = 'restore'), 'restore');
SELECT pg_temp.espera('W.8 INSERT gera 1 linha com operation = insert',
  (SELECT count(*)::text FROM public.contact_change_log
    WHERE contact_id = 'd3000000-0000-0000-0000-000000000003' AND operation = 'insert'), '1');
SELECT pg_temp.espera('W.9 INSERT lista os campos preenchidos, sem os internos',
  (SELECT array_to_string(campos, ',') FROM public.contact_change_log
    WHERE contact_id = 'd3000000-0000-0000-0000-000000000003'),
  'assigned_to,conversation_status,name,notes,phone');
SELECT pg_temp.espera('W.10 ator registrado tambem no INSERT',
  (SELECT performed_by::text FROM public.contact_change_log
    WHERE contact_id = 'd3000000-0000-0000-0000-000000000003'),
  '22222222-2222-2222-2222-22222222222b');
-- Anti-PII: NENHUM valor de coluna entrou em `campos` (so nomes).
SELECT pg_temp.espera('W.11 campos NUNCA carrega o telefone editado',
  (SELECT (position('5511988887777' in coalesce(array_to_string(campos, '|'), '')) = 0)::text
     FROM public.contact_change_log WHERE contact_id = 'd1000000-0000-0000-0000-000000000001' AND operation = 'update'), 'true');
SELECT pg_temp.espera('W.12 campos NUNCA carrega o e-mail',
  (SELECT (position('pii-nao-pode-vazar@example.test' in coalesce(array_to_string(campos, '|'), '')) = 0)::text
     FROM public.contact_change_log WHERE contact_id = 'd1000000-0000-0000-0000-000000000001' AND operation = 'update'), 'true');
SELECT pg_temp.espera('W.13 campos NUNCA carrega a nota secreta',
  (SELECT (position('NOTA-SECRETA-NAO-VAZAR' in coalesce(array_to_string(campos, '|'), '')) = 0)::text
     FROM public.contact_change_log WHERE contact_id = 'd3000000-0000-0000-0000-000000000003'), 'true');
SELECT pg_temp.espera('W.14 nenhum valor de PII na trilha inteira (telefone antigo)',
  (SELECT (position('5511911110000' in coalesce(string_agg(array_to_string(campos, '|'), '~'), '')) = 0)::text
     FROM public.contact_change_log), 'true');

-- ============================================================================
-- L. LEITURA: isolamento por visibilidade do contato, sob papeis reais
-- ============================================================================
-- Agente C (nao enxerga c1): zero linhas de c1
SET LOCAL ROLE authenticated;
DO $j$ BEGIN PERFORM set_config('request.jwt.claims',
  json_build_object('sub', '33333333-3333-3333-3333-33333333333c')::text, true); END $j$;
SELECT pg_temp.espera('L.1 agente sem visibilidade ve ZERO linhas do contato alheio',
  (SELECT count(*)::text FROM public.contact_change_log
    WHERE contact_id = 'd1000000-0000-0000-0000-000000000001'), '0');
SELECT pg_temp.espera('L.2 agente sem visibilidade nao ve a trilha toda',
  (SELECT count(*)::text FROM public.contact_change_log), '0');
RESET ROLE;

-- Agente B (dono de c1): ve as linhas de c1
SET LOCAL ROLE authenticated;
DO $j$ BEGIN PERFORM set_config('request.jwt.claims',
  json_build_object('sub', '22222222-2222-2222-2222-22222222222b')::text, true); END $j$;
SELECT pg_temp.espera('L.3 dono do contato ve as linhas dele',
  (SELECT count(*)::text FROM public.contact_change_log
    WHERE contact_id = 'd1000000-0000-0000-0000-000000000001'), '3');
RESET ROLE;

-- Admin: enxerga tudo
SET LOCAL ROLE authenticated;
DO $j$ BEGIN PERFORM set_config('request.jwt.claims',
  json_build_object('sub', '11111111-1111-1111-1111-11111111111a')::text, true); END $j$;
SELECT pg_temp.espera('L.4 admin enxerga todas as linhas',
  (SELECT count(*)::text FROM public.contact_change_log), '4');
RESET ROLE;

-- anon: sem policy de RLS E sem ACL = nao le nada
SET LOCAL ROLE anon;
DO $a$
DECLARE n bigint;
BEGIN
  BEGIN
    SELECT count(*) INTO n FROM public.contact_change_log;
    IF n <> 0 THEN RAISE EXCEPTION 'FALHOU [L.5]: anon leu % linhas', n; END IF;
    RAISE NOTICE 'PASS [L.5] anon nao le nada (0 linhas)';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS [L.5] anon barrado por ACL (%)', SQLERRM;
  END;
END $a$;
RESET ROLE;

-- ============================================================================
-- F. APPEND-ONLY: o cliente nao escreve direto na trilha
-- ============================================================================
SELECT pg_temp.espera('F.1 authenticated tem SELECT',
  has_table_privilege('authenticated','public.contact_change_log','SELECT')::text, 'true');
SELECT pg_temp.espera('F.2 authenticated NAO tem INSERT',
  has_table_privilege('authenticated','public.contact_change_log','INSERT')::text, 'false');
SELECT pg_temp.espera('F.3 authenticated NAO tem UPDATE',
  has_table_privilege('authenticated','public.contact_change_log','UPDATE')::text, 'false');
SELECT pg_temp.espera('F.4 authenticated NAO tem DELETE',
  has_table_privilege('authenticated','public.contact_change_log','DELETE')::text, 'false');
SELECT pg_temp.espera('F.5 anon NAO tem SELECT',
  has_table_privilege('anon','public.contact_change_log','SELECT')::text, 'false');
SELECT pg_temp.espera('F.6 service_role NAO tem escrita direta',
  (has_table_privilege('service_role','public.contact_change_log','INSERT')
   OR has_table_privilege('service_role','public.contact_change_log','UPDATE')
   OR has_table_privilege('service_role','public.contact_change_log','DELETE'))::text, 'false');

SET LOCAL ROLE authenticated;
DO $j$ BEGIN PERFORM set_config('request.jwt.claims',
  json_build_object('sub', '22222222-2222-2222-2222-22222222222b')::text, true); END $j$;
DO $f$
BEGIN
  BEGIN
    INSERT INTO public.contact_change_log (contact_id, operation, campos)
      VALUES ('d1000000-0000-0000-0000-000000000001', 'update', array['forjado']);
    RAISE EXCEPTION 'FALHOU [F.7]: authenticated conseguiu inserir direto na trilha';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS [F.7] INSERT direto barrado (%)', SQLERRM;
  END;
END $f$;
RESET ROLE;
SELECT pg_temp.espera('F.8 nenhuma linha forjada entrou',
  (SELECT count(*)::text FROM public.contact_change_log WHERE 'forjado' = any(campos)), '0');

-- ============================================================================
-- R. ROLLBACK: o bloco do cabecalho roda, derruba tudo, e a migration reaplica
-- ============================================================================
\echo '── executando o rollback do cabecalho (drop trigger -> drop function -> drop table) ──'
DROP TRIGGER IF EXISTS trg_contact_change_log ON public.contacts;
DROP FUNCTION IF EXISTS public.log_contact_change();
DROP TABLE IF EXISTS public.contact_change_log;

SELECT pg_temp.espera('R.1 apos o rollback o gatilho sumiu',
  (SELECT count(*)::text FROM pg_trigger WHERE tgname = 'trg_contact_change_log'), '0');
SELECT pg_temp.espera('R.2 apos o rollback a funcao sumiu',
  (SELECT to_regprocedure('public.log_contact_change()') IS NULL)::text, 'true');
SELECT pg_temp.espera('R.3 apos o rollback a tabela sumiu',
  (SELECT to_regclass('public.contact_change_log') IS NULL)::text, 'true');

\echo '── reaplicando a migration (idempotencia) ──'
\i :mig_dir/20261013051916_contact_change_log.sql
SELECT pg_temp.espera('R.4 reaplicada: tabela de volta',
  (SELECT to_regclass('public.contact_change_log') IS NOT NULL)::text, 'true');
SELECT pg_temp.espera('R.5 reaplicada: gatilho de volta',
  (SELECT count(*)::text FROM pg_trigger WHERE tgname = 'trg_contact_change_log'), '1');
SELECT pg_temp.espera('R.6 reaplicada: funcao de volta e ainda sem EXECUTE para authenticated',
  has_function_privilege('authenticated','public.log_contact_change()','EXECUTE')::text, 'false');

ROLLBACK;
\echo 'PASS: contact_change_log — 1 linha por edicao com ator certo, SO os nomes dos campos (sem PII), UPDATE irrelevante nao grava, soft-delete/restore proprios, leitura sob a visibilidade do contato, append-only, e rollback provado.'
