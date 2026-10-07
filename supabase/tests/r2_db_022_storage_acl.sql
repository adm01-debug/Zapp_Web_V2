-- r2_db_022_storage_acl — ACL de LEITURA dos buckets privados de mídia do WhatsApp.
--
-- Roda com roles/JWT/RLS reais (SET ROLE + request.jwt.claim.sub). Prova que a
-- forja por referência em media_url não concede SELECT, e que os caminhos
-- legítimos decididos para a rodada 1 continuam liberados.

\set ON_ERROR_STOP on

-- O banco local do dia tem uma policy de outro bucket (team-chat-files) que
-- recursa ao ser avaliada junto das policies permissivas de storage.objects.
-- Ela é ortogonal aos buckets deste cartão; removemos só durante este contrato
-- SQL para conseguir exercitar RLS real de whatsapp-media/audio-messages.
DROP POLICY IF EXISTS "Conversation members can read team chat files" ON storage.objects;

DO $$
DECLARE
  uA uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  uB uuid := 'bbbbbbbb-0000-0000-0000-000000000002';
  uU uuid := 'cccccccc-0000-0000-0000-000000000003';
  uS uuid := 'eeeeeeee-0000-0000-0000-000000000004';
  v_pA uuid; v_pB uuid; v_pU uuid; v_pS uuid;
  cA uuid := 'aaaaaaaa-0000-0000-0000-000000000111';
  cB uuid := 'bbbbbbbb-0000-0000-0000-000000000222';
BEGIN
  INSERT INTO auth.users (id, email, instance_id, aud, role, created_at, updated_at) VALUES
    (uA, 'r2db022-a@teste.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now(), now()),
    (uB, 'r2db022-b@teste.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now(), now()),
    (uU, 'r2db022-u@teste.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now(), now()),
    (uS, 'r2db022-s@teste.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now(), now())
  ON CONFLICT DO NOTHING;

  SELECT id INTO v_pA FROM public.profiles WHERE user_id = uA;
  SELECT id INTO v_pB FROM public.profiles WHERE user_id = uB;
  SELECT id INTO v_pU FROM public.profiles WHERE user_id = uU;
  SELECT id INTO v_pS FROM public.profiles WHERE user_id = uS;

  INSERT INTO public.user_roles (user_id, role) VALUES
    (uA, 'agent'), (uB, 'agent'), (uU, 'agent'), (uS, 'supervisor')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.contacts (id, name, phone, assigned_to) VALUES
    (cA, 'Contato A (r2db022)', '+550000000001', v_pA),
    (cB, 'Contato B (r2db022)', '+550000000002', v_pB)
  ON CONFLICT (id) DO UPDATE SET assigned_to = EXCLUDED.assigned_to;

  INSERT INTO storage.objects (bucket_id, name) VALUES
    ('whatsapp-media', cB::text || '/image/secret.jpg'),
    ('whatsapp-media', cB::text || '/image/20261006-recebida.jpg'),
    ('whatsapp-media', cB::text || '/image/fwd-copia.jpg'),
    ('whatsapp-media', 'audio_' || cB::text || '_1759700000123.webm'),
    ('whatsapp-media', 'image/r2db022-b-legacy.jpg'),
    ('whatsapp-media', 'document/r2db022-b-doc.pdf'),
    ('whatsapp-media', 'kb/r2db022-manual.pdf'),
    ('whatsapp-media', 'stickers/r2db022-sticker.webp'),
    ('whatsapp-media', uB::text || '/r2db022-owned-by-user.jpg'),
    ('whatsapp-media', 'image/r2db022%evil.jpg'),
    ('whatsapp-media', cA::text || '/image/own.jpg'),
    ('audio-messages', 'audio/r2db022-b-legacy.ogg'),
    ('audio-messages', cB::text || '/1759700000001.webm'),
    ('audio-messages', 'custom-sounds/r2db022-alert.mp3'),
    ('audio-messages', uB::text || '/r2db022-owned-by-user.webm'),
    ('audio-messages', cA::text || '/1759700000000.webm')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.messages (id, contact_id, sender, content, message_type, media_url, external_id) VALUES
    ('dddddddd-0000-0000-0000-000000000441', cB, 'contact', '[Imagem]', 'image',
     'https://exemplo.invalido/storage/v1/object/public/whatsapp-media/image/r2db022-b-legacy.jpg',
     'r2db022-recv-legacy-image'),
    ('dddddddd-0000-0000-0000-000000000442', cB, 'contact', '[Documento]', 'document',
     'https://exemplo.invalido/storage/v1/object/public/whatsapp-media/document/r2db022-b-doc.pdf',
     'r2db022-recv-legacy-doc'),
    ('dddddddd-0000-0000-0000-000000000443', cB, 'contact', '[Áudio]', 'audio',
     'https://exemplo.invalido/storage/v1/object/public/audio-messages/audio/r2db022-b-legacy.ogg',
     'r2db022-recv-legacy-audio')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.messages (id, contact_id, sender, content, message_type, media_url)
  VALUES ('dddddddd-0000-0000-0000-000000000444', cA, 'agent', 'texto', 'text', NULL)
  ON CONFLICT DO NOTHING;
END $$;

-- A: atacante não lê objetos privados do contato B, mesmo forjando referência visível.
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
SET request.jwt.claim.role = 'authenticated';
DO $$
DECLARE c integer; v_ok boolean; v_err text;
BEGIN
  SELECT count(*) INTO c FROM storage.objects o WHERE o.bucket_id='whatsapp-media' AND o.name='bbbbbbbb-0000-0000-0000-000000000222/image/secret.jpg';
  IF c <> 0 THEN RAISE EXCEPTION 'FALHOU: A enxerga objeto canônico de B antes da forja (count=%)', c; END IF;

  v_ok := false; v_err := NULL;
  BEGIN
    INSERT INTO public.messages (id, contact_id, sender, content, message_type, media_url, external_id)
    VALUES ('dddddddd-0000-0000-0000-000000000445', 'aaaaaaaa-0000-0000-0000-000000000111', 'contact', '[Imagem]', 'image',
            'https://exemplo.invalido/storage/v1/object/public/whatsapp-media/bbbbbbbb-0000-0000-0000-000000000222/image/secret.jpg',
            'r2db022-forja-a')
    ON CONFLICT DO NOTHING;
    v_ok := true;
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
  END;
  SELECT count(*) INTO c FROM storage.objects o WHERE o.bucket_id='whatsapp-media' AND o.name='bbbbbbbb-0000-0000-0000-000000000222/image/secret.jpg';
  IF c <> 0 THEN RAISE EXCEPTION 'FALHOU: A leu objeto de B após INSERT forjado (count=%)', c; END IF;

  v_ok := false; v_err := NULL;
  BEGIN
    UPDATE public.messages
       SET media_url='https://exemplo.invalido/storage/v1/object/public/audio-messages/bbbbbbbb-0000-0000-0000-000000000222/1759700000001.webm'
     WHERE id='dddddddd-0000-0000-0000-000000000444';
    v_ok := true;
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
  END;
  SELECT count(*) INTO c FROM storage.objects o WHERE o.bucket_id='audio-messages' AND o.name='bbbbbbbb-0000-0000-0000-000000000222/1759700000001.webm';
  IF c <> 0 THEN RAISE EXCEPTION 'FALHOU: A leu áudio de B após UPDATE forjado (count=%)', c; END IF;

  SELECT count(*) INTO c FROM storage.objects o WHERE o.bucket_id='whatsapp-media' AND o.name='audio_bbbbbbbb-0000-0000-0000-000000000222_1759700000123.webm';
  IF c <> 0 THEN RAISE EXCEPTION 'FALHOU: A leu áudio ChatPopup de B (count=%)', c; END IF;

  SELECT count(*) INTO c FROM storage.objects o WHERE o.bucket_id='whatsapp-media' AND o.name='image/r2db022%evil.jpg';
  IF c <> 0 THEN RAISE EXCEPTION 'FALHOU: A leu objeto com %% no nome (count=%)', c; END IF;

  SELECT count(*) INTO c FROM storage.objects o WHERE o.bucket_id='whatsapp-media' AND o.name='kb/r2db022-manual.pdf';
  IF c <> 1 THEN RAISE EXCEPTION 'FALHOU: A não leu kb/ funcional (count=%)', c; END IF;
  SELECT count(*) INTO c FROM storage.objects o WHERE o.bucket_id='whatsapp-media' AND o.name='stickers/r2db022-sticker.webp';
  IF c <> 1 THEN RAISE EXCEPTION 'FALHOU: A não leu stickers/ funcional (count=%)', c; END IF;
  SELECT count(*) INTO c FROM storage.objects o WHERE o.bucket_id='audio-messages' AND o.name='custom-sounds/r2db022-alert.mp3';
  IF c <> 1 THEN RAISE EXCEPTION 'FALHOU: A não leu custom-sounds/ funcional (count=%)', c; END IF;

  SELECT count(*) INTO c FROM storage.objects o WHERE o.bucket_id='whatsapp-media' AND o.name='aaaaaaaa-0000-0000-0000-000000000111/image/own.jpg';
  IF c <> 1 THEN RAISE EXCEPTION 'FALHOU: A não leu mídia do próprio contato (count=%)', c; END IF;
  RAISE NOTICE 'PASS: A negado para B/forjas e liberado para caminhos funcionais/próprios (update aceito=% %)', v_ok, coalesce(v_err,'');
END $$;
RESET ROLE;

-- B: dono legítimo lê os caminhos mantidos pela decisão do dono.
SET ROLE authenticated;
SET request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
SET request.jwt.claim.role = 'authenticated';
DO $$
DECLARE c integer;
BEGIN
  SELECT count(*) INTO c FROM storage.objects o WHERE o.bucket_id='whatsapp-media' AND o.name='bbbbbbbb-0000-0000-0000-000000000222/image/secret.jpg';
  IF c <> 1 THEN RAISE EXCEPTION 'FALHOU: B não leu objeto canônico (count=%)', c; END IF;
  SELECT count(*) INTO c FROM storage.objects o WHERE o.bucket_id='whatsapp-media' AND o.name='bbbbbbbb-0000-0000-0000-000000000222/image/20261006-recebida.jpg';
  IF c <> 1 THEN RAISE EXCEPTION 'FALHOU: B não leu mídia recebida no path do contato (count=%)', c; END IF;
  SELECT count(*) INTO c FROM storage.objects o WHERE o.bucket_id='whatsapp-media' AND o.name='bbbbbbbb-0000-0000-0000-000000000222/image/fwd-copia.jpg';
  IF c <> 1 THEN RAISE EXCEPTION 'FALHOU: B não leu encaminhamento/cópia no path do contato (count=%)', c; END IF;
  SELECT count(*) INTO c FROM storage.objects o WHERE o.bucket_id='audio-messages' AND o.name='bbbbbbbb-0000-0000-0000-000000000222/1759700000001.webm';
  IF c <> 1 THEN RAISE EXCEPTION 'FALHOU: B não leu áudio canônico (count=%)', c; END IF;
  SELECT count(*) INTO c FROM storage.objects o WHERE o.bucket_id='whatsapp-media' AND o.name='audio_bbbbbbbb-0000-0000-0000-000000000222_1759700000123.webm';
  IF c <> 1 THEN RAISE EXCEPTION 'FALHOU: B não leu áudio do ChatPopup (count=%)', c; END IF;
  SELECT count(*) INTO c FROM storage.objects o WHERE o.bucket_id='whatsapp-media' AND o.name='image/r2db022-b-legacy.jpg';
  IF c <> 1 THEN RAISE EXCEPTION 'FALHOU: B não leu imagem recebida legada sem prefixo (count=%)', c; END IF;
  SELECT count(*) INTO c FROM storage.objects o WHERE o.bucket_id='whatsapp-media' AND o.name='document/r2db022-b-doc.pdf';
  IF c <> 1 THEN RAISE EXCEPTION 'FALHOU: B não leu documento recebido legado sem prefixo (count=%)', c; END IF;
  SELECT count(*) INTO c FROM storage.objects o WHERE o.bucket_id='audio-messages' AND o.name='audio/r2db022-b-legacy.ogg';
  IF c <> 1 THEN RAISE EXCEPTION 'FALHOU: B não leu áudio recebido legado sem prefixo (count=%)', c; END IF;
  SELECT count(*) INTO c FROM storage.objects o WHERE o.bucket_id='whatsapp-media' AND o.name='bbbbbbbb-0000-0000-0000-000000000002/r2db022-owned-by-user.jpg';
  IF c <> 1 THEN RAISE EXCEPTION 'FALHOU: B não leu ramo foldername[1]=auth.uid() em whatsapp-media (count=%)', c; END IF;
  SELECT count(*) INTO c FROM storage.objects o WHERE o.bucket_id='audio-messages' AND o.name='bbbbbbbb-0000-0000-0000-000000000002/r2db022-owned-by-user.webm';
  IF c <> 1 THEN RAISE EXCEPTION 'FALHOU: B não leu ramo foldername[1]=auth.uid() em audio-messages (count=%)', c; END IF;
  RAISE NOTICE 'PASS: B leu caminhos canônicos, legados e exceções legítimas';
END $$;
RESET ROLE;

-- Usuário sem vínculo e anon seguem negados para objetos privados de contato.
SET ROLE authenticated;
SET request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
SET request.jwt.claim.role = 'authenticated';
DO $$
DECLARE c integer;
BEGIN
  SELECT count(*) INTO c FROM storage.objects o WHERE o.bucket_id='whatsapp-media' AND o.name='bbbbbbbb-0000-0000-0000-000000000222/image/secret.jpg';
  IF c <> 0 THEN RAISE EXCEPTION 'FALHOU: usuário sem vínculo leu objeto privado (count=%)', c; END IF;
  SELECT count(*) INTO c FROM storage.objects o WHERE o.bucket_id='audio-messages' AND o.name='bbbbbbbb-0000-0000-0000-000000000222/1759700000001.webm';
  IF c <> 0 THEN RAISE EXCEPTION 'FALHOU: usuário sem vínculo leu áudio privado (count=%)', c; END IF;
  RAISE NOTICE 'PASS: usuário sem vínculo negado';
END $$;
RESET ROLE;

SET ROLE anon;
RESET request.jwt.claim.sub;
RESET request.jwt.claim.role;
DO $$
DECLARE c integer;
BEGIN
  BEGIN
    SELECT count(*) INTO c FROM storage.objects o WHERE o.bucket_id='whatsapp-media' AND o.name='bbbbbbbb-0000-0000-0000-000000000222/image/secret.jpg';
  EXCEPTION WHEN insufficient_privilege THEN
    c := 0;
  END;
  IF c <> 0 THEN RAISE EXCEPTION 'FALHOU: anon leu objeto privado (count=%)', c; END IF;
  RAISE NOTICE 'PASS: anon negado';
END $$;
RESET ROLE;

-- Supervisor mantém acesso já previsto ao bucket todo.
SET ROLE authenticated;
SET request.jwt.claim.sub = 'eeeeeeee-0000-0000-0000-000000000004';
SET request.jwt.claim.role = 'authenticated';
DO $$
DECLARE c integer;
BEGIN
  SELECT count(*) INTO c FROM storage.objects o WHERE o.bucket_id='whatsapp-media' AND o.name='bbbbbbbb-0000-0000-0000-000000000222/image/secret.jpg';
  IF c <> 1 THEN RAISE EXCEPTION 'FALHOU: supervisor não leu objeto de B (count=%)', c; END IF;
  SELECT count(*) INTO c FROM storage.objects o WHERE o.bucket_id='audio-messages' AND o.name='audio/r2db022-b-legacy.ogg';
  IF c <> 1 THEN RAISE EXCEPTION 'FALHOU: supervisor não leu legado (count=%)', c; END IF;
  RAISE NOTICE 'PASS: supervisor mantém acesso';
END $$;
RESET ROLE;

-- Guarda contra policy residual permissiva por OR: a policy de media_url antiga sumiu,
-- há só um locator por bucket, sem LIKE/right/position/replace.
SET ROLE postgres;
DO $$
DECLARE c integer;
BEGIN
  SELECT count(*) INTO c FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='whatsapp media readable via visible message';
  IF c <> 0 THEN RAISE EXCEPTION 'FALHOU: policy antiga baseada em media_url ainda existe'; END IF;
  SELECT count(*) INTO c FROM pg_policies
   WHERE schemaname='storage' AND tablename='objects' AND cmd='SELECT'
     AND policyname = 'Users can read assigned whatsapp media';
  IF c <> 1 THEN RAISE EXCEPTION 'FALHOU: policy locator de whatsapp-media ausente/duplicada (count=%)', c; END IF;
  SELECT count(*) INTO c FROM pg_policies
   WHERE schemaname='storage' AND tablename='objects' AND cmd='SELECT'
     AND policyname = 'Users can read assigned audio messages';
  IF c <> 1 THEN RAISE EXCEPTION 'FALHOU: policy locator de audio-messages ausente/duplicada (count=%)', c; END IF;
  SELECT count(*) INTO c FROM pg_policies
   WHERE schemaname='storage' AND tablename='objects' AND cmd='SELECT'
     AND (qual ~ 'whatsapp-media' OR qual ~ 'audio-messages')
     AND (qual ~ '~~' OR qual ~* 'position\(' OR qual ~* 'right\(' OR qual ~* 'replace\(');
  IF c <> 0 THEN RAISE EXCEPTION 'FALHOU: % policy(s) SELECT residual(is) com pattern/substring antigo', c; END IF;
  RAISE NOTICE 'PASS: sem policy residual permissiva por OR';
END $$;
RESET ROLE;

-- Dados de cenário ficam idempotentes por ON CONFLICT; não apagamos messages aqui porque
-- há FKs com ON DELETE SET NULL em tabelas publicadas com coluna-lista no banco local.

CREATE POLICY "Conversation members can read team chat files" ON storage.objects
FOR SELECT
USING (
  bucket_id = 'team-chat-files'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR is_admin_or_supervisor(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.team_messages tm
      JOIN public.team_conversation_members mem ON mem.conversation_id = tm.conversation_id
      JOIN public.profiles p ON p.id = mem.profile_id
      WHERE tm.media_bucket = 'team-chat-files'
        AND tm.media_path = name
        AND p.user_id = auth.uid()
    )
  )
);

\echo 'r2_db_022_storage_acl: TODAS AS ASSERÇÕES PASSARAM'
