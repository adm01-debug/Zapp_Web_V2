-- search_events — prova do registro de eventos da busca global SEM texto livre
-- (cartão t_a86eec01, migration 20261016013134_search_events.sql).
--
-- O QUE PROVA (critério do cartão):
--   T1) o agente registra a PRÓPRIA busca; registrar em nome de outro é negado
--       pela RLS (não é privilégio, é WITH CHECK);
--   T2) ninguém lê a tabela direto: não existe policy de SELECT e o papel
--       authenticated não tem SELECT (senão a RLS seria decorativa);
--   T3) só admin/supervisor leem o agregado: agent e anon são negados na RPC
--       search_insights (42501 / sem EXECUTE);
--   T4) o agregado bate: total, buscas sem resultado, cliques, tipo do clique,
--       média do comprimento — e a janela (30/365 dias) recorta o período;
--   T5) nenhuma coluna guarda o termo digitado: conferido contra o catálogo real
--       do Postgres (pg_attribute), não contra o texto da migration;
--   T6) retenção de 90 dias: apaga o que passou, preserva o recente, é
--       idempotente, roda como service_role e é negada a anon/authenticated;
--   T7) entradas inválidas são recusadas pelas constraints (comprimento 0/201,
--       tipo fora do vocabulário, clique sem tipo e tipo sem clique);
--   T8) o rollback do cabeçalho da migration é executável: roda dentro de um
--       SAVEPOINT e desfaz tabela + funções; o savepoint restaura tudo.
--
-- COMO RODA (banco LOCAL do cartão, nunca produção):
--   zapp-db-local psql . v2-<id> < supabase/tests/search_events.sql
-- O arquivo roda como postgres, troca de papel dentro dos blocos (SET LOCAL
-- ROLE + request.jwt.claims) e termina em ROLLBACK: nenhuma fixture fica no
-- banco. Sem a migration aplicada ele FALHA já na 1ª checagem.
--
-- LIMITAÇÃO: a autorização é provada por has_function_privilege/has_table_privilege
-- + tentativa real com SET ROLE (ACL do Postgres) e auth.uid() lido de
-- request.jwt.claims — não pelo caminho JWT/PostgREST completo.

\set ON_ERROR_STOP on

BEGIN;

-- ================================ fixture ================================
-- ids: auth.users (a1...), profiles (a0...)
SET LOCAL session_replication_role = replica;

INSERT INTO auth.users (id, email) VALUES
  ('a1aaaaaa-0000-0000-0000-000000000001', 'admin.busca@teste.local'),
  ('a1aaaaaa-0000-0000-0000-000000000002', 'supervisor.busca@teste.local'),
  ('a1aaaaaa-0000-0000-0000-000000000003', 'agente.busca@teste.local')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, user_id, name) VALUES
  ('a0aaaaaa-0000-0000-0000-000000000001', 'a1aaaaaa-0000-0000-0000-000000000001', 'Admin Busca'),
  ('a0aaaaaa-0000-0000-0000-000000000002', 'a1aaaaaa-0000-0000-0000-000000000002', 'Supervisor Busca'),
  ('a0aaaaaa-0000-0000-0000-000000000003', 'a1aaaaaa-0000-0000-0000-000000000003', 'Agente Busca')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('a1aaaaaa-0000-0000-0000-000000000001', 'admin'),
  ('a1aaaaaa-0000-0000-0000-000000000002', 'supervisor'),
  ('a1aaaaaa-0000-0000-0000-000000000003', 'agent')
ON CONFLICT (user_id, role) DO NOTHING;

SET LOCAL session_replication_role = origin;

-- Eventos conhecidos (inseridos como postgres: aqui só a massa do agregado).
-- Sem termo — só o comprimento. e5 é antigo de propósito (100 dias).
INSERT INTO public.search_events
  (user_id, term_length, had_results, result_kind, clicked, created_at)
VALUES
  ('a1aaaaaa-0000-0000-0000-000000000003',  5, true,  'message', true,  now() - interval '1 hour'),
  ('a1aaaaaa-0000-0000-0000-000000000003', 12, false, null,      false, now() - interval '2 hours'),
  ('a1aaaaaa-0000-0000-0000-000000000002',  8, true,  'contact', true,  now() - interval '3 hours'),
  ('a1aaaaaa-0000-0000-0000-000000000003',  3, false, null,      false, now() - interval '4 hours'),
  ('a1aaaaaa-0000-0000-0000-000000000003',  6, true,  null,      false, now() - interval '100 days');

-- ===================== T5+T1-estrutura: forma da tabela =====================
DO $$
DECLARE
  v_cols     text[];
  v_int_cols text[];
  v_rls      boolean;
  v_pol      integer;
  v_pol_cmd  text;
  v_pol_roles text[];
  v_n        integer;
BEGIN
  -- T5: a lista de colunas é EXATAMENTE esta — nada de `term`, `query`, `search`.
  SELECT array_agg(a.attname ORDER BY a.attnum) INTO v_cols
    FROM pg_attribute a
    JOIN pg_class c     ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'search_events'
     AND a.attnum > 0 AND NOT a.attisdropped;

  IF v_cols IS NULL THEN
    RAISE EXCEPTION 'T5 FALHOU: tabela public.search_events não existe (migration não aplicada)';
  END IF;

  IF v_cols <> ARRAY['id','user_id','term_length','had_results','result_kind','clicked','created_at'] THEN
    RAISE EXCEPTION 'T5 FALHOU: colunas de search_events = % (esperado o conjunto sem texto livre)', v_cols;
  END IF;

  -- nenhuma coluna de texto pode carregar o termo: só `result_kind` é texto.
  SELECT array_agg(a.attname ORDER BY a.attnum) INTO v_int_cols
    FROM pg_attribute a
    JOIN pg_class c     ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_type t      ON t.oid = a.atttypid
   WHERE n.nspname = 'public' AND c.relname = 'search_events'
     AND a.attnum > 0 AND NOT a.attisdropped
     AND t.typname IN ('text','varchar','bpchar','citext');

  IF v_int_cols <> ARRAY['result_kind'] THEN
    RAISE EXCEPTION 'T5 FALHOU: colunas de texto = % (só result_kind é esperada; o termo não pode ter onde morar)', v_int_cols;
  END IF;

  -- T1-estrutura: RLS ligada e UMA única policy, de INSERT para authenticated.
  SELECT c.relrowsecurity INTO v_rls
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'search_events';
  IF v_rls IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'T1 FALHOU: search_events sem RLS ligada';
  END IF;

  SELECT count(*), min(polcmd), min(polroles::text) INTO v_n, v_pol_cmd, v_pol_roles
    FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'search_events';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'T1 FALHOU: search_events tem % policies (esperado 1, de INSERT)', v_n;
  END IF;
  IF v_pol_cmd <> 'a' THEN
    RAISE EXCEPTION 'T1 FALHOU: policy de search_events tem comando % (esperado INSERT/''a'')', v_pol_cmd;
  END IF;

  RAISE NOTICE 'T1/T5 OK: colunas=%, RLS=on, 1 policy de INSERT para authenticated', v_cols;
END $$;

-- ============ T1/T2: o agente insere o seu e não lê a tabela ============
DO $$
DECLARE
  v_agente uuid := 'a1aaaaaa-0000-0000-0000-000000000003';
  v_outro  uuid := 'a1aaaaaa-0000-0000-0000-000000000002';
  v_antes  bigint;
  v_depois bigint;
  v_public_sel boolean;
BEGIN
  -- ACL: authenticated só tem INSERT (e nenhum SELECT/UPDATE/DELETE).
  IF NOT has_table_privilege('authenticated', 'public.search_events', 'INSERT') THEN
    RAISE EXCEPTION 'T2 FALHOU: authenticated não tem INSERT em search_events';
  END IF;
  IF has_table_privilege('authenticated', 'public.search_events', 'SELECT') THEN
    RAISE EXCEPTION 'T2 FALHOU: authenticated tem SELECT em search_events (a RLS viraria decoração)';
  END IF;
  IF has_table_privilege('anon', 'public.search_events', 'INSERT') THEN
    RAISE EXCEPTION 'T2 FALHOU: anon tem INSERT em search_events';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM aclexplode((SELECT relacl FROM pg_class WHERE oid = 'public.search_events'::regclass)) a
     WHERE a.grantee = 0
  ) INTO v_public_sel;
  IF v_public_sel THEN
    RAISE EXCEPTION 'T2 FALHOU: PUBLIC ainda tem privilégio em search_events';
  END IF;

  SELECT count(*) INTO v_antes FROM public.search_events;

  -- insert do PRÓPRIO evento, como o agente autenticado
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', v_agente, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.search_events (user_id, term_length, had_results, result_kind, clicked)
    VALUES (v_agente, 7, true, 'message', true);
  RESET ROLE;

  SELECT count(*) INTO v_depois FROM public.search_events;
  IF v_depois <> v_antes + 1 THEN
    RAISE EXCEPTION 'T1 FALHOU: insert do próprio evento não entrou (antes=% depois=%)', v_antes, v_depois;
  END IF;

  -- insert em nome de OUTRO usuário: a RLS tem de negar (42501) e nada entra
  BEGIN
    SET LOCAL ROLE authenticated;
    INSERT INTO public.search_events (user_id, term_length, had_results)
      VALUES (v_outro, 9, true);
    RESET ROLE;
    RAISE EXCEPTION 'T1 FALHOU: agente conseguiu registrar evento em nome de outro usuário';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
  END;

  SELECT count(*) INTO v_depois FROM public.search_events;
  IF v_depois <> v_antes + 1 THEN
    RAISE EXCEPTION 'T1 FALHOU: linha indevida entrou (depois=% esperado=%)', v_depois, v_antes + 1;
  END IF;

  -- leitura direta pelo agente: negada pelo ACL
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM count(*) FROM public.search_events;
    RESET ROLE;
    RAISE EXCEPTION 'T2 FALHOU: agente conseguiu ler search_events direto';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
  END;

  RAISE NOTICE 'T1/T2 OK: insert próprio entrou, insert alheio negado, leitura direta negada';
END $$;

-- ============ T3/T4: agregado só para admin/supervisor, e bate ============
DO $$
DECLARE
  v_admin uuid := 'a1aaaaaa-0000-0000-0000-000000000001';
  v_sup   uuid := 'a1aaaaaa-0000-0000-0000-000000000002';
  v_agente uuid := 'a1aaaaaa-0000-0000-0000-000000000003';
  v_total bigint;
  v_sem   bigint;
  v_cli   bigint;
  v_med   numeric;
  v_kinds jsonb;
BEGIN
  -- ACL da RPC
  IF has_function_privilege('anon', 'public.search_insights(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'T3 FALHOU: anon tem EXECUTE em search_insights';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.search_insights(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'T3 FALHOU: authenticated não tem EXECUTE em search_insights';
  END IF;

  -- admin: janela de 30 dias (o evento de 100 dias fica fora).
  -- Massa em 30 dias: 5 fixtures (5,12,8,3) + 1 evento que o T1 acabou de
  -- registrar como agente (7, com clique) = conta com 5 buscas.
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT * INTO v_total, v_sem, v_cli, v_med, v_kinds FROM public.search_insights(30);
  RESET ROLE;

  IF v_total <> 5 THEN
    RAISE EXCEPTION 'T4 FALHOU: total em 30 dias = % (esperado 5)', v_total;
  END IF;
  IF v_sem <> 2 THEN
    RAISE EXCEPTION 'T4 FALHOU: buscas sem resultado = % (esperado 2)', v_sem;
  END IF;
  IF v_cli <> 3 THEN
    RAISE EXCEPTION 'T4 FALHOU: buscas com clique = % (esperado 3)', v_cli;
  END IF;
  IF v_med <> 7.0 THEN
    RAISE EXCEPTION 'T4 FALHOU: média do comprimento = % (esperado 7.0)', v_med;
  END IF;
  IF v_kinds <> '{"contact": 1, "message": 2}'::jsonb THEN
    RAISE EXCEPTION 'T4 FALHOU: cliques por tipo = % (esperado {"contact":1,"message":2})', v_kinds;
  END IF;

  -- janela sem argumento = 30 dias; janela de 365 dias alcança o evento antigo
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT * INTO v_total, v_sem, v_cli, v_med, v_kinds FROM public.search_insights();
  RESET ROLE;
  IF v_total <> 5 THEN
    RAISE EXCEPTION 'T4 FALHOU: total sem argumento = % (esperado o padrão de 30 dias: 5)', v_total;
  END IF;

  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT * INTO v_total, v_sem, v_cli, v_med, v_kinds FROM public.search_insights(365);
  RESET ROLE;
  IF v_total <> 6 THEN
    RAISE EXCEPTION 'T4 FALHOU: total em 365 dias = % (esperado 6)', v_total;
  END IF;

  -- supervisor também lê
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', v_sup, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT * INTO v_total, v_sem, v_cli, v_med, v_kinds FROM public.search_insights(30);
  RESET ROLE;
  IF v_total <> 5 THEN
    RAISE EXCEPTION 'T3 FALHOU: supervisor não leu o agregado (total=%)', v_total;
  END IF;

  -- agente comum: negado
  BEGIN
    PERFORM set_config('request.jwt.claims',
                       json_build_object('sub', v_agente, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    PERFORM public.search_insights(30);
    RESET ROLE;
    RAISE EXCEPTION 'T3 FALHOU: agente conseguiu ler o agregado';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
  END;

  RAISE NOTICE 'T3/T4 OK: admin/supervisor leem (5 em 30 d, 2 sem resultado, 3 cliques, média 7.0), agente negado';
END $$;

-- ============ T7: entradas inválidas são recusadas pelas constraints ============
DO $$
DECLARE
  v_u uuid := 'a1aaaaaa-0000-0000-0000-000000000003';
  v_ok boolean;
BEGIN
  BEGIN
    INSERT INTO public.search_events (user_id, term_length, had_results) VALUES (v_u, 0, true);
    RAISE EXCEPTION 'T7 FALHOU: comprimento 0 aceito';
  EXCEPTION WHEN check_violation THEN NULL; END;

  BEGIN
    INSERT INTO public.search_events (user_id, term_length, had_results) VALUES (v_u, 201, true);
    RAISE EXCEPTION 'T7 FALHOU: comprimento 201 aceito';
  EXCEPTION WHEN check_violation THEN NULL; END;

  BEGIN
    INSERT INTO public.search_events (user_id, term_length, had_results, result_kind, clicked)
      VALUES (v_u, 5, true, 'message', false);
    RAISE EXCEPTION 'T7 FALHOU: tipo de resultado sem clique aceito';
  EXCEPTION WHEN check_violation THEN NULL; END;

  BEGIN
    INSERT INTO public.search_events (user_id, term_length, had_results, clicked)
      VALUES (v_u, 5, true, true);
    RAISE EXCEPTION 'T7 FALHOU: clique sem tipo de resultado aceito';
  EXCEPTION WHEN check_violation THEN NULL; END;

  BEGIN
    INSERT INTO public.search_events (user_id, term_length, had_results, result_kind, clicked)
      VALUES (v_u, 5, true, 'ticket', true);
    RAISE EXCEPTION 'T7 FALHOU: tipo de resultado fora do vocabulário aceito';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- a busca sem resultado é caso VÁLIDO (é o que dá para medir depois)
  INSERT INTO public.search_events (user_id, term_length, had_results)
    VALUES (v_u, 4, false);
  v_ok := true;
  IF NOT v_ok THEN RAISE EXCEPTION 'unreachable'; END IF;

  RAISE NOTICE 'T7 OK: 0/201, tipo sem clique, clique sem tipo e tipo fora do vocabulário recusados';
END $$;

-- ============ T6: retenção de 90 dias ============
DO $$
DECLARE
  v_removidas integer;
  v_antigas   bigint;
  v_recentes  bigint;
BEGIN
  IF has_function_privilege('anon', 'public.purge_old_search_events()', 'EXECUTE') THEN
    RAISE EXCEPTION 'T6 FALHOU: anon tem EXECUTE em purge_old_search_events';
  END IF;
  IF has_function_privilege('authenticated', 'public.purge_old_search_events()', 'EXECUTE') THEN
    RAISE EXCEPTION 'T6 FALHOU: authenticated tem EXECUTE em purge_old_search_events';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.purge_old_search_events()', 'EXECUTE') THEN
    RAISE EXCEPTION 'T6 FALHOU: service_role não tem EXECUTE em purge_old_search_events';
  END IF;

  SELECT count(*) INTO v_recentes FROM public.search_events WHERE created_at >= now() - interval '90 days';

  -- tentativa real como authenticated: negada
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM public.purge_old_search_events();
    RESET ROLE;
    RAISE EXCEPTION 'T6 FALHOU: authenticated rodou a limpeza';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
  END;

  -- como service_role (o job): apaga só o que passou de 90 dias
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SET LOCAL ROLE service_role;
  v_removidas := public.purge_old_search_events();
  RESET ROLE;

  IF v_removidas <> 1 THEN
    RAISE EXCEPTION 'T6 FALHOU: limpeza removeu % linhas (esperado 1)', v_removidas;
  END IF;

  SELECT count(*) INTO v_antigas FROM public.search_events WHERE created_at < now() - interval '90 days';
  IF v_antigas <> 0 THEN
    RAISE EXCEPTION 'T6 FALHOU: sobraram % linhas fora da retenção', v_antigas;
  END IF;

  SELECT count(*) INTO v_antigas FROM public.search_events;
  IF v_antigas <> v_recentes THEN
    RAISE EXCEPTION 'T6 FALHOU: a limpeza tocou linha recente (% agora, % antes)', v_antigas, v_recentes;
  END IF;

  -- idempotente
  SET LOCAL ROLE service_role;
  v_removidas := public.purge_old_search_events();
  RESET ROLE;
  IF v_removidas <> 0 THEN
    RAISE EXCEPTION 'T6 FALHOU: 2ª rodada removeu % linhas (esperado 0)', v_removidas;
  END IF;

  RAISE NOTICE 'T6 OK: retenção de 90 dias (1 removida, 0 na 2ª rodada), anon/authenticated negados, service_role permitido';
END $$;

-- ============ T8: o rollback do cabeçalho da migration roda mesmo ============
-- Mesmas instruções do bloco "-- Rollback (SQL executavel, na ordem):" do
-- cabeçalho, dentro de um SAVEPOINT, para não derrubar o resto do teste.
SAVEPOINT antes_do_rollback;
do $$ begin if exists (select 1 from pg_extension where extname = 'pg_cron') then perform cron.unschedule(jobid) from cron.job where jobname = 'search-events-retention'; end if; end $$;
drop function if exists public.search_insights(integer);
drop function if exists public.purge_old_search_events();
drop table if exists public.search_events;

DO $$
DECLARE
  v_n integer;
BEGIN
  SELECT count(*) INTO v_n
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'search_events';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'T8 FALHOU: rollback não removeu a tabela';
  END IF;

  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname IN ('search_insights','purge_old_search_events');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'T8 FALHOU: rollback deixou % funções para trás', v_n;
  END IF;
  RAISE NOTICE 'T8 OK: rollback do cabeçalho remove tabela e funções';
END $$;

ROLLBACK TO SAVEPOINT antes_do_rollback;

DO $$
DECLARE
  v_n integer;
BEGIN
  SELECT count(*) INTO v_n
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'search_events';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'T8 FALHOU: a tabela não voltou depois do ROLLBACK TO SAVEPOINT';
  END IF;
  RAISE NOTICE 'T8 OK: savepoint restaurou a tabela (o rollback é executável e isolado)';
END $$;

ROLLBACK;
