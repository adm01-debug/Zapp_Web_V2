-- catalog_rate_limit_policy_confiavel — B1–B31 e C1–C9 sobre a RPC REAL do #296
-- (supabase/migrations/20261007000311_catalogo_rate_limit_politica_confiavel.sql,
--  cartão de origem t_c7191d8c; refazer t_a6c17c8a).
--
-- O QUE PROVA (critério do cartão): a cota e a janela do limitador do catálogo vêm de
-- CONFIGURAÇÃO CONFIÁVEL (public.catalog_rate_limit_policy) e nunca dos argumentos da RPC.
--   B1–B3   p_limit=1 / p_window_ms=1 (o que um cliente hostil manda) não apertam a cota:
--           120 passam em list_products, a 121ª é negada e os 121 hits ficam no balde;
--   B4–B13  p_window_ms = 0, negativo, 1 ms ou enorme e p_limit = 999999, 0 ou negativo NÃO
--           apagam hit nenhum e NÃO liberam a requisição (era o defeito P2: o usuário
--           autenticado zerava o próprio contador e a chamada seguinte voltava liberada);
--   B14     nenhum dos ataques apagou histórico;
--   B15–B16 isolamento por usuário (cada um tem o próprio balde);
--   B17–B21 ação inventada cai no balde 'global' (não cria balde novo e ilimitado);
--   B22     isolamento por ação;
--   B23–B24 p_user nulo falha alto e não grava hit órfão;
--   B25     sem a linha 'global' a função cai no piso interno e não estoura;
--   B26–B28 ACL da primitiva e da tabela de política (authenticated executa, anon não;
--           authenticated não lê a política);
--   B29–B31 SELECT/UPDATE direto na política são negados e nada foi alterado;
--   C1–C9   o bloco BEGIN-ROLLBACK do PRÓPRIO arquivo da migration é extraído e EXECUTADO:
--           a tabela some, o corpo ANTERIOR volta (o argumento manda de novo, inclusive o
--           expurgo com janela 0 = o defeito vira visível de novo) e reaplicar é idempotente.
--
-- COMO RODA (Postgres 17 descartável; nada de produção). Fixtures e asserções ficam numa
-- transação que termina em ROLLBACK — zero efeito colateral, idempotente:
--   docker run --rm -d --name zapp-v2-catalog-rl-$$ -v "$PWD:/repo:ro" \
--     -e POSTGRES_PASSWORD=test_only postgres:17-alpine
--   docker exec -i zapp-v2-catalog-rl-$$ psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
--     -v mig_shared=/repo/supabase/migrations/20261002681230_catalogo_rate_limit_compartilhado.sql \
--     -v mig_append=/repo/supabase/migrations/20261003122707_catalogo_rate_limit_hits_append_only.sql \
--     -v mig_fix=/repo/supabase/migrations/20261007000311_catalogo_rate_limit_politica_confiavel.sql \
--     < supabase/tests/catalog_rate_limit_policy_confiavel.sql
-- Papel de usuário sempre por SET LOCAL ROLE + request.jwt.claims — nunca superusuário.
-- O bloco C lê o arquivo da migration com pg_read_file (superusuário do Postgres descartável),
-- por isso -v mig_fix= tem de ser um caminho legível DENTRO do container (absoluto, ex. /repo/...).
--
-- VERMELHO esperado sem a correção: o mesmo comando com -v sem_migration=1 falha já em B1,
-- porque a tabela public.catalog_rate_limit_policy não existe (as duas migrations anteriores
-- do limitador não a criam) — e, no lugar dela, p_window_ms = 0 volta a zerar a chave.

\set ON_ERROR_STOP on

-- Arquivos das migrations sob teste: -v mig_* vencem o padrão.
\if :{?mig_shared}
\else
  \set mig_shared 'supabase/migrations/20261002681230_catalogo_rate_limit_compartilhado.sql'
\endif
\if :{?mig_append}
\else
  \set mig_append 'supabase/migrations/20261003122707_catalogo_rate_limit_hits_append_only.sql'
\endif
\if :{?mig_fix}
\else
  \set mig_fix 'supabase/migrations/20261007000311_catalogo_rate_limit_politica_confiavel.sql'
\endif

BEGIN;

-- ---------------------------------------------------------------------------
-- Superfície mínima à mão (só existe em Postgres descartável)
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

-- Default privileges do Supabase: função nova nasce executável por anon/authenticated.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

CREATE FUNCTION public.z296_assert(p_ok boolean, p_msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FALHOU: %', p_msg;
  END IF;
  RAISE NOTICE 'ok  %', p_msg;
END $$;

-- Leitor da tabela de hits com os privilégios de quem criou (a leitura crua é da prova, não
-- do produto: authenticated não tem SELECT em catalog_rate_limit_hits).
CREATE FUNCTION public.z296_hits(p_user uuid, p_action text) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_n integer;
BEGIN
  SELECT count(*)::int INTO v_n FROM public.catalog_rate_limit_hits
   WHERE user_id = p_user AND action = p_action;
  RETURN v_n;
END $$;

-- ---------------------------------------------------------------------------
-- Extrai o bloco BEGIN-ROLLBACK do PROPRIO arquivo da migration e o executa (nada de copia no
-- teste): o caminho entra por psql -v mig_fix=... (variavel so e interpolada em SQL simples).
CREATE FUNCTION public.z296_aplicar_rollback(p_arquivo text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $func$
DECLARE
  v_txt text;
  v_blk text;
BEGIN
  v_txt := pg_read_file(p_arquivo);
  v_blk := substring(v_txt from '-- ===== BEGIN-ROLLBACK[^' || chr(92) || 'n]*' || chr(92) || 'n(.*)-- ===== END-ROLLBACK');
  IF v_blk IS NULL OR length(btrim(v_blk)) = 0 THEN
    RAISE EXCEPTION 'nao consegui extrair o bloco BEGIN-ROLLBACK de %', p_arquivo;
  END IF;
  v_blk := regexp_replace(v_blk, '(?m)^-- ?', '', 'g');
  EXECUTE v_blk;
END $func$;

-- Migrations REAIS: o estado anterior do limitador (compartilhado + append-only) e, salvo no
-- modo vermelho, a correção sob teste.
-- ---------------------------------------------------------------------------
\i :mig_shared
\i :mig_append

\if :{?sem_migration}
  \echo '### modo vermelho: migration 20261007000311 NAO aplicada ###'
\else
  \i :mig_fix
\endif

\echo ''
\echo '============ BLOCO B — correção aplicada ============'

-- B1–B3: a cota vem da política, não do argumento. U3 manda p_limit=1 e p_window_ms=1.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
SELECT public.z296_assert(
  (SELECT count(*) FROM generate_series(1,120) g
    WHERE public.catalog_rate_limit_hit('33333333-3333-3333-3333-333333333333','list_products',1,1)) = 120,
  'B.1 o limite vem da politica (120/min em list_products), nao do argumento');
SELECT public.z296_assert(
  public.catalog_rate_limit_hit('33333333-3333-3333-3333-333333333333','list_products',1,1) IS FALSE,
  'B.2 a 121a chamada e negada (a janela tambem veio da politica, nao dos 1 ms)');
RESET ROLE;
SELECT public.z296_assert(
  public.z296_hits('33333333-3333-3333-3333-333333333333','list_products') = 121,
  'B.3 o balde tem os 121 hits (nenhum foi apagado)');

-- B4–B14: ataques com janela/limite arbitrários não apagam nem liberam.
SET LOCAL ROLE authenticated;
SELECT public.z296_assert(
  public.catalog_rate_limit_hit('33333333-3333-3333-3333-333333333333','list_products',120,0) IS FALSE,
  'B.4 ataque p_window_ms=0 NAO zera: segue negado');
RESET ROLE;
SELECT public.z296_assert(
  public.z296_hits('33333333-3333-3333-3333-333333333333','list_products') = 122,
  'B.5 ...e o historico nao foi apagado (ganhou o hit do ataque)');
SET LOCAL ROLE authenticated;
SELECT public.z296_assert(
  public.catalog_rate_limit_hit('33333333-3333-3333-3333-333333333333','list_products',120,60000) IS FALSE,
  'B.6 a chamada seguinte do endpoint continua negada (cota intacta)');
RESET ROLE;
SELECT public.z296_assert(
  public.z296_hits('33333333-3333-3333-3333-333333333333','list_products') = 123,
  'B.7 historico intacto depois do ataque');
SET LOCAL ROLE authenticated;
SELECT public.z296_assert(
  public.catalog_rate_limit_hit('33333333-3333-3333-3333-333333333333','list_products',120,-5000) IS FALSE,
  'B.8 janela negativa nao apaga nada e nega');
SELECT public.z296_assert(
  public.catalog_rate_limit_hit('33333333-3333-3333-3333-333333333333','list_products',120,1) IS FALSE,
  'B.9 janela 1 ms nao reinventa a janela e nega');
SELECT public.z296_assert(
  public.catalog_rate_limit_hit('33333333-3333-3333-3333-333333333333','list_products',120,999999999) IS FALSE,
  'B.10 janela enorme nao apaga nada e nega');
SELECT public.z296_assert(
  public.catalog_rate_limit_hit('33333333-3333-3333-3333-333333333333','list_products',999999,60000) IS FALSE,
  'B.11 limite arbitrario (p_limit=999999) nao libera');
SELECT public.z296_assert(
  public.catalog_rate_limit_hit('33333333-3333-3333-3333-333333333333','list_products',0,60000) IS FALSE,
  'B.12 p_limit=0 nao libera');
SELECT public.z296_assert(
  public.catalog_rate_limit_hit('33333333-3333-3333-3333-333333333333','list_products',-7,60000) IS FALSE,
  'B.13 p_limit negativo nao libera');
RESET ROLE;
SELECT public.z296_assert(
  public.z296_hits('33333333-3333-3333-3333-333333333333','list_products') = 129,
  'B.14 o balde segue com todos os hits do bloco (nada foi apagado)');

-- B15–B16: isolamento por usuário (U5 usa a MESMA ação de U1, cujo balde está poluído).
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}', true);
SELECT public.z296_assert(
  (SELECT count(*) FROM generate_series(1,60) g
    WHERE public.catalog_rate_limit_hit('55555555-5555-5555-5555-555555555555','bootstrap',1,1)) = 60,
  'B.15 outro usuario tem balde proprio: 60 passam em bootstrap com p_limit=1');
SELECT public.z296_assert(
  public.catalog_rate_limit_hit('55555555-5555-5555-5555-555555555555','bootstrap',1,1) IS FALSE,
  'B.16 ...e a 61a dele e negada');

-- B17–B21: ação inventada cai no balde 'global'.
SELECT set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
SELECT public.z296_assert(
  public.catalog_rate_limit_hit('33333333-3333-3333-3333-333333333333','acao_inventada_xyz',999999,60000) IS TRUE,
  'B.17 acao inventada e aceita (balde global), sem criar balde novo');
RESET ROLE;
SELECT public.z296_assert(
  public.z296_hits('33333333-3333-3333-3333-333333333333','global') = 1,
  'B.18 o hit da acao inventada foi gravado no balde global');
SELECT public.z296_assert(
  public.z296_hits('33333333-3333-3333-3333-333333333333','acao_inventada_xyz') = 0,
  'B.19 nenhum hit ficou na acao inventada');
SET LOCAL ROLE authenticated;
SELECT public.z296_assert(
  (SELECT count(*) FROM generate_series(1,60) g
    WHERE public.catalog_rate_limit_hit('33333333-3333-3333-3333-333333333333','global',60,60000)) = 59,
  'B.20 esgotar o balde global de U3 (59: o hit do ataque B.17 ja estava la)');
SELECT public.z296_assert(
  public.catalog_rate_limit_hit('33333333-3333-3333-3333-333333333333','outra_acao_qualquer',999999,60000) IS FALSE,
  'B.21 com o global cheio, outra acao inventada tambem e negada (sem balde novo)');
-- B22: isolamento por ação (U1 só gastou list_products).
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SELECT public.z296_assert(
  public.catalog_rate_limit_hit('11111111-1111-1111-1111-111111111111','list_products',120,60000) IS TRUE,
  'B.22 isolamento por acao: list_products de U1 segue no proprio balde');

-- B23–B24: entrada inválida falha alto e não grava hit órfão.
DO $$
DECLARE falhou boolean := false;
BEGIN
  BEGIN
    PERFORM public.catalog_rate_limit_hit(NULL, 'bootstrap', 60, 60000);
  EXCEPTION WHEN null_value_not_allowed THEN falhou := true;
  END;
  PERFORM public.z296_assert(falhou, 'B.23 p_user nulo falha alto (nao grava hit e nao devolve decisao falsa)');
END $$;
RESET ROLE;
SELECT public.z296_assert(
  (SELECT count(*) FROM public.catalog_rate_limit_hits WHERE user_id IS NULL) = 0,
  'B.24 o hit nulo nao entrou na tabela');

-- B25: sem a linha 'global' a função cai no piso interno, sem erro novo.
DELETE FROM public.catalog_rate_limit_policy WHERE action = 'global';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}', true);
SELECT public.z296_assert(
  (SELECT public.catalog_rate_limit_hit('55555555-5555-5555-5555-555555555555','acao_sem_politica',60,60000)) IS TRUE,
  'B.25 sem a linha global, a funcao cai no piso interno e nao estoura');
RESET ROLE;
INSERT INTO public.catalog_rate_limit_policy (action, max_hits, window_ms) VALUES ('global', 60, 60000);

-- B26–B28: ACL.
SELECT public.z296_assert(
  has_function_privilege('authenticated','public.catalog_rate_limit_hit(uuid,text,integer,integer)','EXECUTE'),
  'B.26 authenticated MANTEM execute (a edge continua funcionando)');
SELECT public.z296_assert(
  NOT has_function_privilege('anon','public.catalog_rate_limit_hit(uuid,text,integer,integer)','EXECUTE'),
  'B.27 anon nao executa');
SELECT public.z296_assert(
  NOT has_table_privilege('authenticated','public.catalog_rate_limit_policy','SELECT'),
  'B.28 authenticated nao le a tabela de politica');

-- B29–B31: leitura/escrita direta na política pelo cliente é negada e nada muda.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
DO $$
DECLARE negou_select boolean := false; negou_update boolean := false;
BEGIN
  BEGIN
    PERFORM count(*) FROM public.catalog_rate_limit_policy;
  EXCEPTION WHEN insufficient_privilege THEN negou_select := true;
  END;
  BEGIN
    UPDATE public.catalog_rate_limit_policy SET max_hits = 999999 WHERE action = 'bootstrap';
  EXCEPTION WHEN insufficient_privilege THEN negou_update := true;
  END;
  PERFORM public.z296_assert(negou_select, 'B.29 SELECT direto na politica e negado');
  PERFORM public.z296_assert(negou_update, 'B.30 UPDATE direto na politica e negado');
END $$;
RESET ROLE;
SELECT public.z296_assert(
  (SELECT max_hits FROM public.catalog_rate_limit_policy WHERE action = 'bootstrap') = 60,
  'B.31 a politica nao foi alterada pelo cliente');

-- ---------------------------------------------------------------------------
-- BLOCO C — o ROLLBACK escrito na migration roda e devolve o estado anterior, e
-- reaplicar a migration é idempotente. O bloco é EXTRAÍDO do arquivo da migration
-- (não é uma cópia no teste).
-- ---------------------------------------------------------------------------
\echo ''
\echo '============ BLOCO C — rollback executado a partir do proprio arquivo ============'

SELECT public.z296_assert(
  (SELECT count(*) FROM public.catalog_rate_limit_policy) = 7,
  'C.1 antes do rollback: a politica existe com as 7 acoes');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"77777777-7777-7777-7777-777777777777","role":"authenticated"}', true);
SELECT public.z296_assert(
  (SELECT count(*) FROM generate_series(1,60) g
    WHERE public.catalog_rate_limit_hit('77777777-7777-7777-7777-777777777777','bootstrap',1,1)) = 60,
  'C.2 antes do rollback: a politica governa e o argumento nao vale (60 passam com p_limit=1)');
RESET ROLE;

SELECT public.z296_aplicar_rollback(:'mig_fix');

SELECT public.z296_assert(
  to_regclass('public.catalog_rate_limit_policy') IS NULL,
  'C.3 depois do rollback: a tabela de politica nao existe mais');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}', true);
SELECT public.z296_assert(
  (SELECT count(*) FROM generate_series(1,60) g
    WHERE public.catalog_rate_limit_hit('99999999-9999-9999-9999-999999999999','bootstrap',1,1)) = 1,
  'C.4 o corpo ANTERIOR voltou: o argumento volta a mandar (so 1 passa com p_limit=1)');
SELECT public.z296_assert(
  public.catalog_rate_limit_hit('99999999-9999-9999-9999-999999999999','bootstrap',60,0) IS TRUE,
  'C.5 ...inclusive o expurgo: janela 0 zera a chave de novo (o defeito volta a ser visivel)');
RESET ROLE;
SELECT public.z296_assert(
  public.z296_hits('99999999-9999-9999-9999-999999999999','bootstrap') = 0,
  'C.6 ...e o balde ficou vazio (defeito de volta, como no estado anterior)');

\i :mig_fix
SELECT public.z296_assert(
  (SELECT count(*) FROM public.catalog_rate_limit_policy) = 7,
  'C.7 reaplicar a migration e idempotente: a politica volta com as 7 acoes');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
SELECT public.z296_assert(
  (SELECT count(*) FROM generate_series(1,60) g
    WHERE public.catalog_rate_limit_hit('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','bootstrap',1,1)) = 60,
  'C.8 ...e a correcao volta a valer (60 passam de novo com p_limit=1)');
SELECT public.z296_assert(
  public.catalog_rate_limit_hit('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','bootstrap',1,1) IS FALSE,
  'C.9 ...e o teto volta a ser o da politica (a 61a e negada)');
RESET ROLE;

\echo ''
\echo 'PASS: R2-DB-010 — a cota do catalogo vem de configuracao confiavel (public.catalog_rate_limit_policy); janela e limite arbitrarios por RPC direta nao apagam hits nem liberam a requisicao; o rollback devolve o estado anterior e reaplicar e idempotente.'

-- Zero efeito colateral: nada do que foi criado/alterado aqui fica no banco.
ROLLBACK;
