-- messages_sem_escrita_direta_do_cliente — T1–T7 sobre a migration REAL
-- 20261012151936_messages_sem_escrita_direta_do_cliente.sql.
--
-- O QUE PROVA. O cliente (anon/authenticated) NAO cria nem forja linha em
-- public.messages (INSERT) e NAO altera status/status_updated_at; os fluxos legítimos do
-- front seguem atualizáveis; service_role não perde nada; a trigger de defesa em
-- profundidade recusa status mesmo com GRANT de coluna extra.
--
-- SUPERFÍCIE À MÃO. Roles anon/authenticated/service_role e public.messages com as colunas
-- usadas, SEM RLS (quem decide é o GRANT + a trigger), no forma ANTERIOR à migration:
-- GRANT SELECT, INSERT, UPDATE de TABELA — o furo. Nada de auth.uid(): a guarda e o
-- contrato de ACL não dependem dela.
--
-- COMO RODA. Em Postgres descartável; tudo numa transação que termina em ROLLBACK — zero
-- efeito colateral, idempotente:
--   docker run --rm -d --name zapp-v2-msgwrite-$$ -e POSTGRES_PASSWORD=test_only postgres:17-alpine
--   docker exec -i zapp-v2-msgwrite-$$ psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
--     -v mig=supabase/migrations/20261012151936_messages_sem_escrita_direta_do_cliente.sql \
--     < supabase/tests/messages_sem_escrita_direta_do_cliente.sql
-- Só roda em Postgres descartável (no banco da tarefa as roles e a tabela já existem).
-- VERMELHO esperado sem a migration: `-v sem_migration=1` falha já em T2.

\set ON_ERROR_STOP on

\if :{?sem_migration}
\else
  \if :{?mig}
  \else
    \set mig 'supabase/migrations/20261012151936_messages_sem_escrita_direta_do_cliente.sql'
  \endif
\endif

BEGIN;

-- ---------------------------------------------------------------------------
-- Superfície mínima à mão (forma ANTERIOR à migration: GRANT de tabela, sem trigger)
-- ---------------------------------------------------------------------------
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE TABLE public.messages (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id          uuid,
  sender              text,
  agent_id            uuid,
  external_id         text,
  content             text,
  media_url           text,
  is_read             boolean NOT NULL DEFAULT false,
  is_deleted          boolean NOT NULL DEFAULT false,
  status              text,
  status_updated_at   timestamptz,
  transcription       text,
  transcription_status text,
  link_preview        jsonb,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;

INSERT INTO public.messages (id, contact_id, sender, content, status)
VALUES
  ('eeeeeeee-0000-0000-0000-000000000005','aaaaaaaa-0000-0000-0000-000000000101','agent','resposta do agente','sent'),
  ('ffffffff-0000-0000-0000-000000000006','aaaaaaaa-0000-0000-0000-000000000101','agent','outra resposta','sent');

-- ---------------------------------------------------------------------------
-- Migration sob teste (o arquivo real do repositório)
-- ---------------------------------------------------------------------------
\if :{?sem_migration}
\else
\i :mig
\endif

-- ---------------------------------------------------------------------------
-- T1 — bypass privilegiado: postgres e service_role inserem e mudam status
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  INSERT INTO public.messages (contact_id, sender, content, status)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000202', 'contact', 'recebida', 'received');

  SET LOCAL ROLE service_role;
  INSERT INTO public.messages (contact_id, sender, content, status)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000202', 'contact', 'recebida sr', 'received');
  UPDATE public.messages SET status = 'delivered', status_updated_at = now()
   WHERE id = 'eeeeeeee-0000-0000-0000-000000000005';
  RESET ROLE;
  RAISE NOTICE 'T1 OK: postgres e service_role inserem e mudam status (bypass do dono/service_role)';
END $$;

-- ---------------------------------------------------------------------------
-- T2 — INSERT direto de authenticated: NEGADO (42501)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.messages (contact_id, sender, content, status)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000101', 'agent', 'forjada', 'sent');
    RAISE EXCEPTION 'T2 FALHOU: authenticated conseguiu INSERT direto em messages';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'T2 OK: INSERT direto de authenticated negado (%)', SQLERRM;
  END;
  RESET ROLE;
END $$;

-- ---------------------------------------------------------------------------
-- T3 — UPDATE de coluna vedada por authenticated: NEGADO (42501)
-- ---------------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  SET LOCAL ROLE authenticated;
  FOR r IN SELECT * FROM (VALUES
      ('status',            '''delivered'''),
      ('status_updated_at', 'now()'),
      ('sender',            '''contact'''),
      ('agent_id',          '''cccccccc-0000-0000-0000-000000000303''::uuid'),
      ('external_id',       '''WA-HACK'''),
      ('media_url',         '''http://exemplo/x.jpg'''),
      ('contact_id',        '''cccccccc-0000-0000-0000-000000000303''::uuid')
    ) AS t(col, expr) LOOP
    BEGIN
      EXECUTE format('UPDATE public.messages SET %I = %s WHERE id = %L',
                     r.col, r.expr, 'eeeeeeee-0000-0000-0000-000000000005');
      RAISE EXCEPTION 'T3 FALHOU: authenticated conseguiu UPDATE de %', r.col;
    EXCEPTION
      WHEN insufficient_privilege THEN NULL; -- negado, como esperado
    END;
  END LOOP;
  RESET ROLE;
  RAISE NOTICE 'T3 OK: UPDATE de status/status_updated_at/sender/agent_id/external_id/media_url/contact_id negado a authenticated';
END $$;

-- ---------------------------------------------------------------------------
-- T4 — UPDATE legítimo por authenticated: PASSA (1 linha cada)
-- ---------------------------------------------------------------------------
DO $$
DECLARE par text; v_rows integer; caso text;
BEGIN
  SET LOCAL ROLE authenticated;
  FOREACH par IN ARRAY ARRAY[
    'is_read = true',
    'content = ''editado'', updated_at = now()',
    'is_deleted = true, content = ''[Mensagem apagada]''',
    'transcription = ''texto'', transcription_status = ''completed''',
    'link_preview = ''{"a":1}''::jsonb'
  ] LOOP
    EXECUTE format('UPDATE public.messages SET %s WHERE id = %L',
                   par, 'eeeeeeee-0000-0000-0000-000000000005');
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN
      RAISE EXCEPTION 'T4 FALHOU: UPDATE legítimo (% ) afetou % linha(s), esperado 1', par, v_rows;
    END IF;
  END LOOP;
  RESET ROLE;
  RAISE NOTICE 'T4 OK: os cinco fluxos legítimos do front atualizam 1 linha';
END $$;

-- ---------------------------------------------------------------------------
-- T5 — defesa em profundidade: com GRANT de coluna extra, a trigger recusa status;
--      content continua passando
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  EXECUTE 'GRANT UPDATE (status, status_updated_at, content) ON public.messages TO authenticated';
  SET LOCAL ROLE authenticated;
  BEGIN
    UPDATE public.messages SET status = 'delivered'
     WHERE id = 'ffffffff-0000-0000-0000-000000000006';
    RAISE EXCEPTION 'T5 FALHOU: a trigger deixou passar o UPDATE de status';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'message_status_forbidden' THEN
      RAISE EXCEPTION 'T5 FALHOU: erro inesperado em status (%)', SQLERRM;
    END IF;
  END;
  UPDATE public.messages SET content = 'sem tocar no status'
   WHERE id = 'ffffffff-0000-0000-0000-000000000006';
  RESET ROLE;
  -- desfaz o GRANT extra do cenário (o content já é legítimo; status volta a fechado)
  EXECUTE 'REVOKE UPDATE (status, status_updated_at) ON public.messages FROM authenticated';
  RAISE NOTICE 'T5 OK: trigger recusa status (message_status_forbidden/42501) e nao interfere no content';
END $$;

-- ---------------------------------------------------------------------------
-- T6 — anon: INSERT e UPDATE NEGADOS
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  SET LOCAL ROLE anon;
  BEGIN
    INSERT INTO public.messages (contact_id, sender, content, status)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000101', 'agent', 'forjada anon', 'sent');
    RAISE EXCEPTION 'T6 FALHOU: anon conseguiu INSERT';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.messages SET is_read = true WHERE id = 'eeeeeeee-0000-0000-0000-000000000005';
    RAISE EXCEPTION 'T6 FALHOU: anon conseguiu UPDATE';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
  RAISE NOTICE 'T6 OK: anon negado no INSERT e no UPDATE';
END $$;

-- ---------------------------------------------------------------------------
-- T7 — estado do catálogo de privilégios e de policies
-- ---------------------------------------------------------------------------
DO $$
DECLARE c text;
BEGIN
  IF has_table_privilege('authenticated','public.messages','INSERT')
     OR has_table_privilege('authenticated','public.messages','UPDATE') THEN
    RAISE EXCEPTION 'T7 FALHOU: authenticated ainda tem INSERT/UPDATE de tabela';
  END IF;
  FOREACH c IN ARRAY ARRAY['is_read','is_deleted','content','updated_at','transcription','transcription_status','link_preview'] LOOP
    IF NOT has_column_privilege('authenticated','public.messages',c,'UPDATE') THEN
      RAISE EXCEPTION 'T7 FALHOU: authenticated perdeu o UPDATE legitimo de %', c;
    END IF;
  END LOOP;
  FOREACH c IN ARRAY ARRAY['status','status_updated_at','sender','agent_id','external_id','media_url','contact_id','created_at'] LOOP
    IF has_column_privilege('authenticated','public.messages',c,'UPDATE') THEN
      RAISE EXCEPTION 'T7 FALHOU: authenticated ainda atualiza a coluna vedada %', c;
    END IF;
  END LOOP;
  IF NOT has_table_privilege('service_role','public.messages','INSERT')
     OR NOT has_table_privilege('service_role','public.messages','UPDATE') THEN
    RAISE EXCEPTION 'T7 FALHOU: service_role perdeu INSERT/UPDATE';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='messages' AND cmd='INSERT') THEN
    RAISE EXCEPTION 'T7 FALHOU: sobrou policy de INSERT em messages';
  END IF;
  RAISE NOTICE 'T7 OK: ACL por coluna conforme o contrato e sem policy de INSERT';
END $$;

DO $$ BEGIN RAISE NOTICE 'messages_sem_escrita_direta_do_cliente: TODAS as assercoes passaram (T1-T7)'; END $$;

ROLLBACK;
