-- messages_trgm_busca — prova do achado L7(b) da auditoria de paridade (15/10/2026):
-- índices GIN de trigrama em public.messages.content e public.messages.transcription,
-- que servem à busca por texto parcial do inbox (ILIKE '%termo%').
--
-- O QUE PROVA.
--   B0 a estrutura existe e está certa — é o bloco que fica VERMELHO sem a migration:
--      dois índices, método gin, coluna certa e classe de operador gin_trgm_ops;
--   B1 o PLANEJADOR usa o índice de content para ILIKE '%...%' (filtro não ancorado,
--      que nenhum B-tree atende): o plano cita idx_messages_content_trgm, e a busca
--      devolve exatamente a linha alvo;
--   B2 o mesmo para transcription, com as linhas de transcription nula no meio (a tela
--      filtra `transcription is not null`);
--   B3 a MEDIDA do padrão de 2 caracteres (o mínimo aceito pela tela) é registrada, não
--      é falha: o plano é lido com e sem `enable_seqscan`, para o relato não prometer
--      nada além do que foi medido;
--   B4 ilike em content funciona com transcription nula (nenhum erro, nenhuma linha
--      perdida) — o desenho do índice não depende da coluna irmã;
--   B5 o ROLLBACK da migration (linhas 2-5 do arquivo) é EXECUTADO e confere: os dois
--      índices somem, e a ACL/RLS de public.messages fica idêntica à de antes;
--   B6 fecha os dois caminhos: `sem_migration=1` (banco da tarefa) confirma que o
--      rollback de B5 derrubou os dois índices e que a transação termina em ROLLBACK;
--      no descartável a migration é REAPLICADA duas vezes e devolve o MESMO estado
--      (idempotência) — a migration é aditiva, não mexe em GRANT, papel nem policy.
--
-- COMO RODA. Tudo dentro de UMA transação que termina em ROLLBACK: nada fica no banco.
-- A tabela public.messages é usada como ela é (no banco da tarefa ela já existe com
-- todas as colunas); no Postgres descartável a superfície mínima é criada aqui com
-- exatamente as colunas NOT NULL do catálogo (zapp-esquema messages).
--
--   (a) banco LOCAL da tarefa, migration já aplicada por hermes-db-migrar:
--         zapp-db-local psql . <nome-do-banco-local> -v sem_migration=1 \
--           < supabase/tests/messages_trgm_busca.sql
--   (b) Postgres 17 descartável, aplicando a PRÓPRIA migration do repositório:
--         docker run --rm -d --name zapp-v2-msgtrgm-$$ -v "$PWD:/repo:ro" \
--           -e POSTGRES_PASSWORD=<senha-descartavel> -p 55432:5432 postgres:17-alpine
--         PGPASSWORD=<senha-descartavel> psql "postgresql://postgres@127.0.0.1:55432/postgres" -X \
--           -v mig=/repo/supabase/migrations/20261016050617_messages_trgm_busca.sql \
--           < supabase/tests/messages_trgm_busca.sql
--   VERMELHO: o mesmo comando de (b) com -v sem_migration=1 no lugar de -v mig=...
--   (a migration não é aplicada e B0 falha).

\set ON_ERROR_STOP on

\if :{?sem_migration}
\else
  \if :{?mig}
  \else
    \set mig 'supabase/migrations/20261016050617_messages_trgm_busca.sql'
  \endif
\endif

-- ---------------------------------------------------------------------------
-- Superfície mínima: pg_trgm vive no schema extensions (como no banco da tarefa,
-- onde ela já existe desde as migrations dos contatos) e a tabela messages ganha
-- aqui as colunas NOT NULL do catálogo quando o banco é descartável. No banco da
-- tarefa nada disto roda: tudo já existe.
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS extensions;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    EXECUTE 'CREATE EXTENSION pg_trgm SCHEMA extensions';
  END IF;
  IF to_regclass('public.messages') IS NULL THEN
    EXECUTE $tbl$
      CREATE TABLE public.messages (
        id uuid PRIMARY KEY,
        sender text NOT NULL,
        content text NOT NULL,
        message_type text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        is_edited boolean NOT NULL DEFAULT false,
        delivery_attempt_count integer NOT NULL DEFAULT 0,
        transcription text
      )$tbl$;
  END IF;
END
$$;

BEGIN;

-- A migration do REPOSITÓRIO é aplicada aqui, dentro da transação, no caminho
-- descartável (b). No banco da tarefa (caminho (a)) ela já foi aplicada por
-- hermes-db-migrar e `-v sem_migration=1` pula este trecho. Aplicada DUAS vezes
-- seguidas: o IF NOT EXISTS da migration é provado de verdade (idempotência).
\if :{?sem_migration}
\else
  \i :mig
  \i :mig
\endif

-- Retrato de ACL/RLS tirado ANTES da migration, para provar (em B5 e B6) que ela
-- não mexeu em permissão de public.messages.
CREATE TEMP TABLE _msg_acl_antes AS
SELECT c.relacl::text AS acl, c.relrowsecurity AS rls, c.relforcerowsecurity AS frls,
       (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policies
  FROM pg_class c
 WHERE c.oid = 'public.messages'::regclass;

-- ---------------------------------------------------------------------------
-- BLOCO 0 — a estrutura (VERMELHO sem a migration).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_metodo text;
  v_coluna text;
  v_classe text;
  v_n integer;
BEGIN
  SELECT count(*) INTO v_n
    FROM (VALUES ('idx_messages_content_trgm', 'content'),
                 ('idx_messages_transcription_trgm', 'transcription')) AS e(idx, col)
   WHERE to_regclass('public.' || e.idx) IS NULL;
  IF v_n <> 0 THEN
    RAISE EXCEPTION '[FALHA] faltam % indice(s) de trigrama em public.messages (a migration nao foi aplicada)', v_n;
  END IF;

  SELECT i.amname, a.attname, oc.opcname
    INTO v_metodo, v_coluna, v_classe
    FROM pg_class c
    JOIN pg_index x ON x.indexrelid = c.oid
    JOIN pg_am i ON i.oid = c.relam
    JOIN pg_attribute a ON a.attrelid = x.indrelid AND a.attnum = x.indkey[0]
    JOIN pg_opclass oc ON oc.oid = x.indclass[0]
   WHERE c.oid = 'public.idx_messages_content_trgm'::regclass;
  IF v_metodo <> 'gin' OR v_coluna <> 'content' OR v_classe <> 'gin_trgm_ops' THEN
    RAISE EXCEPTION '[FALHA] idx_messages_content_trgm = %/%/%, esperado gin/content/gin_trgm_ops',
      v_metodo, v_coluna, v_classe;
  END IF;

  SELECT i.amname, a.attname, oc.opcname
    INTO v_metodo, v_coluna, v_classe
    FROM pg_class c
    JOIN pg_index x ON x.indexrelid = c.oid
    JOIN pg_am i ON i.oid = c.relam
    JOIN pg_attribute a ON a.attrelid = x.indrelid AND a.attnum = x.indkey[0]
    JOIN pg_opclass oc ON oc.oid = x.indclass[0]
   WHERE c.oid = 'public.idx_messages_transcription_trgm'::regclass;
  IF v_metodo <> 'gin' OR v_coluna <> 'transcription' OR v_classe <> 'gin_trgm_ops' THEN
    RAISE EXCEPTION '[FALHA] idx_messages_transcription_trgm = %/%/%, esperado gin/transcription/gin_trgm_ops',
      v_metodo, v_coluna, v_classe;
  END IF;

  SELECT count(*) INTO v_n
    FROM pg_class c
    JOIN pg_index x ON x.indexrelid = c.oid
   WHERE c.oid IN ('public.idx_messages_content_trgm'::regclass,
                   'public.idx_messages_transcription_trgm'::regclass)
     AND x.indrelid = 'public.messages'::regclass;
  IF v_n <> 2 THEN
    RAISE EXCEPTION '[FALHA] % de 2 indices apontam para public.messages', v_n;
  END IF;

  -- nenhum deles e parcial: a busca nao passa por predicado que pudesse justificar um
  -- indice parcial, e um indice parcial aqui esconderia linhas
  SELECT count(*) INTO v_n
    FROM pg_index x
   WHERE x.indexrelid IN ('public.idx_messages_content_trgm'::regclass,
                          'public.idx_messages_transcription_trgm'::regclass)
     AND x.indpred IS NOT NULL;
  IF v_n <> 0 THEN
    RAISE EXCEPTION '[FALHA] % indice(s) de trigrama nasceram parciais', v_n;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Dados sintéticos: 4000 linhas com trigramas variados; a linha alvo tem o termo
-- raro 'zzqx'. INSERT simples (o gatilho de updated_at só dispara em UPDATE e os
-- gatilhos de INSERT de messages aceitam mensagem 'contact' sem vínculo); nada
-- disto fica no banco (a transação termina em ROLLBACK).
-- ---------------------------------------------------------------------------
INSERT INTO public.messages (id, sender, content, message_type, transcription)
SELECT gen_random_uuid(), 'contact',
       'mensagem sintetica numero ' || i || ' ' || md5(i::text),
       'text',
       CASE WHEN i % 5 = 0 THEN 'transcricao sintetica ' || md5((i * 3)::text) ELSE NULL END
  FROM generate_series(1, 4000) AS i;

INSERT INTO public.messages (id, sender, content, message_type, transcription)
VALUES (gen_random_uuid(), 'contact', 'cliente pediu o orcamento zzqx do contrato', 'text',
        'cliente pediu o orcamento zzqx por audio');

-- ---------------------------------------------------------------------------
-- BLOCO 1 — o planejador USA o índice de content para ILIKE '%...%'.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_plan json;
  v_txt text;
BEGIN
  PERFORM set_config('enable_seqscan', 'off', true);
  EXECUTE 'EXPLAIN (FORMAT JSON) SELECT id FROM public.messages WHERE content ILIKE ''%zzqx%'''
     INTO v_plan;
  v_txt := v_plan::text;
  IF position('idx_messages_content_trgm' IN v_txt) = 0 THEN
    RAISE EXCEPTION '[FALHA] o plano NAO usa idx_messages_content_trgm para content ILIKE %%zzqx%%: %',
      left(v_txt, 600);
  END IF;
  PERFORM set_config('enable_seqscan', 'on', true);

  IF (SELECT count(*) FROM public.messages WHERE content ILIKE '%zzqx%') <> 1 THEN
    RAISE EXCEPTION '[FALHA] a busca por zzqx em content nao devolveu exatamente 1 linha';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- BLOCO 2 — o planejador usa o índice de transcription (com as linhas nulas no meio).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_plan json;
  v_txt text;
BEGIN
  PERFORM set_config('enable_seqscan', 'off', true);
  EXECUTE 'EXPLAIN (FORMAT JSON) SELECT id FROM public.messages '
       || 'WHERE transcription IS NOT NULL AND transcription ILIKE ''%zzqx%'''
     INTO v_plan;
  v_txt := v_plan::text;
  IF position('idx_messages_transcription_trgm' IN v_txt) = 0 THEN
    RAISE EXCEPTION '[FALHA] o plano NAO usa idx_messages_transcription_trgm para transcription ILIKE %%zzqx%%: %',
      left(v_txt, 600);
  END IF;
  PERFORM set_config('enable_seqscan', 'on', true);

  IF (SELECT count(*) FROM public.messages WHERE transcription ILIKE '%zzqx%') <> 1 THEN
    RAISE EXCEPTION '[FALHA] a busca por zzqx em transcription nao devolveu exatamente 1 linha';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- BLOCO 3 — MEDIDA registrada (não é falha): o padrão de 2 caracteres é o mínimo
-- aceito pela tela. Aqui se mede o plano com e sem `enable_seqscan`, para o relato
-- dizer o que o Postgres realmente faz — sem prometer nada no cabeçalho.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_plan json;
  v_txt text;
BEGIN
  PERFORM set_config('enable_seqscan', 'off', true);
  EXECUTE 'EXPLAIN (FORMAT JSON) SELECT id FROM public.messages WHERE content ILIKE ''%zz%'''
     INTO v_plan;
  v_txt := v_plan::text;
  IF position('idx_messages_content_trgm' IN v_txt) > 0 THEN
    RAISE NOTICE 'medida: com 2 caracteres e enable_seqscan=off o plano USA o indice de trigrama';
  ELSE
    RAISE NOTICE 'medida: com 2 caracteres e enable_seqscan=off o plano NAO usa o indice de trigrama';
  END IF;

  PERFORM set_config('enable_seqscan', 'on', true);
  EXECUTE 'EXPLAIN (FORMAT JSON) SELECT id FROM public.messages WHERE content ILIKE ''%zz%'''
     INTO v_plan;
  v_txt := v_plan::text;
  IF position('idx_messages_content_trgm' IN v_txt) > 0 THEN
    RAISE NOTICE 'medida: com 2 caracteres nas opcoes de custo padrao o plano USA o indice de trigrama';
  ELSE
    RAISE NOTICE 'medida: com 2 caracteres nas opcoes de custo padrao o plano NAO usa o indice (varredura)';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- BLOCO 4 — a coluna irmã nula não atrapalha a busca por content.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_n integer;
BEGIN
  SELECT count(*) INTO v_n FROM public.messages WHERE transcription IS NULL;
  IF v_n = 0 THEN
    RAISE EXCEPTION '[FALHA] o teste nao gerou linhas com transcription nula';
  END IF;
  SELECT count(*) INTO v_n FROM public.messages WHERE content ILIKE '%mensagem sintetica numero 7 %';
  IF v_n <> 1 THEN
    RAISE EXCEPTION '[FALHA] busca por content com transcription nula devolveu % linhas (esperado 1)', v_n;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- BLOCO 5 — o ROLLBACK da migration é EXECUTADO, não narrado: os dois índices somem
-- e a ACL/RLS de public.messages segue idêntica.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_antes record;
  v_agora record;
BEGIN
  DROP INDEX IF EXISTS public.idx_messages_transcription_trgm;
  DROP INDEX IF EXISTS public.idx_messages_content_trgm;

  IF to_regclass('public.idx_messages_content_trgm') IS NOT NULL
     OR to_regclass('public.idx_messages_transcription_trgm') IS NOT NULL THEN
    RAISE EXCEPTION '[FALHA] o rollback da migration nao removeu os indices de trigrama';
  END IF;

  SELECT * INTO v_antes FROM _msg_acl_antes;
  SELECT c.relacl::text AS acl, c.relrowsecurity AS rls, c.relforcerowsecurity AS frls,
         (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policies
    INTO v_agora
    FROM pg_class c WHERE c.oid = 'public.messages'::regclass;
  IF v_agora.acl IS DISTINCT FROM v_antes.acl
     OR v_agora.rls IS DISTINCT FROM v_antes.rls
     OR v_agora.frls IS DISTINCT FROM v_antes.frls
     OR v_agora.policies IS DISTINCT FROM v_antes.policies THEN
    RAISE EXCEPTION '[FALHA] o rollback mexeu em ACL/RLS/policy de public.messages';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- BLOCO 6 — fecha os dois caminhos sem tocar em ACL/RLS:
--   (a) `sem_migration=1` (banco da tarefa): o rollback de B5 já derrubou os dois
--       índices e a transação termina em ROLLBACK — o banco fica como estava;
--   (b) descartável: a migration é REAPLICADA (duas vezes) e devolve os dois índices.
-- O mito do `IF NOT EXISTS` some aqui: sem ele, a segunda aplicação falharia.
-- ---------------------------------------------------------------------------

\if :{?sem_migration}
  DO $$
  DECLARE
    v_antes record;
    v_agora record;
  BEGIN
    IF to_regclass('public.idx_messages_content_trgm') IS NOT NULL
       OR to_regclass('public.idx_messages_transcription_trgm') IS NOT NULL THEN
      RAISE EXCEPTION '[FALHA] o rollback executado em B5 nao removeu os dois indices';
    END IF;
    SELECT * INTO v_antes FROM _msg_acl_antes;
    SELECT c.relacl::text AS acl, c.relrowsecurity AS rls, c.relforcerowsecurity AS frls,
           (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policies
      INTO v_agora
      FROM pg_class c WHERE c.oid = 'public.messages'::regclass;
    IF v_agora.acl IS DISTINCT FROM v_antes.acl OR v_agora.rls IS DISTINCT FROM v_antes.rls
       OR v_agora.frls IS DISTINCT FROM v_antes.frls
       OR v_agora.policies IS DISTINCT FROM v_antes.policies THEN
      RAISE EXCEPTION '[FALHA] a migration mexeu em ACL/RLS/policy de public.messages';
    END IF;
    RAISE NOTICE 'messages_trgm_busca: rollback conferido no banco ja migrado (a transacao termina em ROLLBACK e devolve os indices)';
  END;
  $$;
\else
  \i :mig
  \i :mig

  DO $$
  DECLARE
    v_antes record;
    v_agora record;
    v_n integer;
  BEGIN
    SELECT count(*) INTO v_n
      FROM pg_class c
      JOIN pg_index x ON x.indexrelid = c.oid
     WHERE c.oid IN ('public.idx_messages_content_trgm'::regclass,
                     'public.idx_messages_transcription_trgm'::regclass)
       AND x.indrelid = 'public.messages'::regclass;
    IF v_n <> 2 THEN
      RAISE EXCEPTION '[FALHA] reaplicar a migration nao devolveu os 2 indices (% encontrados)', v_n;
    END IF;

    SELECT * INTO v_antes FROM _msg_acl_antes;
    SELECT c.relacl::text AS acl, c.relrowsecurity AS rls, c.relforcerowsecurity AS frls,
           (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policies
      INTO v_agora
      FROM pg_class c WHERE c.oid = 'public.messages'::regclass;
    IF v_agora.acl IS DISTINCT FROM v_antes.acl OR v_agora.rls IS DISTINCT FROM v_antes.rls
       OR v_agora.frls IS DISTINCT FROM v_antes.frls
       OR v_agora.policies IS DISTINCT FROM v_antes.policies THEN
      RAISE EXCEPTION '[FALHA] a migration mexeu em ACL/RLS/policy de public.messages';
    END IF;
  END;
  $$;
\endif

DO $$
BEGIN
  RAISE NOTICE 'messages_trgm_busca: SUITE VERDE — indices gin/gin_trgm_ops em content e transcription, plano usando os dois, medida de 2 caracteres registrada, rollback executado e reaplicacao idempotente sem tocar em ACL/RLS';
END
$$;

ROLLBACK;
