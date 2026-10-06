-- R2-DB-022 B: prova real de RLS para as três policies de leitura de mídia privada.
-- Executar no banco LOCAL descartável da tarefa, com o psql vendo o workspace
-- a partir da raiz do repositório; o teste inclui as migrations reais com \i.
\set ON_ERROR_STOP on
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert_count(p_label text, p_expected bigint, p_actual bigint)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_actual IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'FALHOU: % (esperado %, obtido %)', p_label, p_expected, p_actual;
  END IF;
  RAISE NOTICE 'PASS: %', p_label;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.assert_count(text, bigint, bigint) TO anon, authenticated;

-- Cenário sintético. Inserts de preparação usam o dono; as consultas usam anon/authenticated.
INSERT INTO auth.users (id, email, instance_id, aud, role, created_at, updated_at) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'r2db022-a@teste.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now(), now()),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'r2db022-b@teste.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now(), now()),
  ('cccccccc-0000-0000-0000-000000000003', 'r2db022-u@teste.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now(), now()),
  ('dddddddd-0000-0000-0000-000000000004', 'r2db022-admin@teste.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now(), now());

INSERT INTO public.user_roles (user_id, role) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'agent'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'agent'),
  ('cccccccc-0000-0000-0000-000000000003', 'agent'),
  ('dddddddd-0000-0000-0000-000000000004', 'admin');

INSERT INTO public.contacts (id, name, phone, assigned_to) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000111', 'Contato A R2DB022', '+550000000001',
   (SELECT id FROM public.profiles WHERE user_id='aaaaaaaa-0000-0000-0000-000000000001')),
  ('bbbbbbbb-0000-0000-0000-000000000222', 'Contato B R2DB022', '+550000000002',
   (SELECT id FROM public.profiles WHERE user_id='bbbbbbbb-0000-0000-0000-000000000002'));

INSERT INTO storage.objects (bucket_id, name) VALUES
  ('whatsapp-media', 'aaaaaaaa-0000-0000-0000-000000000111/own.jpg'),
  ('audio-messages', 'aaaaaaaa-0000-0000-0000-000000000111/own.ogg'),
  ('whatsapp-media', 'bbbbbbbb-0000-0000-0000-000000000222/secret.jpg'),
  ('audio-messages', 'bbbbbbbb-0000-0000-0000-000000000222/secret.ogg'),
  ('whatsapp-media', 'image/r2db022-received.jpg'),
  ('audio-messages', 'audio/r2db022-received.ogg'),
  ('whatsapp-media', 'image/r2db022-malformed.jpg'),
  ('whatsapp-media', 'image/r2db022-query.jpg'),
  ('whatsapp-media', 'image/r2db022%2Fevil.jpg'),
  ('whatsapp-media', 'image/r2db022_evil.jpg'),
  ('whatsapp-media', 'image/r2db022-bucket.jpg');

-- Origem recebida legítima de B e locators ambíguos que devem falhar fechados.
INSERT INTO public.messages (contact_id, sender, content, message_type, media_url, external_id) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000222', 'contact', '[Imagem]', 'image',
   'https://exemplo.invalido/storage/v1/object/public/whatsapp-media/image/r2db022-received.jpg', 'r2db022-in-image'),
  ('bbbbbbbb-0000-0000-0000-000000000222', 'contact', '[Áudio]', 'audio',
   'https://exemplo.invalido/storage/v1/object/public/audio-messages/audio/r2db022-received.ogg', 'r2db022-in-audio'),
  ('bbbbbbbb-0000-0000-0000-000000000222', 'contact', '[Malformada]', 'image',
   'nao-e-https/storage/v1/object/public/whatsapp-media/image/r2db022-malformed.jpg', 'r2db022-malformed'),
  ('bbbbbbbb-0000-0000-0000-000000000222', 'contact', '[Query]', 'image',
   'https://exemplo.invalido/storage/v1/object/public/whatsapp-media/image/r2db022-query.jpg?download=1', 'r2db022-query'),
  ('bbbbbbbb-0000-0000-0000-000000000222', 'contact', '[Encoding]', 'image',
   'https://exemplo.invalido/storage/v1/object/public/whatsapp-media/image/r2db022%2Fevil.jpg', 'r2db022-encoding'),
  ('bbbbbbbb-0000-0000-0000-000000000222', 'contact', '[Underscore diferente]', 'image',
   'https://exemplo.invalido/storage/v1/object/public/whatsapp-media/image/r2db022Xevil.jpg', 'r2db022-underscore'),
  ('bbbbbbbb-0000-0000-0000-000000000222', 'contact', '[Bucket divergente]', 'image',
   'https://exemplo.invalido/storage/v1/object/public/audio-messages/image/r2db022-bucket.jpg', 'r2db022-bucket');

-- Referências controladas pelo agente A para objetos de B: estado explorável antes da ACL.
INSERT INTO public.messages (contact_id, sender, content, message_type, media_url) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000111', 'agent', '[Ref canônica]', 'image',
   'https://exemplo.invalido/storage/v1/object/public/whatsapp-media/bbbbbbbb-0000-0000-0000-000000000222/secret.jpg'),
  ('aaaaaaaa-0000-0000-0000-000000000111', 'agent', '[Ref recebida]', 'image',
   'https://exemplo.invalido/storage/v1/object/public/whatsapp-media/image/r2db022-received.jpg'),
  ('aaaaaaaa-0000-0000-0000-000000000111', 'agent', '[Ref áudio]', 'audio',
   'https://exemplo.invalido/storage/v1/object/public/audio-messages/audio/r2db022-received.ogg');

SELECT pg_temp.assert_count('authenticated não possui BYPASSRLS', 0,
  (SELECT count(*) FROM pg_roles WHERE rolname='authenticated' AND (rolsuper OR rolbypassrls)));
SELECT pg_temp.assert_count('fronteira de escrita irmã está aplicada', 1,
  (SELECT count(*) FROM pg_trigger WHERE tgname='trg_guard_message_provenance_fields' AND NOT tgisinternal));

-- RED: restaura o estado histórico vulnerável e prova o vazamento com A sob RLS real.
\i supabase/migrations/20260930700000_fix_whatsapp_storage_policies.sql
\i supabase/migrations/20261003142707_whatsapp_media_recebida_select_via_messages.sql
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
SET request.jwt.claim.role = 'authenticated';
SELECT pg_temp.assert_count('RED: A lê três objetos de B por referências reassociáveis', 3,
  (SELECT count(*) FROM storage.objects
   WHERE (bucket_id, name) IN (
     ('whatsapp-media', 'bbbbbbbb-0000-0000-0000-000000000222/secret.jpg'),
     ('whatsapp-media', 'image/r2db022-received.jpg'),
     ('audio-messages', 'audio/r2db022-received.ogg'))));
RESET ROLE;

-- GREEN: executa a migration real, não uma cópia do SQL.
\i supabase/migrations/20261004194017_r2_db_022_storage_acl.sql

SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT pg_temp.assert_count('A não lê nenhum objeto de B após as referências forjadas', 0,
  (SELECT count(*) FROM storage.objects WHERE name LIKE 'bbbbbbbb-%' OR name LIKE '%r2db022%'));
SELECT pg_temp.assert_count('A lê mídia canônica própria nos dois buckets', 2,
  (SELECT count(*) FROM storage.objects WHERE name LIKE 'aaaaaaaa-0000-0000-0000-000000000111/%'));
RESET ROLE;

SET ROLE authenticated;
SET request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
SELECT pg_temp.assert_count('B lê mídia canônica e recebida legítima nos dois buckets', 4,
  (SELECT count(*) FROM storage.objects
   WHERE (bucket_id, name) IN (
     ('whatsapp-media', 'bbbbbbbb-0000-0000-0000-000000000222/secret.jpg'),
     ('audio-messages', 'bbbbbbbb-0000-0000-0000-000000000222/secret.ogg'),
     ('whatsapp-media', 'image/r2db022-received.jpg'),
     ('audio-messages', 'audio/r2db022-received.ogg'))));
SELECT pg_temp.assert_count('URL malformada/query/encoding/%/_/bucket divergente não autorizam', 0,
  (SELECT count(*) FROM storage.objects WHERE name IN (
    'image/r2db022-malformed.jpg', 'image/r2db022-query.jpg', 'image/r2db022%2Fevil.jpg',
    'image/r2db022_evil.jpg', 'image/r2db022-bucket.jpg')));
RESET ROLE;

SET ROLE authenticated;
SET request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
SELECT pg_temp.assert_count('usuário sem vínculo é negado', 0,
  (SELECT count(*) FROM storage.objects WHERE name LIKE '%r2db022%' OR name LIKE 'bbbbbbbb-%'));
RESET ROLE;

SET ROLE authenticated;
SET request.jwt.claim.sub = 'dddddddd-0000-0000-0000-000000000004';
SELECT pg_temp.assert_count('admin preserva o acesso vigente aos dois buckets', 11,
  (SELECT count(*) FROM storage.objects WHERE name LIKE '%r2db022%' OR name LIKE 'aaaaaaaa-%' OR name LIKE 'bbbbbbbb-%'));
RESET ROLE;

SET ROLE anon;
RESET request.jwt.claim.sub;
DO $$ DECLARE v_count bigint := 0;
BEGIN
  BEGIN
    SELECT count(*) INTO v_count FROM storage.objects
    WHERE name='image/r2db022-received.jpg';
  EXCEPTION WHEN insufficient_privilege THEN
    v_count := 0;
  END;
  IF v_count <> 0 THEN RAISE EXCEPTION 'FALHOU: anon leu objeto privado'; END IF;
  RAISE NOTICE 'PASS: anon é negado';
END $$;
RESET ROLE;

SELECT pg_temp.assert_count('as três policies alvo permanecem presentes', 3,
  (SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
   AND cmd='SELECT' AND policyname IN (
     'whatsapp media readable via visible message',
     'Users can read assigned whatsapp media',
     'Users can read assigned audio messages')));

ROLLBACK;
\echo 'r2_db_022_storage_acl: RED histórico e GREEN atual comprovados com roles/JWT/RLS reais'
