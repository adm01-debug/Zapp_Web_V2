-- ============================================================================
-- PB-35 (auditoria de paridade V3->V2, cartao t_1d123124)
-- "o contador de uso do emoji personalizado sobe para QUALQUER atendente"
-- ============================================================================
--
-- O QUE PROVA (criterio de pronto do cartao):
--   1. Contador sobe por RPC: um atendente comum (papel `authenticated` sem
--      admin) incrementa o `use_count` do emoji de OUTRO dono via
--      public.increment_custom_emoji_use(id);
--   2. Nenhum outro campo editavel: o RPC nao toca em name/category/
--      is_favorite/uploaded_by/updated_at, e o UPDATE DIRETO do atendente
--      continua barrado pela RLS (dono ou admin) — o contador so sobe pelo RPC;
--   3. ACL: EXECUTE so para `authenticated` (anon e service_role negados),
--      PUBLIC revogado.
--
-- A PROTECAO entra VERBATIM dos arquivos de migration do repositorio (via `\i`,
-- em ordem cronologica) — nada de copiar policy para dentro do teste. A unica
-- superficie adicional e ambiente (roles, schema auth, storage stub e as 3
-- tabelas que a migration de 20260320133103 tambem toca).
--
-- ENFORCEMENT exercido como PAPEL REAL: `SET LOCAL ROLE authenticated` + JWT
-- sintetico em request.jwt.claims (o caminho do PostgREST), nunca como postgres.
-- O helper confere que current_user e de fato o papel pedido.
--
-- COMO RODA (PostgreSQL 17 descartavel; o repo entra somente-leitura):
--   docker run --rm -d --name zapp-pb35-$$ -e POSTGRES_PASSWORD=test_only \
--     -v "$PWD:/repo:ro" postgres:17-alpine
--   docker exec -i zapp-pb35-$$ psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
--     -v mig_dir=/repo/supabase/migrations \
--     < supabase/tests/custom_emoji_use_rpc_increment.sql
--   docker rm -f zapp-pb35-$$
--
-- VERMELHO (falha sem a correcao): acrescente `-v sem_correcao=1` — a migration
-- nova nao e aplicada e a chamada a RPC resolve em erro 42883.
--
-- Tudo roda numa unica transacao que termina em ROLLBACK: idempotente.
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

CREATE SCHEMA storage;
CREATE TABLE storage.buckets (
  id text PRIMARY KEY, name text, public boolean,
  file_size_limit bigint, allowed_mime_types text[]);
CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text);

CREATE TABLE public.user_roles (user_id uuid NOT NULL, role text NOT NULL);
CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin', 'supervisor'))
$$;
-- Tabelas que a migration 20260320133103 tambem endurece (fora do objeto do cartao;
-- existem so para o arquivo real aplicar inteiro).
CREATE TABLE public.audio_memes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), uploaded_by uuid);
CREATE TABLE public.sicoob_contact_mapping (id uuid PRIMARY KEY DEFAULT gen_random_uuid());

-- ── A PROTECAO, verbatim das migrations reais, em ordem cronologica ──────────
\echo '── aplicando as migrations REAIS (custom_emojis: tabela, policies, storage) ──'
\i :mig_dir/20260319005455_7ef4d742-f86f-4f76-a8c5-6af7430f68c5.sql
\i :mig_dir/20260319011916_8e038bb1-f955-4cb2-ab8a-7bd288db81a3.sql
\i :mig_dir/20260320133103_90061855-3227-445f-a47a-a15c38ac5cf2.sql

-- GRANT de tabela do PostgREST: e ele que faz a RLS ser a UNICA barreira de escrita.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_emojis TO authenticated, service_role;

-- ── Fixtures (sem gatilho nesta tabela) ─────────────────────────────────────
INSERT INTO public.custom_emojis (id, name, image_url, category, is_favorite, use_count, uploaded_by) VALUES
  ('e0000000-0000-0000-0000-00000000000a', 'Alheio',      'https://x/a.png', 'memes',   false, 0, '33333333-3333-3333-3333-33333333333c'),
  ('e0000000-0000-0000-0000-00000000000b', 'Do proprio',  'https://x/b.png', 'outros',  true,  5, '22222222-2222-2222-2222-22222222222b');
-- Marca de edicao do emoji alheio, para provar que o RPC nao mexe em updated_at.
UPDATE public.custom_emojis SET updated_at = timestamptz '2026-01-01 12:00:00+00'
 WHERE id = 'e0000000-0000-0000-0000-00000000000a';

-- ── Modo vermelho: a correcao ausente ───────────────────────────────────────
\if :{?sem_correcao}
  \echo '  [sem_correcao] a RPC do contador NAO e criada (estado anterior ao cartao)'
\else
  \i :mig_dir/20261013012531_custom_emoji_use_rpc.sql
\endif

-- ── Helpers do teste ───────────────────────────────────────────────────────
CREATE FUNCTION pg_temp.espera(p_label text, p_atual text, p_esperado text) RETURNS void
LANGUAGE plpgsql AS $h$
BEGIN
  IF p_atual IS DISTINCT FROM p_esperado THEN
    RAISE EXCEPTION 'PB-35 FALHOU [%]: esperado %, obtido %', p_label, p_esperado, p_atual;
  END IF;
  RAISE NOTICE 'PASS [%] -> %', p_label, p_atual;
END $h$;

CREATE FUNCTION pg_temp.espera_erro(p_label text, p_atual text, p_sqlstate text) RETURNS void
LANGUAGE plpgsql AS $h$
BEGIN
  IF p_atual IS NULL OR p_atual NOT LIKE 'ERRO ' || p_sqlstate || ' %' THEN
    RAISE EXCEPTION 'PB-35 FALHOU [%]: esperava erro SQLSTATE %, veio: %', p_label, p_sqlstate, p_atual;
  END IF;
  RAISE NOTICE 'PASS [%] -> %', p_label, p_atual;
END $h$;

-- Roda p_sql sob o PAPEL REAL (SET LOCAL ROLE) com o JWT do usuario p_uid.
-- Devolve 'OK <linhas>' ou 'ERRO <sqlstate> <mensagem>'.
CREATE FUNCTION pg_temp.operacao(p_papel text, p_uid uuid, p_sql text) RETURNS text
LANGUAGE plpgsql AS $h$
DECLARE v_ret text; v_n bigint;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', p_papel)::text, true);
  EXECUTE format('SET LOCAL ROLE %I', p_papel);
  IF current_user <> p_papel THEN
    RAISE EXCEPTION 'PB-35 FALHOU: papel real nao aplicado (current_user=%)', current_user;
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

-- Le um unico valor sob o PAPEL REAL. Devolve o valor como texto ou 'ERRO <sqlstate>'.
CREATE FUNCTION pg_temp.valor(p_papel text, p_uid uuid, p_sql text) RETURNS text
LANGUAGE plpgsql AS $h$
DECLARE v text;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', p_papel)::text, true);
  EXECUTE format('SET LOCAL ROLE %I', p_papel);
  IF current_user <> p_papel THEN
    RAISE EXCEPTION 'PB-35 FALHOU: papel real nao aplicado (current_user=%)', current_user;
  END IF;
  BEGIN
    EXECUTE p_sql INTO v;
  EXCEPTION WHEN OTHERS THEN
    v := 'ERRO ' || SQLSTATE;
  END;
  RESET ROLE;
  RETURN v;
END $h$;

\echo
\echo '── T0: a barreira de escrita e a RLS, nao a ACL ────────────────────────'
SELECT pg_temp.espera('T0 authenticated TEM UPDATE na tabela (GRANT do PostgREST)',
  has_table_privilege('authenticated', 'public.custom_emojis', 'UPDATE')::text, 'true');
\if :{?sem_correcao}
\else
SELECT pg_temp.espera('T0b RLS ligada em custom_emojis',
  (SELECT relrowsecurity::text FROM pg_class WHERE oid = 'public.custom_emojis'::regclass), 'true');
-- ACL do RPC: so authenticated; PUBLIC/anon/service_role fora.
SELECT pg_temp.espera('T0c EXECUTE do RPC so para authenticated',
  (SELECT bool_and(has_function_privilege(rol, 'public.increment_custom_emoji_use(uuid)', 'EXECUTE'))::text
     FROM unnest(ARRAY['authenticated']) AS rol), 'true');
SELECT pg_temp.espera('T0d anon NAO tem EXECUTE no RPC',
  has_function_privilege('anon', 'public.increment_custom_emoji_use(uuid)', 'EXECUTE')::text, 'false');
SELECT pg_temp.espera('T0e service_role NAO tem EXECUTE no RPC',
  has_function_privilege('service_role', 'public.increment_custom_emoji_use(uuid)', 'EXECUTE')::text, 'false');
SELECT pg_temp.espera('T0f PUBLIC revogado (nenhum grantee vazio no proacl)',
  (SELECT (proacl::text ~ '(^|,)=X/')::text FROM pg_proc
    WHERE oid = 'public.increment_custom_emoji_use(uuid)'::regprocedure), 'false');
\endif

\echo
\echo '── BLOCO A: o atendente comum sobe o contador do emoji ALHEIO pelo RPC ──'
SELECT pg_temp.espera('T1 RPC devolve 1 no primeiro uso do emoji alheio (dono e outro)',
  pg_temp.valor('authenticated', '22222222-2222-2222-2222-22222222222b',
    $sql$SELECT public.increment_custom_emoji_use('e0000000-0000-0000-0000-00000000000a')::text$sql$),
  '1');
SELECT pg_temp.espera('T1b o valor gravado subiu para 1',
  (SELECT use_count::text FROM public.custom_emojis WHERE id = 'e0000000-0000-0000-0000-00000000000a'), '1');
SELECT pg_temp.espera('T2 segunda chamada devolve 2 (acumula)',
  pg_temp.valor('authenticated', '22222222-2222-2222-2222-22222222222b',
    $sql$SELECT public.increment_custom_emoji_use('e0000000-0000-0000-0000-00000000000a')::text$sql$),
  '2');

\echo
\echo '── BLOCO B: nenhum outro campo e editavel ─────────────────────────────'
-- O contador so sobe pelo RPC: o UPDATE direto do atendente atinge 0 linhas.
SELECT pg_temp.espera('T3 UPDATE direto do use_count do emoji alheio atinge 0 linhas',
  pg_temp.operacao('authenticated', '22222222-2222-2222-2222-22222222222b',
    $sql$UPDATE public.custom_emojis SET use_count = 99 WHERE id = 'e0000000-0000-0000-0000-00000000000a'$sql$),
  'OK 0');
SELECT pg_temp.espera('T3b o contador continua o valor do RPC (nao 99)',
  (SELECT use_count::text FROM public.custom_emojis WHERE id = 'e0000000-0000-0000-0000-00000000000a'), '2');

SELECT pg_temp.espera('T4 UPDATE direto do nome do emoji alheio atinge 0 linhas',
  pg_temp.operacao('authenticated', '22222222-2222-2222-2222-22222222222b',
    $sql$UPDATE public.custom_emojis SET name = 'invadido' WHERE id = 'e0000000-0000-0000-0000-00000000000a'$sql$),
  'OK 0');
SELECT pg_temp.espera('T5 UPDATE direto de categoria+favorito do emoji alheio atinge 0 linhas',
  pg_temp.operacao('authenticated', '22222222-2222-2222-2222-22222222222b',
    $sql$UPDATE public.custom_emojis SET category = 'x', is_favorite = true WHERE id = 'e0000000-0000-0000-0000-00000000000a'$sql$),
  'OK 0');

-- Efeito colateral: o RPC nao reescreve nenhum outro campo (nem updated_at).
SELECT pg_temp.espera('T6 o RPC nao tocou name/category/is_favorite/uploaded_by',
  (SELECT (name || '|' || category || '|' || is_favorite::text || '|' || uploaded_by::text)
     FROM public.custom_emojis WHERE id = 'e0000000-0000-0000-0000-00000000000a'),
  'Alheio|memes|false|33333333-3333-3333-3333-33333333333c');
SELECT pg_temp.espera('T6b o RPC nao reescreveu updated_at (contador nao e edicao)',
  (SELECT (updated_at = timestamptz '2026-01-01 12:00:00+00')::text
     FROM public.custom_emojis WHERE id = 'e0000000-0000-0000-0000-00000000000a'), 'true');
-- Controle: o emoji do proprio atendente nao foi tocado por nenhum caminho.
SELECT pg_temp.espera('T7 o emoji do proprio atendente ficou intacto (controle)',
  (SELECT (use_count || '|' || name || '|' || is_favorite::text)
     FROM public.custom_emojis WHERE id = 'e0000000-0000-0000-0000-00000000000b'), '5|Do proprio|true');

\echo
\echo '── BLOCO C: entrada invalida e negacao de anon ────────────────────────'
SELECT pg_temp.espera('T8 id nulo recusado (22023)',
  pg_temp.valor('authenticated', '22222222-2222-2222-2222-22222222222b',
    $sql$SELECT public.increment_custom_emoji_use(null)::text$sql$),
  'ERRO 22023');
SELECT pg_temp.espera('T9 emoji inexistente recusado (P0002)',
  pg_temp.valor('authenticated', '22222222-2222-2222-2222-22222222222b',
    $sql$SELECT public.increment_custom_emoji_use('e0000000-0000-0000-0000-0000000000ff')::text$sql$),
  'ERRO P0002');
SELECT pg_temp.espera('T10 anon NAO executa o RPC (42501)',
  pg_temp.valor('anon', null,
    $sql$SELECT public.increment_custom_emoji_use('e0000000-0000-0000-0000-00000000000a')::text$sql$),
  'ERRO 42501');

ROLLBACK;

\echo
\echo 'PB-35 OK: o atendente comum sobe o use_count de emoji alheio pelo RPC;'
\echo '          o UPDATE direto segue barrado e nenhum outro campo muda.'
