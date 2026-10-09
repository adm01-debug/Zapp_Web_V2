-- rls_storage_media_posse_por_caminho — T0–T8 sobre as policies REAIS de SELECT de
-- storage.objects (whatsapp-media / audio-messages) depois do cartao t_15a57807
-- (SEC-DEFINER_GRANTS_STORAGE-01, achado P1 de docs/audits/SEGURANCA_DEFINER_GRANTS_STORAGE_2026-10-07.md).
--
-- O QUE PROVA. A leitura da midia privada nao pode ser decidida pelo TEXTO da
-- `messages.media_url` (campo que o chamador escolhe). As policies sao aplicadas dos
-- arquivos REAIS do repositorio (nunca copiadas para ca); a superficie da plataforma
-- (roles, schema auth, schema storage, tabelas/funcoes de apoio) e criada a mao, como
-- no molde scripts/db-audit/team-membership-bootstrap-owner.test.sh.
--
--   T0 (VERMELHO, antes da migration nova): o agente A LE O OBJETO DE OUTRO CONTATO
--      com uma mensagem dele mesmo apontando a media_url alheia — nos dois buckets e
--      tambem pelo ramo `LIKE '%' || objects.name` da policy de 30/09.
--   T1 (VERDE): o mesmo SELECT, com a migration nova, devolve 0 linha.
--   T2/T3: uso legitimo segue de pe — pasta do SEU contato e midia recebida sem pasta
--      de contato (nome derivado do `external_id` da linha, incl. figurinha).
--   T4: admin/supervisor continua lendo a equipe.
--   T5: anon nao le nada.
--   T6: fila — contato sem `assigned_to` tem o MESMO resultado de antes (negado).
--   T7: dono do objeto pela pasta do proprio uid segue lendo (policy de 30/09).
--   T8 (opcional, -v rb_file=<arquivo>): o bloco de rollback EXTRAIDO da linha 2 da
--      migration devolve o estado anterior — o ataque volta a funcionar.
--
-- COMO RODA. Postgres descartavel; tudo numa transacao que termina em ROLLBACK:
--   sed -n '2p' supabase/migrations/20261009055429_storage_media_visivel_contato.sql \
--     | sed 's/^-- Rollback: //' > .tmp/rollback.sql
--   docker run --rm -d --name zapp-v2-media-$$ -e POSTGRES_PASSWORD=test_only postgres:17-alpine
--   docker cp .tmp/rollback.sql zapp-v2-media-$$:/tmp/rollback.sql
--   for f in 20261009055429_storage_media_visivel_contato \
--            20260930700000_fix_whatsapp_storage_policies \
--            20261003142707_whatsapp_media_recebida_select_via_messages; do \
--     docker cp supabase/migrations/$f.sql zapp-v2-media-$$:/tmp/$f.sql; done
--   docker exec -i zapp-v2-media-$$ psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
--       -v mig_nova=/tmp/20261009055429_storage_media_visivel_contato.sql \
--       -v mig_old_storage=/tmp/20260930700000_fix_whatsapp_storage_policies.sql \
--       -v mig_old_media=/tmp/20261003142707_whatsapp_media_recebida_select_via_messages.sql \
--       -v rb_file=/tmp/rollback.sql \
--     < supabase/tests/rls_storage_media_posse_por_caminho.sql
-- (o `-v rb_file` liga o T8; sem ele o teste roda T0-T7.)
-- VERMELHO esperado com `-v pular_migracao=1`: T1 falha (0 linha esperada, 1 obtida).

\set ON_ERROR_STOP on

\if :{?pular_migracao}
  \set aplicar_migracao 0
\else
  \set aplicar_migracao 1
\endif

-- Caminhos das migrations sob teste (-v mig_*=<caminho> sobrepoe o padrao).
\if :{?mig_nova}
\else
  \set mig_nova 'supabase/migrations/20261009055429_storage_media_visivel_contato.sql'
\endif
\if :{?mig_old_storage}
\else
  \set mig_old_storage 'supabase/migrations/20260930700000_fix_whatsapp_storage_policies.sql'
\endif
\if :{?mig_old_media}
\else
  \set mig_old_media 'supabase/migrations/20261003142707_whatsapp_media_recebida_select_via_messages.sql'
\endif

BEGIN;

-- ---------------------------------------------------------------------------
-- Superficie minima da plataforma, feita a mao (roles, auth, storage, apoio)
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

CREATE SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA extensions;

-- storage: foldername() e a origem das policies (definicoes da plataforma Supabase)
CREATE SCHEMA storage;
CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  _parts text[];
BEGIN
  SELECT string_to_array(name, '/') INTO _parts;
  RETURN _parts[1:array_length(_parts, 1) - 1];
END $$;
CREATE TABLE storage.objects (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id  text NOT NULL,
  name       text NOT NULL,
  owner      uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
GRANT SELECT ON storage.objects TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON storage.objects TO authenticated, service_role;

-- apoio: perfis, papeis, contatos/fila, mensagens
CREATE TABLE public.profiles (id uuid PRIMARY KEY, user_id uuid NOT NULL UNIQUE);
CREATE TABLE public.user_roles (user_id uuid NOT NULL, role text NOT NULL, PRIMARY KEY (user_id, role));
CREATE TABLE public.agent_visibility_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL,
  can_see_agent_id uuid NOT NULL
);
CREATE TABLE public.queues (id uuid PRIMARY KEY, name text);
CREATE TABLE public.queue_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id uuid NOT NULL, profile_id uuid NOT NULL, is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.contacts (
  id uuid PRIMARY KEY, assigned_to uuid, queue_id uuid
);
CREATE TABLE public.messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id  uuid NOT NULL,
  sender      text,
  message_type text,
  media_url   text,
  external_id text,
  agent_id    uuid,
  status      text
);
CREATE INDEX idx_messages_media_url_trgm
  ON public.messages USING gin (media_url extensions.gin_trgm_ops);

-- Helpers de visibilidade: corpos reais de 20260909200000 (dependencia, nao o alvo)
CREATE FUNCTION public.get_profile_id_for_user(_user_id uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT profile.id FROM public.profiles AS profile
   WHERE _user_id = auth.uid() AND profile.user_id = _user_id LIMIT 1 $$;

CREATE FUNCTION public.get_visible_agent_ids(_user_id uuid) RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT profile.id FROM public.profiles AS profile
   WHERE _user_id = auth.uid() AND profile.user_id = _user_id
  UNION
  SELECT visibility.can_see_agent_id
    FROM public.agent_visibility_grants AS visibility
    JOIN public.profiles AS viewer ON viewer.id = visibility.agent_id
   WHERE _user_id = auth.uid() AND viewer.user_id = _user_id
     AND EXISTS (SELECT 1 FROM public.user_roles AS r
                  WHERE r.user_id = _user_id AND r.role = 'special_agent') $$;

CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles AS r
                  WHERE r.user_id = _user_id AND r.role IN ('admin', 'supervisor')) $$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Fixtures (postgres; ids sinteticos, host example.test)
-- ---------------------------------------------------------------------------
INSERT INTO public.profiles (id, user_id) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-0000-0000-0000-0000000000a1'), -- agente A (atacante)
  ('bbbbbbbb-0000-0000-0000-000000000002', '11111111-0000-0000-0000-0000000000b2'), -- dono do contato alheio
  ('cccccccc-0000-0000-0000-000000000003', '11111111-0000-0000-0000-0000000000c3'), -- admin/supervisor
  ('dddddddd-0000-0000-0000-000000000004', '11111111-0000-0000-0000-0000000000d4'); -- agente da fila
INSERT INTO public.user_roles (user_id, role) VALUES
  ('11111111-0000-0000-0000-0000000000c3', 'supervisor');

INSERT INTO public.queues (id, name) VALUES ('99999999-0000-0000-0000-0000000000f1', 'fila-1');
INSERT INTO public.queue_members (queue_id, profile_id, is_active) VALUES
  ('99999999-0000-0000-0000-0000000000f1', 'dddddddd-0000-0000-0000-000000000004', true);

INSERT INTO public.contacts (id, assigned_to, queue_id) VALUES
  ('e0000000-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-000000000001', NULL), -- contato do agente A
  ('e0000000-0000-0000-0000-0000000000b2', 'bbbbbbbb-0000-0000-0000-000000000002', NULL), -- contato alheio
  ('e0000000-0000-0000-0000-0000000000f1', NULL, '99999999-0000-0000-0000-0000000000f1'); -- contato so na fila

-- Mensagens. A linha forjada do agente A aponta para o objeto do contato alheio.
INSERT INTO public.messages (id, contact_id, sender, message_type, media_url, external_id, agent_id, status) VALUES
  ('f0000000-0000-0000-0000-0000000000f1', 'e0000000-0000-0000-0000-0000000000a1', 'agent', 'image',
   'https://db.example.test/storage/v1/object/public/whatsapp-media/e0000000-0000-0000-0000-0000000000b2/image/v.jpg',
   NULL, 'aaaaaaaa-0000-0000-0000-000000000001', 'sent'),
  ('f0000000-0000-0000-0000-0000000000f2', 'e0000000-0000-0000-0000-0000000000a1', 'agent', 'audio',
   'https://db.example.test/storage/v1/object/public/audio-messages/e0000000-0000-0000-0000-0000000000b2/audio/v.ogg',
   NULL, 'aaaaaaaa-0000-0000-0000-000000000001', 'sent'),
  ('f0000000-0000-0000-0000-0000000000f3', 'e0000000-0000-0000-0000-0000000000a1', 'agent', 'image',
   'https://db.example.test/storage/v1/object/public/whatsapp-media/image/3EB0VICTIMA0000000001.jpg',
   NULL, 'aaaaaaaa-0000-0000-0000-000000000001', 'sent'),
  ('f0000000-0000-0000-0000-0000000000f4', 'e0000000-0000-0000-0000-0000000000a1', 'agent', 'image',
   'https://db.example.test/storage/v1/object/public/whatsapp-media/e0000000-0000-0000-0000-0000000000a1/image/a.jpg',
   NULL, 'aaaaaaaa-0000-0000-0000-000000000001', 'sent'),
  ('f0000000-0000-0000-0000-0000000000f5', 'e0000000-0000-0000-0000-0000000000a1', 'contact', 'image',
   'https://db.example.test/storage/v1/object/public/whatsapp-media/image/3EB0ATACANTE000000001.jpg',
   '3EB0ATACANTE000000001', NULL, 'received'),
  ('f0000000-0000-0000-0000-0000000000f6', 'e0000000-0000-0000-0000-0000000000a1', 'contact', 'sticker',
   'https://db.example.test/storage/v1/object/public/whatsapp-media/stickers/sticker_3EB0FIG0000000001.webp',
   '3EB0FIG0000000001', NULL, 'received'),
  ('f0000000-0000-0000-0000-0000000000f7', 'e0000000-0000-0000-0000-0000000000b2', 'contact', 'image',
   'https://db.example.test/storage/v1/object/public/whatsapp-media/image/3EB0VICTIMA0000000001.jpg',
   '3EB0VICTIMA0000000001', NULL, 'received');

INSERT INTO storage.objects (bucket_id, name) VALUES
  ('whatsapp-media', 'e0000000-0000-0000-0000-0000000000b2/image/v.jpg'),        -- objeto alheio (pasta de contato)
  ('audio-messages', 'e0000000-0000-0000-0000-0000000000b2/audio/v.ogg'),        -- idem, bucket de audio
  ('whatsapp-media', 'image/3EB0VICTIMA0000000001.jpg'),                          -- recebida alheia, sem pasta
  ('whatsapp-media', 'e0000000-0000-0000-0000-0000000000a1/image/a.jpg'),         -- legitima do agente A
  ('audio-messages', 'e0000000-0000-0000-0000-0000000000a1/audio/a.ogg'),         -- legitima do agente A
  ('whatsapp-media', 'image/3EB0ATACANTE000000001.jpg'),                          -- recebida legitima do agente A
  ('whatsapp-media', 'stickers/sticker_3EB0FIG0000000001.webp'),                  -- figurinha recebida do agente A
  ('whatsapp-media', 'e0000000-0000-0000-0000-0000000000f1/image/f.jpg');         -- contato so na fila

-- ---------------------------------------------------------------------------
-- Estado ANTERIOR: as duas migrations reais que criaram as policies de midia
-- ---------------------------------------------------------------------------
\i :mig_old_storage
\i :mig_old_media

-- ---------------------------------------------------------------------------
-- T0 — VERMELHO: o agente A le o objeto do contato alheio (3 caminhos distintos)
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_n integer;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '11111111-0000-0000-0000-0000000000a1', 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO v_n FROM storage.objects
   WHERE bucket_id = 'whatsapp-media'
     AND name = 'e0000000-0000-0000-0000-0000000000b2/image/v.jpg';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'T0 FALHOU (estado anterior): objeto alheio por pasta de contato nao foi lido (n=%)', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM storage.objects
   WHERE bucket_id = 'audio-messages'
     AND name = 'e0000000-0000-0000-0000-0000000000b2/audio/v.ogg';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'T0 FALHOU (estado anterior): objeto alheio de audio nao foi lido (n=%)', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM storage.objects
   WHERE bucket_id = 'whatsapp-media'
     AND name = 'image/3EB0VICTIMA0000000001.jpg';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'T0 FALHOU (estado anterior): objeto alheio sem pasta nao foi lido (n=%)', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM storage.objects
   WHERE bucket_id = 'whatsapp-media'
     AND name = 'e0000000-0000-0000-0000-0000000000f1/image/f.jpg';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'T0 FALHOU (estado anterior): contato so na fila ja deveria ser negado (n=%)', v_n;
  END IF;

  RESET ROLE;
  RAISE NOTICE 'T0 OK (estado ANTERIOR reproduzido): agente le a midia alheia nos tres caminhos; fila negada';
END $$;

-- ---------------------------------------------------------------------------
-- Migration sob teste (arquivo real do repositorio)
-- ---------------------------------------------------------------------------
\if :aplicar_migracao
\i :mig_nova
\endif

-- ---------------------------------------------------------------------------
-- T1 — VERDE: o mesmo SELECT do atacante agora devolve 0 linha
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_n integer;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '11111111-0000-0000-0000-0000000000a1', 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO v_n FROM storage.objects
   WHERE bucket_id = 'whatsapp-media'
     AND name = 'e0000000-0000-0000-0000-0000000000b2/image/v.jpg';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'T1 FALHOU: media_url forjada ainda autoriza pasta de contato alheio (n=%)', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM storage.objects
   WHERE bucket_id = 'audio-messages'
     AND name = 'e0000000-0000-0000-0000-0000000000b2/audio/v.ogg';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'T1 FALHOU: media_url forjada ainda autoriza audio de contato alheio (n=%)', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM storage.objects
   WHERE bucket_id = 'whatsapp-media'
     AND name = 'image/3EB0VICTIMA0000000001.jpg';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'T1 FALHOU: media_url forjada ainda autoriza recebida de contato alheio (n=%)', v_n;
  END IF;

  RESET ROLE;
  RAISE NOTICE 'T1 OK: leitura da midia alheia negada nos tres caminhos';
END $$;

-- ---------------------------------------------------------------------------
-- T2/T3 — uso legitimo segue de pe (pasta do proprio contato e recebida sem pasta)
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_n integer;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '11111111-0000-0000-0000-0000000000a1', 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO v_n FROM storage.objects
   WHERE bucket_id = 'whatsapp-media'
     AND name = 'e0000000-0000-0000-0000-0000000000a1/image/a.jpg';
  IF v_n <> 1 THEN RAISE EXCEPTION 'T2 FALHOU: agente perdeu a midia do PROPRIO contato (n=%)', v_n; END IF;

  SELECT count(*) INTO v_n FROM storage.objects
   WHERE bucket_id = 'audio-messages'
     AND name = 'e0000000-0000-0000-0000-0000000000a1/audio/a.ogg';
  IF v_n <> 1 THEN RAISE EXCEPTION 'T2 FALHOU: agente perdeu o audio do PROPRIO contato (n=%)', v_n; END IF;

  SELECT count(*) INTO v_n FROM storage.objects
   WHERE bucket_id = 'whatsapp-media'
     AND name = 'image/3EB0ATACANTE000000001.jpg';
  IF v_n <> 1 THEN RAISE EXCEPTION 'T3 FALHOU: agente perdeu a midia RECEBIDA do proprio contato (n=%)', v_n; END IF;

  SELECT count(*) INTO v_n FROM storage.objects
   WHERE bucket_id = 'whatsapp-media'
     AND name = 'stickers/sticker_3EB0FIG0000000001.webp';
  IF v_n <> 1 THEN RAISE EXCEPTION 'T3 FALHOU: agente perdeu a figurinha RECEBIDA do proprio contato (n=%)', v_n; END IF;

  RESET ROLE;
  RAISE NOTICE 'T2/T3 OK: pasta do proprio contato e midia recebida (imagem e figurinha) seguem legiveis';
END $$;

-- ---------------------------------------------------------------------------
-- T4 — admin/supervisor le a equipe
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_n integer;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '11111111-0000-0000-0000-0000000000c3', 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO v_n FROM storage.objects
   WHERE bucket_id = 'whatsapp-media'
     AND name IN ('e0000000-0000-0000-0000-0000000000b2/image/v.jpg',
                  'image/3EB0VICTIMA0000000001.jpg',
                  'e0000000-0000-0000-0000-0000000000a1/image/a.jpg');
  IF v_n <> 3 THEN RAISE EXCEPTION 'T4 FALHOU: supervisor nao le a equipe (n=%, esperado 3)', v_n; END IF;

  SELECT count(*) INTO v_n FROM storage.objects
   WHERE bucket_id = 'audio-messages'
     AND name = 'e0000000-0000-0000-0000-0000000000b2/audio/v.ogg';
  IF v_n <> 1 THEN RAISE EXCEPTION 'T4 FALHOU: supervisor nao le o audio da equipe (n=%)', v_n; END IF;

  RESET ROLE;
  RAISE NOTICE 'T4 OK: supervisor le a midia da equipe nos dois buckets';
END $$;

-- ---------------------------------------------------------------------------
-- T5 — anon nao le nada
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_n integer;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  SET LOCAL ROLE anon;

  SELECT count(*) INTO v_n FROM storage.objects;
  IF v_n <> 0 THEN RAISE EXCEPTION 'T5 FALHOU: anon leu % objeto(s) de midia', v_n; END IF;

  RESET ROLE;
  RAISE NOTICE 'T5 OK: anon nao le nenhum objeto';
END $$;

-- ---------------------------------------------------------------------------
-- T6 — fila: mesmo resultado de antes (negado) para contato sem assigned_to
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_n integer;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '11111111-0000-0000-0000-0000000000d4', 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO v_n FROM storage.objects
   WHERE bucket_id = 'whatsapp-media'
     AND name = 'e0000000-0000-0000-0000-0000000000f1/image/f.jpg';
  IF v_n <> 0 THEN RAISE EXCEPTION 'T6 FALHOU: objeto de contato so na fila passou a ser lido (n=%)', v_n; END IF;

  RESET ROLE;
  RAISE NOTICE 'T6 OK: fila sem assigned_to segue negada (mesmo resultado do estado anterior)';
END $$;

-- ---------------------------------------------------------------------------
-- T7 — dono pela pasta do proprio uid segue lendo (policy de 30/09)
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_n integer;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '11111111-0000-0000-0000-0000000000a1', 'role', 'authenticated')::text, true);
  INSERT INTO storage.objects (bucket_id, name)
  VALUES ('whatsapp-media', '11111111-0000-0000-0000-0000000000a1/anexo.jpg');

  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_n FROM storage.objects
   WHERE bucket_id = 'whatsapp-media'
     AND name = '11111111-0000-0000-0000-0000000000a1/anexo.jpg';
  RESET ROLE;
  IF v_n <> 1 THEN RAISE EXCEPTION 'T7 FALHOU: dono perdeu o objeto na pasta do proprio uid (n=%)', v_n; END IF;

  RAISE NOTICE 'T7 OK: pasta do proprio uid segue legivel pelo dono';
END $$;

-- ---------------------------------------------------------------------------
-- T8 — rollback extraido da linha 2 da migration devolve o estado anterior
-- ---------------------------------------------------------------------------
\if :{?rb_file}
DO $$
DECLARE v_n integer;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '11111111-0000-0000-0000-0000000000a1', 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_n FROM storage.objects
   WHERE bucket_id = 'whatsapp-media'
     AND name = 'e0000000-0000-0000-0000-0000000000b2/image/v.jpg';
  RESET ROLE;
  IF v_n <> 0 THEN RAISE EXCEPTION 'T8 FAIL-FAST: antes do rollback o ataque deveria estar negado (n=%)', v_n; END IF;
  RAISE NOTICE 'T8 (pre): ataque negado pela migration nova';
END $$;

\i :rb_file

DO $$
DECLARE v_n integer;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '11111111-0000-0000-0000-0000000000a1', 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO v_n FROM storage.objects
   WHERE bucket_id = 'whatsapp-media'
     AND name = 'e0000000-0000-0000-0000-0000000000b2/image/v.jpg';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'T8 FALHOU: o rollback nao devolveu o estado anterior (n=%)', v_n;
  END IF;

  RESET ROLE;
  RAISE NOTICE 'T8 OK: o bloco da linha 2 restaurou as tres policies anteriores (ataque volta a funcionar)';
END $$;
\endif

DO $$
BEGIN
  RAISE NOTICE 'rls_storage_media_posse_por_caminho: TODAS as assercoes passaram (T0-T8)';
END $$;

ROLLBACK;
