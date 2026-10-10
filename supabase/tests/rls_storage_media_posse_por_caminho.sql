-- rls_storage_media_posse_por_caminho — T0–T10 sobre as policies REAIS de SELECT de
-- storage.objects (whatsapp-media / audio-messages) depois do cartao t_e35ed064
-- (SEC-DEFINER_GRANTS_STORAGE-01, achado P1 de docs/audits/SEGURANCA_DEFINER_GRANTS_STORAGE_2026-10-07.md).
--
-- O QUE PROVA. A leitura da midia privada nao pode ser decidida pelo TEXTO da
-- `messages.media_url`, campo que o chamador escolhe — nem pelo `LIKE '%/' || objects.name`
-- (SEC-DEFINER_GRANTS_STORAGE-02). A autorizacao vem do CAMINHO do objeto. O acervo legado
-- (`image/<id>.jpg`) so continua legivel ao agente quando existe a mensagem de ENTRADA
-- (`sender = 'contact'`) daquele contato visivel — o ramo (c) da policy.
--
-- O ataque NAO e simulado com INSERT manual: T0 chama a RPC REAL
-- `public.enqueue_outbound_message` como `authenticated` (o proprio caminho do achado) e so
-- depois le o objeto. Os arquivos aplicados sao os REAIS do repositorio (nunca copiados):
--   mig_nova        = a migration sob teste (posse por caminho + ramo do acervo legado)
--   mig_old_storage = 20260930700000 (policies de 30/09, com o LIKE)
--   mig_old_media   = 20261003142707 (policy de 03/10, por texto de media_url)
--   mig_insert      = 20260925120000 (policy de INSERT de messages — dependencia)
--   mig_enqueue     = 20260930200000 (RPC de envio SECURITY DEFINER — dependencia do ataque)
--   mig_provenance  = 20261006114108 (trigger de proveniencia — dependencia da seguranca do ramo (c))
--
-- ASSERCOES
--   T0 (VERMELHO, antes da migration nova): as 3 midias alheias ficam legiveis ao agente A
--      depois de ele enfileirar a mensagem forjada pela RPC real (pasta de contato alheio,
--      objeto de audio alheio e objeto legado sem pasta de contato).
--   T1 (VERDE): os mesmos 3 SELECTs devolvem 0 linha.
--   T2/G1: leitura legitima segue de pe — pasta do SEU contato (imagem e audio).
--   T3/G2: acervo legado `image/<id>.jpg` cuja mensagem de ENTRADA (sender='contact',
--      `external_id` que NAO casa com o nome do objeto, para o ramo (b) nao poder explicar)
--      e de contato visivel → legivel depois.
--   G2b: objeto legado SEM mensagem de entrada → negado ao agente, legivel ao supervisor
--      (o trade-off aceito do cartao).
--   G3/T4: supervisor le a equipe (inclusive ks legados orfaos e `kb/`).
--   G4/T5: anon nao le nada.
--   G5: o encaminhar (copy server-side da ORIGEM, src/hooks/chat/useForwardMedia.ts:152)
--      segue lendo a origem: pasta do proprio contato E objeto recebido/legado; o objeto
--      COPIADO para a pasta do contato de destino tambem e legivel.
--   T6: fila — apos a correcao, membro da fila passa a ler midia do contato sem assigned_to via is_contact_visible_to_user.
--   T7: dono do objeto pela pasta do proprio uid segue lendo (policy de 30/09).
--   T9: a premissa do ramo (c) — `authenticated` NAO consegue gravar sender<>'agent',
--      `media_url` nem `external_id` (trigger), e a RPC real grava sender='agent' com
--      `external_id` nulo.
--   T10: ACL — EXECUTE da RPC de envio para `authenticated`, negado a `anon`.
--   T8 (opcional, -v rb_file=<arquivo>): o bloco de rollback EXTRAIDO da linha 2 da migration
--      devolve o estado anterior — o ataque volta a funcionar.
--
-- COMO RODA. Postgres descartavel; tudo numa transacao que termina em ROLLBACK:
--   sed -n '2p' supabase/migrations/<mig_nova>.sql | sed 's/^-- Rollback: //' > .tmp/rollback.sql
--   docker run --rm -d --name zapp-v2-media-$$ -e POSTGRES_PASSWORD=test_only postgres:17-alpine
--   docker exec -i zapp-v2-media-$$ psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
--       -v mig_nova=/tmp/<mig_nova>.sql -v rb_file=/tmp/rollback.sql \
--     < supabase/tests/rls_storage_media_posse_por_caminho.sql
-- (o `-v rb_file` liga o T8; sem ele o teste roda T0-T10.)
-- VERMELHO esperado com `-v pular_migracao=1`: T1 falha (0 linha esperada, 1 obtida).
-- VERMELHO esperado com `-v mig_nova=<copia da migration sem `m.sender = 'contact'`>`:
-- T1 falha no objeto legado (o ramo (c) sem a guarda de entrada aceita a mensagem forjada).

\set ON_ERROR_STOP on

\if :{?pular_migracao}
  \set aplicar_migracao 0
\else
  \set aplicar_migracao 1
\endif

-- Caminhos das migrations sob teste (-v mig_*=<caminho> sobrepoe o padrao).
\if :{?mig_nova}
\else
  \set mig_nova 'supabase/migrations/20261009163000_storage_media_posse_por_caminho_legado.sql'
\endif
\if :{?mig_old_storage}
\else
  \set mig_old_storage 'supabase/migrations/20260930700000_fix_whatsapp_storage_policies.sql'
\endif
\if :{?mig_old_media}
\else
  \set mig_old_media 'supabase/migrations/20261003142707_whatsapp_media_recebida_select_via_messages.sql'
\endif
\if :{?mig_insert}
\else
  \set mig_insert 'supabase/migrations/20260925120000_fix_messages_insert_rls_contact_visibility.sql'
\endif
\if :{?mig_enqueue}
\else
  \set mig_enqueue 'supabase/migrations/20260930200000_enforce_enqueue_connection_scope.sql'
\endif
\if :{?mig_provenance}
\else
  \set mig_provenance 'supabase/migrations/20261006114108_r2_db_022_provenance_trigger.sql'
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

-- apoio: papeis/perfis/permissoes, contatos/fila, conexao de envio, mensagens
CREATE TABLE public.profiles (id uuid PRIMARY KEY, user_id uuid NOT NULL UNIQUE, is_active boolean NOT NULL DEFAULT true);
CREATE TABLE public.user_roles (user_id uuid NOT NULL, role text NOT NULL, PRIMARY KEY (user_id, role));
CREATE TABLE public.permissions (id uuid PRIMARY KEY, name text NOT NULL);
CREATE TABLE public.role_permissions (role text NOT NULL, permission_id uuid NOT NULL);
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
  id uuid PRIMARY KEY, assigned_to uuid, queue_id uuid, whatsapp_connection_id uuid
);
CREATE TABLE public.whatsapp_connections (
  id uuid PRIMARY KEY, status text, instance_id text, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.whatsapp_connection_queues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), whatsapp_connection_id uuid NOT NULL, queue_id uuid NOT NULL
);
CREATE TABLE public.messages (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id        uuid NOT NULL,
  client_message_id uuid,
  whatsapp_connection_id uuid,
  agent_id          uuid,
  sender            text,
  content           text,
  message_type      text,
  media_url         text,
  caption           text,
  reply_to_id       uuid,
  is_read           boolean,
  status            text,
  external_id       text,
  status_updated_at timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_messages_contact_client_id
  ON public.messages (contact_id, client_message_id) WHERE client_message_id IS NOT NULL;
CREATE INDEX idx_messages_media_url_trgm
  ON public.messages USING gin (media_url extensions.gin_trgm_ops);

-- Helpers de visibilidade: corpos REAIS de 20260909200000 (dependencia, nao o alvo)
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

-- corpo REAL de 20260909200000
CREATE FUNCTION public.is_contact_visible_to_user(_contact_id uuid, _user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT _user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.contacts AS contact
      WHERE contact.id = _contact_id
        AND (
          public.is_admin_or_supervisor(_user_id)
          OR contact.assigned_to IN (SELECT public.get_visible_agent_ids(_user_id))
          OR EXISTS (
            SELECT 1 FROM public.queue_members AS member
            WHERE member.queue_id = contact.queue_id
              AND member.profile_id = public.get_profile_id_for_user(_user_id)
              AND member.is_active = true
          )
        )
    ) $$;

-- corpo REAL de 20251231115910 (dependencia da RPC de envio)
CREATE FUNCTION public.user_has_permission(_user_id uuid, _permission_name text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role = ur.role
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE ur.user_id = _user_id AND p.name = _permission_name
  ) $$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT INSERT, UPDATE ON public.messages TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Estado ANTERIOR: as duas migrations reais que criaram as policies de midia
-- ---------------------------------------------------------------------------
\i :mig_old_storage
\i :mig_old_media

-- ---------------------------------------------------------------------------
-- Dependencias REAIS (arquivos do repositorio) + 2 policies de messages da
-- cadeia consolidada, reproduzidas abaixo porque o arquivo que as cria hoje
-- recria tambem uma policy de SELECT que a consolidacao removeu depois.
-- ---------------------------------------------------------------------------
\i :mig_insert
\i :mig_enqueue
\i :mig_provenance

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- DEPENDENCIA (nao e o alvo): corpo consolidado de messages_select_policy,
-- de 20260902023200_consolidate_rls_select_messages_contacts.sql.
CREATE POLICY "messages_select_policy" ON public.messages
  FOR SELECT TO authenticated
  USING (
    is_admin_or_supervisor(auth.uid())
    OR contact_id IN (
        SELECT c.id FROM public.contacts c
        WHERE c.assigned_to IN (SELECT get_visible_agent_ids(auth.uid()))
      )
    OR EXISTS (
        SELECT 1 FROM public.contacts c
        JOIN public.queue_members qm ON qm.queue_id = c.queue_id
        WHERE c.id = messages.contact_id
          AND qm.profile_id = get_profile_id_for_user(auth.uid())
          AND qm.is_active = true
      )
  );

-- DEPENDENCIA (nao e o alvo): policy de UPDATE de messages, corpo final de
-- 20260329175910 + paridade de fila de 20260925223000.
CREATE POLICY "Users can update messages from their assigned contacts" ON public.messages
  FOR UPDATE TO authenticated
  USING (
    (contact_id IN (
      SELECT c.id FROM public.contacts c
      WHERE c.assigned_to IN (SELECT get_visible_agent_ids(auth.uid()))
    ))
    OR is_admin_or_supervisor(auth.uid())
    OR (EXISTS (
      SELECT 1 FROM public.contacts c
      JOIN public.queue_members qm ON qm.queue_id = c.queue_id
      WHERE c.id = messages.contact_id
        AND qm.profile_id = get_profile_id_for_user(auth.uid())
        AND qm.is_active = true
    ))
  );

-- ---------------------------------------------------------------------------
-- Fixtures (postgres; ids sinteticos, host example.test)
-- ---------------------------------------------------------------------------
INSERT INTO public.profiles (id, user_id) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-0000-0000-0000-0000000000a1'), -- agente A (atacante)
  ('bbbbbbbb-0000-0000-0000-000000000002', '11111111-0000-0000-0000-0000000000b2'), -- dono do contato alheio
  ('cccccccc-0000-0000-0000-000000000003', '11111111-0000-0000-0000-0000000000c3'), -- admin/supervisor
  ('dddddddd-0000-0000-0000-000000000004', '11111111-0000-0000-0000-0000000000d4'); -- agente da fila
INSERT INTO public.user_roles (user_id, role) VALUES
  ('11111111-0000-0000-0000-0000000000a1', 'agent'),
  ('11111111-0000-0000-0000-0000000000c3', 'supervisor'),
  ('11111111-0000-0000-0000-0000000000d4', 'agent');
INSERT INTO public.permissions (id, name) VALUES
  ('77777777-0000-0000-0000-0000000000a1', 'send_messages'),
  ('77777777-0000-0000-0000-0000000000a2', 'view_inbox');
INSERT INTO public.role_permissions (role, permission_id) VALUES
  ('agent', '77777777-0000-0000-0000-0000000000a1'),
  ('agent', '77777777-0000-0000-0000-0000000000a2'),
  ('supervisor', '77777777-0000-0000-0000-0000000000a1');

INSERT INTO public.queues (id, name) VALUES ('99999999-0000-0000-0000-0000000000f1', 'fila-1');
INSERT INTO public.queue_members (queue_id, profile_id, is_active) VALUES
  ('99999999-0000-0000-0000-0000000000f1', 'dddddddd-0000-0000-0000-000000000004', true);

INSERT INTO public.whatsapp_connections (id, status, instance_id) VALUES
  ('66666666-0000-0000-0000-0000000000c1', 'connected', 'inst-1');

INSERT INTO public.contacts (id, assigned_to, queue_id, whatsapp_connection_id) VALUES
  ('e0000000-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-000000000001', NULL, '66666666-0000-0000-0000-0000000000c1'), -- contato do agente A
  ('e0000000-0000-0000-0000-0000000000b2', 'bbbbbbbb-0000-0000-0000-000000000002', NULL, NULL), -- contato alheio
  ('e0000000-0000-0000-0000-0000000000f1', NULL, '99999999-0000-0000-0000-0000000000f1', NULL); -- contato so na fila

-- Mensagens de ENTRADA (sender='contact'): na plataforma so a ingestao
-- (service_role) as cria; aqui sao fixture. O legado `image/3EB0LEGADO.jpg` tem
-- `external_id` que NAO casa com o nome do objeto, para o ramo (b) nao explicar a leitura.
INSERT INTO public.messages (id, contact_id, sender, message_type, media_url, external_id, agent_id, status) VALUES
  ('f0000000-0000-0000-0000-0000000000f5', 'e0000000-0000-0000-0000-0000000000a1', 'contact', 'image',
   'https://db.example.test/storage/v1/object/public/whatsapp-media/image/3EB0LEGADO.jpg',
   '3EB0OUTROID', NULL, 'received'),
  ('f0000000-0000-0000-0000-0000000000f6', 'e0000000-0000-0000-0000-0000000000a1', 'contact', 'sticker',
   'https://db.example.test/storage/v1/object/public/whatsapp-media/stickers/sticker_3EB0FIG0000000001.webp',
   '3EB0FIG0000000001', NULL, 'received'),
  ('f0000000-0000-0000-0000-0000000000f7', 'e0000000-0000-0000-0000-0000000000b2', 'contact', 'image',
   'https://db.example.test/storage/v1/object/public/whatsapp-media/image/3EB0VITIMA.jpg',
   '3EB0VITIMA', NULL, 'received'),
  ('f0000000-0000-0000-0000-0000000000f8', 'e0000000-0000-0000-0000-0000000000f1', 'contact', 'image',
   'https://db.example.test/storage/v1/object/public/whatsapp-media/e0000000-0000-0000-0000-0000000000f1/image/f.jpg',
   NULL, NULL, 'received');

INSERT INTO storage.objects (bucket_id, name) VALUES
  ('whatsapp-media', 'e0000000-0000-0000-0000-0000000000b2/image/v.jpg'),   -- o1 alvo do E1 (pasta de contato alheio)
  ('audio-messages', 'e0000000-0000-0000-0000-0000000000b2/audio/v.ogg'),   -- o2 alvo do E3 (audio alheio)
  ('whatsapp-media', 'image/3EB0VITIMA.jpg'),                               -- o3 recebida do contato alheio
  ('whatsapp-media', 'image/3EB0LEGADO.jpg'),                               -- o4 legado COM mensagem de entrada
  ('whatsapp-media', 'image/3EB0ORFAO.jpg'),                                -- o5 legado SEM mensagem de entrada
  ('whatsapp-media', 'e0000000-0000-0000-0000-0000000000a1/image/a.jpg'),   -- o6 legitima do agente A
  ('audio-messages', 'e0000000-0000-0000-0000-0000000000a1/audio/a.ogg'),   -- o7 legitima do agente A (audio)
  ('whatsapp-media', 'stickers/sticker_3EB0FIG0000000001.webp'),            -- o8 figurinha recebida do agente A
  ('whatsapp-media', 'e0000000-0000-0000-0000-0000000000f1/image/f.jpg'),   -- o9 contato so na fila
  ('whatsapp-media', 'kb/1791000000000_manual.md'),                         -- o10 acervo kb/
  ('audio-messages', 'custom-sounds/1791000000000-som.mp3');                -- o11 acervo custom-sounds/

-- ---------------------------------------------------------------------------
-- T0 — VERMELHO: o agente A LE A MIDIA ALHEIA depois de enfileirar a mensagem
-- pelo caminho REAL (RPC enqueue_outbound_message, como authenticated)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_n integer;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '11111111-0000-0000-0000-0000000000a1', 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  -- E1: mensagem no PROPRIO contato apontando para a pasta de um contato alheio
  PERFORM public.enqueue_outbound_message(
    p_contact_id => 'e0000000-0000-0000-0000-0000000000a1'::uuid,
    p_client_message_id => 'd0000000-0000-0000-0000-0000000000e1'::uuid,
    p_content => '[Imagem]', p_message_type => 'image',
    p_media_url => 'https://db.example.test/storage/v1/object/public/whatsapp-media/e0000000-0000-0000-0000-0000000000b2/image/v.jpg');

  -- E2: mensagem no PROPRIO contato apontando para o objeto LEGADO (sem pasta de contato)
  PERFORM public.enqueue_outbound_message(
    p_contact_id => 'e0000000-0000-0000-0000-0000000000a1'::uuid,
    p_client_message_id => 'd0000000-0000-0000-0000-0000000000e2'::uuid,
    p_content => '[Imagem]', p_message_type => 'image',
    p_media_url => 'https://db.example.test/storage/v1/object/public/whatsapp-media/image/3EB0ORFAO.jpg');

  -- E3: idem no bucket de audio
  PERFORM public.enqueue_outbound_message(
    p_contact_id => 'e0000000-0000-0000-0000-0000000000a1'::uuid,
    p_client_message_id => 'd0000000-0000-0000-0000-0000000000e3'::uuid,
    p_content => '[Audio]', p_message_type => 'audio',
    p_media_url => 'https://db.example.test/storage/v1/object/public/audio-messages/e0000000-0000-0000-0000-0000000000b2/audio/v.ogg');

  SELECT count(*) INTO v_n FROM storage.objects
   WHERE bucket_id = 'whatsapp-media'
     AND name = 'e0000000-0000-0000-0000-0000000000b2/image/v.jpg';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'T0 FALHOU (estado anterior): E1 nao reproduziu a leitura alheia (n=%)', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM storage.objects
   WHERE bucket_id = 'whatsapp-media'
     AND name = 'image/3EB0ORFAO.jpg';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'T0 FALHOU (estado anterior): E2 (objeto legado sem entrada) nao foi lido (n=%)', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM storage.objects
   WHERE bucket_id = 'audio-messages'
     AND name = 'e0000000-0000-0000-0000-0000000000b2/audio/v.ogg';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'T0 FALHOU (estado anterior): E3 (audio alheio) nao foi lido (n=%)', v_n;
  END IF;

  -- D4: agente da fila lê midia do contato so na fila (old policy permite via messages_select_policy)
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '11111111-0000-0000-0000-0000000000d4', 'role', 'authenticated')::text, true);
  SELECT count(*) INTO v_n FROM storage.objects
   WHERE bucket_id = 'whatsapp-media' AND name = 'e0000000-0000-0000-0000-0000000000f1/image/f.jpg';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'T0 FALHOU (estado anterior): D4 nao leu midia do contato so na fila (n=%)', v_n;
  END IF;

  RESET ROLE;
  RAISE NOTICE 'T0 OK (estado ANTERIOR reproduzido): os 3 caminhos do ataque leem midia alheia';
END $$;

-- ---------------------------------------------------------------------------
-- Migration sob teste (arquivo real do repositorio)
-- ---------------------------------------------------------------------------
\if :aplicar_migracao
\i :mig_nova
\endif

-- ---------------------------------------------------------------------------
-- T1 — VERDE: os mesmos 3 SELECTs devolvem 0 linha
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
  IF v_n <> 0 THEN RAISE EXCEPTION 'T1 FALHOU: E1 ainda le pasta de contato alheio (n=%)', v_n; END IF;

  SELECT count(*) INTO v_n FROM storage.objects
   WHERE bucket_id = 'whatsapp-media'
     AND name = 'image/3EB0ORFAO.jpg';
  IF v_n <> 0 THEN RAISE EXCEPTION 'T1 FALHOU: E2 ainda le objeto legado sem mensagem de entrada (n=%)', v_n; END IF;

  SELECT count(*) INTO v_n FROM storage.objects
   WHERE bucket_id = 'audio-messages'
     AND name = 'e0000000-0000-0000-0000-0000000000b2/audio/v.ogg';
  IF v_n <> 0 THEN RAISE EXCEPTION 'T1 FALHOU: E3 ainda le audio de contato alheio (n=%)', v_n; END IF;

  -- D4: agente da fila ainda le midia do contato so na fila apos a correcao
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '11111111-0000-0000-0000-0000000000d4', 'role', 'authenticated')::text, true);
  SELECT count(*) INTO v_n FROM storage.objects
   WHERE bucket_id = 'whatsapp-media' AND name = 'e0000000-0000-0000-0000-0000000000f1/image/f.jpg';
  IF v_n <> 1 THEN RAISE EXCEPTION 'T1 FALHOU: D4 nao leu midia do contato so na fila apos correcao (n=%)', v_n; END IF;

  -- Ataque: D4 tenta forjar mensagem no contato da fila apontando para pasta de contato alheio (B)
  PERFORM public.enqueue_outbound_message(
    p_contact_id => 'e0000000-0000-0000-0000-0000000000f1'::uuid,
    p_client_message_id => 'd0000000-0000-0000-0000-0000000000e4'::uuid,
    p_content => '[Imagem]', p_message_type => 'image',
    p_media_url => 'https://db.example.test/storage/v1/object/public/whatsapp-media/e0000000-0000-0000-0000-0000000000b2/image/v.jpg');

  SELECT count(*) INTO v_n FROM storage.objects
   WHERE bucket_id = 'whatsapp-media' AND name = 'e0000000-0000-0000-0000-0000000000b2/image/v.jpg';
  IF v_n <> 0 THEN RAISE EXCEPTION 'T1 FALHOU: D4 leu midia de contato alheio via fila forjada (n=%)', v_n; END IF;

  RESET ROLE;
  RAISE NOTICE 'T1 OK: os tres caminhos do ataque foram negados, D4 ainda le midia da fila, ataque de fila forjada negado';
END $$;

-- ---------------------------------------------------------------------------
-- G1/T2 e G2/T3 — uso legitimo segue de pe (pasta do proprio contato; recebida
-- por `external_id`; acervo legado COM mensagem de entrada)
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_n integer;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '11111111-0000-0000-0000-0000000000a1', 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO v_n FROM storage.objects
   WHERE bucket_id = 'whatsapp-media' AND name = 'e0000000-0000-0000-0000-0000000000a1/image/a.jpg';
  IF v_n <> 1 THEN RAISE EXCEPTION 'G1 FALHOU: agente perdeu a midia do PROPRIO contato (n=%)', v_n; END IF;

  SELECT count(*) INTO v_n FROM storage.objects
   WHERE bucket_id = 'audio-messages' AND name = 'e0000000-0000-0000-0000-0000000000a1/audio/a.ogg';
  IF v_n <> 1 THEN RAISE EXCEPTION 'G1 FALHOU: agente perdeu o audio do PROPRIO contato (n=%)', v_n; END IF;

  SELECT count(*) INTO v_n FROM storage.objects
   WHERE bucket_id = 'whatsapp-media' AND name = 'stickers/sticker_3EB0FIG0000000001.webp';
  IF v_n <> 1 THEN RAISE EXCEPTION 'G1 FALHOU: agente perdeu a figurinha recebida (ramo b) (n=%)', v_n; END IF;

  SELECT count(*) INTO v_n FROM storage.objects
   WHERE bucket_id = 'whatsapp-media' AND name = 'image/3EB0LEGADO.jpg';
  IF v_n <> 1 THEN RAISE EXCEPTION 'G2 FALHOU: agente perdeu o acervo legado COM mensagem de entrada (n=%)', v_n; END IF;

  SELECT count(*) INTO v_n FROM storage.objects
   WHERE bucket_id = 'whatsapp-media' AND name = 'image/3EB0VITIMA.jpg';
  IF v_n <> 0 THEN RAISE EXCEPTION 'G2 FALHOU: entrada de contato NAO visivel liberou a midia (n=%)', v_n; END IF;

  SELECT count(*) INTO v_n FROM storage.objects
   WHERE bucket_id = 'whatsapp-media' AND name = 'image/3EB0ORFAO.jpg';
  IF v_n <> 0 THEN RAISE EXCEPTION 'G2b FALHOU: legado SEM mensagem de entrada passou a ser lido (n=%)', v_n; END IF;
  RESET ROLE;
  RAISE NOTICE 'G1/G2/G2b OK: proprio contato e legado COM entrada legiveis; entrada alheia e legado orfao negados';
END $$;

-- ---------------------------------------------------------------------------
-- G5 — encaminhar (copy server-side da ORIGEM) segue lendo a origem, e o objeto
-- COPIADO para a pasta do contato de destino tambem e legivel
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_n integer;
BEGIN
  INSERT INTO storage.objects (bucket_id, name)
  VALUES ('whatsapp-media', 'e0000000-0000-0000-0000-0000000000a1/ab12-foto-recebida.jpg'),
         ('audio-messages', 'e0000000-0000-0000-0000-0000000000a1/ab34-voz.ogg');

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '11111111-0000-0000-0000-0000000000a1', 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO v_n FROM storage.objects
   WHERE bucket_id = 'whatsapp-media' AND name = 'e0000000-0000-0000-0000-0000000000a1/image/a.jpg';
  IF v_n <> 1 THEN RAISE EXCEPTION 'G5 FALHOU: origem do encaminhar (pasta do proprio contato) ilegivel (n=%)', v_n; END IF;

  SELECT count(*) INTO v_n FROM storage.objects
   WHERE bucket_id = 'whatsapp-media' AND name = 'image/3EB0LEGADO.jpg';
  IF v_n <> 1 THEN RAISE EXCEPTION 'G5 FALHOU: origem do encaminhar (acervo legado com entrada) ilegivel (n=%)', v_n; END IF;

  SELECT count(*) INTO v_n FROM storage.objects
   WHERE bucket_id = 'whatsapp-media' AND name = 'e0000000-0000-0000-0000-0000000000a1/ab12-foto-recebida.jpg';
  IF v_n <> 1 THEN RAISE EXCEPTION 'G5 FALHOU: destino copiado (imagem) ilegivel (n=%)', v_n; END IF;

  SELECT count(*) INTO v_n FROM storage.objects
   WHERE bucket_id = 'audio-messages' AND name = 'e0000000-0000-0000-0000-0000000000a1/ab34-voz.ogg';
  IF v_n <> 1 THEN RAISE EXCEPTION 'G5 FALHOU: destino copiado (audio) ilegivel (n=%)', v_n; END IF;

  RESET ROLE;
  RAISE NOTICE 'G5 OK: origem e destino do encaminhar seguem legiveis';
END $$;

-- ---------------------------------------------------------------------------
-- G3/T4 — supervisor le a equipe (inclusive legado orfao e kb/)
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
                  'image/3EB0VITIMA.jpg',
                  'image/3EB0ORFAO.jpg',
                  'kb/1791000000000_manual.md');
  IF v_n <> 4 THEN RAISE EXCEPTION 'G3 FALHOU: supervisor nao le a equipe (n=%, esperado 4)', v_n; END IF;

  SELECT count(*) INTO v_n FROM storage.objects
   WHERE bucket_id = 'audio-messages' AND name = 'e0000000-0000-0000-0000-0000000000b2/audio/v.ogg';
  IF v_n <> 1 THEN RAISE EXCEPTION 'G3 FALHOU: supervisor nao le o audio da equipe (n=%)', v_n; END IF;

  RESET ROLE;
  RAISE NOTICE 'G3 OK: supervisor le a midia da equipe nos dois buckets (legado orfao e kb inclusive)';
END $$;

-- ---------------------------------------------------------------------------
-- G4/T5 — anon nao le nada
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_n integer;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  SET LOCAL ROLE anon;

  SELECT count(*) INTO v_n FROM storage.objects;
  IF v_n <> 0 THEN RAISE EXCEPTION 'G4 FALHOU: anon leu % objeto(s) de midia', v_n; END IF;

  RESET ROLE;
  RAISE NOTICE 'G4 OK: anon nao le nenhum objeto';
END $$;

-- ---------------------------------------------------------------------------
-- T6 — fila: apos a correcao, membro da fila passa a ler midia do contato
-- sem assigned_to (contato so na fila) via is_contact_visible_to_user
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_n integer;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '11111111-0000-0000-0000-0000000000d4', 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO v_n FROM storage.objects
   WHERE bucket_id = 'whatsapp-media' AND name = 'e0000000-0000-0000-0000-0000000000f1/image/f.jpg';
  IF v_n <> 1 THEN RAISE EXCEPTION 'T6 FALHOU: D4 nao leu midia do contato so na fila apos correcao (n=%)', v_n; END IF;

  RESET ROLE;
  RAISE NOTICE 'T6 OK: membro da fila passa a ler midia do contato sem assigned_to apos correcao';
END $$;

-- ---------------------------------------------------------------------------
-- T7 — dono pela pasta do proprio uid segue lendo (policy de 30/09)
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_n integer;
BEGIN
  INSERT INTO storage.objects (bucket_id, name)
  VALUES ('whatsapp-media', '11111111-0000-0000-0000-0000000000a1/anexo.jpg');

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '11111111-0000-0000-0000-0000000000a1', 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_n FROM storage.objects
   WHERE bucket_id = 'whatsapp-media' AND name = '11111111-0000-0000-0000-0000000000a1/anexo.jpg';
  RESET ROLE;
  IF v_n <> 1 THEN RAISE EXCEPTION 'T7 FALHOU: dono perdeu o objeto na pasta do proprio uid (n=%)', v_n; END IF;

  RAISE NOTICE 'T7 OK: pasta do proprio uid segue legivel pelo dono';
END $$;

-- ---------------------------------------------------------------------------
-- T9 — premissa do ramo (c): `authenticated` NAO grava sender<>'agent',
-- media_url nem external_id; a RPC real grava sender='agent'
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_sender text;
  v_ext text;
  v_erro text;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '11111111-0000-0000-0000-0000000000a1', 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  BEGIN
    INSERT INTO public.messages (contact_id, sender, content, message_type)
    VALUES ('e0000000-0000-0000-0000-0000000000a1', 'contact', 'forjada', 'text');
    RAISE EXCEPTION 'T9 FALHOU: authenticated inseriu sender=''contact''';
  EXCEPTION WHEN insufficient_privilege THEN
    GET STACKED DIAGNOSTICS v_erro = MESSAGE_TEXT;
    IF position('message_sender_forbidden' IN v_erro) = 0 THEN
      RAISE EXCEPTION 'T9 FALHOU: INSERT de sender=''contact'' recusado por outro motivo: %', v_erro;
    END IF;
  END;

  BEGIN
    INSERT INTO public.messages (contact_id, sender, content, message_type, media_url)
    VALUES ('e0000000-0000-0000-0000-0000000000a1', 'agent', 'forjada', 'image',
            'https://db.example.test/storage/v1/object/public/whatsapp-media/image/3EB0ORFAO.jpg');
    RAISE EXCEPTION 'T9 FALHOU: authenticated inseriu media_url em INSERT direto';
  EXCEPTION WHEN insufficient_privilege THEN
    GET STACKED DIAGNOSTICS v_erro = MESSAGE_TEXT;
    IF position('message_media_url_forbidden' IN v_erro) = 0 THEN
      RAISE EXCEPTION 'T9 FALHOU: INSERT com media_url recusado por outro motivo: %', v_erro;
    END IF;
  END;

  BEGIN
    UPDATE public.messages SET media_url = 'https://db.example.test/storage/v1/object/public/whatsapp-media/image/3EB0ORFAO.jpg'
     WHERE id = 'f0000000-0000-0000-0000-0000000000f5';
    RAISE EXCEPTION 'T9 FALHOU: authenticated trocou media_url de linha existente';
  EXCEPTION WHEN insufficient_privilege THEN
    GET STACKED DIAGNOSTICS v_erro = MESSAGE_TEXT;
    IF position('message_provenance_forbidden' IN v_erro) = 0 THEN
      RAISE EXCEPTION 'T9 FALHOU: UPDATE de media_url recusado por outro motivo: %', v_erro;
    END IF;
  END;

  RESET ROLE;

  SELECT sender, external_id INTO v_sender, v_ext
    FROM public.messages
   WHERE contact_id = 'e0000000-0000-0000-0000-0000000000a1'
     AND client_message_id = 'd0000000-0000-0000-0000-0000000000e1';
  IF v_sender IS DISTINCT FROM 'agent' OR v_ext IS NOT NULL THEN
    RAISE EXCEPTION 'T9 FALHOU: a RPC de envio gravou sender=% external_id=% (esperado agent/NULL)', v_sender, v_ext;
  END IF;

  RAISE NOTICE 'T9 OK: authenticated nao forja proveniencia; a RPC real grava sender=agent, external_id nulo';
END $$;

-- ---------------------------------------------------------------------------
-- T10 — ACL da RPC de envio (a superficie do achado)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT has_function_privilege('authenticated',
       'public.enqueue_outbound_message(uuid,uuid,text,text,text,uuid,uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'T10 FALHOU: a RPC de envio deveria ser executavel por authenticated';
  END IF;
  IF has_function_privilege('anon',
       'public.enqueue_outbound_message(uuid,uuid,text,text,text,uuid,uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'T10 FALHOU: a RPC de envio esta aberta a anon';
  END IF;
  RAISE NOTICE 'T10 OK: EXECUTE da RPC de envio concedido a authenticated e negado a anon';
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
   WHERE bucket_id = 'whatsapp-media' AND name = 'e0000000-0000-0000-0000-0000000000b2/image/v.jpg';
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
   WHERE bucket_id = 'whatsapp-media' AND name = 'e0000000-0000-0000-0000-0000000000b2/image/v.jpg';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'T8 FALHOU: o rollback nao devolveu o estado anterior (n=%)', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM storage.objects
   WHERE bucket_id = 'whatsapp-media' AND name = 'image/3EB0ORFAO.jpg';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'T8 FALHOU: o rollback nao devolveu a leitura do objeto legado (n=%)', v_n;
  END IF;

  RESET ROLE;
  RAISE NOTICE 'T8 OK: o bloco da linha 2 restaurou as tres policies anteriores (ataque volta a funcionar)';
END $$;
\endif

DO $$
BEGIN
  RAISE NOTICE 'rls_storage_media_posse_por_caminho: TODAS as assercoes passaram (T0-T10)';
END $$;

ROLLBACK;
