-- search_events — prova do registro de eventos da busca global SEM texto livre
-- (cartão t_a86eec01, migration base 20261016013134_search_events.sql e RPC
-- 20261026100000_search_event_rpc.sql).
--
-- O QUE PROVA (critério do cartão):
--   T1) o agente só registra pela RPC autenticada, que não aceita identidade
--       informada pelo cliente;
--   T2) não há escrita nem leitura direta na tabela por papéis de cliente;
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
--   T9) log_search_event descarta PII, registra uma busca uma vez, e correlaciona
--       clique/replay pelo mesmo ID opaco e tipo real sem inflar a contagem.
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

  IF v_cols <> ARRAY['id','user_id','term_length','had_results','result_kind','clicked','created_at','client_event_id'] THEN
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

  -- T1-estrutura: RLS ligada e nenhuma policy; somente a RPC SECURITY DEFINER escreve.
  SELECT c.relrowsecurity INTO v_rls
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'search_events';
  IF v_rls IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'T1 FALHOU: search_events sem RLS ligada';
  END IF;

  SELECT count(*) INTO v_n
    FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'search_events';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'T1 FALHOU: search_events tem % policies (esperado 0; escrita somente pela RPC)', v_n;
  END IF;

  RAISE NOTICE 'T1/T5 OK: colunas=%, RLS=on, sem policies de cliente', v_cols;
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
  -- ACL: authenticated não escreve nem lê diretamente (a RPC é o único caminho).
  IF has_table_privilege('authenticated', 'public.search_events', 'INSERT') THEN
    RAISE EXCEPTION 'T2 FALHOU: authenticated tem INSERT direto em search_events';
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

  -- Até a própria linha é negada por INSERT direto.
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', v_agente, 'role', 'authenticated')::text, true);
  BEGIN
    SET LOCAL ROLE authenticated;
    INSERT INTO public.search_events (user_id, term_length, had_results)
      VALUES (v_agente, 7, true);
    RESET ROLE;
    RAISE EXCEPTION 'T2 FALHOU: agente inseriu diretamente a própria linha';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
  END;

  -- Também não pode escolher outro user_id.
  BEGIN
    SET LOCAL ROLE authenticated;
    INSERT INTO public.search_events (user_id, term_length, had_results)
      VALUES (v_outro, 9, true);
    RESET ROLE;
    RAISE EXCEPTION 'T2 FALHOU: agente inseriu diretamente em nome de outro usuário';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
  END;

  SELECT count(*) INTO v_depois FROM public.search_events;
  IF v_depois <> v_antes THEN
    RAISE EXCEPTION 'T2 FALHOU: INSERT direto alterou a tabela (antes=% depois=%)', v_antes, v_depois;
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

  RAISE NOTICE 'T1/T2 OK: INSERT próprio/alheio e leitura direta negados; escrita passa pela RPC';
END $$;

-- ============ T9: RPC segura, idempotente e sem texto persistido ============
DO $$
DECLARE
  v_agente uuid := 'a1aaaaaa-0000-0000-0000-000000000003';
  v_evento uuid := 'e9000000-0000-0000-0000-000000000001';
  v_evento_sem_resultado uuid := 'e9000000-0000-0000-0000-000000000002';
  v_contagem integer;
  v_clicked boolean;
  v_kind text;
  v_inicio bigint;
  v_final bigint;
BEGIN
  IF to_regprocedure('public.log_search_event(text,integer,boolean,uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'T9 FALHOU: RPC log_search_event ausente';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.log_search_event(text,integer,boolean,uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'T9 FALHOU: authenticated sem EXECUTE em log_search_event';
  END IF;
  IF has_function_privilege('anon', 'public.log_search_event(text,integer,boolean,uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'T9 FALHOU: anon tem EXECUTE em log_search_event';
  END IF;
  IF has_function_privilege('service_role', 'public.log_search_event(text,integer,boolean,uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'T9 FALHOU: service_role tem EXECUTE em log_search_event';
  END IF;

  -- Mesmo o papel authenticated sem subject (auth.uid() NULL) deve falhar fechado.
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM public.log_search_event('consulta segura', 1, false, gen_random_uuid(), null);
    RESET ROLE;
    RAISE EXCEPTION 'T9 FALHOU: RPC aceitou sessão authenticated sem auth.uid()';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
  END;

  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', v_agente, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO v_inicio FROM public.search_events;

  SET LOCAL ROLE authenticated;
  PERFORM public.log_search_event('consulta segura', 2, false, v_evento, null);
  PERFORM public.log_search_event('consulta segura', 2, false, v_evento, null);
  RESET ROLE;

  SELECT count(*), bool_or(clicked), min(result_kind)
    INTO v_contagem, v_clicked, v_kind
    FROM public.search_events
   WHERE user_id = v_agente AND client_event_id = v_evento;
  IF v_contagem <> 1 OR v_clicked IS DISTINCT FROM false OR v_kind IS NOT NULL THEN
    RAISE EXCEPTION 'T9 FALHOU: busca repetida criou/alterou linhas (n=%, clicked=%, kind=%)',
      v_contagem, v_clicked, v_kind;
  END IF;

  SET LOCAL ROLE authenticated;
  PERFORM public.log_search_event('consulta segura', 2, true, v_evento, 'message');
  PERFORM public.log_search_event('consulta segura', 2, true, v_evento, 'message');
  PERFORM public.log_search_event('consulta segura', 2, false, v_evento, null);
  -- Reutilizar o ID com outra busca não pode converter o clique/categoria.
  PERFORM public.log_search_event('outra consulta', 2, true, v_evento, 'contact');
  RESET ROLE;

  SELECT count(*), bool_or(clicked), min(result_kind)
    INTO v_contagem, v_clicked, v_kind
    FROM public.search_events
   WHERE user_id = v_agente AND client_event_id = v_evento;
  IF v_contagem <> 1 OR v_clicked IS DISTINCT FROM true OR v_kind IS DISTINCT FROM 'message' THEN
    RAISE EXCEPTION 'T9 FALHOU: clique/replay não atualizou o mesmo evento (n=%, clicked=%, kind=%)',
      v_contagem, v_clicked, v_kind;
  END IF;

  -- Busca sem resultado não pode virar clique nem quebrar a constraint de coerência.
  SET LOCAL ROLE authenticated;
  PERFORM public.log_search_event('sem retorno', 0, false, v_evento_sem_resultado, null);
  PERFORM public.log_search_event('sem retorno', 0, true, v_evento_sem_resultado, 'message');
  -- Barreira server-side: PII e tokens não geram linha mesmo se o cliente chamar a RPC.
  PERFORM public.log_search_event('ana@example.com', 1, false, gen_random_uuid(), null);
  PERFORM public.log_search_event('11987654321', 1, false, gen_random_uuid(), null);
  PERFORM public.log_search_event(repeat('a', 32), 1, false, gen_random_uuid(), null);
  -- Entradas inválidas não criam linhas nem violam constraints.
  PERFORM public.log_search_event('ab', 1, false, gen_random_uuid(), null);
  PERFORM public.log_search_event(repeat('x', 201), 1, false, gen_random_uuid(), null);
  PERFORM public.log_search_event('consulta segura', -1, false, gen_random_uuid(), null);
  PERFORM public.log_search_event('consulta segura', null, false, gen_random_uuid(), null);
  -- Compatibilidade com clientes antigos: parâmetros opcionais geram ID no servidor.
  PERFORM public.log_search_event('consulta compat', 1, false);
  RESET ROLE;

  SELECT count(*) INTO v_contagem
    FROM public.search_events
   WHERE user_id = v_agente AND client_event_id = v_evento_sem_resultado AND clicked;
  IF v_contagem <> 0 THEN
    RAISE EXCEPTION 'T9 FALHOU: busca sem resultado foi marcada como clique';
  END IF;
  SELECT count(*) INTO v_contagem
    FROM public.search_events
   WHERE user_id = v_agente AND term_length = 15 AND had_results
     AND NOT clicked AND client_event_id IS NOT NULL;
  IF v_contagem <> 1 THEN
    RAISE EXCEPTION 'T9 FALHOU: chamada antiga sem ID não ganhou ID do servidor (n=%)', v_contagem;
  END IF;
  SELECT count(*) INTO v_final FROM public.search_events;
  IF v_final <> v_inicio + 3 THEN
    RAISE EXCEPTION 'T9 FALHOU: filtro de PII/idempotência alterou contagem indevidamente (início=%, fim=%)',
      v_inicio, v_final;
  END IF;

  RAISE NOTICE 'T9 OK: RPC autenticada, sem PII, limites, categoria, compatibilidade, idempotência e clique correlacionado';
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
  -- Massa em 30 dias: 4 fixtures recentes (5,12,8,3) + 3 RPCs do T9
  -- (15 com clique, 11 sem resultado, 15 compatibilidade) = 7 buscas, média 9.9.
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT * INTO v_total, v_sem, v_cli, v_med, v_kinds FROM public.search_insights(30);
  RESET ROLE;

  IF v_total <> 7 THEN
    RAISE EXCEPTION 'T4 FALHOU: total em 30 dias = % (esperado 7)', v_total;
  END IF;
  IF v_sem <> 3 THEN
    RAISE EXCEPTION 'T4 FALHOU: buscas sem resultado = % (esperado 3)', v_sem;
  END IF;
  IF v_cli <> 3 THEN
    RAISE EXCEPTION 'T4 FALHOU: buscas com clique = % (esperado 3)', v_cli;
  END IF;
  IF v_med <> 9.9 THEN
    RAISE EXCEPTION 'T4 FALHOU: média do comprimento = % (esperado 9.9)', v_med;
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
  IF v_total <> 7 THEN
    RAISE EXCEPTION 'T4 FALHOU: total sem argumento = % (esperado o padrão de 30 dias: 7)', v_total;
  END IF;

  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT * INTO v_total, v_sem, v_cli, v_med, v_kinds FROM public.search_insights(365);
  RESET ROLE;
  IF v_total <> 8 THEN
    RAISE EXCEPTION 'T4 FALHOU: total em 365 dias = % (esperado 8)', v_total;
  END IF;

  -- supervisor também lê
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', v_sup, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT * INTO v_total, v_sem, v_cli, v_med, v_kinds FROM public.search_insights(30);
  RESET ROLE;
  IF v_total <> 7 THEN
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

  RAISE NOTICE 'T3/T4 OK: admin/supervisor leem (7 em 30 d, 3 sem resultado, 3 cliques, média 9.9), agente negado';
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

-- ============ T8: rollback isolado da RPC e da tabela base ================
-- Primeiro prova o rollback desta migration mantendo a tabela base e suas linhas.
SAVEPOINT antes_do_rollback_rpc;
drop function if exists public.log_search_event(text, integer, boolean, uuid, text);
drop index if exists public.search_events_user_event_id_key;
alter table public.search_events drop column if exists client_event_id;
create policy "Users can register their own search events"
  on public.search_events for insert to authenticated
  with check (user_id = (select auth.uid()));
grant insert on table public.search_events to authenticated;

DO $$
DECLARE
  v_n integer;
  v_column boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_attribute
     WHERE attrelid = 'public.search_events'::regclass
       AND attname = 'client_event_id' AND NOT attisdropped
  ) INTO v_column;
  IF v_column THEN
    RAISE EXCEPTION 'T8 FALHOU: rollback da RPC deixou client_event_id';
  END IF;
  IF to_regprocedure('public.log_search_event(text,integer,boolean,uuid,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'T8 FALHOU: rollback da RPC deixou log_search_event';
  END IF;
  SELECT count(*) INTO v_n FROM pg_class WHERE relname = 'search_events_user_event_id_key';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'T8 FALHOU: rollback da RPC deixou o índice de client_event_id';
  END IF;
  IF has_table_privilege('authenticated', 'public.search_events', 'INSERT') IS NOT TRUE THEN
    RAISE EXCEPTION 'T8 FALHOU: rollback da RPC não restaurou o INSERT da migration base';
  END IF;
  SELECT count(*) INTO v_n
    FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'search_events';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'T8 FALHOU: rollback da RPC deixou % policies (esperado 1)', v_n;
  END IF;
  SELECT count(*) INTO v_n
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'search_events';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'T8 FALHOU: rollback da RPC removeu a tabela base';
  END IF;
  RAISE NOTICE 'T8 OK: rollback RPC remove coluna/índice/função e restaura policy/grant base';
END $$;

ROLLBACK TO SAVEPOINT antes_do_rollback_rpc;

-- Em seguida, testa a remoção da migration base dentro de outro savepoint.
SAVEPOINT antes_do_rollback_base;
drop function if exists public.log_search_event(text, integer, boolean, uuid, text);
drop index if exists public.search_events_user_event_id_key;
alter table public.search_events drop column if exists client_event_id;
drop policy if exists "Users can register their own search events" on public.search_events;
revoke insert on table public.search_events from authenticated;
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
    RAISE EXCEPTION 'T8 FALHOU: rollback base não removeu a tabela';
  END IF;

  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname IN ('search_insights','purge_old_search_events');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'T8 FALHOU: rollback base deixou % funções para trás', v_n;
  END IF;
  RAISE NOTICE 'T8 OK: rollback base remove tabela e funções';
END $$;

ROLLBACK TO SAVEPOINT antes_do_rollback_base;

DO $$
DECLARE
  v_n integer;
BEGIN
  SELECT count(*) INTO v_n
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'search_events';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'T8 FALHOU: savepoint não restaurou a tabela base';
  END IF;
  IF to_regprocedure('public.log_search_event(text,integer,boolean,uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'T8 FALHOU: savepoint não restaurou log_search_event';
  END IF;
  RAISE NOTICE 'T8 OK: savepoints restauraram tabela e RPC após os dois rollbacks';
END $$;

ROLLBACK;
