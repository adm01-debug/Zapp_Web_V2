-- tc002_find_or_create_direct_pair — TC-002 (#55): a RPC de conversa direta sob DUAS
-- transações SIMULTÂNEAS para o mesmo par (item 55 / #55; cartão t_33c5f2c0).
--
-- Prova portada de scripts/db-audit/tc002-direct-conversation-race.test.sh, que saiu do
-- repositório: scripts/ci/check-test-inventory.mjs só aceita .test.sh novo em scripts/db-audit
-- se ele estiver citado NOMINALMENTE em db-guard.yml (não existe glob para .test.sh), e nem o
-- workflow nem scripts/ci/ são deste cartão. supabase/tests/*.sql é o caminho que já existe
-- para prova de banco: nenhum passo de workflow precisa ser criado.
--
-- O QUE PROVA (RPC REAL public.find_or_create_direct_conversation; arquivos REAIS do repositório):
--   A1-A4  o defeito tem dentes: com os dois corpos regredidos (20260927270007 + 20260929190000),
--          duas transações concorrentes para o MESMO par devolvem ids DIFERENTES e deixam DUAS
--          conversas diretas, as duas com o par ordenado NULL (o índice único deixa de arbitrar);
--   B1-B18 a cadeia ATIVA — 20260927270007 + 20260929190000 + 20261006152414, a última definição
--          da RPC em dia/2026-10-16 (commit bff18177fd) — já protege: as duas transações devolvem
--          o MESMO id, fica UMA conversa com os DOIS membros usando o member_role PADRÃO, o par
--          ordenado é gravado, os dois lados leem a conversa por RLS e um terceiro não, chamada
--          seguinte devolve o mesmo id, a linha legada sem par não duplica, self e other_profile_id
--          nulo NÃO criam conversa e a ACL da função não muda;
--   C1-C5  idempotência e rollback: reaplicar 20261006152414 não falha, o bloco `-- Rollback:` do
--          PRÓPRIO arquivo executa e devolve o corpo regredido (a corrida volta a duplicar), e
--          reaplicar restaura a proteção.
--
-- COMO RODA. Postgres 17 descartável com o repositório montado em /repo (o arquivo cria roles,
-- schema auth e as duas tabelas À MÃO, então só roda em banco descartável — a guarda do topo
-- recusa qualquer banco que já tenha as roles, isto é, banco da tarefa ou de produção):
--   docker run --rm -d --name zapp-v2-tc002-$$ -v "$PWD:/repo:ro" \
--     -e POSTGRES_PASSWORD=test_only postgres:17-alpine
--   docker exec -i zapp-v2-tc002-$$ psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
--     < supabase/tests/tc002_find_or_create_direct_pair.sql
--   docker rm -f zapp-v2-tc002-$$
-- VERMELHO (só o defeito, sem a cadeia ativa): o mesmo comando com -v sem_fix=1 — o arquivo prova
-- o bloco A e para antes de aplicar 20261006152414.
-- A concorrência é REAL: duas conexões dblink na MESMA instância, cada uma com
-- SET LOCAL ROLE authenticated + request.jwt.claims (papéis reais, sem superusuário no caminho
-- testado), com a sessão A mantendo a transação ABERTA enquanto a sessão B entra — como o
-- PostgREST faria.

\set ON_ERROR_STOP on

\if :{?fix}
\else
  \set fix '/repo/supabase/migrations/20261006152414_team_chat_direct_conversation_race_guard.sql'
\endif
\if :{?pre_e16}
\else
  \set pre_e16 '/repo/supabase/migrations/20260927270007_team_chat_e16_find_or_create_direct_conversation.sql'
\endif
\if :{?pre_e29}
\else
  \set pre_e29 '/repo/supabase/migrations/20260929190000_team_chat_e29_conversations_constraints.sql'
\endif

-- ---------------------------------------------------------------------------
-- Guarda: este arquivo cria roles/auth/tabelas à mão. Só roda em banco descartável.
-- ---------------------------------------------------------------------------
DO $guarda$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role')) THEN
    RAISE EXCEPTION 'tc002: recusado — este arquivo cria roles, schema auth e tabelas a mao; rode SO em Postgres descartavel (receita no cabecalho)';
  END IF;
END;
$guarda$;

CREATE TEMP TABLE tc002_cfg AS SELECT :'fix'::text AS fix_path;
CREATE TEMP TABLE tc002_estado (chave text PRIMARY KEY, valor text);

CREATE TEMP TABLE tc002_pessoa AS
SELECT * FROM (VALUES
  ('ATILA', 'a0000000-0000-0000-0000-000000000001'::uuid,
   '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}'::text),
  ('DORA',  'a0000000-0000-0000-0000-000000000002'::uuid,
   '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}'::text),
  ('EVA',   'a0000000-0000-0000-0000-000000000003'::uuid,
   '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}'::text),
  ('OTTO',  'a0000000-0000-0000-0000-000000000004'::uuid,
   '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}'::text)
) AS p(quem, profile_id, jwt);

-- ---------------------------------------------------------------------------
-- Superfície mínima do Supabase, criada à mão (forma canônica do repositório).
-- É COMITADA antes das sessões dblink: DDL não comitada é invisível para outra conexão,
-- e sem isso a corrida não teria como acontecer.
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
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  role text DEFAULT 'agent',
  is_active boolean DEFAULT true
);

CREATE TABLE public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text
);

CREATE TABLE public.team_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL DEFAULT 'direct',
  name text,
  avatar_url text,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  department_id uuid REFERENCES public.departments(id),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT team_conversations_type_check CHECK (type IN ('direct', 'group', 'department'))
);

CREATE TABLE public.team_conversation_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.team_conversations(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_read_at timestamptz DEFAULT now(),
  is_muted boolean DEFAULT false,
  is_pinned boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  member_role text NOT NULL DEFAULT 'member',
  UNIQUE (conversation_id, profile_id),
  CONSTRAINT team_conversation_members_member_role_check CHECK (member_role IN ('owner', 'admin', 'member'))
);

CREATE OR REPLACE FUNCTION public.current_profile_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
  AS $function$ SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1; $function$;
REVOKE EXECUTE ON FUNCTION public.current_profile_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_profile_id() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_team_conversation_member(_user_id uuid, _conversation_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
  AS $function$
    SELECT EXISTS (
      SELECT 1 FROM public.team_conversation_members tcm
      JOIN public.profiles p ON p.id = tcm.profile_id
      WHERE tcm.conversation_id = _conversation_id AND p.user_id = _user_id
    );
  $function$;
REVOKE EXECUTE ON FUNCTION public.is_team_conversation_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_team_conversation_member(uuid, uuid) TO authenticated, service_role;

ALTER TABLE public.team_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_conversation_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY team_conversations_select_members ON public.team_conversations FOR SELECT TO authenticated
  USING (public.is_team_conversation_member(auth.uid(), id)
         OR created_by = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1));
CREATE POLICY team_conversation_members_select_members ON public.team_conversation_members FOR SELECT TO authenticated
  USING (public.is_team_conversation_member(auth.uid(), conversation_id));

GRANT SELECT ON public.team_conversations TO authenticated;
GRANT SELECT ON public.team_conversation_members TO authenticated;
GRANT SELECT ON public.profiles TO authenticated;

INSERT INTO public.profiles (id, user_id, role)
SELECT profile_id, (jwt::jsonb ->> 'sub')::uuid, 'agent' FROM tc002_pessoa;

-- Duas conexões de verdade, na mesma instância, para a corrida.
CREATE EXTENSION IF NOT EXISTS dblink;
SELECT dblink_connect('tc002_a', 'dbname=postgres application_name=tc002_a');
SELECT dblink_connect('tc002_b', 'dbname=postgres application_name=tc002_b');

-- ---------------------------------------------------------------------------
-- Helpers (temporários, da sessão do psql)
-- ---------------------------------------------------------------------------
CREATE FUNCTION pg_temp.tc002_jwt(p_quem text) RETURNS text
LANGUAGE sql STABLE AS $h$ SELECT jwt FROM tc002_pessoa WHERE quem = p_quem $h$;

CREATE FUNCTION pg_temp.tc002_perfil(p_quem text) RETURNS uuid
LANGUAGE sql STABLE AS $h$ SELECT profile_id FROM tc002_pessoa WHERE quem = p_quem $h$;

CREATE FUNCTION pg_temp.tc002_afirmar(p_rotulo text, p_esperado text, p_obtido text) RETURNS void
LANGUAGE plpgsql AS $h$
BEGIN
  IF p_obtido IS DISTINCT FROM p_esperado THEN
    RAISE EXCEPTION 'FALHOU — %: esperado %, obtido %',
      p_rotulo, quote_nullable(p_esperado), quote_nullable(p_obtido);
  END IF;
  RAISE NOTICE 'OK — %', p_rotulo;
END;
$h$;

CREATE FUNCTION pg_temp.tc002_afirmar_diferente(p_rotulo text, p_a text, p_b text) RETURNS void
LANGUAGE plpgsql AS $h$
BEGIN
  IF p_a IS NULL OR p_b IS NULL THEN
    RAISE EXCEPTION 'FALHOU — %: as duas transacoes precisam devolver um id (%, %)', p_rotulo, p_a, p_b;
  END IF;
  IF p_a = p_b THEN
    RAISE EXCEPTION 'FALHOU — %: as duas transacoes devolveram o MESMO id (%)', p_rotulo, p_a;
  END IF;
  RAISE NOTICE 'OK — % (ids distintos: % / %)', p_rotulo, p_a, p_b;
END;
$h$;

-- Duas transações SIMULTÂNEAS para o mesmo par: A insere e fica com a transação ABERTA
-- (sem comitar) enquanto B entra pela segunda conexão. Só depois A comita — se o UPSERT do
-- par estiver arbitrando o índice único, B espera A e devolve o MESMO id.
CREATE FUNCTION pg_temp.tc002_corrida(
  p_jwt_a text, p_alvo_a uuid, p_jwt_b text, p_alvo_b uuid
) RETURNS TABLE(id_a uuid, id_b uuid, b_esperou boolean)
LANGUAGE plpgsql AS $h$
DECLARE
  v_id_a uuid;
  v_id_b uuid;
  v_esperou boolean := false;
  v_i integer;
BEGIN
  PERFORM dblink_exec('tc002_a', 'BEGIN');
  PERFORM dblink_exec('tc002_a', 'SET LOCAL ROLE authenticated');
  PERFORM dblink_exec('tc002_a', format('SET LOCAL request.jwt.claims = %L', p_jwt_a));
  SELECT t.r INTO v_id_a
    FROM dblink('tc002_a',
      format('SELECT public.find_or_create_direct_conversation(%L::uuid) AS r', p_alvo_a)) AS t(r uuid);

  PERFORM dblink_exec('tc002_b', 'BEGIN');
  PERFORM dblink_exec('tc002_b', 'SET LOCAL ROLE authenticated');
  PERFORM dblink_exec('tc002_b', format('SET LOCAL request.jwt.claims = %L', p_jwt_b));
  PERFORM dblink_send_query('tc002_b',
    format('SELECT public.find_or_create_direct_conversation(%L::uuid)::text', p_alvo_b));

  -- B terminou sozinho (o defeito não toca o índice) ou está esperando o índice de A?
  FOR v_i IN 1..160 LOOP
    EXIT WHEN dblink_is_busy('tc002_b') = 0;
    SELECT EXISTS (
      SELECT 1 FROM pg_stat_activity
       WHERE application_name = 'tc002_b' AND wait_event_type = 'Lock'
    ) INTO v_esperou;
    EXIT WHEN v_esperou;
    PERFORM pg_sleep(0.05);
  END LOOP;

  PERFORM dblink_exec('tc002_a', 'COMMIT');

  SELECT t.r::uuid INTO v_id_b FROM dblink_get_result('tc002_b') AS t(r text);
  PERFORM dblink_get_result('tc002_b');   -- drena o resultado até o fim
  PERFORM dblink_exec('tc002_b', 'COMMIT');

  id_a := v_id_a;
  id_b := v_id_b;
  b_esperou := v_esperou;
  RETURN NEXT;
END;
$h$;

-- ===========================================================================
-- A — os corpos regredidos (o defeito), com as migrations REAIS do repositório
-- ===========================================================================
\echo '== A: corpos regredidos (o defeito) — 20260927270007 + 20260929190000 =='
\i :pre_e16
\i :pre_e29

DELETE FROM public.team_conversation_members;
DELETE FROM public.team_conversations;

DO $a_0$
DECLARE v text;
BEGIN
  SELECT count(*)::text INTO v FROM public.team_conversations WHERE type = 'direct';
  PERFORM pg_temp.tc002_afirmar('A.0 ponto de partida: nenhuma conversa direta ainda', '0', v);
END;
$a_0$;

DO $a_1$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM pg_temp.tc002_corrida(
    pg_temp.tc002_jwt('ATILA'), pg_temp.tc002_perfil('DORA'),
    pg_temp.tc002_jwt('DORA'),  pg_temp.tc002_perfil('ATILA'));
  PERFORM pg_temp.tc002_afirmar_diferente('A.1 (DEFEITO) as duas transacoes concorrentes devolvem ids DIFERENTES',
    r.id_a::text, r.id_b::text);
  PERFORM pg_temp.tc002_afirmar('A.1b (DEFEITO) e B nao ficou esperando o indice unico do par', 'false', r.b_esperou::text);
END;
$a_1$;

DO $a_2$
DECLARE v text;
BEGIN
  SELECT count(*)::text INTO v FROM public.team_conversations WHERE type = 'direct';
  PERFORM pg_temp.tc002_afirmar('A.2 (DEFEITO) ficaram DUAS conversas diretas para o mesmo par', '2', v);
  SELECT count(*)::text INTO v FROM public.team_conversations
   WHERE type = 'direct' AND direct_member_a IS NULL AND direct_member_b IS NULL;
  PERFORM pg_temp.tc002_afirmar('A.3 (DEFEITO) as duas nasceram com o par ordenado NULL (o indice nao arbitra)', '2', v);
  SELECT count(*)::text INTO v FROM (
    SELECT conversation_id FROM public.team_conversation_members
     GROUP BY conversation_id HAVING count(*) = 2) x;
  PERFORM pg_temp.tc002_afirmar('A.4 (DEFEITO) e com os dois membros cada (duplicata completa)', '2', v);
END;
$a_2$;

\if :{?sem_fix}
  \echo '== sem_fix=1: o defeito do bloco A foi reproduzido e 20261006152414 NAO foi aplicada =='
  \echo '== rode sem -v sem_fix=1 para aplicar a cadeia ativa e ver os blocos B e C =='
  \quit
\endif

-- ===========================================================================
-- B — cadeia ativa aplicada (a proteção que já está em dia/2026-10-16)
-- ===========================================================================
\echo '== B: cadeia ativa aplicada (20261006152414) =='
\i :fix

DELETE FROM public.team_conversation_members;
DELETE FROM public.team_conversations;

DO $b_0$
BEGIN
  RAISE NOTICE 'OK — B.0 a cadeia ativa (20261006152414) foi aplicada no PostgreSQL descartavel';
END;
$b_0$;

DO $b_1$
DECLARE v text;
BEGIN
  SELECT has_function_privilege('authenticated', 'public.find_or_create_direct_conversation(uuid)', 'EXECUTE')::text
         || '|' ||
         has_function_privilege('anon', 'public.find_or_create_direct_conversation(uuid)', 'EXECUTE')::text
    INTO v;
  PERFORM pg_temp.tc002_afirmar('B.1 authenticated executa a RPC; anon NAO executa', 'true|false', v);

  SELECT count(*)::text INTO v
    FROM aclexplode((SELECT proacl FROM pg_proc
                      WHERE oid = 'public.find_or_create_direct_conversation(uuid)'::regprocedure))
   WHERE grantee = 0 AND privilege_type = 'EXECUTE';
  PERFORM pg_temp.tc002_afirmar('B.2 PUBLIC (grantee 0) segue sem EXECUTE', '0', v);
END;
$b_1$;

DO $b_3$
DECLARE v text;
BEGIN
  SELECT string_agg(r.rolname, ',' ORDER BY r.rolname) INTO v
    FROM aclexplode((SELECT proacl FROM pg_proc
                      WHERE oid = 'public.find_or_create_direct_conversation(uuid)'::regprocedure)) a
    JOIN pg_roles r ON r.oid = a.grantee
   WHERE a.privilege_type = 'EXECUTE' AND r.rolname <> 'postgres';
  PERFORM pg_temp.tc002_afirmar('B.3 no estado ativo quem executa a RPC e authenticated,service_role (anon e PUBLIC ficam de fora)',
    'authenticated,service_role', v);
END;
$b_3$;

DO $b_4$
DECLARE r record; v_id text;
BEGIN
  SELECT * INTO r FROM pg_temp.tc002_corrida(
    pg_temp.tc002_jwt('ATILA'), pg_temp.tc002_perfil('DORA'),
    pg_temp.tc002_jwt('DORA'),  pg_temp.tc002_perfil('ATILA'));
  IF r.id_a IS NULL OR r.id_b IS NULL THEN
    RAISE EXCEPTION 'B.4 a corrida nao devolveu os dois ids (% / %)', r.id_a, r.id_b;
  END IF;
  PERFORM pg_temp.tc002_afirmar('B.4 duas transacoes concorrentes devolvem o MESMO id', r.id_a::text, r.id_b::text);
  PERFORM pg_temp.tc002_afirmar('B.4b e B esperou o indice unico do par (arbitro real)', 'true', r.b_esperou::text);
  v_id := r.id_a::text;

  PERFORM pg_temp.tc002_afirmar('B.5 ficou UMA unica conversa direta', '1', (
    SELECT count(*)::text FROM public.team_conversations WHERE type = 'direct'));
  PERFORM pg_temp.tc002_afirmar('B.6 ...com os DOIS membros', '2', (
    SELECT count(*)::text FROM public.team_conversation_members WHERE conversation_id = v_id::uuid));
  PERFORM pg_temp.tc002_afirmar('B.7 ...e os dois membros com o member_role PADRAO', 'member|member', (
    SELECT string_agg(member_role, '|' ORDER BY profile_id)
      FROM public.team_conversation_members WHERE conversation_id = v_id::uuid));
  PERFORM pg_temp.tc002_afirmar('B.8 o par ordenado canonico foi gravado (o indice unico arbitra)',
    pg_temp.tc002_perfil('ATILA')::text || '|' || pg_temp.tc002_perfil('DORA')::text, (
    SELECT direct_member_a::text || '|' || direct_member_b::text
      FROM public.team_conversations WHERE id = v_id::uuid));
END;
$b_4$;

-- RLS: quem participa lê, quem não participa não lê (papel REAL authenticated).
DO $b_9$
DECLARE v_id text;
BEGIN
  SELECT id::text INTO v_id FROM public.team_conversations WHERE type = 'direct';

  PERFORM set_config('request.jwt.claims', pg_temp.tc002_jwt('ATILA'), true);
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.tc002_afirmar('B.9 ATILA le a conversa devolvida sob RLS', v_id, (
    SELECT id::text FROM public.team_conversations WHERE id = v_id::uuid));
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', pg_temp.tc002_jwt('DORA'), true);
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.tc002_afirmar('B.10 DORA le a MESMA conversa devolvida sob RLS', v_id, (
    SELECT id::text FROM public.team_conversations WHERE id = v_id::uuid));
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', pg_temp.tc002_jwt('EVA'), true);
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.tc002_afirmar('B.11 EVA (nao participa) NAO enxerga a conversa', '0', (
    SELECT count(*)::text FROM public.team_conversations WHERE id = v_id::uuid));
  RESET ROLE;
END;
$b_9$;

-- Chamada seguinte, com o par invertido, e a linha legada sem par.
DO $b_12$
DECLARE v_id text; v_chamada text; v_jwt text; v_alvo uuid;
BEGIN
  SELECT id::text INTO v_id FROM public.team_conversations WHERE type = 'direct';
  v_jwt := pg_temp.tc002_jwt('DORA');
  v_alvo := pg_temp.tc002_perfil('ATILA');

  PERFORM set_config('request.jwt.claims', v_jwt, true);
  SET LOCAL ROLE authenticated;
  EXECUTE format('SELECT public.find_or_create_direct_conversation(%L::uuid)::text', v_alvo)
    INTO v_chamada;
  RESET ROLE;
  PERFORM pg_temp.tc002_afirmar('B.12 chamada seguinte (mesmo par, invertido) devolve o mesmo id', v_id, v_chamada);
  PERFORM pg_temp.tc002_afirmar('B.13 e continua existindo UMA conversa direta', '1', (
    SELECT count(*)::text FROM public.team_conversations WHERE type = 'direct'));
END;
$b_12$;

-- Linha legada: direta criada pelo corpo regredido — par NULL, dois membros.
INSERT INTO public.team_conversations (id, type, created_by)
VALUES ('e0000000-0000-0000-0000-0000000000f1', 'direct', pg_temp.tc002_perfil('EVA'));
INSERT INTO public.team_conversation_members (conversation_id, profile_id)
VALUES ('e0000000-0000-0000-0000-0000000000f1', pg_temp.tc002_perfil('EVA')),
       ('e0000000-0000-0000-0000-0000000000f1', pg_temp.tc002_perfil('OTTO'));

DO $b_14$
DECLARE
  v_legado constant text := 'e0000000-0000-0000-0000-0000000000f1';
  v_chamada text; v_jwt text; v_alvo uuid;
BEGIN
  v_jwt := pg_temp.tc002_jwt('EVA');
  v_alvo := pg_temp.tc002_perfil('OTTO');

  PERFORM set_config('request.jwt.claims', v_jwt, true);
  SET LOCAL ROLE authenticated;
  EXECUTE format('SELECT public.find_or_create_direct_conversation(%L::uuid)::text', v_alvo)
    INTO v_chamada;
  RESET ROLE;
  PERFORM pg_temp.tc002_afirmar('B.14 legado sem par: a RPC acha a conversa existente pelos membros', v_legado, v_chamada);
  PERFORM pg_temp.tc002_afirmar('B.15 ...e nao cria uma duplicata ao lado dela', '1', (
    SELECT count(*)::text FROM (
      SELECT c.id FROM public.team_conversations c
        JOIN public.team_conversation_members m ON m.conversation_id = c.id
       WHERE c.type = 'direct' AND m.profile_id IN (pg_temp.tc002_perfil('EVA'), pg_temp.tc002_perfil('OTTO'))
       GROUP BY c.id HAVING count(*) = 2) x));
END;
$b_14$;

DO $b_16$
DECLARE
  v_jwt text; v_alvo uuid;
  v_erro_self text; v_erro_nulo text; v_estado_nulo text;
  v_antes text; v_depois text;
BEGIN
  SELECT count(*)::text INTO v_antes FROM public.team_conversations WHERE type = 'direct';

  v_jwt := pg_temp.tc002_jwt('ATILA');
  v_alvo := pg_temp.tc002_perfil('ATILA');

  PERFORM set_config('request.jwt.claims', v_jwt, true);
  SET LOCAL ROLE authenticated;

  BEGIN
    EXECUTE format('SELECT public.find_or_create_direct_conversation(%L::uuid)::text', v_alvo);
    RAISE EXCEPTION 'B.16 FALHOU: conversa consigo mesmo NAO foi recusada';
  EXCEPTION WHEN OTHERS THEN
    v_erro_self := SQLERRM;
  END;

  BEGIN
    EXECUTE 'SELECT public.find_or_create_direct_conversation(NULL)::text';
    RAISE EXCEPTION 'B.17 FALHOU: other_profile_id nulo NAO foi recusado';
  EXCEPTION WHEN OTHERS THEN
    v_erro_nulo := SQLERRM;
    v_estado_nulo := SQLSTATE;
  END;

  RESET ROLE;
  SELECT count(*)::text INTO v_depois FROM public.team_conversations WHERE type = 'direct';

  PERFORM pg_temp.tc002_afirmar('B.16 conversa consigo mesmo e recusada',
    'cannot_create_direct_with_self', v_erro_self);
  PERFORM pg_temp.tc002_afirmar('B.17 other_profile_id nulo nao cria conversa direta', v_antes, v_depois);
  RAISE NOTICE 'OK — B.17 other_profile_id nulo recusado pelo banco (SQLSTATE %, "%")', v_estado_nulo, v_erro_nulo;
END;
$b_16$;

DO $b_18$
BEGIN
  PERFORM pg_temp.tc002_afirmar('B.18 as recusas nao deixaram conversa direta a mais (par + legado)', '2', (
    SELECT count(*)::text FROM public.team_conversations WHERE type = 'direct'));
END;
$b_18$;

-- ===========================================================================
-- C — idempotência e provas do rollback de 20261006152414
-- ===========================================================================
\echo '== C: idempotencia e rollback =='

\i :fix
DO $c_1$
BEGIN
  RAISE NOTICE 'OK — C.1 reaplicar 20261006152414 nao falha (idempotente)';
END;
$c_1$;

DO $c_2$
DECLARE
  v_path text; v_linhas text[]; v_rollback text := '';
  v_i int; v_linha text; v_achou boolean := false;
BEGIN
  SELECT fix_path INTO v_path FROM tc002_cfg;
  v_linhas := string_to_array(pg_read_file(v_path), E'\n');

  FOR v_i IN 1..coalesce(array_length(v_linhas, 1), 0) LOOP
    v_linha := v_linhas[v_i];
    IF NOT v_achou THEN
      IF v_linha ~* '^--[[:space:]]*rollback[[:space:]]*:' THEN
        v_achou := true;
        v_linha := regexp_replace(v_linha, '^--[[:space:]]*rollback[[:space:]]*:[[:space:]]*', '');
        IF btrim(v_linha) <> '' THEN v_rollback := v_linha; END IF;
      END IF;
    ELSE
      EXIT WHEN v_linha ~* '^--[[:space:]]*rollback-fim';
      EXIT WHEN v_linha !~ '^--';
      v_linha := regexp_replace(v_linha, '^--[[:space:]]?', '');
      v_rollback := v_rollback || CASE WHEN v_rollback = '' THEN '' ELSE E'\n' END || v_linha;
    END IF;
  END LOOP;

  IF NOT v_achou THEN
    RAISE EXCEPTION 'C.2 o arquivo % nao tem bloco -- Rollback:', regexp_replace(v_path, '^.*/', '');
  END IF;
  IF btrim(v_rollback) = '' THEN
    RAISE EXCEPTION 'C.2 o bloco -- Rollback: de % esta vazio', regexp_replace(v_path, '^.*/', '');
  END IF;

  EXECUTE v_rollback;
  RAISE NOTICE 'OK — C.2 o bloco -- Rollback: de % (lido do proprio arquivo) executou',
    regexp_replace(v_path, '^.*/', '');
END;
$c_2$;

DELETE FROM public.team_conversation_members;
DELETE FROM public.team_conversations;

DO $c_3$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM pg_temp.tc002_corrida(
    pg_temp.tc002_jwt('EVA'), pg_temp.tc002_perfil('OTTO'),
    pg_temp.tc002_jwt('OTTO'), pg_temp.tc002_perfil('EVA'));
  PERFORM pg_temp.tc002_afirmar_diferente(
    'C.3 rollback provado pelo comportamento: o corpo anterior voltou e a corrida duplica de novo',
    r.id_a::text, r.id_b::text);
  PERFORM pg_temp.tc002_afirmar('C.4 e o par voltou a ficar NULL (comportamento do corpo anterior)', '2', (
    SELECT count(*)::text FROM public.team_conversations
     WHERE type = 'direct' AND direct_member_a IS NULL AND direct_member_b IS NULL));
END;
$c_3$;

\i :fix
DELETE FROM public.team_conversation_members;
DELETE FROM public.team_conversations;

DO $c_5$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM pg_temp.tc002_corrida(
    pg_temp.tc002_jwt('EVA'), pg_temp.tc002_perfil('OTTO'),
    pg_temp.tc002_jwt('OTTO'), pg_temp.tc002_perfil('EVA'));
  IF r.id_a IS NULL OR r.id_b IS NULL THEN
    RAISE EXCEPTION 'C.5 a corrida nao devolveu os dois ids (% / %)', r.id_a, r.id_b;
  END IF;
  PERFORM pg_temp.tc002_afirmar('C.5 reaplicar 20261006152414 restaura a protecao (mesmo id na corrida)',
    r.id_a::text, r.id_b::text);
END;
$c_5$;

SELECT dblink_disconnect('tc002_a');
SELECT dblink_disconnect('tc002_b');

DO $fim$
BEGIN
  RAISE NOTICE 'tc002_find_or_create_direct_pair: TODAS as assercoes passaram (A1-A4, B1-B18, C1-C5) — a protecao da conversa direta esta na cadeia ativa de dia/2026-10-16 (20261006152414)';
END;
$fim$;