-- ============================================================================
-- Banco/seguranca (IA-DB-002) — cartao t_e3c75d53
-- "RPC ai_sentiment_summary: resumo agregado de sentimento no servidor."
--
-- O QUE PROVA (criterio de pronto do cartao):
--   A) public.ai_sentiment_summary(p_days) devolve, para o STAFF, os totais
--      REAIS do periodo: total, baldes (positivos/neutros/negativos, com
--      `critico` contando como negativo), media e transcricoes — cada numero
--      conferido contra a contagem direta da tabela (baseline do superusuario);
--   B) serie diaria: EXATAMENTE p_days baldes (inclusive os dias vazios), um
--      por dia de calendario em America/Sao_Paulo, com a soma dos totais igual
--      ao total do periodo; dia sem amostra valida devolve media NULL;
--   C) periodo anterior: os mesmos agregados do bloco de dias imediatamente
--      anterior; quando esse bloco esta VAZIO, `anterior` volta NULO (nao
--      objeto zerado, nao media 0);
--   D) volume real: > 1000 analises no periodo -> o total NAO trunca (era o
--      defeito medido: o cliente parava no limite de linhas do PostgREST);
--   E) fail-closed: AGENTE, ANON e SERVICE_ROLE sao NEGADOS com 42501 — mesma
--      resposta para janela com e sem dado (sem oraculo);
--   F) ACL: EXECUTE so para authenticated; SECURITY DEFINER ligado com
--      search_path fixo.
--
-- COMO A PROTECAO ENTRA NO TESTE (nada de copiar funcao para dentro do arquivo):
-- a superficie minima (roles, schema auth, tabelas de ambiente, PUBLICATION) e
-- criada a mao — e ambiente, nao contrato — e a PROTECAO vem VERBATIM dos
-- arquivos de migration do repositorio, via `\i`. As tabelas de contrato
-- (user_roles/has_role/is_admin_or_supervisor) vem da migration real
-- 20251215025014 e conversation_analyses da migration real 20251222170958.
-- Mesmo padrao de supabase/tests/audit_log_summary_por_periodo.sql.
--
-- ENFORCEMENT como PAPEL REAL: as assercoes rodam com `SET LOCAL ROLE
-- authenticated` + JWT sintetico em request.jwt.claims — o caminho do PostgREST,
-- nunca como postgres (que ignora RLS/GRANT). O helper confere que current_user
-- e de fato o papel pedido; se nao pegasse, o teste FALHA em vez de dar verde.
--
-- COMO RODA (PostgreSQL 17 descartavel; o repo e montado somente-leitura):
--   docker run --rm -d --name zapp-ia-sent-$$ -e POSTGRES_PASSWORD=test_only \
--     -v "$PWD:/repo:ro" postgres:17-alpine
--   docker exec -i zapp-ia-sent-$$ psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
--     -v repo=/repo -v mig_dir=/repo/supabase/migrations \
--     < supabase/tests/ai_sentiment_summary.sql
--   docker rm -f zapp-ia-sent-$$
--
-- VERMELHO (o teste falha quando a correcao nao esta la): acrescente
--   -v sem_funcao=1. Com sem_funcao a migration desta entrega NAO e aplicada,
--   entao a funcao nao existe e a 1a assercao de comportamento quebra com
--   42883 (undefined_function). Nada persiste: o arquivo termina em ROLLBACK.
--
-- TODO o arquivo roda numa unica transacao que termina em ROLLBACK: idempotente,
-- sem efeito colateral e reaplicavel.
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

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  role text DEFAULT 'agent',
  permissions jsonb DEFAULT '{}'::jsonb,
  access_level text DEFAULT 'active',
  is_active boolean DEFAULT true
);
CREATE TABLE public.contacts (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.whatsapp_connections (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
-- messages: recorte minimo do que a RPC le (transcription + created_at).
-- A coluna transcription e a real (migration 20251215172702).
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid,
  transcription text,
  created_at timestamptz NOT NULL DEFAULT now()
);

SET session_replication_role = replica;

INSERT INTO auth.users (id) VALUES
  ('11111111-1111-1111-1111-11111111111a'),  -- ADMIN
  ('22222222-2222-2222-2222-22222222222b');  -- AGENTE

INSERT INTO public.profiles (id, user_id, name) VALUES
  ('a0000000-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-11111111111a', 'ADMIN IA'),
  ('b0000000-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-22222222222b', 'AGENTE IA');

SET session_replication_role = origin;

-- ── A PROTECAO, verbatim das migrations reais ────────────────────────────────
\echo '── aplicando as migrations REAIS (user_roles/has_role + conversation_analyses + a entrega) ──'
\i :mig_dir/20251215025014_fcc5bc79-55e3-4972-8765-6a7840fdce5a.sql
\i :mig_dir/20251222170958_bbee0ce2-8225-4290-9b92-23a6abef22b5.sql
\if :{?sem_funcao}
  \echo '  [sem_funcao] a migration desta entrega NAO e aplicada (modo vermelho)'
\else
\i :mig_dir/20261013213816_ai_sentiment_summary.sql
\endif

-- Papel de admin (depois da policy), com o gatilho de auth.users desligado.
SET session_replication_role = replica;
INSERT INTO public.user_roles (user_id, role) VALUES
  ('11111111-1111-1111-1111-11111111111a', 'admin'),
  ('22222222-2222-2222-2222-22222222222b', 'agent');
SET session_replication_role = origin;

-- ── Helpers do proprio teste ────────────────────────────────────────────────
CREATE FUNCTION pg_temp.espera(p_label text, p_atual text, p_esperado text) RETURNS void
LANGUAGE plpgsql AS $h$
BEGIN
  IF p_atual IS DISTINCT FROM p_esperado THEN
    RAISE EXCEPTION 'IA-DB-002 FALHOU [%]: esperado %, obtido %', p_label, p_esperado, p_atual;
  END IF;
  RAISE NOTICE 'PASS [%] -> %', p_label, p_atual;
END $h$;

-- Meia-noite (America/Sao_Paulo) do dia de hoje menos k dias. Ancorar as
-- fixtures no dia de calendario SP deixa o teste independente do relogio:
-- tudo que esta em "hoje as 00:00" esta sempre dentro da janela [.., now()).
CREATE FUNCTION pg_temp.dia(p_k integer) RETURNS timestamptz
LANGUAGE sql STABLE AS $$
  SELECT ((((now() at time zone 'America/Sao_Paulo')::date - p_k)::timestamp)
          at time zone 'America/Sao_Paulo') $$;

-- Um unico valor, lido sob o PAPEL REAL (SET LOCAL ROLE) com o JWT de p_uid.
-- Devolve o valor, ou 'ERRO <sqlstate>' — assim uma chamada negada nao aborta.
CREATE FUNCTION pg_temp.valor(p_papel text, p_uid uuid, p_sql text) RETURNS text
LANGUAGE plpgsql AS $h$
DECLARE v text;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  EXECUTE format('SET LOCAL ROLE %I', p_papel);
  IF current_user <> p_papel THEN
    RAISE EXCEPTION 'IA-DB-002 FALHOU: papel real nao aplicado (current_user=%)', current_user;
  END IF;
  BEGIN
    EXECUTE p_sql INTO v;
  EXCEPTION WHEN OTHERS THEN
    v := 'ERRO ' || SQLSTATE;
  END;
  RESET ROLE;
  RETURN v;
END $h$;

-- ── Fixtures: 5 analises na janela atual, em dias distintos ──────────────────
-- Contato unico; contact_id NOT NULL na tabela real.
INSERT INTO public.contacts (id) VALUES ('c0000000-0000-0000-0000-00000000000c');

INSERT INTO public.conversation_analyses (contact_id, summary, sentiment, sentiment_score, created_at) VALUES
  ('c0000000-0000-0000-0000-00000000000c', 'hoje positivo',   'positivo', 80,   pg_temp.dia(0)),
  ('c0000000-0000-0000-0000-00000000000c', 'hoje critico',    'critico',  20,   pg_temp.dia(0)),
  ('c0000000-0000-0000-0000-00000000000c', 'ontem neutro',    'neutro',   NULL, pg_temp.dia(1)),
  ('c0000000-0000-0000-0000-00000000000c', 'anteontem pos',   'positivo', 40,   pg_temp.dia(2)),
  ('c0000000-0000-0000-0000-00000000000c', '3 dias negativo', 'negativo', 10,   pg_temp.dia(3));

-- Transcricoes: 2 na janela atual (hoje, anteontem), 1 na anterior (8 dias).
INSERT INTO public.messages (transcription, created_at) VALUES
  ('audio hoje',    pg_temp.dia(0)),
  ('audio anteontem', pg_temp.dia(2)),
  ('audio 8 dias',  pg_temp.dia(8));

-- ── T0: estrutura ───────────────────────────────────────────────────────────
\echo
\echo '── T0: estrutura ───────────────────────────────────────────────────────'
\if :{?sem_funcao}
\echo '  [sem_funcao] pulando os auto-testes de estrutura (a funcao nao existe)'
\else
SELECT pg_temp.espera('T0a ai_sentiment_summary e SECURITY DEFINER',
  (SELECT prosecdef::text FROM pg_proc WHERE oid = 'public.ai_sentiment_summary(integer)'::regprocedure), 'true');
SELECT pg_temp.espera('T0b search_path fixo',
  (SELECT (proconfig::text LIKE '%search_path=public, pg_temp%')::text FROM pg_proc
    WHERE oid = 'public.ai_sentiment_summary(integer)'::regprocedure), 'true');
SELECT pg_temp.espera('T0c assinatura exata (integer) existe',
  (SELECT count(*)::text FROM pg_proc WHERE oid = 'public.ai_sentiment_summary(integer)'::regprocedure), '1');
\endif

-- ── BLOCO A: o STAFF ve os numeros REAIS do periodo ─────────────────────────
\echo
\echo '── BLOCO A: admin le o resumo real da janela atual ──────────────────────'
SELECT pg_temp.espera('A1 total == 5',
  pg_temp.valor('authenticated', '11111111-1111-1111-1111-11111111111a',
    $q$SELECT (public.ai_sentiment_summary(7)->>'total')::text$q$), '5');
SELECT pg_temp.espera('A2 positivos == 2',
  pg_temp.valor('authenticated', '11111111-1111-1111-1111-11111111111a',
    $q$SELECT (public.ai_sentiment_summary(7)->>'positivos')::text$q$), '2');
SELECT pg_temp.espera('A3 neutros == 1',
  pg_temp.valor('authenticated', '11111111-1111-1111-1111-11111111111a',
    $q$SELECT (public.ai_sentiment_summary(7)->>'neutros')::text$q$), '1');
SELECT pg_temp.espera('A4 negativos == 2 (negativo + critico)',
  pg_temp.valor('authenticated', '11111111-1111-1111-1111-11111111111a',
    $q$SELECT (public.ai_sentiment_summary(7)->>'negativos')::text$q$), '2');
SELECT pg_temp.espera('A5 media == 37.50 (exclui a nota ausente)',
  pg_temp.valor('authenticated', '11111111-1111-1111-1111-11111111111a',
    $q$SELECT (public.ai_sentiment_summary(7)->>'media')::text$q$), '37.50');
SELECT pg_temp.espera('A6 transcricoes na janela == 2',
  pg_temp.valor('authenticated', '11111111-1111-1111-1111-11111111111a',
    $q$SELECT (public.ai_sentiment_summary(7)->>'transcricoes')::text$q$), '2');
-- Baseline do superusuario (a mesma conta, direto na tabela).
SELECT pg_temp.espera('A7 baseline direto: total 5',
  (SELECT count(*)::text FROM public.conversation_analyses
    WHERE created_at >= pg_temp.dia(6) AND created_at < now()), '5');
SELECT pg_temp.espera('A8 baseline direto: critico entra em negativo',
  (SELECT count(*)::text FROM public.conversation_analyses
    WHERE created_at >= pg_temp.dia(6) AND created_at < now()
      AND sentiment IN ('negativo','critico')), '2');
SELECT pg_temp.espera('A9 p_days invalido (0) normaliza para 1: janela de hoje',
  pg_temp.valor('authenticated', '11111111-1111-1111-1111-11111111111a',
    $q$SELECT (public.ai_sentiment_summary(0)->>'periodo_dias')::text$q$), '1');
SELECT pg_temp.espera('A10 p_days invalido (0): so o dia de hoje (total 2)',
  pg_temp.valor('authenticated', '11111111-1111-1111-1111-11111111111a',
    $q$SELECT (public.ai_sentiment_summary(0)->>'total')::text$q$), '2');

-- ── BLOCO B: serie diaria ───────────────────────────────────────────────────
\echo
\echo '── BLOCO B: serie diaria ───────────────────────────────────────────────'
SELECT pg_temp.espera('B1 serie tem exatamente 7 baldes',
  pg_temp.valor('authenticated', '11111111-1111-1111-1111-11111111111a',
    $q$SELECT jsonb_array_length(public.ai_sentiment_summary(7)->'serie_diaria')::text$q$), '7');
SELECT pg_temp.espera('B2 soma dos totais da serie == total do periodo (5)',
  pg_temp.valor('authenticated', '11111111-1111-1111-1111-11111111111a',
    $q$SELECT (SELECT coalesce(sum((e->>'total')::int),0) FROM jsonb_array_elements(public.ai_sentiment_summary(7)->'serie_diaria') e)::text$q$), '5');
SELECT pg_temp.espera('B3 balde de hoje: total 2 / pos 1 / neg 1 / media 50',
  pg_temp.valor('authenticated', '11111111-1111-1111-1111-11111111111a',
    $q$SELECT (e->>'total')||'/'||(e->>'positivos')||'/'||(e->>'negativos')||'/'||(e->>'media') FROM jsonb_array_elements(public.ai_sentiment_summary(7)->'serie_diaria') e WHERE e->>'dia' = to_char(pg_temp.dia(0), 'YYYY-MM-DD')$q$), '2/1/1/50.00');
SELECT pg_temp.espera('B4 balde de ontem: neutro 1 e media NULA (nota ausente)',
  pg_temp.valor('authenticated', '11111111-1111-1111-1111-11111111111a',
    $q$SELECT (e->>'neutros')||'/'||coalesce(e->>'media','<nulo>') FROM jsonb_array_elements(public.ai_sentiment_summary(7)->'serie_diaria') e WHERE e->>'dia' = to_char(pg_temp.dia(1), 'YYYY-MM-DD')$q$), '1/<nulo>');
SELECT pg_temp.espera('B5 dia vazio (4 atras): total 0 e media NULA',
  pg_temp.valor('authenticated', '11111111-1111-1111-1111-11111111111a',
    $q$SELECT (e->>'total')||'/'||coalesce(e->>'media','<nulo>') FROM jsonb_array_elements(public.ai_sentiment_summary(7)->'serie_diaria') e WHERE e->>'dia' = to_char(pg_temp.dia(4), 'YYYY-MM-DD')$q$), '0/<nulo>');

-- ── BLOCO C: periodo anterior (vazio -> NULO; depois populado) ───────────────
\echo
\echo '── BLOCO C: periodo anterior ──────────────────────────────────────────'
SELECT pg_temp.espera('C1 periodo anterior VAZIO -> anterior NULO (nao zerado)',
  pg_temp.valor('authenticated', '11111111-1111-1111-1111-11111111111a',
    $q$SELECT jsonb_typeof(public.ai_sentiment_summary(7)->'anterior')$q$), 'null');

-- Agora popula o bloco anterior: 1 analise e 1 transcricao a 8 dias.
INSERT INTO public.conversation_analyses (contact_id, summary, sentiment, sentiment_score, created_at) VALUES
  ('c0000000-0000-0000-0000-00000000000c', '8 dias positivo', 'positivo', 100, pg_temp.dia(8));

SELECT pg_temp.espera('C2 anterior populado: total 1',
  pg_temp.valor('authenticated', '11111111-1111-1111-1111-11111111111a',
    $q$SELECT (public.ai_sentiment_summary(7)->'anterior'->>'total')::text$q$), '1');
SELECT pg_temp.espera('C3 anterior: media 100 / positivos 1',
  pg_temp.valor('authenticated', '11111111-1111-1111-1111-11111111111a',
    $q$SELECT (public.ai_sentiment_summary(7)->'anterior'->>'media')||'/'||(public.ai_sentiment_summary(7)->'anterior'->>'positivos')$q$), '100.00/1');
SELECT pg_temp.espera('C4 anterior: 1 transcricao (a de 8 dias)',
  pg_temp.valor('authenticated', '11111111-1111-1111-1111-11111111111a',
    $q$SELECT (public.ai_sentiment_summary(7)->'anterior'->>'transcricoes')::text$q$), '1');
SELECT pg_temp.espera('C5 a analise de 8 dias NAO entra na janela atual',
  pg_temp.valor('authenticated', '11111111-1111-1111-1111-11111111111a',
    $q$SELECT (public.ai_sentiment_summary(7)->>'total')::text$q$), '5');

-- ── BLOCO D: volume > 1000 (o defeito medido era o truncamento) ──────────────
\echo
\echo '── BLOCO D: volume real, sem truncar ──────────────────────────────────'
INSERT INTO public.conversation_analyses (contact_id, summary, sentiment, sentiment_score, created_at)
SELECT 'c0000000-0000-0000-0000-00000000000c', 'volume '||g, 'neutro', 50, pg_temp.dia(0)
FROM generate_series(1, 1200) g;

SELECT pg_temp.espera('D1 baseline direto: 5 + 1200 = 1205',
  (SELECT count(*)::text FROM public.conversation_analyses
    WHERE created_at >= pg_temp.dia(6) AND created_at < now()), '1205');
SELECT pg_temp.espera('D2 a RPC devolve 1205 (nao truncado)',
  pg_temp.valor('authenticated', '11111111-1111-1111-1111-11111111111a',
    $q$SELECT (public.ai_sentiment_summary(7)->>'total')::text$q$), '1205');
SELECT pg_temp.espera('D3 a RPC concorda com a contagem direta',
  pg_temp.valor('authenticated', '11111111-1111-1111-1111-11111111111a',
    $q$SELECT (public.ai_sentiment_summary(7)->>'total')::text$q$),
  (SELECT count(*)::text FROM public.conversation_analyses
    WHERE created_at >= pg_temp.dia(6) AND created_at < now()));
SELECT pg_temp.espera('D4 a soma da serie acompanha o total (1205)',
  pg_temp.valor('authenticated', '11111111-1111-1111-1111-11111111111a',
    $q$SELECT (SELECT coalesce(sum((e->>'total')::int),0) FROM jsonb_array_elements(public.ai_sentiment_summary(7)->'serie_diaria') e)::text$q$), '1205');

-- ── BLOCO E: fail-closed — agente, anon e service_role sao NEGADOS ───────────
\echo
\echo '── BLOCO E: nao-staff e negado (42501) ────────────────────────────────'
SELECT pg_temp.espera('E1 AGENTE: negado (42501)',
  pg_temp.valor('authenticated', '22222222-2222-2222-2222-22222222222b',
    $q$SELECT (public.ai_sentiment_summary(7)->>'total')$q$), 'ERRO 42501');
-- Sem oraculo: a mesma janela com dado e uma janela vazia respondem igual.
SELECT pg_temp.espera('E2 AGENTE: janela vazia -> mesmo erro (sem oraculo)',
  pg_temp.valor('authenticated', '22222222-2222-2222-2222-22222222222b',
    $q$SELECT (public.ai_sentiment_summary(3)->>'total')$q$), 'ERRO 42501');
SELECT pg_temp.espera('E3 ANON: sem EXECUTE (42501)',
  pg_temp.valor('anon', NULL,
    $q$SELECT (public.ai_sentiment_summary(7)->>'total')$q$), 'ERRO 42501');
SELECT pg_temp.espera('E4 SERVICE_ROLE: revogado (42501)',
  pg_temp.valor('service_role', NULL,
    $q$SELECT (public.ai_sentiment_summary(7)->>'total')$q$), 'ERRO 42501');

-- ── BLOCO F: ACL por assinatura exata ────────────────────────────────────────
\echo
\echo '── BLOCO F: ACL por assinatura exata ───────────────────────────────────'
SELECT pg_temp.espera('F1 authenticated TEM EXECUTE',
  has_function_privilege('authenticated', 'public.ai_sentiment_summary(integer)', 'EXECUTE')::text, 'true');
SELECT pg_temp.espera('F2 anon NAO tem EXECUTE',
  has_function_privilege('anon', 'public.ai_sentiment_summary(integer)', 'EXECUTE')::text, 'false');
SELECT pg_temp.espera('F3 service_role NAO tem EXECUTE',
  has_function_privilege('service_role', 'public.ai_sentiment_summary(integer)', 'EXECUTE')::text, 'false');

ROLLBACK;

\echo
\echo 'IA-DB-002 OK: staff le o agregado real (sem truncar), serie diaria de p_days'
\echo '             baldes, anterior NULO quando vazio; agente/anon/service_role'
\echo '             negados (42501); EXECUTE so para authenticated.'
