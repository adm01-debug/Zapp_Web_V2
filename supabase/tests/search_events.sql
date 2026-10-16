-- ============================================================================
-- feat(db): analise de buscas — search_events (termo normalizado, SEM PII),
-- retencao de 90 dias e tres RPCs (log_search_event GET_search_insights,
-- purge_search_events). Cartao t_d15d3a92 (workersql). Origem: auditoria de
-- paridade V3->V2 (parte 1, HZ1-06), aprovada pelo dono em 13/10.
--
-- O QUE PROVA (criterio de pronto do cartao):
--   A) no estado ANTES do conserto a analise de buscas NAO existe no banco: a
--      tabela public.search_events e as funcoes log_search_event /
--      get_search_insights / purge_search_events nao existem (42883/42P01);
--   B) DEPOIS da migration <ts>_search_events:
--        B1 log_search_event grava como o proprio usuario (auth.uid()), com o
--           termo normalizado (caixa/acento/espaco) e no maximo 80 caracteres;
--        B2 termo com PII NAO e gravado — telefone (7+ digitos), e-mail (@),
--           CPF/CNPJ no formato pontuado e token longo — e a razao do descarte e
--           devolvida; a checagem do '@' e feita no termo BRUTO, antes da
--           normalizacao (que apagaria o sinal);
--        B3 termo vazio/NULL e sem autenticacao tambem nao gravam;
--        B4 nenhum termo com digito ou arroba chegou ao banco (o bug do V3);
--        B5 taxa: passado o limite por usuario, a gravacao e recusada
--           (rate_limited) sem quebrar a chamada;
--   C) leitura: a tabela NAO tem nenhuma policy nem privilegio para
--      authenticated/anon (negada por padrao, inclusive para admin — a leitura
--      e so pela RPC); get_search_insights responde 42501 a agente comum e a
--      anonimo, e devolve os indicadores para admin E supervisor (o proprio
--      cartao diz admin/supervisor); os numeros conferem com a fixture e a
--      janela p_days funciona (entrada invalida nao derruba a RPC);
--   D) retencao: purge_search_events so roda com service_role, apaga em lote o
--      que passou de 90 dias, respeita p_limit e nao toca no que esta dentro do
--      prazo;
--   E) reaplicar a migration nao muda nada (idempotente);
--   F) o rollback do proprio arquivo roda verbatim e derruba tabela e funcoes
--      (inverso de verdade, nao de fachada).
--
-- COMO A PROTECAO ENTRA NO TESTE (nada de copiar o conserto para dentro do
-- arquivo): a superficie minima (roles, schema auth, tabelas de apoio e a
-- publicacao) e criada a mao — e ambiente, nao contrato — e a PROTECAO e
-- aplicada VERBATIM dos arquivos de migration do repositorio, via `\i`, na
-- ordem cronologica:
--   20251215025014 -> app_role, user_roles, has_role(), is_admin_or_supervisor()
--                     (public.contacts, profiles, whatsapp_connections e
--                      storage/publication sao a superficie que ele consome)
--   <ts>_search_events -> a migration sob teste (o conserto)
-- Mesmo padrao de supabase/tests/global_settings_secrets_rls.sql (t_3dd47b33),
-- user_roles_troca_de_papel_autorizacao_e_auditoria.sql e
-- scripts/db-audit/dashboard-rls-authorization.test.sh.
--
-- ENFORCEMENT exercido como PAPEL REAL: as assercoes rodam com `SET LOCAL ROLE
-- authenticated` (e anon) + JWT sintetico em request.jwt.claims — o caminho do
-- PostgREST, nunca como postgres/superusuario (que ignora RLS e GRANT). Cada
-- operacao confere dentro do helper que current_user e de fato o papel pedido:
-- se o papel nao pegasse, o teste FALHA em vez de dar verde.
--
-- COMO RODA (PostgreSQL 17 descartavel; o repo e montado somente-leitura):
--   docker run --rm -d --name zapp-search-$$ -e POSTGRES_PASSWORD=test_only \
--     -v "$PWD:/repo:ro" postgres:17-alpine
--   docker exec -i zapp-search-$$ psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
--     -v repo=/repo -v mig_dir=/repo/supabase/migrations \
--     < supabase/tests/search_events.sql
--   docker rm -f zapp-search-$$
--
-- VERMELHO (o teste falha quando o conserto nao esta la):
--   `-v sem_conserto=1` — a migration sob teste NAO e aplicada; o BLOCO A
--   descreve o defeito e o BLOCO B ABORTA na primeira assercao (a funcao nao
--   existe). Nada persiste: o arquivo termina em ROLLBACK.
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

-- ── Superficie minima (ambiente; o contrato vem das migrations abaixo) ──────
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

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  role text DEFAULT 'agent'
);
CREATE TABLE public.contacts (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.whatsapp_connections (id uuid PRIMARY KEY DEFAULT gen_random_uuid());

-- ── Fixtures: entram sem disparar o gatilho de auth.users ───────────────────
SET session_replication_role = replica;

INSERT INTO auth.users (id) VALUES
  ('11111111-1111-1111-1111-11111111111a'),  -- ADMIN
  ('22222222-2222-2222-2222-22222222222b'),  -- AGENTE
  ('44444444-4444-4444-4444-44444444444d'),  -- SUPERVISOR
  ('55555555-5555-5555-5555-55555555555e');  -- RATE (so para o limite de taxa)

INSERT INTO public.profiles (id, user_id, name) VALUES
  ('a0000000-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-11111111111a', 'ADMIN SEARCH'),
  ('b0000000-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-22222222222b', 'AGENTE SEARCH'),
  ('d0000000-0000-0000-0000-00000000000d', '44444444-4444-4444-4444-44444444444d', 'SUPERVISOR SEARCH'),
  ('e0000000-0000-0000-0000-00000000000e', '55555555-5555-5555-5555-55555555555e', 'RATE SEARCH');

SET session_replication_role = origin;

-- ── A PROTECAO, verbatim das migrations reais, em ordem cronologica ─────────
\echo '── aplicando as migrations REAIS (helpers de papel) ──'
\i :mig_dir/20251215025014_fcc5bc79-55e3-4972-8765-6a7840fdce5a.sql

GRANT SELECT ON public.profiles, public.user_roles TO authenticated, service_role;

-- Fixtures de papel (depois das policies, com o gatilho de auth.users desligado).
SET session_replication_role = replica;
INSERT INTO public.user_roles (user_id, role) VALUES
  ('11111111-1111-1111-1111-11111111111a', 'admin'),
  ('22222222-2222-2222-2222-22222222222b', 'agent'),
  ('44444444-4444-4444-4444-44444444444d', 'supervisor'),
  ('55555555-5555-5555-5555-55555555555e', 'agent');
SET session_replication_role = origin;

-- ── Helpers do proprio teste ────────────────────────────────────────────────
CREATE FUNCTION pg_temp.espera(p_label text, p_atual text, p_esperado text) RETURNS void
LANGUAGE plpgsql AS $h$
BEGIN
  IF p_atual IS DISTINCT FROM p_esperado THEN
    RAISE EXCEPTION 'SEARCH-EVENTS FALHOU [%]: esperado %, obtido %', p_label, p_esperado, p_atual;
  END IF;
  RAISE NOTICE 'PASS [%] -> %', p_label, p_atual;
END $h$;

CREATE FUNCTION pg_temp.espera_erro(p_label text, p_atual text, p_sqlstate text) RETURNS void
LANGUAGE plpgsql AS $h$
BEGIN
  IF p_atual IS NULL OR p_atual NOT LIKE 'ERRO ' || p_sqlstate || ' %' THEN
    RAISE EXCEPTION 'SEARCH-EVENTS FALHOU [%]: esperava erro SQLSTATE %, veio: %', p_label, p_sqlstate, p_atual;
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
    RAISE EXCEPTION 'SEARCH-EVENTS FALHOU: papel real nao aplicado (current_user=%)', current_user;
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
    v := 'ERRO ' || SQLSTATE || ' ' || SQLERRM;
  END;
  RESET ROLE;
  RETURN v;
END $h$;

\echo
\echo '── BLOCO A: a analise de buscas existe? (defeito vivo x conserto) ──────'
\if :{?sem_conserto}
  SELECT pg_temp.espera('A1 [defeito vivo] a tabela search_events nao existe',
    (to_regclass('public.search_events') IS NULL)::text, 'true');
  SELECT pg_temp.espera_erro('A2 [defeito vivo] log_search_event nao existe',
    pg_temp.valor('authenticated', '22222222-2222-2222-2222-22222222222b',
      $sql$SELECT public.log_search_event('compra de paes', 3, true) ->> 'recorded'$sql$), '42883');
  SELECT pg_temp.espera_erro('A3 [defeito vivo] get_search_insights nao existe',
    pg_temp.valor('authenticated', '11111111-1111-1111-1111-11111111111a',
      $sql$SELECT public.get_search_insights(30) ->> 'total'$sql$), '42883');
\else
  \echo '── aplicando a migration SOB TESTE (o conserto) ──'
  \i :mig_dir/20261016112552_search_events.sql

  SELECT pg_temp.espera('A1 a tabela search_events existe',
    (to_regclass('public.search_events') IS NOT NULL)::text, 'true');
  SELECT pg_temp.espera('A2 as tres funcoes existem',
    (SELECT count(*)::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname IN ('log_search_event','get_search_insights','purge_search_events')), '3');
\endif

\echo
\echo '── BLOCO B: gravacao, normalizacao e descarte de PII (papel AGENTE) ────'

\if :{?sem_conserto}
  \echo '  [sem_conserto] a primeira assercao daqui aborta o teste (funcao ausente)'
\endif

SELECT pg_temp.espera('B1 termo com caixa/acento/espaco extra e gravado (recorded=true)',
  pg_temp.valor('authenticated', '22222222-2222-2222-2222-22222222222b',
    $sql$SELECT public.log_search_event('  Compra   de Pães  ', 3, true) ->> 'recorded'$sql$), 'true');
SELECT pg_temp.espera('B1b o termo gravado esta normalizado (caixa+acento+espaco)',
  (SELECT term_normalized FROM public.search_events
     WHERE user_id = '22222222-2222-2222-2222-22222222222b'), 'compra de paes');
SELECT pg_temp.espera('B1c result_count e clicked ficam registrados',
  (SELECT result_count::text || ' ' || clicked::text FROM public.search_events
     WHERE user_id = '22222222-2222-2222-2222-22222222222b'), '3 true');
SELECT pg_temp.espera('B1d o agente tem 1 evento gravado',
  (SELECT count(*)::text FROM public.search_events
     WHERE user_id = '22222222-2222-2222-2222-22222222222b'), '1');

SELECT pg_temp.espera('B2 telefone (11 digitos) NAO e gravado',
  pg_temp.valor('authenticated', '22222222-2222-2222-2222-22222222222b',
    $sql$SELECT public.log_search_event('11987654321', 0, false) ->> 'reason'$sql$), 'pii_phone');
SELECT pg_temp.espera('B2b telefone com 7 digitos tambem e descartado',
  pg_temp.valor('authenticated', '22222222-2222-2222-2222-22222222222b',
    $sql$SELECT public.log_search_event('pedido 1234567', 0, false) ->> 'reason'$sql$), 'pii_phone');
SELECT pg_temp.espera('B3 e-mail (@) NAO e gravado — o sinal e lido no termo BRUTO',
  pg_temp.valor('authenticated', '22222222-2222-2222-2222-22222222222b',
    $sql$SELECT public.log_search_event('meu@email.com', 0, false) ->> 'reason'$sql$), 'pii_email');
SELECT pg_temp.espera('B4 CPF (11 digitos) NAO e gravado',
  pg_temp.valor('authenticated', '22222222-2222-2222-2222-22222222222b',
    $sql$SELECT public.log_search_event('123.456.789-01', 0, false) ->> 'reason'$sql$), 'pii_document');
SELECT pg_temp.espera('B4b CNPJ (14 digitos) NAO e gravado',
  pg_temp.valor('authenticated', '22222222-2222-2222-2222-22222222222b',
    $sql$SELECT public.log_search_event('12.345.678/0001-95', 0, false) ->> 'reason'$sql$), 'pii_document');
SELECT pg_temp.espera('B5 token longo (JWT) NAO e gravado',
  pg_temp.valor('authenticated', '22222222-2222-2222-2222-22222222222b',
    $sql$SELECT public.log_search_event('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9', 0, false) ->> 'reason'$sql$), 'pii_token');
SELECT pg_temp.espera('B5b palavra continua de 32+ caracteres NAO e gravada',
  pg_temp.valor('authenticated', '22222222-2222-2222-2222-22222222222b',
    $sql$SELECT public.log_search_event('aBcDeFgHiJkLmNoPqRsTuVwXyZaBcDeFgHiJkLmNoP', 0, false) ->> 'reason'$sql$), 'pii_token');

SELECT pg_temp.espera('B6 termo vazio NAO e gravado',
  pg_temp.valor('authenticated', '22222222-2222-2222-2222-22222222222b',
    $sql$SELECT public.log_search_event('   ', 0, false) ->> 'reason'$sql$), 'empty');
SELECT pg_temp.espera('B6b termo NULL NAO e gravado',
  pg_temp.valor('authenticated', '22222222-2222-2222-2222-22222222222b',
    $sql$SELECT public.log_search_event(NULL, 0, false) ->> 'reason'$sql$), 'empty');
SELECT pg_temp.espera('B6c sem autenticacao (JWT sem sub) NAO grava',
  pg_temp.valor('authenticated', NULL,
    $sql$SELECT public.log_search_event('compra de paes', 0, false) ->> 'reason'$sql$), 'not_authenticated');
SELECT pg_temp.espera('B7 nenhuma das tentativas descartadas virou linha (segue 1)',
  (SELECT count(*)::text FROM public.search_events
     WHERE user_id = '22222222-2222-2222-2222-22222222222b'), '1');

SELECT pg_temp.espera('B8 termo acima de 80 caracteres e cortado em 80',
  pg_temp.valor('authenticated', '22222222-2222-2222-2222-22222222222b',
    $sql$SELECT public.log_search_event('termo muito longo para testar o corte de oitenta caracteres na normalizacao da busca de contatos e empresas', 0, false) ->> 'recorded'$sql$), 'true');
SELECT pg_temp.espera('B8b o termo ficou com exatamente 80 caracteres',
  (SELECT length(term_normalized)::text FROM public.search_events
     WHERE user_id = '22222222-2222-2222-2222-22222222222b'
       AND term_normalized <> 'compra de paes'), '80');
SELECT pg_temp.espera('B9 nenhum termo gravado tem digito ou arroba (o bug do V3)',
  (SELECT count(*)::text FROM public.search_events WHERE term_normalized ~ '[0-9@]'), '0');

\echo
\echo '── BLOCO C: leitura negada por padrao e agregacao so admin/supervisor ──'
SELECT pg_temp.espera('T0a authenticated NAO tem privilegio de tabela (nem SELECT)',
  has_table_privilege('authenticated', 'public.search_events', 'SELECT,INSERT,UPDATE,DELETE')::text, 'false');
SELECT pg_temp.espera('T0b anon NAO tem privilegio de tabela',
  has_table_privilege('anon', 'public.search_events', 'SELECT')::text, 'false');
SELECT pg_temp.espera('T0c RLS ligada em search_events',
  (SELECT relrowsecurity::text FROM pg_class WHERE oid = 'public.search_events'::regclass), 'true');
SELECT pg_temp.espera('T0d search_events nao tem NENHUMA policy (nega por padrao)',
  (SELECT count(*)::text FROM pg_policies WHERE schemaname = 'public' AND tablename = 'search_events'), '0');

SELECT pg_temp.espera_erro('C1 agente comum NAO le a tabela direto',
  pg_temp.valor('authenticated', '22222222-2222-2222-2222-22222222222b',
    $sql$SELECT count(*)::text FROM public.search_events$sql$), '42501');
SELECT pg_temp.espera_erro('C1b anon NAO le a tabela direto',
  pg_temp.valor('anon', NULL, $sql$SELECT count(*)::text FROM public.search_events$sql$), '42501');
SELECT pg_temp.espera_erro('C1c nem o ADMIN le a tabela direto (a leitura e so pela RPC)',
  pg_temp.valor('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$SELECT count(*)::text FROM public.search_events$sql$), '42501');
SELECT pg_temp.espera_erro('C1d agente comum NAO grava na tabela direto (a RPC e o unico caminho)',
  pg_temp.operacao('authenticated', '22222222-2222-2222-2222-22222222222b',
    $sql$INSERT INTO public.search_events (user_id, term_normalized) VALUES ('22222222-2222-2222-2222-22222222222b','direto')$sql$), '42501');

SELECT pg_temp.espera_erro('C2 agente comum recebe 42501 na RPC de indicadores',
  pg_temp.valor('authenticated', '22222222-2222-2222-2222-22222222222b',
    $sql$SELECT public.get_search_insights(30) ->> 'total'$sql$), '42501');
SELECT pg_temp.espera_erro('C2b anon recebe 42501 na RPC de indicadores',
  pg_temp.valor('anon', NULL, $sql$SELECT public.get_search_insights(30) ->> 'total'$sql$), '42501');

-- Fixture deterministica dos indicadores (como postgres, e ambiente):
--   SUPERVISOR: 'orcamento' x2 (5 cliques 1, 2 sem clique), 1 busca sem resultado
--   AGENTE:     'compra de paes' (3 resultados, clicado) + o termo cortado (0)
--   AGENTE:     1 linha de 40 dias atras (fora da janela de 30, dentro de 60)
INSERT INTO public.search_events (user_id, term_normalized, result_count, clicked) VALUES
  ('44444444-4444-4444-4444-44444444444d', 'orcamento', 5, true),
  ('44444444-4444-4444-4444-44444444444d', 'orcamento', 2, false),
  ('44444444-4444-4444-4444-44444444444d', 'produto inexistente', 0, false);
INSERT INTO public.search_events (user_id, term_normalized, result_count, clicked, created_at) VALUES
  ('22222222-2222-2222-2222-22222222222b', 'termo antigo', 1, false, now() - interval '40 days');

SELECT pg_temp.espera('C3 SUPERVISOR le os indicadores',
  pg_temp.valor('authenticated', '44444444-4444-4444-4444-44444444444d',
    $sql$SELECT public.get_search_insights(30) ->> 'days'$sql$), '30');
SELECT pg_temp.espera('C3b o total da janela de 30 dias e 5',
  pg_temp.valor('authenticated', '44444444-4444-4444-4444-44444444444d',
    $sql$SELECT public.get_search_insights(30) ->> 'total'$sql$), '5');
SELECT pg_temp.espera('C4 ADMIN tambem le os indicadores (o cartao diz admin/supervisor)',
  pg_temp.valor('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$SELECT public.get_search_insights(30) ->> 'total'$sql$), '5');
SELECT pg_temp.espera('C5 buscas sem resultado na janela sao 2',
  pg_temp.valor('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$SELECT public.get_search_insights(30) ->> 'no_results'$sql$), '2');
SELECT pg_temp.espera('C5b cliques na janela sao 2',
  pg_temp.valor('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$SELECT public.get_search_insights(30) ->> 'clicks'$sql$), '2');
SELECT pg_temp.espera('C5c a taxa de clique e 2/5 (sem divisao por zero)',
  pg_temp.valor('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$SELECT ((public.get_search_insights(30) ->> 'click_rate')::numeric = 0.4)::text$sql$), 'true');
SELECT pg_temp.espera('C6 o topo da lista e o termo buscado 2 vezes',
  pg_temp.valor('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$SELECT (public.get_search_insights(30) ->> 'top_queries')::jsonb -> 0 ->> 'term'$sql$), 'orcamento');
SELECT pg_temp.espera('C6b o topo da lista sem resultado traz a busca que nao achou nada',
  pg_temp.valor('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$SELECT (public.get_search_insights(30) ->> 'no_result_terms')::jsonb -> 0 ->> 'term'$sql$),
  'produto inexistente');
SELECT pg_temp.espera('C7 janela de 60 dias inclui a linha de 40 dias (total 6)',
  pg_temp.valor('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$SELECT public.get_search_insights(60) ->> 'total'$sql$), '6');
SELECT pg_temp.espera('C8 p_days NULL cai no padrao de 30 dias',
  pg_temp.valor('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$SELECT public.get_search_insights(NULL) ->> 'days'$sql$), '30');
SELECT pg_temp.espera('C8b p_days 0 cai no padrao de 30 dias',
  pg_temp.valor('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$SELECT public.get_search_insights(0) ->> 'days'$sql$), '30');
SELECT pg_temp.espera('C8c p_days 999 e limitado a 365 dias',
  pg_temp.valor('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$SELECT public.get_search_insights(999) ->> 'days'$sql$), '365');
SELECT pg_temp.espera('C9 a linha fora da janela de 30 nao entra em nenhum indicador',
  pg_temp.valor('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$SELECT ((public.get_search_insights(30) ->> 'total')::int
                = (public.get_search_insights(30) ->> 'total')::int)::text$sql$), 'true');

\echo
\echo '── BLOCO D: retencao de 90 dias (expurgo so com service_role) ─────────'
SELECT pg_temp.espera('D1 agente comum NAO executa o expurgo',
  pg_temp.valor('authenticated', '22222222-2222-2222-2222-22222222222b',
    $sql$SELECT public.purge_search_events(1000)::text$sql$), 'ERRO 42501 permission denied for function purge_search_events');
SELECT pg_temp.espera('D1b admin tambem NAO executa o expurgo (so service_role)',
  pg_temp.valor('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$SELECT public.purge_search_events(1000)::text$sql$), 'ERRO 42501 permission denied for function purge_search_events');
SELECT pg_temp.espera('D2 service_role tem EXECUTE no expurgo',
  has_function_privilege('service_role', 'public.purge_search_events(integer)', 'EXECUTE')::text, 'true');

INSERT INTO public.search_events (user_id, term_normalized, result_count, clicked, created_at) VALUES
  ('22222222-2222-2222-2222-22222222222b', 'termo vencido a', 1, false, now() - interval '91 days'),
  ('44444444-4444-4444-4444-44444444444d', 'termo vencido b', 1, false, now() - interval '91 days');

SELECT pg_temp.espera('D3 o expurgo apaga as 2 linhas vencidas',
  pg_temp.valor('service_role', NULL, $sql$SELECT public.purge_search_events()::text$sql$), '2');
SELECT pg_temp.espera('D3b nada vencido sobrou',
  (SELECT count(*)::text FROM public.search_events WHERE created_at < now() - interval '90 days'), '0');
SELECT pg_temp.espera('D3c as 6 linhas dentro do prazo seguem intactas',
  (SELECT count(*)::text FROM public.search_events), '6');
SELECT pg_temp.espera('D3d a linha de 40 dias sobreviveu ao expurgo',
  (SELECT count(*)::text FROM public.search_events WHERE term_normalized = 'termo antigo'), '1');

INSERT INTO public.search_events (user_id, term_normalized, result_count, clicked, created_at)
SELECT '22222222-2222-2222-2222-22222222222b', 'lote ' || g, 1, false, now() - interval '91 days'
  FROM generate_series(1, 2) AS g;
SELECT pg_temp.espera('D4 o expurgo respeita p_limit (apaga 1 por chamada)',
  pg_temp.valor('service_role', NULL, $sql$SELECT public.purge_search_events(1)::text$sql$), '1');
SELECT pg_temp.espera('D4b sobra 1 vencida para a proxima chamada',
  (SELECT count(*)::text FROM public.search_events WHERE created_at < now() - interval '90 days'), '1');

\echo
\echo '── BLOCO E: reaplicar a migration nao muda nada (idempotente) ─────────'
\if :{?sem_conserto}
  \echo '  [sem_conserto] nada a idempotenciar'
\else
  \i :mig_dir/20261016112552_search_events.sql
  SELECT pg_temp.espera('E1 apos reaplicar, seguem as 3 funcoes',
    (SELECT count(*)::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname IN ('log_search_event','get_search_insights','purge_search_events')), '3');
  SELECT pg_temp.espera('E2 apos reaplicar, nenhum dado se perdeu',
    (SELECT count(*)::text FROM public.search_events), '7');
  SELECT pg_temp.espera('E3 apos reaplicar, a leitura segue negada ao agente',
    has_table_privilege('authenticated', 'public.search_events', 'SELECT')::text, 'false');
  SELECT pg_temp.espera('E4 apos reaplicar, segue sem policy',
    (SELECT count(*)::text FROM pg_policies WHERE schemaname = 'public' AND tablename = 'search_events'), '0');
  SELECT pg_temp.espera('E5 apos reaplicar, o supervisor continua lendo os indicadores',
    pg_temp.valor('authenticated', '44444444-4444-4444-4444-44444444444d',
      $sql$SELECT (public.get_search_insights(30) ->> 'total')$sql$), '5');
\endif

\echo
\echo '── BLOCO B2: limite de taxa por usuario (por ultimo: mexe nas contagens) ─'
-- 30 eventos recentes do usuario RATE entram como postgres (ambiente): a
-- proxima chamada dele tem de ser recusada, e a de outro usuario nao.
INSERT INTO public.search_events (user_id, term_normalized, result_count, clicked)
SELECT '55555555-5555-5555-5555-55555555555e', 'termo lote ' || g, 1, false
  FROM generate_series(1, 30) AS g;
SELECT pg_temp.espera('B10 passado o limite, a gravacao e recusada (rate_limited)',
  pg_temp.valor('authenticated', '55555555-5555-5555-5555-55555555555e',
    $sql$SELECT public.log_search_event('mais um termo', 1, false) ->> 'reason'$sql$), 'rate_limited');
SELECT pg_temp.espera('B10b o limite e POR USUARIO (outro usuario grava normalmente)',
  pg_temp.valor('authenticated', '22222222-2222-2222-2222-22222222222b',
    $sql$SELECT public.log_search_event('orcamento de brindes', 5, false) ->> 'recorded'$sql$), 'true');
SELECT pg_temp.espera('B11 o evento recusado nao entrou na tabela (segue 30 do RATE)',
  (SELECT count(*)::text FROM public.search_events
     WHERE user_id = '55555555-5555-5555-5555-55555555555e'), '30');

\echo
\echo '── BLOCO F: o rollback da migration e executavel e e o inverso de verdade ─'
-- Le as linhas "--   <stmt>;" do proprio arquivo da migration (verbatim, sem
-- copia a mao) e executa. Depois prova que o estado ANTERIOR volta: a tabela e
-- as funcoes somem.
\if :{?sem_conserto}
  \echo '  [sem_conserto] sem conserto nao ha rollback a provar'
\else
DO $bloco$
DECLARE
  v_txt  text := pg_read_file('/repo/supabase/migrations/20261016112552_search_events.sql');
  v_stmt text;
  v_n    int := 0;
BEGIN
  FOR v_stmt IN
    SELECT regexp_replace(btrim(l, E' \t'), '^--[[:space:]]+', '')
      FROM unnest(string_to_array(v_txt, E'\n')) AS l
     WHERE btrim(l, E' \t') ~* '^--[[:space:]]+(drop|create|alter|grant|revoke|insert|update|delete|comment|select)[[:space:]]'
  LOOP
    EXECUTE v_stmt;
    v_n := v_n + 1;
  END LOOP;
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'SEARCH-EVENTS FALHOU: rollback do arquivo trouxe % statements (esperava 4)', v_n;
  END IF;
  RAISE NOTICE 'PASS [F1 rollback executado verbatim do arquivo] -> % statements', v_n;
END
$bloco$;
SELECT pg_temp.espera('F2 o rollback derruba a tabela',
  (to_regclass('public.search_events') IS NULL)::text, 'true');
SELECT pg_temp.espera_erro('F3 o rollback derruba log_search_event',
  pg_temp.valor('authenticated', '22222222-2222-2222-2222-22222222222b',
    $sql$SELECT public.log_search_event('compra de paes', 1, false) ->> 'recorded'$sql$), '42883');
SELECT pg_temp.espera_erro('F4 o rollback derruba get_search_insights',
  pg_temp.valor('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$SELECT public.get_search_insights(30) ->> 'total'$sql$), '42883');
SELECT pg_temp.espera_erro('F5 o rollback derruba purge_search_events',
  pg_temp.valor('service_role', NULL, $sql$SELECT public.purge_search_events()::text$sql$), '42883');
\endif

ROLLBACK;

\if :{?sem_conserto}
\echo 'SEARCH-EVENTS VERMELHO: sem a migration, a analise de buscas nao existe (o teste ABORTOU acima).'
\else
\echo 'SEARCH-EVENTS OK: termo normalizado e cortado em 80; telefone/e-mail/CPF-CNPJ/token';
\echo '                 nunca entram no banco; limite de taxa por usuario; leitura negada por';
\echo '                 padrao (nem admin le direto) e indicadores so admin/supervisor;';
\echo '                 expurgo de 90 dias so com service_role e em lote; rollback verbatim derruba tudo.'
\endif
