-- ============================================================================
-- Historico de alertas de SLA + preferencias de alerta (cartao t_79282d5d)
--
-- O QUE PROVA:
--   A) sla_alert_events — SELECT obedece a MESMA regra de visibilidade de
--      contato (public.is_contact_visible_to_user): admin/supervisor e quem ve o
--      contato enxergam; agente sem vinculo nao enxerga nada; anon nao tem nem
--      GRANT de tabela;
--   B) INSERT/UPDATE/DELETE diretos em sla_alert_events NAO sao concedidos a
--      nenhum papel de cliente — so as funcoes SECURITY DEFINER escrevem;
--   C) record_sla_alert e IDEMPOTENTE (um unico alerta ATIVO por
--      contato+tipo+severidade; a 2a chamada devolve o mesmo id, sem linha nova);
--   D) record_sla_alert / resolve_sla_alert negam agente sem vinculo e anon
--      (42501) e exigem staff para resolver;
--   E) resolver grava resolved_at/resolved_by (auditoria sem dado pessoal) e uma
--      2a resolucao levanta P0002;
--   F) sla_alert_preferences — SELECT/INSERT/UPDATE so da PROPRIA linha
--      (user_id = auth.uid()); escrever na linha de outro e' negado; anon negado;
--      gatilho de updated_at ativo.
--
-- COMO A PROTECAO ENTRA NO TESTE (nada de copiar policy para dentro do arquivo):
--   a superficie minima (roles, schema auth, storage, tabelas e a funcao de
--   ambiente update_updated_at_column) e' criada a mao — e' AMBIENTE, nao
--   contrato — e a PROTECAO (tabelas, indices, policies, funcoes) e' aplicada
--   VERBATIM dos arquivos de migration do repositorio via `\i`, em ordem
--   cronologica. Mesmo padrao de
--   supabase/tests/user_roles_troca_de_papel_autorizacao_e_auditoria.sql.
--
-- ENFORCEMENT como PAPEL REAL: as assercoes rodam com `SET LOCAL ROLE
--   authenticated`/`anon`/`service_role` + JWT sintetico em
--   request.jwt.claims (o caminho do PostgREST), nunca como postgres. Em anon e
--   service_role o claim `role` acompanha o papel, senao auth.role() mentiria.
--
-- COMO RODA (PostgreSQL 17 descartavel; o repo e' montado somente-leitura):
--   docker run --rm -d --name zapp-sla-$$ -e POSTGRES_PASSWORD=test_only \
--     -v "$PWD:/repo:ro" postgres:17-alpine
--   docker exec -i zapp-sla-$$ psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
--     -v repo=/repo -v mig_dir=/repo/supabase/migrations \
--     < supabase/tests/sla_alert_events_and_preferences.sql
--   docker rm -f zapp-sla-$$
--
-- VERMELHO (falha quando a protecao nao esta la): acrescente `-v sem_guarda=1`.
--   Derruba a RLS das duas tabelas e as policies de escrita das preferencias —
--   as assercoes de negacao passam a esperar o que a correcao permite.
-- ============================================================================

\set ON_ERROR_STOP on
\if :{?mig_dir}
\else
  \set mig_dir supabase/migrations
\endif

-- ── Superficie minima (ambiente; o contrato vem das migrations logo abaixo) ──
BEGIN;

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

CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE SCHEMA storage;
CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean);
CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text);
CREATE PUBLICATION supabase_realtime;

-- profiles/contacts/whatsapp_connections/warroom_alerts reproduzem a superficie
-- que a migration-base assume existir.
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  role text DEFAULT 'agent',
  permissions jsonb DEFAULT '{}'::jsonb,
  access_level text DEFAULT 'active',
  is_active boolean DEFAULT true
);
CREATE TABLE public.queues (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assigned_to uuid REFERENCES public.profiles(id),
  queue_id uuid REFERENCES public.queues(id)
);
CREATE TABLE public.queue_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id uuid NOT NULL REFERENCES public.queues(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_active boolean DEFAULT true
);
CREATE TABLE public.agent_visibility_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  can_see_agent_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE
);
CREATE TABLE public.conversation_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE,
  status text
);
CREATE TABLE public.contact_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE,
  author_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE
);
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE,
  media_url text
);
CREATE TABLE public.whatsapp_connections (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.warroom_alerts (id uuid PRIMARY KEY DEFAULT gen_random_uuid());

-- Funcao de AMBIENTE (ja existe no schema real): o gatilho de updated_at das
-- preferencias depende dela; seu corpo trivial e' recriado aqui de proposito
-- (nao e' a protecao sob teste).
CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

-- ── Fixtures (entram sem disparar o sinal de auth.users) ─────────────────────
SET session_replication_role = replica;

INSERT INTO auth.users (id) VALUES
  ('11111111-1111-1111-1111-11111111111a'),  -- ADMIN
  ('22222222-2222-2222-2222-22222222222b'),  -- SUPERVISOR
  ('33333333-3333-3333-3333-33333333333c'),  -- AGENTE B (ve C1 e C2, nao C3)
  ('44444444-4444-4444-4444-44444444444d');  -- AGENTE D (nao ve contato algum)

INSERT INTO public.profiles (id, user_id, name) VALUES
  ('a0000000-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-11111111111a', 'ADMIN SLA'),
  ('bb000000-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-22222222222b', 'SUPERVISOR SLA'),
  ('b0000000-0000-0000-0000-00000000000c', '33333333-3333-3333-3333-33333333333c', 'AGENTE B SLA'),
  ('d0000000-0000-0000-0000-00000000000d', '44444444-4444-4444-4444-44444444444d', 'AGENTE D SLA');

INSERT INTO public.queues (id) VALUES
  ('10000000-0000-0000-0000-000000000001'),  -- Q1
  ('10000000-0000-0000-0000-000000000002');  -- Q2

INSERT INTO public.contacts (id, assigned_to, queue_id) VALUES
  ('c1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-000000000001'),  -- C1: atribuido a B
  ('c2000000-0000-0000-0000-000000000002', NULL,                                   '10000000-0000-0000-0000-000000000002'),  -- C2: fila Q2 (B membro)
  ('c3000000-0000-0000-0000-000000000003', NULL,                                   '10000000-0000-0000-0000-000000000001');  -- C3: fila Q1 (B nao membro)

INSERT INTO public.queue_members (queue_id, profile_id, is_active) VALUES
  ('10000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-00000000000c', true);

SET session_replication_role = origin;

-- ── A PROTECAO, verbatim das migrations reais, em ordem cronologica ──────────
\echo '── aplicando as migrations REAIS (base -> visibilidade de contato -> SLA) ──'
\i :mig_dir/20251215025014_fcc5bc79-55e3-4972-8765-6a7840fdce5a.sql
\i :mig_dir/20260329175853_8f18172f-981a-4c58-b505-ce1630af8ab6.sql
\i :mig_dir/20260909200000_harden_inbox_contact_authorization.sql
\i :mig_dir/20261011180337_sla_alert_events_and_preferences.sql

-- Papeis das fixtures (depois das policies; gatilho de auth.users desligado).
SET session_replication_role = replica;
INSERT INTO public.user_roles (user_id, role) VALUES
  ('11111111-1111-1111-1111-11111111111a', 'admin'),
  ('22222222-2222-2222-2222-22222222222b', 'supervisor'),
  ('33333333-3333-3333-3333-33333333333c', 'agent'),
  ('44444444-4444-4444-4444-44444444444d', 'agent');

-- Fixtures do historico (via postgres, nao pela funcao — o alvo aqui e' a RLS).
INSERT INTO public.sla_alert_events (id, contact_id, alert_type, severity, queue_id, resolved_at, resolved_by) VALUES
  ('e1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'first_response', 'breached', '10000000-0000-0000-0000-000000000001', NULL, NULL),                      -- A1 ativo  (C1)
  ('e1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001', 'resolution',     'warning',  '10000000-0000-0000-0000-000000000001', now(), 'a0000000-0000-0000-0000-00000000000a'), -- A2 resolvido (C1)
  ('e1000000-0000-0000-0000-000000000003', 'c2000000-0000-0000-0000-000000000002', 'first_response', 'warning',  '10000000-0000-0000-0000-000000000002', NULL, NULL),                      -- A3 ativo  (C2)
  ('e1000000-0000-0000-0000-000000000004', 'c3000000-0000-0000-0000-000000000003', 'first_response', 'breached', '10000000-0000-0000-0000-000000000001', NULL, NULL);                      -- A4 ativo  (C3)

-- Preferencias: a de D serve para provar que B nao mexe nela.
INSERT INTO public.sla_alert_preferences (user_id, updated_at) VALUES
  ('44444444-4444-4444-4444-44444444444d', '2000-01-01 00:00:00+00');

SET session_replication_role = origin;

-- ── Modo vermelho: derruba a protecao que o cartao adicionou ─────────────────
\if :{?sem_guarda}
  ALTER TABLE public.sla_alert_events DISABLE ROW LEVEL SECURITY;
  ALTER TABLE public.sla_alert_preferences DISABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "sla_alert_preferences_insert_policy" ON public.sla_alert_preferences;
  DROP POLICY IF EXISTS "sla_alert_preferences_update_policy" ON public.sla_alert_preferences;
  \echo '  [sem_guarda] RLS das duas tabelas desligada (modo vermelho)'
\endif

-- ── Helpers do proprio teste ────────────────────────────────────────────────
CREATE FUNCTION pg_temp.espera(p_label text, p_atual text, p_esperado text) RETURNS void
LANGUAGE plpgsql AS $h$
BEGIN
  IF p_atual IS DISTINCT FROM p_esperado THEN
    RAISE EXCEPTION 'SLA FALHOU [%]: esperado %, obtido %', p_label, p_esperado, p_atual;
  END IF;
  RAISE NOTICE 'PASS [%] -> %', p_label, p_atual;
END $h$;

CREATE FUNCTION pg_temp.espera_erro(p_label text, p_atual text, p_sqlstate text) RETURNS void
LANGUAGE plpgsql AS $h$
BEGIN
  IF p_atual IS NULL OR p_atual NOT LIKE 'ERRO ' || p_sqlstate || ' %' THEN
    RAISE EXCEPTION 'SLA FALHOU [%]: esperava erro SQLSTATE %, veio: %', p_label, p_sqlstate, p_atual;
  END IF;
  RAISE NOTICE 'PASS [%] -> %', p_label, p_atual;
END $h$;

-- Roda p_sql sob o PAPEL REAL (SET LOCAL ROLE) com o JWT de p_uid. p_claim_role
-- acompanha o papel (anon/service_role) para auth.role() nao mentir.
-- Devolve 'OK <linhas>' ou 'ERRO <sqlstate> <mensagem>'.
CREATE FUNCTION pg_temp.operacao(p_papel text, p_uid uuid, p_sql text,
                                 p_claim_role text DEFAULT 'authenticated') RETURNS text
LANGUAGE plpgsql AS $h$
DECLARE v_ret text; v_n bigint;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', p_claim_role)::text, true);
  EXECUTE format('SET LOCAL ROLE %I', p_papel);
  IF current_user <> p_papel THEN
    RAISE EXCEPTION 'SLA FALHOU: papel real nao aplicado (current_user=%)', current_user;
  END IF;
  BEGIN
    EXECUTE p_sql;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_ret := 'OK ' || v_n;
  EXCEPTION WHEN OTHERS THEN
    v_ret := 'ERRO ' || SQLSTATE || ' ' || SQLERRM;
  END;
  RESET ROLE;
  RETURN v_ret;
END $h$;

CREATE FUNCTION pg_temp.valor(p_papel text, p_uid uuid, p_sql text,
                              p_claim_role text DEFAULT 'authenticated') RETURNS text
LANGUAGE plpgsql AS $h$
DECLARE v text;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', p_claim_role)::text, true);
  EXECUTE format('SET LOCAL ROLE %I', p_papel);
  BEGIN
    EXECUTE p_sql INTO v;
  EXCEPTION WHEN OTHERS THEN
    v := 'ERRO ' || SQLSTATE;
  END;
  RESET ROLE;
  RETURN v;
END $h$;

\echo
\echo '── T0: a barreira e a RLS, nao a ACL ───────────────────────────────────'
SELECT pg_temp.espera('T0a authenticated tem SELECT no historico',
  has_table_privilege('authenticated', 'public.sla_alert_events', 'SELECT')::text, 'true');
SELECT pg_temp.espera('T0b authenticated NAO tem INSERT no historico',
  has_table_privilege('authenticated', 'public.sla_alert_events', 'INSERT')::text, 'false');
SELECT pg_temp.espera('T0c authenticated NAO tem UPDATE no historico',
  has_table_privilege('authenticated', 'public.sla_alert_events', 'UPDATE')::text, 'false');
SELECT pg_temp.espera('T0d authenticated NAO tem DELETE no historico',
  has_table_privilege('authenticated', 'public.sla_alert_events', 'DELETE')::text, 'false');
SELECT pg_temp.espera('T0e anon NAO tem privilegio algum no historico',
  has_table_privilege('anon', 'public.sla_alert_events', 'SELECT,INSERT,UPDATE,DELETE')::text, 'false');
SELECT pg_temp.espera('T0f authenticated tem SELECT/INSERT/UPDATE nas preferencias',
  has_table_privilege('authenticated', 'public.sla_alert_preferences', 'SELECT,INSERT,UPDATE')::text, 'true');
SELECT pg_temp.espera('T0g authenticated NAO tem DELETE nas preferencias',
  has_table_privilege('authenticated', 'public.sla_alert_preferences', 'DELETE')::text, 'false');

\if :{?sem_guarda}
\else
SELECT pg_temp.espera('T0h RLS ligada no historico',
  (SELECT relrowsecurity::text FROM pg_class WHERE oid = 'public.sla_alert_events'::regclass), 'true');
SELECT pg_temp.espera('T0i RLS ligada nas preferencias',
  (SELECT relrowsecurity::text FROM pg_class WHERE oid = 'public.sla_alert_preferences'::regclass), 'true');
SELECT pg_temp.espera('T0j indice unico PARCIAL garante 1 alerta ativo por combinacao',
  (SELECT (count(*) > 0)::text FROM pg_indexes
    WHERE tablename = 'sla_alert_events' AND indexdef LIKE '%UNIQUE%'
      AND indexdef LIKE '%contact_id, alert_type, severity%'
      AND indexdef LIKE '%resolved_at IS NULL%'), 'true');
\endif

SELECT pg_temp.espera('T0k CHECK recusa alert_type fora do contrato',
  (SELECT CASE WHEN EXISTS (SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.sla_alert_events'::regclass
       AND pg_get_constraintdef(oid) LIKE '%first_response%resolution%')
   THEN 'true' ELSE 'false' END), 'true');

\echo
\echo '── BLOCO A: SELECT do historico obedece a visibilidade de contato ──────'
SELECT pg_temp.espera('A1 admin ve os 4 alertas',
  pg_temp.valor('authenticated', '11111111-1111-1111-1111-11111111111a',
    'SELECT count(*)::text FROM public.sla_alert_events'), '4');
SELECT pg_temp.espera('A2 supervisor ve os 4 alertas',
  pg_temp.valor('authenticated', '22222222-2222-2222-2222-22222222222b',
    'SELECT count(*)::text FROM public.sla_alert_events'), '4');
SELECT pg_temp.espera('A3 agente B (atribuido a C1 + membro de Q2) ve 3 alertas',
  pg_temp.valor('authenticated', '33333333-3333-3333-3333-33333333333c',
    'SELECT count(*)::text FROM public.sla_alert_events'), '3');
SELECT pg_temp.espera('A4 agente D (sem vinculo) ve 0 alertas',
  pg_temp.valor('authenticated', '44444444-4444-4444-4444-44444444444d',
    'SELECT count(*)::text FROM public.sla_alert_events'), '0');
SELECT pg_temp.espera('A5 agente B nao ve o alerta do contato C3',
  pg_temp.valor('authenticated', '33333333-3333-3333-3333-33333333333c',
    'SELECT count(*)::text FROM public.sla_alert_events WHERE contact_id = ''c3000000-0000-0000-0000-000000000003'''), '0');
SELECT pg_temp.espera_erro('A6 anon nao le o historico (sem GRANT)',
  pg_temp.operacao('anon', NULL, 'SELECT count(*) FROM public.sla_alert_events', 'anon'), '42501');

\echo
\echo '── BLOCO B: escrita direta no historico e negada a cliente ─────────────'
SELECT pg_temp.espera_erro('B1 agente nao INSERT direto',
  pg_temp.operacao('authenticated', '33333333-3333-3333-3333-33333333333c',
    $sql$INSERT INTO public.sla_alert_events (contact_id, alert_type, severity)
          VALUES ('c1000000-0000-0000-0000-000000000001', 'first_response', 'breached')$sql$), '42501');
SELECT pg_temp.espera_erro('B2 admin tambem nao INSERT direto',
  pg_temp.operacao('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$UPDATE public.sla_alert_events SET severity = 'warning'$sql$), '42501');
SELECT pg_temp.espera('B3 o CHECK do historico recusa tipo invalido',
  (SELECT (count(*) > 0)::text FROM pg_constraint
    WHERE conrelid = 'public.sla_alert_events'::regclass
      AND pg_get_constraintdef(oid) LIKE '%first_response%resolution%'), 'true');

\echo
\echo '── BLOCO C: record_sla_alert (idempotente) e resolve_sla_alert (staff) ─'
SELECT pg_temp.espera_erro('C1 agente D nao registra alerta de contato que nao ve',
  pg_temp.operacao('authenticated', '44444444-4444-4444-4444-44444444444d',
    $sql$SELECT public.record_sla_alert('c3000000-0000-0000-0000-000000000003', 'first_response', 'breached')$sql$), '42501');
SELECT pg_temp.espera_erro('C2 anon nao registra alerta',
  pg_temp.operacao('anon', NULL,
    $sql$SELECT public.record_sla_alert('c1000000-0000-0000-0000-000000000001', 'first_response', 'breached')$sql$, 'anon'), '42501');
SELECT pg_temp.espera_erro('C3 record_sla_alert recusa tipo invalido',
  pg_temp.operacao('authenticated', '33333333-3333-3333-3333-33333333333c',
    $sql$SELECT public.record_sla_alert('c1000000-0000-0000-0000-000000000001', 'qualquer', 'breached')$sql$), '22023');

-- C4: 2a chamada para um alerta que JA existe (A1) devolve o MESMO id e nao cria linha.
SELECT pg_temp.espera('C4 record idempotente devolve o id vigente',
  pg_temp.valor('authenticated', '33333333-3333-3333-3333-33333333333c',
    $sql$SELECT public.record_sla_alert('c1000000-0000-0000-0000-000000000001', 'first_response', 'breached')::text$sql$),
  'e1000000-0000-0000-0000-000000000001');
SELECT pg_temp.espera('C5 nao criou linha nova para a combinacao ativa',
  (SELECT count(*)::text FROM public.sla_alert_events
    WHERE contact_id = 'c1000000-0000-0000-0000-000000000001'
      AND alert_type = 'first_response' AND severity = 'breached' AND resolved_at IS NULL), '1');

-- C6: combinacao INEDITA cria exatamente uma linha e a repeticao nao duplica.
SELECT pg_temp.espera('C6 record cria alerta inedito para B (retorno nao vazio)',
  (pg_temp.valor('authenticated', '33333333-3333-3333-3333-33333333333c',
    $sql$SELECT (public.record_sla_alert('c1000000-0000-0000-0000-000000000001', 'resolution', 'breached') IS NOT NULL)::text$sql$)), 'true');
SELECT pg_temp.espera('C6b 1 linha ativa da combinacao inedita',
  (SELECT count(*)::text FROM public.sla_alert_events
    WHERE contact_id = 'c1000000-0000-0000-0000-000000000001'
      AND alert_type = 'resolution' AND severity = 'breached' AND resolved_at IS NULL), '1');
SELECT pg_temp.espera('C7 repetir a chamada nao duplica',
  (SELECT CASE WHEN pg_temp.valor('authenticated', '33333333-3333-3333-3333-33333333333c',
      $sql$SELECT public.record_sla_alert('c1000000-0000-0000-0000-000000000001', 'resolution', 'breached')$sql$) IS NOT NULL
   THEN (SELECT count(*)::text FROM public.sla_alert_events
    WHERE contact_id = 'c1000000-0000-0000-0000-000000000001'
      AND alert_type = 'resolution' AND severity = 'breached' AND resolved_at IS NULL) END), '1');
-- C8: service_role (cron futuro) registra sem sessao de usuario.
SELECT pg_temp.espera('C8 service_role registra alerta (caminho do cron)',
  pg_temp.valor('service_role', NULL,
    $sql$SELECT (public.record_sla_alert('c3000000-0000-0000-0000-000000000003', 'resolution', 'warning') IS NOT NULL)::text$sql$, 'service_role'),
  'true');

-- C9: resolver e' ato de staff.
SELECT pg_temp.espera_erro('C9 agente B nao resolve (staff only)',
  pg_temp.operacao('authenticated', '33333333-3333-3333-3333-33333333333c',
    $sql$SELECT public.resolve_sla_alert('e1000000-0000-0000-0000-000000000001')$sql$), '42501');
SELECT pg_temp.espera_erro('C10 anon nao resolve',
  pg_temp.operacao('anon', NULL,
    $sql$SELECT public.resolve_sla_alert('e1000000-0000-0000-0000-000000000001')$sql$, 'anon'), '42501');
SELECT pg_temp.espera('C11 supervisor resolve e devolve o id',
  pg_temp.valor('authenticated', '22222222-2222-2222-2222-22222222222b',
    $sql$SELECT public.resolve_sla_alert('e1000000-0000-0000-0000-000000000003')::text$sql$),
  'e1000000-0000-0000-0000-000000000003');
SELECT pg_temp.espera('C12 resolver gravou resolved_at e resolved_by (auditoria)',
  (SELECT CASE WHEN resolved_at IS NOT NULL AND resolved_by = 'bb000000-0000-0000-0000-00000000000b'
   THEN 'true' ELSE 'false' END FROM public.sla_alert_events
   WHERE id = 'e1000000-0000-0000-0000-000000000003'), 'true');
SELECT pg_temp.espera_erro('C13 resolver duas vezes levanta P0002',
  pg_temp.operacao('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$SELECT public.resolve_sla_alert('e1000000-0000-0000-0000-000000000003')$sql$), 'P0002');

\echo
\echo '── BLOCO D: sla_alert_preferences so na propria linha ──────────────────'
SELECT pg_temp.espera('D1 B le apenas a propria preferencia (D tem 1, B tem 0)',
  pg_temp.valor('authenticated', '33333333-3333-3333-3333-33333333333c',
    'SELECT count(*)::text FROM public.sla_alert_preferences'), '0');
SELECT pg_temp.espera('D2 B cria a propria preferencia',
  pg_temp.operacao('authenticated', '33333333-3333-3333-3333-33333333333c',
    $sql$INSERT INTO public.sla_alert_preferences (user_id, enabled, updated_at)
          VALUES ('33333333-3333-3333-3333-33333333333c', false, '2000-01-01 00:00:00+00')$sql$), 'OK 1');
SELECT pg_temp.espera_erro('D3 B nao cria preferencia para outro usuario',
  pg_temp.operacao('authenticated', '33333333-3333-3333-3333-33333333333c',
    $sql$INSERT INTO public.sla_alert_preferences (user_id) VALUES ('11111111-1111-1111-1111-11111111111a')$sql$), '42501');
SELECT pg_temp.espera('D4 B atualiza a propria preferencia',
  pg_temp.operacao('authenticated', '33333333-3333-3333-3333-33333333333c',
    $sql$UPDATE public.sla_alert_preferences SET enabled = true
          WHERE user_id = '33333333-3333-3333-3333-33333333333c'$sql$), 'OK 1');
SELECT pg_temp.espera('D5 B nao alcanca a preferencia de D (0 linhas)',
  pg_temp.operacao('authenticated', '33333333-3333-3333-3333-33333333333c',
    $sql$UPDATE public.sla_alert_preferences SET enabled = true
          WHERE user_id = '44444444-4444-4444-4444-44444444444d'$sql$), 'OK 0');
SELECT pg_temp.espera('D6 gatilho de updated_at tocou a linha',
  (SELECT (updated_at > '2000-01-02'::timestamptz)::text FROM public.sla_alert_preferences
    WHERE user_id = '33333333-3333-3333-3333-33333333333c'), 'true');
SELECT pg_temp.espera_erro('D7 anon nao le preferencias (sem GRANT)',
  pg_temp.operacao('anon', NULL, 'SELECT count(*) FROM public.sla_alert_preferences', 'anon'), '42501');

\echo
\echo '=== SLA ALERT: TODAS AS ASSERCOES PASSARAM ==='

-- Banco descartavel; nada persiste.
ROLLBACK;
