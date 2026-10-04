-- r2_db_022_storage_acl — regressão da ACL de LEITURA dos buckets privados de mídia do WhatsApp.
--
-- R2-DB-022 B (P1). Prova, com roles/JWT/RLS REAIS (SET ROLE + request.jwt.claim.sub, sem
-- BYPASSRLS e sem inspeção textual de pg_policies), que depois da migration a leitura de
-- storage.objects é autorizada SÓ pela propriedade canônica do objeto e pela origem recebida
-- confiável — nunca por uma referência reassociável em messages.media_url.
--
-- Como rodar (banco LOCAL da tarefa, já com a migration aplicada):
--   zapp-db-local psql . <NOME_DO_BANCO> < este arquivo
-- Um RAISE EXCEPTION em qualquer asserção aborta o psql (ON_ERROR_STOP) com código != 0.

\set ON_ERROR_STOP on

-- ============================================================================
-- Identificadores fixos do cenário
-- ============================================================================
--   user_A        agente A (atacante), atribuído ao contact_A
--   user_B        agente B (dono legítimo), atribuído ao contact_B
--   user_unlinked usuário com perfil mas SEM contato atribuído
-- Objetos privados de B:
--   whatsapp-media/<contact_B>/image/secret.jpg        (canônico de agente: 1º segmento = contact_B)
--   whatsapp-media/image/r2db022-b-secret.jpg          (recebido legado: 1º segmento = 'image')
--   audio-messages/audio/r2db022-b-secret.ogg          (recebido legado: 1º segmento = 'audio')
--   whatsapp-media/image/r2db022%evil.jpg              (nome com '%' — não pode virar curinga)
-- Objeto próprio de A:
--   whatsapp-media/<contact_A>/image/own.jpg

-- ============================================================================
-- SETUP (como postgres/superuser; ignora RLS de propósito, é só o cenário)
-- ============================================================================
DO $$
DECLARE
  uA uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  uB uuid := 'bbbbbbbb-0000-0000-0000-000000000002';
  uU uuid := 'cccccccc-0000-0000-0000-000000000003';
  v_pA uuid; v_pB uuid; v_pU uuid;
  cA uuid := 'aaaaaaaa-0000-0000-0000-000000000111';
  cB uuid := 'bbbbbbbb-0000-0000-0000-000000000222';
BEGIN
  -- limpeza de eventual execução anterior (idempotente; storage.objects não pode ser
  -- apagado direto por causa do trigger storage.protect_delete — usamos ON CONFLICT abaixo)
  DELETE FROM public.messages WHERE contact_id IN (cA, cB)
    OR external_id LIKE 'r2db022%';
  DELETE FROM public.contacts WHERE id IN (cA, cB);
  DELETE FROM public.user_roles WHERE user_id IN (uA, uB, uU);
  DELETE FROM public.profiles WHERE user_id IN (uA, uB, uU);
  DELETE FROM auth.users WHERE id IN (uA, uB, uU);

  INSERT INTO auth.users (id, email, instance_id, aud, role, created_at, updated_at) VALUES
    (uA, 'r2db022-a@teste.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now(), now()),
    (uB, 'r2db022-b@teste.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now(), now()),
    (uU, 'r2db022-u@teste.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now(), now());

  -- perfis criados automaticamente pelo trigger handle_new_user (on_auth_user_created)
  SELECT id INTO v_pA FROM public.profiles WHERE user_id = uA;
  SELECT id INTO v_pB FROM public.profiles WHERE user_id = uB;
  SELECT id INTO v_pU FROM public.profiles WHERE user_id = uU;

  INSERT INTO public.user_roles (user_id, role) VALUES
    (uA, 'agent'), (uB, 'agent'), (uU, 'agent');

  INSERT INTO public.contacts (id, name, phone, assigned_to) VALUES
    (cA, 'Contato A (r2db022)', '+550000000001', v_pA),
    (cB, 'Contato B (r2db022)', '+550000000002', v_pB);

  -- objetos privados de B + objeto próprio de A + objeto com '%' no nome
  INSERT INTO storage.objects (bucket_id, name) VALUES
    ('whatsapp-media', cB::text || '/image/secret.jpg'),
    ('whatsapp-media', 'image/r2db022-b-secret.jpg'),
    ('audio-messages', 'audio/r2db022-b-secret.ogg'),
    ('whatsapp-media', 'image/r2db022%evil.jpg'),
    ('whatsapp-media', cA::text || '/image/own.jpg')
  ON CONFLICT DO NOTHING;

  -- mídia RECEBIDA legítima de B (origem confiável: ingestão privilegiada)
  INSERT INTO public.messages (contact_id, sender, content, message_type, media_url, external_id) VALUES
    (cB, 'contact', '[Imagem]', 'image',
     'https://exemplo.invalido/storage/v1/object/public/whatsapp-media/image/r2db022-b-secret.jpg',
     'r2db022-b-secret'),
    (cB, 'contact', '[Áudio]', 'audio',
     'https://exemplo.invalido/storage/v1/object/public/audio-messages/audio/r2db022-b-secret.ogg',
     'r2db022-b-secret-audio');

  -- ATAQUE: A fabrica uma referência (mensagem visível p/ A, sender='agent') apontando
  -- para os objetos privados de B — exatamente o vetor que as policies antigas liberavam.
  INSERT INTO public.messages (contact_id, sender, content, message_type, media_url) VALUES
    (cA, 'agent', '[Imagem]', 'image',
     'https://exemplo.invalido/storage/v1/object/public/whatsapp-media/' || cB::text || '/image/secret.jpg'),
    (cA, 'agent', '[Imagem]', 'image',
     'https://exemplo.invalido/storage/v1/object/public/whatsapp-media/image/r2db022-b-secret.jpg'),
    (cA, 'agent', '[Áudio]', 'audio',
     'https://exemplo.invalido/storage/v1/object/public/audio-messages/audio/r2db022-b-secret.ogg');
END $$;

-- ============================================================================
-- ASSERÇÕES (roles/JWT/RLS reais)
-- ============================================================================

-- (1) A (agente) NÃO enxerga os objetos privados de B
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
SET request.jwt.claim.role = 'authenticated';
DO $$
DECLARE c integer;
BEGIN
  SELECT count(*) INTO c FROM storage.objects o
   WHERE o.bucket_id='whatsapp-media' AND o.name='bbbbbbbb-0000-0000-0000-000000000222/image/secret.jpg';
  IF c <> 0 THEN RAISE EXCEPTION 'FALHOU: A enxerga o objeto canônico de B (count=%)', c; END IF;
  RAISE NOTICE 'PASS: A negado no objeto canônico de B';

  SELECT count(*) INTO c FROM storage.objects o
   WHERE o.bucket_id='whatsapp-media' AND o.name='image/r2db022-b-secret.jpg';
  IF c <> 0 THEN RAISE EXCEPTION 'FALHOU: A enxerga a imagem recebida legada de B (count=%)', c; END IF;
  RAISE NOTICE 'PASS: A negado na imagem recebida legada de B (referência sender=agent)';

  SELECT count(*) INTO c FROM storage.objects o
   WHERE o.bucket_id='audio-messages' AND o.name='audio/r2db022-b-secret.ogg';
  IF c <> 0 THEN RAISE EXCEPTION 'FALHOU: A enxerga o áudio recebido legado de B (count=%)', c; END IF;
  RAISE NOTICE 'PASS: A negado no áudio recebido legado de B';

  -- '%' não vira curinga: A não lê o objeto com '%' no nome
  SELECT count(*) INTO c FROM storage.objects o
   WHERE o.bucket_id='whatsapp-media' AND o.name='image/r2db022%evil.jpg';
  IF c <> 0 THEN RAISE EXCEPTION 'FALHOU: A leu objeto com %% no nome (curinga) count=%', c; END IF;
  RAISE NOTICE 'PASS: A negado no objeto com %% no nome';

  -- A enxerga o PRÓPRIO objeto (path do próprio contato)
  SELECT count(*) INTO c FROM storage.objects o
   WHERE o.bucket_id='whatsapp-media' AND o.name='aaaaaaaa-0000-0000-0000-000000000111/image/own.jpg';
  IF c <> 1 THEN RAISE EXCEPTION 'FALHOU: A não enxerga o próprio objeto (count=%)', c; END IF;
  RAISE NOTICE 'PASS: A enxerga o próprio objeto (path do próprio contato)';
END $$;
RESET ROLE;

-- (2) B (dono legítimo) enxerga os próprios objetos — canônico e recebido legado
SET ROLE authenticated;
SET request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
SET request.jwt.claim.role = 'authenticated';
DO $$
DECLARE c integer;
BEGIN
  SELECT count(*) INTO c FROM storage.objects o
   WHERE o.bucket_id='whatsapp-media' AND o.name='bbbbbbbb-0000-0000-0000-000000000222/image/secret.jpg';
  IF c <> 1 THEN RAISE EXCEPTION 'FALHOU: B não enxerga o próprio objeto canônico (count=%)', c; END IF;
  RAISE NOTICE 'PASS: B enxerga o próprio objeto canônico';

  SELECT count(*) INTO c FROM storage.objects o
   WHERE o.bucket_id='whatsapp-media' AND o.name='image/r2db022-b-secret.jpg';
  IF c <> 1 THEN RAISE EXCEPTION 'FALHOU: B não enxerga a própria imagem recebida legada (count=%)', c; END IF;
  RAISE NOTICE 'PASS: B enxerga a própria imagem recebida legada (origem confiável + exato)';

  SELECT count(*) INTO c FROM storage.objects o
   WHERE o.bucket_id='audio-messages' AND o.name='audio/r2db022-b-secret.ogg';
  IF c <> 1 THEN RAISE EXCEPTION 'FALHOU: B não enxerga o próprio áudio recebido legado (count=%)', c; END IF;
  RAISE NOTICE 'PASS: B enxerga o próprio áudio recebido legado';

  -- B NÃO enxerga objeto de outro contato (A)
  SELECT count(*) INTO c FROM storage.objects o
   WHERE o.bucket_id='whatsapp-media' AND o.name='aaaaaaaa-0000-0000-0000-000000000111/image/own.jpg';
  IF c <> 0 THEN RAISE EXCEPTION 'FALHOU: B enxergou objeto do contato de A (count=%)', c; END IF;
  RAISE NOTICE 'PASS: B negado no objeto do contato de A';
END $$;
RESET ROLE;

-- (3) usuário SEM vínculo (perfil sem contato) é negado
SET ROLE authenticated;
SET request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
SET request.jwt.claim.role = 'authenticated';
DO $$
DECLARE c integer;
BEGIN
  SELECT count(*) INTO c FROM storage.objects o
   WHERE o.bucket_id='whatsapp-media' AND o.name='image/r2db022-b-secret.jpg';
  IF c <> 0 THEN RAISE EXCEPTION 'FALHOU: usuário sem vínculo enxergou objeto de B (count=%)', c; END IF;
  RAISE NOTICE 'PASS: usuário sem vínculo negado';
END $$;
RESET ROLE;

-- (4) anon é negado (não há policy SELECT para anon nestes buckets)
SET ROLE anon;
RESET request.jwt.claim.sub;
RESET request.jwt.claim.role;
DO $$
DECLARE c integer;
BEGIN
  BEGIN
    SELECT count(*) INTO c FROM storage.objects o
     WHERE o.bucket_id='whatsapp-media' AND o.name='image/r2db022-b-secret.jpg';
  EXCEPTION WHEN insufficient_privilege THEN
    -- anon não tem GRANT de SELECT em team_messages, referenciada por uma policy
    -- TO public de team-chat-files; erro de permissão também é "negado" (fail-closed).
    c := 0;
  END;
  IF c <> 0 THEN RAISE EXCEPTION 'FALHOU: anon enxergou objeto privado (count=%)', c; END IF;
  RAISE NOTICE 'PASS: anon negado';
END $$;
RESET ROLE;

-- ============================================================================
-- (5) Nenhuma policy SELECT residual baseada em referência reassociável
--     (LIKE / substring / position / replace sobre media_url).
-- ============================================================================
SET ROLE postgres;
DO $$
DECLARE c integer;
BEGIN
  SELECT count(*) INTO c FROM pg_policies
   WHERE schemaname='storage' AND tablename='objects' AND cmd='SELECT'
     AND (qual ~ 'whatsapp-media' OR qual ~ 'audio-messages')
     AND (qual ~* 'LIKE' OR qual ~* 'substring' OR qual ~* 'position\(' OR qual ~* 'replace\(');
  IF c <> 0 THEN
    RAISE EXCEPTION 'FALHOU: % policy(s) SELECT residual(is) com LIKE/substring/position/replace', c;
  END IF;
  RAISE NOTICE 'PASS: nenhuma policy SELECT residual baseada em media_url (LIKE/substring/position/replace)';

  -- as três policies alvo continuam presentes e cobrem os dois buckets
  SELECT count(*) INTO c FROM pg_policies
   WHERE schemaname='storage' AND tablename='objects' AND cmd='SELECT'
     AND policyname IN ('whatsapp media readable via visible message',
                        'Users can read assigned whatsapp media',
                        'Users can read assigned audio messages');
  IF c <> 3 THEN RAISE EXCEPTION 'FALHOU: esperava 3 policies SELECT alvo, achei %', c; END IF;
  RAISE NOTICE 'PASS: 3 policies SELECT alvo presentes';
END $$;
RESET ROLE;

-- ============================================================================
-- LIMPEZA final (idempotente; só o cenário do teste)
-- ============================================================================
DO $$
DECLARE
  uA uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  uB uuid := 'bbbbbbbb-0000-0000-0000-000000000002';
  uU uuid := 'cccccccc-0000-0000-0000-000000000003';
  cA uuid := 'aaaaaaaa-0000-0000-0000-000000000111';
  cB uuid := 'bbbbbbbb-0000-0000-0000-000000000222';
BEGIN
  DELETE FROM public.messages WHERE contact_id IN (cA, cB) OR external_id LIKE 'r2db022%';
  DELETE FROM public.contacts WHERE id IN (cA, cB);
  DELETE FROM public.user_roles WHERE user_id IN (uA, uB, uU);
  DELETE FROM public.profiles WHERE user_id IN (uA, uB, uU);
  DELETE FROM auth.users WHERE id IN (uA, uB, uU);
END $$;

\echo 'r2_db_022_storage_acl: TODAS AS ASSERÇÕES PASSARAM'
