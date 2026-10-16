-- r2_db_022_provenance_trigger — T1–T9 sobre as triggers REAIS de public.messages
-- (cartão t_d620059f; função reaplicada do commit 81d78b5db, parte 1 da migration
-- 20261004194016_r2_db_022_write_boundary.sql). T6–T9 acrescentados pelo cartão
-- SEC-RLS-01 resíduo (mensagens: status/carimbos de entrega e texto do cliente).
--
-- O QUE PROVA. A superfície mínima do Supabase é criada à mão aqui (roles
-- anon/authenticated/service_role, schema auth com auth.uid()/auth.role(),
-- public.messages com as colunas usadas — inclusive os DEFAULTS reais
-- status='sent', created_at=now(), status_updated_at=now(), como em
-- supabase/schema-manifest.json), GRANT INSERT/UPDATE/SELECT para authenticated,
-- SEM RLS — quem decide é só a trigger. Papel de usuário sempre por SET LOCAL ROLE
-- dentro de DO $$ ... $$, nunca superusuário/dono:
--   T1 bypass: como postgres e como service_role, INSERT com proveniência
--      (sender='contact' + external_id + media_url) e UPDATE de media_url PASSAM;
--   T2 authenticated insere mensagem de agente sem campos vedados e PASSA (usa o
--      DEFAULT de status: o status deixou de ser escolhido pelo cliente em T6);
--   T3 authenticated NÃO forja INSERT: sender<>'agent', external_id e media_url
--      caem com o SQLERRM exato da trigger e SQLSTATE 42501;
--   T4 authenticated NÃO altera media_url, contact_id, sender, agent_id nem
--      external_id (42501 / message_provenance_forbidden em cada um);
--   T5 authenticated edita content/is_read de mensagem PRÓPRIA (sender='agent') e
--      PASSA (1 linha afetada);
--   T6 (R1) authenticated NÃO forja a linha que o SLA lê como resposta enviada:
--      status fora do default, created_at escolhido ou status_updated_at escolhido
--      caem com 42501 (message_status_forbidden / message_created_at_forbidden /
--      message_status_updated_at_forbidden) e NADA é gravado;
--   T7 (R2) authenticated NÃO reescreve content/caption de linha sender='contact'
--      (42501 / message_contact_content_forbidden);
--   T8 (R3) authenticated NÃO troca status de linha existente ('failed'→'sent')
--      (42501 / message_status_forbidden);
--   T9 (G) o uso legítimo segue passando: is_read, link_preview,
--      transcription/transcription_status, o par do apagar
--      (is_deleted=true + content='[Mensagem apagada]') em mensagem de cliente e de
--      agente, e postgres/service_role livres (INSERT inbound com status e
--      created_at escolhidos, como faz ingest_inbound_message_tx).
--
-- FORA DAQUI (banco LOCAL da tarefa, schema completo e papéis reais): a linha nova
-- em conversation_sla que trg_messages_sla_first_response gravaria, e as RPCs
-- enqueue_outbound_message/complete_outbound_message, que só existem lá.
--
-- COMO RODA. Em Postgres descartável; fixtures e asserções numa transação que
-- termina em ROLLBACK — zero efeito colateral e idempotente:
--   docker run --rm -d --name zapp-v2-prov-$$ -v "$PWD:/repo:ro" \
--     -e POSTGRES_PASSWORD=test_only postgres:17-alpine
--   docker exec -i zapp-v2-prov-$$ psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
--     -v mig_base=/repo/supabase/migrations/20261006114108_r2_db_022_provenance_trigger.sql \
--     -v mig=/repo/supabase/migrations/20261009162228_messages_internal_stamps_guard.sql \
--     < supabase/tests/r2_db_022_provenance_trigger.sql
-- O arquivo cria roles, schema auth e public.messages À MÃO: só roda em Postgres
-- descartável (no banco da tarefa as roles, as FKs e a tabela já existem).
-- VERMELHO: o mesmo comando com -v sem_migration=1 (nenhuma trigger) falha já em T3;
-- com -v mig=<arquivo da versão ANTERIOR> (mutação: sem as cláusulas novas) falha em T6.
-- A mutação remove SÓ a cláusula nova — o resto da trigger continua válido, então T3/T4
-- seguem passando e a queda é exatamente em T6/T7/T8.

\set ON_ERROR_STOP on

-- Caminho dos arquivos das migrations sob teste: -v mig= / -v mig_base= vencem os padrões.
\if :{?sem_migration}
\else
  \if :{?mig}
  \else
    \set mig 'supabase/migrations/20261009162228_messages_internal_stamps_guard.sql'
  \endif
  \if :{?mig_base}
  \else
    \set mig_base 'supabase/migrations/20261006114108_r2_db_022_provenance_trigger.sql'
  \endif
\endif

BEGIN;

-- ---------------------------------------------------------------------------
-- Superfície mínima à mão (forma ANTERIOR às migrations: sem trigger alguma)
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

-- DEFAULTS iguais aos da coluna real (supabase/schema-manifest.json): é deles que
-- a guarda de status/created_at/status_updated_at depende.
CREATE TABLE public.messages (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id        uuid,
  sender            text,
  content           text,
  caption           text,
  message_type      text,
  media_url         text,
  agent_id          uuid,
  external_id       text,
  status            text DEFAULT 'sent',
  status_updated_at timestamptz DEFAULT now(),
  link_preview      jsonb,
  transcription     text,
  transcription_status text DEFAULT 'pending',
  is_read           boolean NOT NULL DEFAULT false,
  is_deleted        boolean DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
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
   'aaaaaaaa-0000-0000-0000-000000000001',NULL,'sent'),
  -- T8: linha que o authenticated tenta promover de 'failed' para 'sent'
  ('ffffffff-0000-0000-0000-000000000006','aaaaaaaa-0000-0000-0000-000000000101',
   'agent','tentativa que falhou','text',NULL,
   'aaaaaaaa-0000-0000-0000-000000000001',NULL,'failed');

-- ---------------------------------------------------------------------------
-- Migrations sob teste (os arquivos reais do repositório, na ordem em que entram)
-- ---------------------------------------------------------------------------
\if :{?sem_migration}
\else
  \i :mig_base
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
--       (sender='agent', external_id NULL, media_url NULL, status = DEFAULT)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','aaaaaaaa-0000-0000-0000-000000000001','role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.messages (contact_id, sender, content, message_type, agent_id)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000101','agent','resposta do agente','text',
          'aaaaaaaa-0000-0000-0000-000000000001');
  RESET ROLE;
  RAISE NOTICE 'T2 OK: INSERT de agente sem campos vedados passou (status pelo default)';
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
-- T5 — UPDATE legítimo (content de mensagem PRÓPRIA + is_read) por authenticated
--       PASSA
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

-- ---------------------------------------------------------------------------
-- T6 (R1) — authenticated NÃO forja a linha que o SLA lê como resposta enviada:
--       status fora do default, created_at e status_updated_at escolhidos caem
--       com 42501 e NADA é gravado
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_rows integer;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','aaaaaaaa-0000-0000-0000-000000000001','role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  -- status escolhido (default da coluna é 'sent')
  BEGIN
    INSERT INTO public.messages (contact_id, sender, content, message_type, agent_id, status)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000101','agent','forjada','text',
            'aaaaaaaa-0000-0000-0000-000000000001','delivered');
    RAISE EXCEPTION 'T6 FALHOU: INSERT com status escolhido NAO bloqueado';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'message_status_forbidden' THEN
      RAISE EXCEPTION 'T6 FALHOU: erro inesperado em status (% / SQLSTATE %)', SQLERRM, SQLSTATE;
    END IF;
  END;

  -- created_at antedatado
  BEGIN
    INSERT INTO public.messages (contact_id, sender, content, message_type, agent_id, created_at)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000101','agent','forjada','text',
            'aaaaaaaa-0000-0000-0000-000000000001','2020-01-01T00:00:00Z');
    RAISE EXCEPTION 'T6 FALHOU: INSERT com created_at escolhido NAO bloqueado';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'message_created_at_forbidden' THEN
      RAISE EXCEPTION 'T6 FALHOU: erro inesperado em created_at (% / SQLSTATE %)', SQLERRM, SQLSTATE;
    END IF;
  END;

  -- status_updated_at antedatado (o alvo do relatório: o SLA lê coalesce(status_updated_at, created_at))
  BEGIN
    INSERT INTO public.messages (contact_id, sender, content, message_type, agent_id, status, status_updated_at)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000101','agent','forjada','text',
            'aaaaaaaa-0000-0000-0000-000000000001','sent','2020-01-01T00:00:00Z');
    RAISE EXCEPTION 'T6 FALHOU: INSERT com status_updated_at escolhido NAO bloqueado';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'message_status_updated_at_forbidden' THEN
      RAISE EXCEPTION 'T6 FALHOU: erro inesperado em status_updated_at (% / SQLSTATE %)', SQLERRM, SQLSTATE;
    END IF;
  END;

  -- nada das tentativas acima ficou gravado
  SELECT count(*) INTO v_rows
    FROM public.messages
   WHERE contact_id = 'aaaaaaaa-0000-0000-0000-000000000101' AND content = 'forjada';
  RESET ROLE;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'T6 FALHOU: % linha(s) forjada(s) ficaram gravadas', v_rows;
  END IF;
  RAISE NOTICE 'T6 OK (R1): status/created_at/status_updated_at do cliente recusados (42501), zero linha gravada';
END $$;

-- ---------------------------------------------------------------------------
-- T7 (R2) — authenticated NÃO reescreve content/caption de mensagem de CLIENTE
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','aaaaaaaa-0000-0000-0000-000000000001','role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  BEGIN
    UPDATE public.messages SET content = 'texto forjado'
     WHERE id = 'dddddddd-0000-0000-0000-000000000004';
    RAISE EXCEPTION 'T7 FALHOU: UPDATE de content de mensagem de cliente NAO bloqueado';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'message_contact_content_forbidden' THEN
      RAISE EXCEPTION 'T7 FALHOU: erro inesperado em content de cliente (% / SQLSTATE %)', SQLERRM, SQLSTATE;
    END IF;
  END;

  BEGIN
    UPDATE public.messages SET caption = 'legenda forjada'
     WHERE id = 'dddddddd-0000-0000-0000-000000000004';
    RAISE EXCEPTION 'T7 FALHOU: UPDATE de caption de mensagem de cliente NAO bloqueado';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'message_contact_content_forbidden' THEN
      RAISE EXCEPTION 'T7 FALHOU: erro inesperado em caption de cliente (% / SQLSTATE %)', SQLERRM, SQLSTATE;
    END IF;
  END;

  RESET ROLE;
  RAISE NOTICE 'T7 OK (R2): reescrita do texto do cliente recusada (42501 / message_contact_content_forbidden)';
END $$;

-- ---------------------------------------------------------------------------
-- T8 (R3) — authenticated NÃO troca status de linha existente ('failed'→'sent'
--       é justamente o carimbo que o SLA lê)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','aaaaaaaa-0000-0000-0000-000000000001','role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  BEGIN
    UPDATE public.messages SET status = 'sent'
     WHERE id = 'ffffffff-0000-0000-0000-000000000006';
    RAISE EXCEPTION 'T8 FALHOU: UPDATE de status NAO bloqueado';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'message_status_forbidden' THEN
      RAISE EXCEPTION 'T8 FALHOU: erro inesperado em status (% / SQLSTATE %)', SQLERRM, SQLSTATE;
    END IF;
  END;

  BEGIN
    UPDATE public.messages SET status_updated_at = '2020-01-01T00:00:00Z'
     WHERE id = 'ffffffff-0000-0000-0000-000000000006';
    RAISE EXCEPTION 'T8 FALHOU: UPDATE de status_updated_at NAO bloqueado';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'message_status_updated_at_forbidden' THEN
      RAISE EXCEPTION 'T8 FALHOU: erro inesperado em status_updated_at (% / SQLSTATE %)', SQLERRM, SQLSTATE;
    END IF;
  END;

  BEGIN
    UPDATE public.messages SET created_at = '2020-01-01T00:00:00Z'
     WHERE id = 'ffffffff-0000-0000-0000-000000000006';
    RAISE EXCEPTION 'T8 FALHOU: UPDATE de created_at NAO bloqueado';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'message_created_at_forbidden' THEN
      RAISE EXCEPTION 'T8 FALHOU: erro inesperado em created_at (% / SQLSTATE %)', SQLERRM, SQLSTATE;
    END IF;
  END;

  RESET ROLE;
  RAISE NOTICE 'T8 OK (R3): status/created_at/status_updated_at de linha existente recusados (42501)';
END $$;

-- ---------------------------------------------------------------------------
-- T9 (G) — uso legítimo segue passando
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_rows integer;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','aaaaaaaa-0000-0000-0000-000000000001','role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  -- is_read (marcar como lido) em mensagem de cliente
  UPDATE public.messages SET is_read = true
   WHERE id = 'dddddddd-0000-0000-0000-000000000004';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'T9 FALHOU: is_read afetou % linha(s), esperado 1', v_rows;
  END IF;

  -- link_preview
  UPDATE public.messages SET link_preview = '{"title":"x"}'::jsonb
   WHERE id = 'dddddddd-0000-0000-0000-000000000004';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'T9 FALHOU: link_preview afetou % linha(s), esperado 1', v_rows;
  END IF;

  -- transcription/transcription_status
  UPDATE public.messages SET transcription = 'texto transcrito', transcription_status = 'completed'
   WHERE id = 'dddddddd-0000-0000-0000-000000000004';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'T9 FALHOU: transcription afetou % linha(s), esperado 1', v_rows;
  END IF;

  -- apagar mensagem de CLIENTE: par exato is_deleted=true + '[Mensagem apagada]'
  UPDATE public.messages SET is_deleted = true, content = '[Mensagem apagada]'
   WHERE id = 'dddddddd-0000-0000-0000-000000000004';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'T9 FALHOU: apagar mensagem de cliente afetou % linha(s), esperado 1', v_rows;
  END IF;

  -- apagar mensagem de AGENTE (mesmo par)
  UPDATE public.messages SET is_deleted = true, content = '[Mensagem apagada]'
   WHERE id = 'eeeeeeee-0000-0000-0000-000000000005';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'T9 FALHOU: apagar mensagem de agente afetou % linha(s), esperado 1', v_rows;
  END IF;

  RESET ROLE;
  RAISE NOTICE 'T9 OK (G): is_read, link_preview, transcription e o par do apagar (cliente e agente) passaram';
END $$;

-- ---------------------------------------------------------------------------
-- T9b (G) — postgres/service_role livres: INSERT inbound com status e created_at
--        escolhidos (como faz ingest_inbound_message_tx)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  INSERT INTO public.messages
    (contact_id, sender, content, message_type, external_id, status, created_at, status_updated_at)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000202','contact','inbound','text','WA-IN-1','received',
          '2026-01-01T10:00:00Z','2026-01-01T10:00:00Z');

  SET LOCAL ROLE service_role;
  UPDATE public.messages
     SET status = 'read', status_updated_at = '2026-01-01T11:00:00Z'
   WHERE external_id = 'WA-IN-1';
  RESET ROLE;
  RAISE NOTICE 'T9b OK (G): postgres e service_role gravam status/created_at/status_updated_at (ingestao inbound)';
END $$;

DO $$
BEGIN
  RAISE NOTICE 'r2_db_022_provenance_trigger: TODAS as assercoes passaram (T1-T9)';
END $$;

ROLLBACK;
