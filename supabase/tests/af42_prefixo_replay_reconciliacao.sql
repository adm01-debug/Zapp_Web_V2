-- af42_prefixo_replay_reconciliacao.sql
-- Prende a MECANICA de que a migration
-- supabase/migrations/20261011000004_prefixo_reconcilia_janela_talkx_e_team_chat_media_rb.sql
-- depende, e que explica as 2 falhas de REPOSITORIO do replay de origin/main (medidas em
-- 17/10/2026 com scripts/db-audit/replay-local.sh: 1022 ok / 24 falhas / 4 INESPERADAS, sendo 2 de
-- repositorio).
--
--   CASO 1 (20261011003008_talkx_n102c_window_open.sql):
--     "cannot change return type of existing function" — CREATE OR REPLACE casa por nome + tipos dos
--     argumentos, nao pelo tipo de retorno; logo uma funcao RETURNS TABLE nao pode virar
--     RETURNS boolean no lugar. A correcao escolhida e RENOMEAR a funcao existente para liberar o NOME.
--   CASO 2 (20261012192938_team_chat_media_path_sender_conversation.sql):
--     "column media_path of relation ... does not exist" — CREATE TABLE IF NOT EXISTS sobre tabela
--     que ja existe e no-op e nao acrescenta coluna. A correcao escolhida e ADD COLUMN.
--
-- Os objetos aqui sao SO DESTE TESTE (prefixo af42_teste_) e sao removidos no fim: o teste nao cria,
-- nao altera e nao depende de nenhum objeto real do schema (roda em qualquer banco da copia).
-- Roda no banco LOCAL, em cima das migrations reais:
--   zapp-db-local psql <copia> <nome> < supabase/tests/af42_prefixo_replay_reconciliacao.sql

DO $$
DECLARE
  v_bateu boolean := false;
  v_erro  text;
  v_retorno text;
  v_colunas text;
BEGIN
  -- T1 — o caso 1 e real: TABLE -> boolean em CREATE OR REPLACE bate em 42P13.
  EXECUTE $ddl$
    CREATE OR REPLACE FUNCTION public.af42_teste_retorno(p_id uuid)
    RETURNS TABLE (allowed boolean, reason text)
    LANGUAGE sql AS $f$ SELECT true, NULL::text $f$
  $ddl$;

  BEGIN
    EXECUTE $ddl$
      CREATE OR REPLACE FUNCTION public.af42_teste_retorno(p_id uuid)
      RETURNS boolean
      LANGUAGE sql AS $f$ SELECT true $f$
    $ddl$;
  EXCEPTION WHEN SQLSTATE '42P13' THEN
    v_bateu := true;
    GET STACKED DIAGNOSTICS v_erro = MESSAGE_TEXT;
  END;

  IF NOT v_bateu THEN
    RAISE EXCEPTION 'af42 T1 FALHOU: o PostgreSQL aceitou trocar o tipo de retorno (o caso 1 nao existe)';
  END IF;
  RAISE NOTICE 'af42 T1 ok: troca de retorno barrada (42P13) -> %', v_erro;

  -- T2 — a correcao do caso 1 funciona: depois do RENAME, o nome fica livre e a versao nova entra;
  --      a definicao anterior continua existindo (e com ela a ACL, que nao e tocada).
  EXECUTE 'ALTER FUNCTION public.af42_teste_retorno(uuid) RENAME TO af42_teste_retorno_legado';
  EXECUTE $ddl$
    CREATE OR REPLACE FUNCTION public.af42_teste_retorno(p_id uuid)
    RETURNS boolean
    LANGUAGE sql AS $f$ SELECT true $f$
  $ddl$;

  SELECT pg_get_function_result(to_regprocedure('public.af42_teste_retorno(uuid)'))
    INTO v_retorno;
  IF v_retorno <> 'boolean' THEN
    RAISE EXCEPTION 'af42 T2 FALHOU: o nome liberado nao recebeu a versao boolean (retorno=%)', v_retorno;
  END IF;

  SELECT pg_get_function_result(to_regprocedure('public.af42_teste_retorno_legado(uuid)'))
    INTO v_retorno;
  IF v_retorno NOT LIKE 'TABLE(%' THEN
    RAISE EXCEPTION 'af42 T2 FALHOU: a definicao anterior nao sobreviveu ao RENAME (retorno=%)', v_retorno;
  END IF;
  RAISE NOTICE 'af42 T2 ok: RENAME libera o nome sem apagar a definicao anterior';

  -- T3 — o caso 2 e real: CREATE TABLE IF NOT EXISTS nao acrescenta coluna a tabela existente.
  EXECUTE 'CREATE TABLE public.af42_teste_rb (message_id uuid PRIMARY KEY, media_bucket text)';
  EXECUTE 'CREATE TABLE IF NOT EXISTS public.af42_teste_rb (message_id uuid PRIMARY KEY, media_bucket text, media_path text, media_type text)';

  v_bateu := false;
  BEGIN
    EXECUTE 'INSERT INTO public.af42_teste_rb (message_id, media_bucket, media_path) VALUES (gen_random_uuid(), ''b'', ''p'')';
  EXCEPTION WHEN SQLSTATE '42703' THEN
    v_bateu := true;
    GET STACKED DIAGNOSTICS v_erro = MESSAGE_TEXT;
  END;

  IF NOT v_bateu THEN
    RAISE EXCEPTION 'af42 T3 FALHOU: o INSERT em media_path passou (o caso 2 nao existe)';
  END IF;
  RAISE NOTICE 'af42 T3 ok: IF NOT EXISTS nao acrescentou a coluna (42703) -> %', v_erro;

  -- T4 — a correcao do caso 2 funciona: ADD COLUMN destrava o INSERT da migration quebrada.
  EXECUTE 'ALTER TABLE public.af42_teste_rb ADD COLUMN media_path text, ADD COLUMN media_type text';
  SELECT string_agg(attname, ',' ORDER BY attnum)
    INTO v_colunas
    FROM pg_attribute
    WHERE attrelid = to_regclass('public.af42_teste_rb') AND attnum > 0 AND NOT attisdropped;

  IF v_colunas NOT LIKE '%media_path%' OR v_colunas NOT LIKE '%media_type%' THEN
    RAISE EXCEPTION 'af42 T4 FALHOU: ADD COLUMN nao deixou as 2 colunas (colunas=%)', v_colunas;
  END IF;

  EXECUTE 'INSERT INTO public.af42_teste_rb (message_id, media_bucket, media_path) VALUES (gen_random_uuid(), ''b'', ''p'')';
  RAISE NOTICE 'af42 T4 ok: ADD COLUMN destrava o INSERT (colunas=%)', v_colunas;

  -- Limpeza: nada deste teste fica no schema (a base e descartavel, mas nao deixa lixo).
  EXECUTE 'DROP TABLE public.af42_teste_rb';
  EXECUTE 'DROP FUNCTION public.af42_teste_retorno(uuid)';
  EXECUTE 'DROP FUNCTION public.af42_teste_retorno_legado(uuid)';

  RAISE NOTICE 'af42_prefixo_replay_reconciliacao: 4/4 ok';
END $$;
