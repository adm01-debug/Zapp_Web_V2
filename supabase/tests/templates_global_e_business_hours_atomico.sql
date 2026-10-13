-- ============================================================================
-- templates-global-e-business-hours (banco)
-- "1) is_global de message_templates so marca admin/supervisor; 2) salvar o
--  horario comercial e tudo-ou-nada (uma transacao) e NAO cria away_messages."
--
-- O QUE PROVA (critério de pronto do cartao):
--   A) um AGENTE autenticado NAO consegue criar template com is_global=true
--      (INSERT) nem virar o proprio template em global (UPDATE); um ADMIN/
--      SUPERVISOR consegue. Com is_global true o template passa a ser
--      entregue a organizacao inteira (policy de SELECT "is_global = true"),
--      entao a barreira e de ESCRITA e a RLS e o unico muro do PostgREST;
--   B) a RPC save_business_hours valida TUDO antes de escrever: um payload com
--      o ultimo dia invalido nao muda NENHUM dia (nada pela metade);
--   C) a RPC NAO cria away_messages (efeito colateral do fluxo antigo removido);
--   D) formato HH:MM estrito, intervalo open<close, day_of_week 0..6 sem
--      repeticao, conexao existente — cada entrada invalida e recusada;
--   E) autorizacao: agente nao chama a RPC (42501); a ACL nega anon/PUBLIC e
--      abre so para authenticated.
--
-- COMO A PROTECAO ENTRA NO TESTE (nada de copiar policy para dentro do arquivo):
-- a superficie minima (roles, schema auth, storage, PUBLICATION) e criada a mao
-- — e ambiente, nao contrato — e a PROTECAO e aplicada VERBATIM dos arquivos de
-- migration do repositorio, via `\i`, em ordem cronologica. Mesmo padrao de
-- supabase/tests/user_roles_troca_de_papel_autorizacao_e_auditoria.sql.
--
-- ENFORCEMENT exercido como PAPEL REAL: as assercoes rodam com
-- `SET LOCAL ROLE authenticated` + JWT sintetico em request.jwt.claims — o
-- caminho do PostgREST, nunca como postgres/superusuario (que ignora RLS e
-- GRANT). O helper confere dentro que `current_user` e de fato o papel pedido.
--
-- COMO RODA (PostgreSQL 17 descartavel; o repo e montado somente-leitura):
--   docker run --rm -d --name zapp-bh-tpl-$$ -e POSTGRES_PASSWORD=test_only \
--     -v "$PWD:/repo:ro" postgres:17-alpine
--   docker exec -i zapp-bh-tpl-$$ psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
--     -v repo=/repo -v mig_dir=/repo/supabase/migrations \
--     < supabase/tests/templates_global_e_business_hours_atomico.sql
--   docker rm -f zapp-bh-tpl-$$
--
-- VERMELHO (o teste falha quando a correcao nao esta la): acrescente `-v sem_guarda=1`.
--   Com sem_guarda as duas policies RESTRICTIVE sao derrubadas DENTRO da transacao
--   e a RPC e substituida por uma versao legada (dia-a-dia, sem validacao, e que
--   cria away_messages) — o comportamento de ANTES deste cartao. Nada persiste
--   porque o arquivo termina em ROLLBACK.
--
-- Tudo roda numa unica transacao que termina em ROLLBACK: idempotente, sem
-- efeito colateral e reaplicavel.
-- ============================================================================

\set ON_ERROR_STOP on
\if :{?mig_dir}
\else
  \set mig_dir supabase/migrations
\endif

BEGIN;

-- ── Superficie minima (ambiente; o contrato vem das migrations logo abaixo) ──
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
-- message_reactions (criada por 20251220181300) aponta para public.messages.
CREATE TABLE public.messages (id uuid PRIMARY KEY DEFAULT gen_random_uuid());

-- ── A PROTECAO, verbatim das migrations reais, em ordem cronologica ──────────
\echo '── aplicando as migrations REAIS (message_templates, business_hours, RPC) ──'
-- 20251215024517: profiles, whatsapp_connections, contacts, update_updated_at_column
\i :mig_dir/20251215024517_1c312256-b6e4-4d34-8dc5-3b03301e369e.sql
-- 20251215025014: app_role, user_roles, is_admin_or_supervisor, audit_logs
\i :mig_dir/20251215025014_fcc5bc79-55e3-4972-8765-6a7840fdce5a.sql
-- 20251215160224: message_templates (tabela, RLS, policies permissivas, gatilho)
\i :mig_dir/20251215160224_cda6461f-44b1-40b5-8fa2-302ba8d7e28d.sql
-- 20251220181300: business_hours e away_messages (tabelas, RLS, policies, gatilhos)
\i :mig_dir/20251220181300_aa931cb8-3812-4396-983e-123d19f73ad8.sql
-- A CORRECAO DESTE CARTAO:
\i :mig_dir/20261013050848_templates_global_e_save_business_hours.sql

-- GRANT de tabela do PostgREST: e ele que faz a RLS ser a UNICA barreira (T0).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_templates TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_hours TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.away_messages TO authenticated, service_role;
GRANT SELECT ON public.whatsapp_connections TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin_or_supervisor(uuid) TO authenticated, service_role;

-- ── Fixtures (sem disparar os gatilhos de auth.users) ───────────────────────
SET session_replication_role = replica;

INSERT INTO auth.users (id) VALUES
  ('11111111-1111-1111-1111-11111111111a'),  -- ADMIN
  ('22222222-2222-2222-2222-22222222222b');  -- AGENTE

INSERT INTO public.profiles (id, user_id, name) VALUES
  ('a0000000-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-11111111111a', 'ADMIN TP'),
  ('b0000000-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-22222222222b', 'AGENTE TP');

INSERT INTO public.user_roles (user_id, role) VALUES
  ('11111111-1111-1111-1111-11111111111a', 'admin'),
  ('22222222-2222-2222-2222-22222222222b', 'agent');

INSERT INTO public.whatsapp_connections (id, name, phone_number) VALUES
  ('cccccccc-0000-0000-0000-000000000001', 'CONEXAO TP', '+5500000000000');

-- Baseline do horario comercial: 7 dias 08:00-12:00 (sera sobrescrito no BLOCO C).
INSERT INTO public.business_hours (whatsapp_connection_id, day_of_week, is_open, open_time, close_time)
SELECT 'cccccccc-0000-0000-0000-000000000001', d, true, '08:00', '12:00'
  FROM generate_series(0, 6) d;

SET session_replication_role = origin;

-- ── Modo vermelho: a correcao ausente (o comportamento de ANTES do cartao) ───
-- `-v sem_guarda=1` derruba as policies restritivas de is_global E troca a RPC
-- `-v sem_rpc=1`   troca SO a RPC (isola a prova de atomicidade/away_messages)
\if :{?sem_guarda}
  DROP POLICY IF EXISTS message_templates_is_global_insert_requer_staff ON public.message_templates;
  DROP POLICY IF EXISTS message_templates_is_global_update_requer_staff ON public.message_templates;
  \set sem_rpc 1
  \echo '  [sem_guarda] policies restritivas de is_global derrubadas (dentro da transacao)'
\endif

\if :{?sem_rpc}
  -- Versao legada: dia-a-dia (sem validacao previa) e criando away_messages.
  CREATE OR REPLACE FUNCTION public.save_business_hours(p_connection_id uuid, p_days jsonb)
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $legacy$
  DECLARE e jsonb;
  BEGIN
    IF auth.uid() IS NULL OR NOT public.is_admin_or_supervisor(auth.uid()) THEN
      RAISE EXCEPTION 'sem_permissao_para_salvar_horario' USING ERRCODE = '42501';
    END IF;
    FOR e IN SELECT * FROM jsonb_array_elements(p_days) LOOP
      INSERT INTO public.business_hours (whatsapp_connection_id, day_of_week, is_open, open_time, close_time)
      VALUES (p_connection_id, (e->>'day_of_week')::int, coalesce((e->>'is_open')::boolean, true),
              (e->>'open_time')::time, (e->>'close_time')::time)
      ON CONFLICT (whatsapp_connection_id, day_of_week) DO UPDATE
        SET is_open = EXCLUDED.is_open, open_time = EXCLUDED.open_time, close_time = EXCLUDED.close_time;
    END LOOP;
    INSERT INTO public.away_messages (whatsapp_connection_id, content, is_enabled)
    VALUES (p_connection_id, 'Fora do horario.', true)
    ON CONFLICT (whatsapp_connection_id) DO UPDATE SET content = EXCLUDED.content, is_enabled = EXCLUDED.is_enabled;
  END $legacy$;
  GRANT EXECUTE ON FUNCTION public.save_business_hours(uuid, jsonb) TO authenticated;
  \echo '  [sem_rpc] RPC trocada pela versao legada (dia-a-dia, sem validacao, cria away_messages)'
\endif

-- ── Helpers do proprio teste ────────────────────────────────────────────────
CREATE FUNCTION pg_temp.espera(p_label text, p_atual text, p_esperado text) RETURNS void
LANGUAGE plpgsql AS $h$
BEGIN
  IF p_atual IS DISTINCT FROM p_esperado THEN
    RAISE EXCEPTION 'TP FALHOU [%]: esperado %, obtido %', p_label, p_esperado, p_atual;
  END IF;
  RAISE NOTICE 'PASS [%] -> %', p_label, p_atual;
END $h$;

CREATE FUNCTION pg_temp.espera_erro(p_label text, p_atual text, p_sqlstate text) RETURNS void
LANGUAGE plpgsql AS $h$
BEGIN
  IF p_atual IS NULL OR p_atual NOT LIKE 'ERRO ' || p_sqlstate || ' %' THEN
    RAISE EXCEPTION 'TP FALHOU [%]: esperava erro SQLSTATE %, veio: %', p_label, p_sqlstate, p_atual;
  END IF;
  RAISE NOTICE 'PASS [%] -> %', p_label, p_atual;
END $h$;

-- Roda p_sql sob o PAPEL REAL (SET LOCAL ROLE) com o JWT do usuario p_uid.
CREATE FUNCTION pg_temp.operacao(p_papel text, p_uid uuid, p_sql text) RETURNS text
LANGUAGE plpgsql AS $h$
DECLARE v_ret text; v_n bigint;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', p_papel)::text, true);
  EXECUTE format('SET LOCAL ROLE %I', p_papel);
  IF current_user <> p_papel THEN
    RAISE EXCEPTION 'TP FALHOU: papel real nao aplicado (current_user=%)', current_user;
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

-- Um unico valor, lido sob o PAPEL REAL (controles de leitura).
CREATE FUNCTION pg_temp.valor(p_papel text, p_uid uuid, p_sql text) RETURNS text
LANGUAGE plpgsql AS $h$
DECLARE v text;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', p_papel)::text, true);
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
\echo '── BLOCO A: is_global de message_templates exige staff ────────────────'

-- T0 — a barreira e a RLS, nao a ACL
SELECT pg_temp.espera('T0 authenticated TEM INSERT/UPDATE/DELETE/SELECT em message_templates',
  has_table_privilege('authenticated', 'public.message_templates', 'INSERT,UPDATE,DELETE,SELECT')::text, 'true');

\if :{?sem_guarda}
\else
SELECT pg_temp.espera('T0b policy restritiva de INSERT existe e e RESTRICTIVE',
  (SELECT (permissive = 'RESTRICTIVE')::text FROM pg_policies
    WHERE schemaname='public' AND tablename='message_templates'
      AND policyname='message_templates_is_global_insert_requer_staff'), 'true');
SELECT pg_temp.espera('T0c policy restritiva de UPDATE existe e e RESTRICTIVE',
  (SELECT (permissive = 'RESTRICTIVE')::text FROM pg_policies
    WHERE schemaname='public' AND tablename='message_templates'
      AND policyname='message_templates_is_global_update_requer_staff'), 'true');
SELECT pg_temp.espera('T0d RPC save_business_hours e SECURITY DEFINER com search_path fixo',
  (SELECT (prosecdef AND proconfig::text LIKE '%search_path=public, pg_temp%')::text
     FROM pg_proc WHERE oid = 'public.save_business_hours(uuid, jsonb)'::regprocedure), 'true');
\endif

-- T1 — controle positivo: o agente CRIA o proprio template nao-global
SELECT pg_temp.espera('T1 agente cria template proprio (is_global=false)',
  pg_temp.operacao('authenticated', '22222222-2222-2222-2222-22222222222b',
    $sql$INSERT INTO public.message_templates (user_id, title, content, is_global)
        VALUES ('22222222-2222-2222-2222-22222222222b', 'Meu atalho', 'Oi', false)$sql$),
  'OK 1');

-- T2 — o vetor: agente criando template GLOBAL
SELECT pg_temp.espera_erro('T2 agente NAO cria template global',
  pg_temp.operacao('authenticated', '22222222-2222-2222-2222-22222222222b',
    $sql$INSERT INTO public.message_templates (user_id, title, content, is_global)
        VALUES ('22222222-2222-2222-2222-22222222222b', 'Global pirata', 'Oi a todos', true)$sql$),
  '42501');
SELECT pg_temp.espera('T2b o INSERT recusado nao criou template global',
  (SELECT count(*)::text FROM public.message_templates WHERE is_global = true), '0');

-- T3 — o agente vira o PROPRIO template em global (UPDATE)
SELECT pg_temp.espera_erro('T3 agente NAO torna o proprio template global',
  pg_temp.operacao('authenticated', '22222222-2222-2222-2222-22222222222b',
    $sql$UPDATE public.message_templates SET is_global = true WHERE title = 'Meu atalho'$sql$),
  '42501');
SELECT pg_temp.espera('T3b o template do agente continua nao-global',
  (SELECT is_global::text FROM public.message_templates WHERE title = 'Meu atalho'), 'false');

-- T4 — o ADMIN cria template global
SELECT pg_temp.espera('T4 admin cria template global',
  pg_temp.operacao('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$INSERT INTO public.message_templates (user_id, title, content, is_global)
        VALUES ('11111111-1111-1111-1111-11111111111a', 'Aviso geral', 'Bem-vindo', true)$sql$),
  'OK 1');

-- T5 — o motivo da barreira: o global e entregue a organizacao inteira
SELECT pg_temp.espera('T5 o agente VE o template global do admin',
  pg_temp.valor('authenticated', '22222222-2222-2222-2222-22222222222b',
    $sql$SELECT count(*)::text FROM public.message_templates WHERE is_global = true$sql$),
  '1');

-- T6 — anon sem GRANT de tabela nao escreve (camada de ACL)
SELECT pg_temp.espera_erro('T6 anon NAO faz INSERT em message_templates',
  pg_temp.operacao('anon', NULL,
    $sql$INSERT INTO public.message_templates (user_id, title, content, is_global)
        VALUES ('11111111-1111-1111-1111-11111111111a', 'x', 'y', true)$sql$),
  '42501');

\echo
\echo '── BLOCO B: ACL da RPC save_business_hours ────────────────────────────'

SELECT pg_temp.espera('T7 anon sem EXECUTE na RPC',
  has_function_privilege('anon', 'public.save_business_hours(uuid, jsonb)', 'EXECUTE')::text, 'false');
SELECT pg_temp.espera('T7b authenticated COM EXECUTE na RPC',
  has_function_privilege('authenticated', 'public.save_business_hours(uuid, jsonb)', 'EXECUTE')::text, 'true');
SELECT pg_temp.espera('T7c PUBLIC sem EXECUTE na RPC (nenhuma entrada =X/ na ACL)',
  (SELECT (NOT EXISTS (SELECT 1 FROM unnest(coalesce(proacl, '{}'::aclitem[])) a
                        WHERE a::text LIKE '=X/%'))::text
     FROM pg_proc WHERE oid = 'public.save_business_hours(uuid, jsonb)'::regprocedure), 'true');
SELECT pg_temp.espera_erro('T7d anon NAO chama a RPC',
  pg_temp.operacao('anon', NULL,
    $sql$SELECT public.save_business_hours('cccccccc-0000-0000-0000-000000000001'::uuid, '[]'::jsonb)$sql$),
  '42501');

\echo
\echo '── BLOCO C: autorizacao e atomicidade da RPC ──────────────────────────'

-- Payloads (VAL7 = 7 dias validos; INV6+1 = 6 dias validos e o ultimo invalido).
-- T8 — agente nao chama a RPC
SELECT pg_temp.espera_erro('T8 agente NAO salva horario',
  pg_temp.operacao('authenticated', '22222222-2222-2222-2222-22222222222b',
    $sql$SELECT public.save_business_hours('cccccccc-0000-0000-0000-000000000001'::uuid,
      '[{"day_of_week":0,"is_open":true,"open_time":"09:00","close_time":"18:00"}]'::jsonb)$sql$),
  '42501');

-- T9 — admin salva 7 dias validos
SELECT pg_temp.espera('T9 admin salva os 7 dias',
  pg_temp.operacao('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$SELECT public.save_business_hours('cccccccc-0000-0000-0000-000000000001'::uuid,
      '[{"day_of_week":0,"is_open":true,"open_time":"09:00","close_time":"18:00"},
        {"day_of_week":1,"is_open":true,"open_time":"09:00","close_time":"18:00"},
        {"day_of_week":2,"is_open":true,"open_time":"09:00","close_time":"18:00"},
        {"day_of_week":3,"is_open":true,"open_time":"09:00","close_time":"18:00"},
        {"day_of_week":4,"is_open":true,"open_time":"09:00","close_time":"18:00"},
        {"day_of_week":5,"is_open":true,"open_time":"09:00","close_time":"18:00"},
        {"day_of_week":6,"is_open":true,"open_time":"09:00","close_time":"18:00"}]'::jsonb)$sql$),
  'OK 1');
SELECT pg_temp.espera('T9b os 7 dias ficaram 09:00-18:00 (contagem)',
  (SELECT count(*)::text FROM public.business_hours
    WHERE whatsapp_connection_id='cccccccc-0000-0000-0000-000000000001'
      AND open_time='09:00' AND close_time='18:00'), '7');

-- T10 — NAO criou away_messages (efeito colateral removido)
SELECT pg_temp.espera('T10 a RPC nao criou away_message',
  (SELECT count(*)::text FROM public.away_messages
    WHERE whatsapp_connection_id='cccccccc-0000-0000-0000-000000000001'), '0');

-- T11 — ATOMICIDADE: o 7o dia invalido derruba TUDO; nenhum dia muda
SELECT pg_temp.espera_erro('T11 ultimo dia invalido (open>=close) recusa o lote inteiro',
  pg_temp.operacao('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$SELECT public.save_business_hours('cccccccc-0000-0000-0000-000000000001'::uuid,
      '[{"day_of_week":0,"is_open":true,"open_time":"10:00","close_time":"11:00"},
        {"day_of_week":1,"is_open":true,"open_time":"10:00","close_time":"11:00"},
        {"day_of_week":2,"is_open":true,"open_time":"10:00","close_time":"11:00"},
        {"day_of_week":3,"is_open":true,"open_time":"10:00","close_time":"11:00"},
        {"day_of_week":4,"is_open":true,"open_time":"10:00","close_time":"11:00"},
        {"day_of_week":5,"is_open":true,"open_time":"10:00","close_time":"11:00"},
        {"day_of_week":6,"is_open":true,"open_time":"18:00","close_time":"09:00"}]'::jsonb)$sql$),
  '22023');
SELECT pg_temp.espera('T11b nenhum dia pela metade: o dia 0 continua 09:00-18:00',
  (SELECT open_time::text || '-' || close_time::text FROM public.business_hours
    WHERE whatsapp_connection_id='cccccccc-0000-0000-0000-000000000001' AND day_of_week=0),
  '09:00:00-18:00:00');
SELECT pg_temp.espera('T11c nenhum dia pela metade: o dia 6 continua 09:00-18:00',
  (SELECT open_time::text || '-' || close_time::text FROM public.business_hours
    WHERE whatsapp_connection_id='cccccccc-0000-0000-0000-000000000001' AND day_of_week=6),
  '09:00:00-18:00:00');
SELECT pg_temp.espera('T11d nenhuma away_message criada pelo lote recusado',
  (SELECT count(*)::text FROM public.away_messages
    WHERE whatsapp_connection_id='cccccccc-0000-0000-0000-000000000001'), '0');

\echo
\echo '── BLOCO D: entradas invalidas ────────────────────────────────────────'

SELECT pg_temp.espera_erro('T12 formato HH:MM estrito recusa "9:00"',
  pg_temp.operacao('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$SELECT public.save_business_hours('cccccccc-0000-0000-0000-000000000001'::uuid,
      '[{"day_of_week":0,"is_open":true,"open_time":"9:00","close_time":"18:00"}]'::jsonb)$sql$),
  '22023');

SELECT pg_temp.espera_erro('T13 day_of_week fora de 0..6',
  pg_temp.operacao('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$SELECT public.save_business_hours('cccccccc-0000-0000-0000-000000000001'::uuid,
      '[{"day_of_week":7,"is_open":true,"open_time":"09:00","close_time":"18:00"}]'::jsonb)$sql$),
  '22023');

SELECT pg_temp.espera_erro('T14 day_of_week repetido',
  pg_temp.operacao('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$SELECT public.save_business_hours('cccccccc-0000-0000-0000-000000000001'::uuid,
      '[{"day_of_week":2,"is_open":true,"open_time":"09:00","close_time":"18:00"},
        {"day_of_week":2,"is_open":false,"open_time":"10:00","close_time":"11:00"}]'::jsonb)$sql$),
  '22023');

SELECT pg_temp.espera_erro('T15 p_days nao-array',
  pg_temp.operacao('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$SELECT public.save_business_hours('cccccccc-0000-0000-0000-000000000001'::uuid, '{}'::jsonb)$sql$),
  '22023');

SELECT pg_temp.espera_erro('T16 conexao inexistente',
  pg_temp.operacao('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$SELECT public.save_business_hours('ffffffff-0000-0000-0000-0000000000ff'::uuid,
      '[{"day_of_week":0,"is_open":true,"open_time":"09:00","close_time":"18:00"}]'::jsonb)$sql$),
  '22023');

SELECT pg_temp.espera_erro('T17 p_days com mais de 7 dias (teto do lote)',
  pg_temp.operacao('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$SELECT public.save_business_hours('cccccccc-0000-0000-0000-000000000001'::uuid,
      '[{"day_of_week":0,"is_open":true,"open_time":"09:00","close_time":"18:00"},
        {"day_of_week":1,"is_open":true,"open_time":"09:00","close_time":"18:00"},
        {"day_of_week":2,"is_open":true,"open_time":"09:00","close_time":"18:00"},
        {"day_of_week":3,"is_open":true,"open_time":"09:00","close_time":"18:00"},
        {"day_of_week":4,"is_open":true,"open_time":"09:00","close_time":"18:00"},
        {"day_of_week":5,"is_open":true,"open_time":"09:00","close_time":"18:00"},
        {"day_of_week":6,"is_open":true,"open_time":"09:00","close_time":"18:00"},
        {"day_of_week":0,"is_open":true,"open_time":"09:00","close_time":"18:00"}]'::jsonb)$sql$),
  '22023');

SELECT pg_temp.espera('T18 nenhuma entrada invalida mexeu no horario',
  (SELECT count(*)::text FROM public.business_hours
    WHERE whatsapp_connection_id='cccccccc-0000-0000-0000-000000000001'
      AND open_time='09:00' AND close_time='18:00'), '7');

ROLLBACK;

\echo
\echo 'TP OK: agente nao marca is_global (e o admin sim); a RPC salva tudo-ou-nada,'
\echo '       nao cria away_messages e recusa as entradas invalidas.'
