-- r2_db_022_provenance_trigger — T1–T5 sobre a trigger REAL de public.messages
-- (cartão t_d620059f; função reaplicada do commit 81d78b5db, parte 1 da migration
-- 20261004194016_r2_db_022_write_boundary.sql).
--
-- O QUE PROVA. A superfície mínima do Supabase é criada à mão aqui (roles
-- anon/authenticated/service_role, schema auth com auth.uid()/auth.role(),
-- public.messages com as colunas usadas, GRANT INSERT/UPDATE/SELECT para
-- authenticated, SEM RLS — quem decide é só a trigger). Papel de usuário sempre
-- por SET LOCAL ROLE dentro de DO $$ ... $$, nunca superusuário/dono:
--   T1 bypass: como postgres e como service_role, INSERT com proveniência
--      (sender='contact' + external_id + media_url) e UPDATE de media_url PASSAM;
--   T2 authenticated insere mensagem de agente (sender='agent', external_id NULL,
--      media_url NULL) e PASSA;
--   T3 authenticated NÃO forja INSERT: sender<>'agent', external_id e media_url
--      caem com o SQLERRM exato da trigger e SQLSTATE 42501;
--   T4 authenticated NÃO altera media_url, contact_id, sender, agent_id nem
--      external_id (42501 / message_provenance_forbidden em cada um);
--   T5 authenticated edita content/is_read e PASSA (1 linha afetada).
--
-- COMO RODA. Em Postgres descartável; fixtures e asserções numa transação que
-- termina em ROLLBACK — zero efeito colateral e idempotente:
--   docker run --rm -d --name zapp-v2-prov-$$ -v "$PWD:/repo:ro" \
--     -e POSTGRES_PASSWORD=test_only postgres:17-alpine
--   docker exec -i zapp-v2-prov-$$ psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
--     -v mig=/repo/supabase/migrations/20261006114108_r2_db_022_provenance_trigger.sql \
--     < supabase/tests/r2_db_022_provenance_trigger.sql
-- O arquivo cria roles, schema auth e public.messages À MÃO: só roda em Postgres
-- descartável (no banco da tarefa as roles, as FKs e a tabela já existem).
-- VERMELHO esperado sem a trigger: o mesmo comando com -v sem_migration=1 falha já em T3.

\set ON_ERROR_STOP on

-- Caminho do arquivo da migration sob teste: -v mig=<caminho> vence o padrão.
\if :{?sem_migration}
\else
  \if :{?mig}
  \else
    \set mig 'supabase/migrations/20261006114108_r2_db_022_provenance_trigger.sql'
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

CREATE TABLE public.messages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id   uuid,
  sender       text,
  content      text,
  message_type text,
  media_url    text,
  agent_id     uuid,
  external_id  text,
  status       text,
  is_read      boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;

-- ---------------------------------------------------------------------------
-- Fixtures (inseridos como postgres, antes da trigger existir)
-- ---------------------------------------------------------------------------
INSERT INTO public.messages
  (id, contact_id, sender, content, message_type, media_url, agent_id, external_id, status)
VALUES
  ('dddddddd-0000-0000-0000-000000000004','aaaaaaaa-0000-0000-0000-000000000101',
   'contact','midia recebida','image',
   'https://db.example.com/storage/v1/object/public/whatsapp-media/aaaaaaaa-0000-0000-0000-000000000101/orig.jpg',
   NULL,'WA-EXT-1','received'),
  ('eeeeeeee-0000-0000-0000-000000000005','aaaaaaaa-0000-0000-0000-000000000101',
   'agent','resposta do agente','text',NULL,
   'aaaaaaaa-0000-0000-0000-000000000001',NULL,'sent');

-- ---------------------------------------------------------------------------
-- Migration sob teste (o arquivo real do repositório)
-- ---------------------------------------------------------------------------
\if :{?sem_migration}
\else
\i :mig
\endif

-- ---------------------------------------------------------------------------
-- T1 — bypass: postgres e service_role passam pelo caminho privilegiado
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_new uuid;
BEGIN
  -- como postgres (papel da sessão): INSERT e UPDATE de proveniência PASSAM
  INSERT INTO public.messages (contact_id, sender, content, message_type, media_url, external_id, status)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000202','contact','recebida','image',
          'https://db.example.com/storage/v1/object/public/whatsapp-media/bbbbbbbb-0000-0000-0000-000000000202/b.jpg',
          'WA-BYP-1','received')
  RETURNING id INTO v_new;
  UPDATE public.messages
     SET media_url = 'https://db.example.com/storage/v1/object/public/whatsapp-media/bbbbbbbb-0000-0000-0000-000000000202/x.jpg'
   WHERE id = 'dddddddd-0000-0000-0000-000000000004';

  -- como service_role: idem
  SET LOCAL ROLE service_role;
  INSERT INTO public.messages (contact_id, sender, content, message_type, media_url, external_id, status)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000202','contact','recebida sr','image',
          'https://db.example.com/storage/v1/object/public/whatsapp-media/bbbbbbbb-0000-0000-0000-000000000202/c.jpg',
          'WA-BYP-2','received');
  UPDATE public.messages
     SET media_url = 'https://db.example.com/storage/v1/object/public/whatsapp-media/bbbbbbbb-0000-0000-0000-000000000202/y.jpg'
   WHERE id = v_new;
  RESET ROLE;
  RAISE NOTICE 'T1 OK: postgres e service_role inserem/atualizam proveniencia (bypass da trigger)';
END $$;

-- ---------------------------------------------------------------------------
-- T2 — INSERT legítimo de agente por authenticated PASSA
--       (sender='agent', external_id NULL, media_url NULL)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','aaaaaaaa-0000-0000-0000-000000000001','role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.messages (contact_id, sender, content, message_type, agent_id, status)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000101','agent','resposta do agente','text',
          'aaaaaaaa-0000-0000-0000-000000000001','sending');
  RESET ROLE;
  RAISE NOTICE 'T2 OK: INSERT de agente sem campos vedados passou';
END $$;

-- ---------------------------------------------------------------------------
-- T3 — INSERT falsificado por authenticated: cada campo vedado cai com o
--       SQLERRM exato da trigger e SQLSTATE 42501
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','aaaaaaaa-0000-0000-0000-000000000001','role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  BEGIN
    INSERT INTO public.messages (contact_id, sender, content, message_type, status)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000101','contact','forjada','text','received');
    RAISE EXCEPTION 'T3 FALHOU: INSERT com sender=contact NAO bloqueado';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'message_sender_forbidden' THEN
      RAISE EXCEPTION 'T3 FALHOU: erro inesperado em sender (% / SQLSTATE %)', SQLERRM, SQLSTATE;
    END IF;
  END;

  BEGIN
    INSERT INTO public.messages (contact_id, sender, content, message_type, external_id, status)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000101','agent','forjada','text','WA-FORGED-1','sent');
    RAISE EXCEPTION 'T3 FALHOU: INSERT com external_id NAO bloqueado';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'message_external_id_forbidden' THEN
      RAISE EXCEPTION 'T3 FALHOU: erro inesperado em external_id (% / SQLSTATE %)', SQLERRM, SQLSTATE;
    END IF;
  END;

  BEGIN
    INSERT INTO public.messages (contact_id, sender, content, message_type, media_url, status)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000101','agent','forjada','image',
            'https://db.example.com/storage/v1/object/public/whatsapp-media/bbbbbbbb-0000-0000-0000-000000000202/m.jpg','sent');
    RAISE EXCEPTION 'T3 FALHOU: INSERT com media_url NAO bloqueado';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'message_media_url_forbidden' THEN
      RAISE EXCEPTION 'T3 FALHOU: erro inesperado em media_url (% / SQLSTATE %)', SQLERRM, SQLSTATE;
    END IF;
  END;

  RESET ROLE;
  RAISE NOTICE 'T3 OK: INSERTs falsificados recusados (sender/external_id/media_url, 42501)';
END $$;

-- ---------------------------------------------------------------------------
-- T4 — UPDATE dos cinco campos de proveniência por authenticated: cada um cai
--       com message_provenance_forbidden e SQLSTATE 42501
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','aaaaaaaa-0000-0000-0000-000000000001','role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  BEGIN
    UPDATE public.messages
       SET media_url = 'https://db.example.com/storage/v1/object/public/whatsapp-media/bbbbbbbb-0000-0000-0000-000000000202/t.jpg'
     WHERE id = 'dddddddd-0000-0000-0000-000000000004';
    RAISE EXCEPTION 'T4 FALHOU: UPDATE de media_url NAO bloqueado';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'message_provenance_forbidden' THEN
      RAISE EXCEPTION 'T4 FALHOU: erro inesperado em media_url (% / SQLSTATE %)', SQLERRM, SQLSTATE;
    END IF;
  END;

  BEGIN
    UPDATE public.messages SET contact_id = 'bbbbbbbb-0000-0000-0000-000000000202'
     WHERE id = 'dddddddd-0000-0000-0000-000000000004';
    RAISE EXCEPTION 'T4 FALHOU: UPDATE de contact_id NAO bloqueado';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'message_provenance_forbidden' THEN
      RAISE EXCEPTION 'T4 FALHOU: erro inesperado em contact_id (% / SQLSTATE %)', SQLERRM, SQLSTATE;
    END IF;
  END;

  BEGIN
    UPDATE public.messages SET sender = 'contact'
     WHERE id = 'eeeeeeee-0000-0000-0000-000000000005';
    RAISE EXCEPTION 'T4 FALHOU: UPDATE de sender NAO bloqueado';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'message_provenance_forbidden' THEN
      RAISE EXCEPTION 'T4 FALHOU: erro inesperado em sender (% / SQLSTATE %)', SQLERRM, SQLSTATE;
    END IF;
  END;

  BEGIN
    UPDATE public.messages SET agent_id = 'bbbbbbbb-0000-0000-0000-000000000202'
     WHERE id = 'eeeeeeee-0000-0000-0000-000000000005';
    RAISE EXCEPTION 'T4 FALHOU: UPDATE de agent_id NAO bloqueado';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'message_provenance_forbidden' THEN
      RAISE EXCEPTION 'T4 FALHOU: erro inesperado em agent_id (% / SQLSTATE %)', SQLERRM, SQLSTATE;
    END IF;
  END;

  BEGIN
    UPDATE public.messages SET external_id = 'WA-HACK'
     WHERE id = 'dddddddd-0000-0000-0000-000000000004';
    RAISE EXCEPTION 'T4 FALHOU: UPDATE de external_id NAO bloqueado';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'message_provenance_forbidden' THEN
      RAISE EXCEPTION 'T4 FALHOU: erro inesperado em external_id (% / SQLSTATE %)', SQLERRM, SQLSTATE;
    END IF;
  END;

  RESET ROLE;
  RAISE NOTICE 'T4 OK: os cinco campos de proveniencia recusados (42501 / message_provenance_forbidden)';
END $$;

-- ---------------------------------------------------------------------------
-- T5 — UPDATE legítimo (content, is_read) por authenticated PASSA
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_rows integer;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','aaaaaaaa-0000-0000-0000-000000000001','role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE public.messages
     SET content = 'conteudo editado', is_read = true
   WHERE id = 'eeeeeeee-0000-0000-0000-000000000005';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RESET ROLE;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'T5 FALHOU: edicao legitima afetou % linha(s), esperado 1', v_rows;
  END IF;
  RAISE NOTICE 'T5 OK: edicao legitima de content/is_read passou (1 linha)';
END $$;

DO $$
BEGIN
  RAISE NOTICE 'r2_db_022_provenance_trigger: TODAS as assercoes passaram (T1-T5)';
END $$;

ROLLBACK;
