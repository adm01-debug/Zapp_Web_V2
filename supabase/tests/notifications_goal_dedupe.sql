-- notifications_goal_dedupe — T1–T7 sobre a trigger REAL de public.notifications
-- (cartão t_0b065192; migration 20261012231400_notifications_goal_dedupe.sql).
--
-- O QUE PROVA. A superfície mínima do Supabase é criada à mão aqui (roles
-- anon/authenticated/service_role, schema auth com auth.uid()/auth.role(),
-- public.notifications com as colunas reais, a coluna dedupe_key e o índice
-- parcial ux_notifications_user_dedupe_key da IA-047, RLS ligada e as policies
-- reais — inclusive "Block authenticated notification inserts" WITH CHECK
-- (false)). Papel de usuário sempre por SET LOCAL ROLE dentro de DO $$ ... $$,
-- nunca superusuário/dono:
--   T1 serviço: como service_role (o escritor do servidor), DUAS inserções
--      idênticas de aviso de meta => 1 linha, com a dedupe_key esperada
--      ('goal:v1:<goal>:<period>:<dia America/Sao_Paulo>');
--   T2 período/meta diferentes (user/meta/período/dia) => linhas diferentes;
--   T3 dia diferente (created_at = ontem) => chave diferente, grava de novo;
--   T4 type <> 'goal' sem dedupe_key => NÃO regride (2 iguais = 2 linhas);
--   T5 escritor com dedupe_key explícita: a repetição cai no índice único
--      (unique_violation/23505) — backstop da corrida que o escritor trata;
--   T6 authenticated continua NEGADO (42501 / policy WITH CHECK false) — a
--      correção não afrouxou proteção nenhuma;
--   T7 a função da trigger não é executável por public/anon/authenticated.
--
-- COMO RODA. Em Postgres descartável; fixtures e asserções numa transação que
-- termina em ROLLBACK — zero efeito colateral e idempotente:
--   docker run --rm -d --name zapp-v2-goaldedupe-$$ -v "$PWD:/repo:ro" \
--     -e POSTGRES_PASSWORD=test_only postgres:17-alpine
--   docker exec -i zapp-v2-goaldedupe-$$ psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
--     -v mig=/repo/supabase/migrations/20261012231400_notifications_goal_dedupe.sql \
--     < supabase/tests/notifications_goal_dedupe.sql
-- O arquivo cria roles, schema auth e public.notifications À MÃO: só roda em
-- Postgres descartável (no banco da tarefa as roles e a tabela já existem).
-- VERMELHO esperado sem a migration: o mesmo comando com -v sem_migration=1
-- falha já em T1 (2 inserções iguais gravam 2 linhas).

\set ON_ERROR_STOP on

-- Caminho do arquivo da migration sob teste: -v mig=<caminho> vence o padrão.
\if :{?sem_migration}
\else
  \if :{?mig}
  \else
    \set mig 'supabase/migrations/20261012231400_notifications_goal_dedupe.sql'
  \endif
\endif

BEGIN;

-- ---------------------------------------------------------------------------
-- Superfície mínima à mão (forma ANTERIOR à migration: sem trigger alguma)
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

CREATE TABLE public.notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL,
  title      text NOT NULL,
  message    text NOT NULL,
  type       text NOT NULL DEFAULT 'info',
  is_read    boolean DEFAULT false,
  metadata   jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at    timestamptz,
  dedupe_key text
);

-- IA-047 (estado real): o índice parcial que o contrato usa como backstop.
CREATE UNIQUE INDEX ux_notifications_user_dedupe_key
  ON public.notifications (user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own notifications" ON public.notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can update own notifications" ON public.notifications
  FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can delete own notifications" ON public.notifications
  FOR DELETE TO authenticated USING (user_id = auth.uid());
-- Estado real desde 20260404174629: escrita de notificação é server-only.
CREATE POLICY "Block authenticated notification inserts" ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (false);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO anon, authenticated;
GRANT ALL ON public.notifications TO service_role;

-- ---------------------------------------------------------------------------
-- Migration sob teste (o arquivo real do repositório)
-- ---------------------------------------------------------------------------
\if :{?sem_migration}
\else
\i :mig
\endif

-- ---------------------------------------------------------------------------
-- T1 — serviço: duas inserções idênticas = 1 linha, com a chave esperada
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_rows     integer;
  v_key      text;
  v_expected text;
BEGIN
  SET LOCAL ROLE service_role;
  INSERT INTO public.notifications (user_id, title, message, type, metadata)
  VALUES ('11111111-1111-1111-1111-111111111111','Meta batida','Você bateu a meta diária','goal',
          jsonb_build_object('goal_id','g-abc','period','daily','current',10,'target',10));
  INSERT INTO public.notifications (user_id, title, message, type, metadata)
  VALUES ('11111111-1111-1111-1111-111111111111','Meta batida','Você bateu a meta diária','goal',
          jsonb_build_object('goal_id','g-abc','period','daily','current',10,'target',10));
  RESET ROLE;

  SELECT count(*) INTO v_rows
    FROM public.notifications
   WHERE user_id = '11111111-1111-1111-1111-111111111111' AND type = 'goal';
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'T1 FALHOU: 2 insercoes iguais gravaram % linha(s), esperado 1', v_rows;
  END IF;

  SELECT n.dedupe_key,
         'goal:v1:g-abc:daily:' ||
         to_char((n.created_at at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD')
    INTO v_key, v_expected
    FROM public.notifications n
   WHERE n.user_id = '11111111-1111-1111-1111-111111111111' AND n.type = 'goal';
  IF v_key IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'T1 FALHOU: dedupe_key=% diferente do esperado=%', v_key, v_expected;
  END IF;

  RAISE NOTICE 'T1 OK: 2 insercoes iguais = 1 linha; dedupe_key=%', v_key;
END $$;

-- ---------------------------------------------------------------------------
-- T2 — período e meta diferentes caem em chaves diferentes
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_rows integer;
BEGIN
  SET LOCAL ROLE service_role;
  INSERT INTO public.notifications (user_id, title, message, type, metadata)
  VALUES ('11111111-1111-1111-1111-111111111111','Meta batida','Meta mensal','goal',
          jsonb_build_object('goal_id','g-abc','period','monthly','current',10,'target',10));
  INSERT INTO public.notifications (user_id, title, message, type, metadata)
  VALUES ('11111111-1111-1111-1111-111111111111','Meta batida','Outra meta','goal',
          jsonb_build_object('goal_id','g-xyz','period','daily','current',5,'target',5));
  RESET ROLE;

  SELECT count(*) INTO v_rows
    FROM public.notifications
   WHERE user_id = '11111111-1111-1111-1111-111111111111' AND type = 'goal';
  IF v_rows <> 3 THEN
    RAISE EXCEPTION 'T2 FALHOU: esperado 3 avisos (g-abc/daily, g-abc/monthly, g-xyz/daily), veio %', v_rows;
  END IF;

  RAISE NOTICE 'T2 OK: meta/período diferentes = linhas diferentes (3 no total)';
END $$;

-- ---------------------------------------------------------------------------
-- T3 — dia diferente: a chave do dia separa ontem de hoje
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_rows integer;
  v_key  text;
BEGIN
  SET LOCAL ROLE service_role;
  INSERT INTO public.notifications (user_id, title, message, type, metadata, created_at)
  VALUES ('11111111-1111-1111-1111-111111111111','Meta batida','Meta de ontem','goal',
          jsonb_build_object('goal_id','g-abc','period','daily','current',10,'target',10),
          now() - interval '1 day');
  RESET ROLE;

  SELECT count(*) INTO v_rows
    FROM public.notifications
   WHERE user_id = '11111111-1111-1111-1111-111111111111' AND type = 'goal';
  IF v_rows <> 4 THEN
    RAISE EXCEPTION 'T3 FALHOU: ontem deveria gravar linha nova; total veio %', v_rows;
  END IF;

  SELECT n.dedupe_key INTO v_key
    FROM public.notifications n
   WHERE n.user_id = '11111111-1111-1111-1111-111111111111'
     AND n.created_at < now() - interval '12 hours';
  IF v_key IS DISTINCT FROM 'goal:v1:g-abc:daily:' ||
       to_char((now() at time zone 'America/Sao_Paulo')::date - 1, 'YYYY-MM-DD') THEN
    RAISE EXCEPTION 'T3 FALHOU: chave do aviso de ontem = %', v_key;
  END IF;

  RAISE NOTICE 'T3 OK: dia diferente => chave diferente (%); 4 no total', v_key;
END $$;

-- ---------------------------------------------------------------------------
-- T4 — avisos de outro tipo NÃO entram no contrato (sem regressão)
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_rows integer;
BEGIN
  SET LOCAL ROLE service_role;
  INSERT INTO public.notifications (user_id, title, message, type, metadata)
  VALUES ('22222222-2222-2222-2222-222222222222','Aviso','dois iguais','info','{}');
  INSERT INTO public.notifications (user_id, title, message, type, metadata)
  VALUES ('22222222-2222-2222-2222-222222222222','Aviso','dois iguais','info','{}');
  RESET ROLE;

  SELECT count(*) INTO v_rows
    FROM public.notifications
   WHERE user_id = '22222222-2222-2222-2222-222222222222' AND type = 'info';
  IF v_rows <> 2 THEN
    RAISE EXCEPTION 'T4 FALHOU: aviso tipo info foi deduplicado (veio %)', v_rows;
  END IF;

  RAISE NOTICE 'T4 OK: type<>goal sem dedupe_key nao e deduplicado (2 linhas)';
END $$;

-- ---------------------------------------------------------------------------
-- T5 — dedupe_key explícita: repetição cai no índice único (23505)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  SET LOCAL ROLE service_role;
  INSERT INTO public.notifications (user_id, title, message, type, dedupe_key)
  VALUES ('22222222-2222-2222-2222-222222222222','Custom','explicito','custom','custom:123');

  BEGIN
    INSERT INTO public.notifications (user_id, title, message, type, dedupe_key)
    VALUES ('22222222-2222-2222-2222-222222222222','Custom','explicito de novo','custom','custom:123');
    RAISE EXCEPTION 'T5 FALHOU: dedupe_key explicita repetida NAO caiu no indice unico';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
  RESET ROLE;

  RAISE NOTICE 'T5 OK: dedupe_key explicita repetida recusada pelo indice (23505)';
END $$;

-- ---------------------------------------------------------------------------
-- T6 — authenticated continua NEGADO (policy intacta, nada afrouxado)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','11111111-1111-1111-1111-111111111111','role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    -- goal_id novo (g-t6) para a trigger NÃO pular a linha antes da RLS: o
    -- ponto aqui é a policy de INSERT, não o dedupe.
    INSERT INTO public.notifications (user_id, title, message, type, metadata)
    VALUES ('11111111-1111-1111-1111-111111111111','Meta','inserida pelo cliente','goal',
            jsonb_build_object('goal_id','g-t6','period','daily'));
    RAISE EXCEPTION 'T6 FALHOU: INSERT de authenticated NAO foi bloqueado (role=%)', current_user;
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  RESET ROLE;

  RAISE NOTICE 'T6 OK: authenticated segue recusado na escrita (42501 / WITH CHECK false)';
END $$;

-- ---------------------------------------------------------------------------
-- T7 — a função da trigger não é executável pelo cliente
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF has_function_privilege('authenticated','public.notifications_goal_dedupe_key()','EXECUTE')
     OR has_function_privilege('anon','public.notifications_goal_dedupe_key()','EXECUTE') THEN
    RAISE EXCEPTION 'T7 FALHOU: funcao da trigger executavel por anon/authenticated';
  END IF;
  RAISE NOTICE 'T7 OK: funcao da trigger fechada para anon/authenticated';
END $$;

DO $$
BEGIN
  RAISE NOTICE 'notifications_goal_dedupe: TODAS as assercoes passaram (T1-T7)';
END $$;

ROLLBACK;
