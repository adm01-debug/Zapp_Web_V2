-- r2_db_022_storage_acl — regressão da ACL de LEITURA dos buckets privados de mídia do WhatsApp.
--
-- R2-DB-022 B (P1). Prova, com roles/JWT/RLS REAIS (SET ROLE + request.jwt.claim.sub, sem
-- BYPASSRLS e sem inspeção textual de pg_policies como evidência de acesso), que depois da
-- migration a leitura de storage.objects é autorizada SÓ pela propriedade canônica do
-- objeto e pela origem recebida confiável — nunca por uma referência reassociável em
-- messages.media_url.
--
-- DEPENDÊNCIA: este teste exige o trigger trg_guard_message_provenance_fields
-- (migration 20261004194016_r2_db_022_write_boundary.sql, cartão irmão t_d1a95e20)
-- aplicado ANTES — é ele que torna sender='contact'+external_id uma proveniência
-- confiável ao impedir authenticated de forjá-la. O bloco (0) aborta com mensagem
-- clara se a dependência não estiver aplicada.
--
-- Como rodar (banco LOCAL da tarefa, com a migration E a do irmão aplicadas):
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
--   whatsapp-media/<contact_B>/image/secret.jpg        (canônico: 1º segmento = contact_B)
--   whatsapp-media/image/r2db022-b-secret.jpg          (recebido legado, origem confiável)
--   whatsapp-media/document/r2db022-b-doc.pdf          (recebido legado, origem confiável)
--   audio-messages/audio/r2db022-b-secret.ogg          (recebido legado, origem confiável)
--   whatsapp-media/image/r2db022%evil.jpg              (nome com '%' — não pode virar curinga)
--   whatsapp-media/image/r2db022-b-untrusted.jpg       (referência sender=contact SEM external_id)
--   whatsapp-media/image/r2db022-b-query.jpg           (media_url confiável mas com '?download=1')
-- Objetos próprios de A (caminhos REAIS de upload do app — ver cabeçalho da migration):
--   whatsapp-media/<contact_A>/01arz3ndektsv4rrffq69g5fav-foto.jpg  (useFileUploadLogic.ts:95)
--   whatsapp-media/<contact_A>/image/own.jpg
--   audio-messages/<contact_A>/1759700000000.webm                 (chat.service.ts:112)

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

  -- objetos privados de B + objetos próprios de A (caminhos reais do app) + edge cases
  INSERT INTO storage.objects (bucket_id, name) VALUES
    ('whatsapp-media', cB::text || '/image/secret.jpg'),
    ('whatsapp-media', 'image/r2db022-b-secret.jpg'),
    ('whatsapp-media', 'document/r2db022-b-doc.pdf'),
    ('audio-messages', 'audio/r2db022-b-secret.ogg'),
    ('whatsapp-media', 'image/r2db022%evil.jpg'),
    ('whatsapp-media', 'image/r2db022-b-untrusted.jpg'),
    ('whatsapp-media', 'image/r2db022-b-query.jpg'),
    ('whatsapp-media', cA::text || '/image/own.jpg'),
    ('whatsapp-media', cA::text || '/01arz3ndektsv4rrffq69g5fav-foto.jpg'),
    ('audio-messages', cA::text || '/1759700000000.webm')
  ON CONFLICT DO NOTHING;

  -- mídia RECEBIDA legítima de B (origem confiável: ingestão privilegiada)
  INSERT INTO public.messages (contact_id, sender, content, message_type, media_url, external_id) VALUES
    (cB, 'contact', '[Imagem]', 'image',
     'https://exemplo.invalido/storage/v1/object/public/whatsapp-media/image/r2db022-b-secret.jpg',
     'r2db022-b-secret'),
    (cB, 'contact', '[Áudio]', 'audio',
     'https://exemplo.invalido/storage/v1/object/public/audio-messages/audio/r2db022-b-secret.ogg',
     'r2db022-b-secret-audio'),
    (cB, 'contact', '[Documento]', 'document',
     'https://exemplo.invalido/storage/v1/object/public/whatsapp-media/document/r2db022-b-doc.pdf',
     'r2db022-b-secret-doc');

  -- referência recebida SEM external_id (origem NÃO confiável — não pode autorizar)
  INSERT INTO public.messages (contact_id, sender, content, message_type, media_url) VALUES
    (cB, 'contact', '[Imagem]', 'image',
     'https://exemplo.invalido/storage/v1/object/public/whatsapp-media/image/r2db022-b-untrusted.jpg');

  -- referência confiável mas com query string (não é comparação exata — fail-closed)
  INSERT INTO public.messages (contact_id, sender, content, message_type, media_url, external_id) VALUES
    (cB, 'contact', '[Imagem]', 'image',
     'https://exemplo.invalido/storage/v1/object/public/whatsapp-media/image/r2db022-b-query.jpg?download=1',
     'r2db022-b-query');

  -- ATAQUE: A fabrica referências (mensagens visíveis p/ A, sender='agent') apontando
  -- para os objetos privados de B — exatamente o vetor que as policies antigas liberavam.
  INSERT INTO public.messages (contact_id, sender, content, message_type, media_url) VALUES
    (cA, 'agent', '[Imagem]', 'image',
     'https://exemplo.invalido/storage/v1/object/public/whatsapp-media/' || cB::text || '/image/secret.jpg'),
    (cA, 'agent', '[Imagem]', 'image',
     'https://exemplo.invalido/storage/v1/object/public/whatsapp-media/image/r2db022-b-secret.jpg'),
    (cA, 'agent', '[Áudio]', 'audio',
     'https://exemplo.invalido/storage/v1/object/public/audio-messages/audio/r2db022-b-secret.ogg');

  -- mensagem própria de A que ele tentará USAR como vetor de UPDATE (media_url nulo)
  INSERT INTO public.messages (id, contact_id, sender, content, message_type) VALUES
    ('dddddddd-0000-0000-0000-000000000444', cA, 'agent', 'mensagem de A', 'text')
  ON CONFLICT DO NOTHING;
END $$;

-- ============================================================================
-- (0) PRÉ-CONDIÇÃO: o trigger da fronteira de escrita (cartão irmão) está aplicado.
--     Sem ele, sender='contact'+external_id é forjável e a policy (1) não é segura.
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class rel ON rel.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = rel.relnamespace
    WHERE t.tgname = 'trg_guard_message_provenance_fields'
      AND n.nspname = 'public' AND rel.relname = 'messages'
      AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'DEPENDÊNCIA AUSENTE: trg_guard_message_provenance_fields não existe em public.messages. Aplique antes a migration 20261004194016_r2_db_022_write_boundary.sql (cartão irmão t_d1a95e20).';
  END IF;
  RAISE NOTICE 'PASS: trigger de proveniência do cartão irmão presente';
END $$;

-- ============================================================================
-- ASSERÇÕES (roles/JWT/RLS reais)
-- ============================================================================

-- (1) A (agente) NÃO enxerga os objetos privados de B — em nenhuma variante
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
   WHERE o.bucket_id='whatsapp-media' AND o.name='document/r2db022-b-doc.pdf';
  IF c <> 0 THEN RAISE EXCEPTION 'FALHOU: A enxerga o documento recebido legado de B (count=%)', c; END IF;
  RAISE NOTICE 'PASS: A negado no documento recebido legado de B';

  SELECT count(*) INTO c FROM storage.objects o
   WHERE o.bucket_id='audio-messages' AND o.name='audio/r2db022-b-secret.ogg';
  IF c <> 0 THEN RAISE EXCEPTION 'FALHOU: A enxerga o áudio recebido legado de B (count=%)', c; END IF;
  RAISE NOTICE 'PASS: A negado no áudio recebido legado de B';

  -- '%' não vira curinga: A não lê o objeto com '%' no nome
  SELECT count(*) INTO c FROM storage.objects o
   WHERE o.bucket_id='whatsapp-media' AND o.name='image/r2db022%evil.jpg';
  IF c <> 0 THEN RAISE EXCEPTION 'FALHOU: A leu objeto com %% no nome (curinga) count=%', c; END IF;
  RAISE NOTICE 'PASS: A negado no objeto com %% no nome';

  SELECT count(*) INTO c FROM storage.objects o
   WHERE o.bucket_id='whatsapp-media' AND o.name='image/r2db022-b-untrusted.jpg';
  IF c <> 0 THEN RAISE EXCEPTION 'FALHOU: A leu objeto por referência sem external_id (count=%)', c; END IF;
  RAISE NOTICE 'PASS: A negado no objeto com referência sem external_id';

  SELECT count(*) INTO c FROM storage.objects o
   WHERE o.bucket_id='whatsapp-media' AND o.name='image/r2db022-b-query.jpg';
  IF c <> 0 THEN RAISE EXCEPTION 'FALHOU: A leu objeto cuja media_url tinha query string (count=%)', c; END IF;
  RAISE NOTICE 'PASS: A negado no objeto com media_url contendo query';

  -- A enxerga a PRÓPRIA mídia enviada nos caminhos REAIS que o app grava
  SELECT count(*) INTO c FROM storage.objects o
   WHERE o.bucket_id='whatsapp-media' AND o.name='aaaaaaaa-0000-0000-0000-000000000111/01arz3ndektsv4rrffq69g5fav-foto.jpg';
  IF c <> 1 THEN RAISE EXCEPTION 'FALHOU: A não enxerga o próprio upload (path real useFileUploadLogic) count=%', c; END IF;
  RAISE NOTICE 'PASS: A enxerga o próprio upload no path real do app (whatsapp-media/<contactId>/<id>-<nome>)';

  SELECT count(*) INTO c FROM storage.objects o
   WHERE o.bucket_id='audio-messages' AND o.name='aaaaaaaa-0000-0000-0000-000000000111/1759700000000.webm';
  IF c <> 1 THEN RAISE EXCEPTION 'FALHOU: A não enxerga o próprio áudio (path real chat.service) count=%', c; END IF;
  RAISE NOTICE 'PASS: A enxerga o próprio áudio no path real do app (audio-messages/<contactId>/<ts>.webm)';

  SELECT count(*) INTO c FROM storage.objects o
   WHERE o.bucket_id='whatsapp-media' AND o.name='aaaaaaaa-0000-0000-0000-000000000111/image/own.jpg';
  IF c <> 1 THEN RAISE EXCEPTION 'FALHOU: A não enxerga o próprio objeto (count=%)', c; END IF;
  RAISE NOTICE 'PASS: A enxerga o próprio objeto (path do próprio contato)';
END $$;

-- (2) FORJA DE PROVENIÊNCIA por authenticated é negada (depende do trigger do irmão).
--     O vetor residual apontado na recusa: sem o trigger, A inseriria uma mensagem
--     sender='contact' + external_id com media_url do objeto de B e a policy (1)
--     concederia a leitura.
DO $$
DECLARE
  v_ok boolean; v_err text; c integer;
BEGIN
  -- 2a. INSERT forjando origem recebida (sender='contact' + external_id + media_url)
  v_ok := false;
  BEGIN
    INSERT INTO public.messages (contact_id, sender, content, message_type, media_url, external_id)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000111', 'contact', '[Imagem]', 'image',
            'https://exemplo.invalido/storage/v1/object/public/whatsapp-media/image/r2db022-b-secret.jpg',
            'r2db022-forja-a');
    v_ok := true;
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
  END;
  IF v_ok THEN RAISE EXCEPTION 'FALHOU: INSERT forjado (sender=contact + external_id) foi aceito'; END IF;
  RAISE NOTICE 'PASS: INSERT forjado sender=contact+external_id negado (%)', v_err;

  -- a linha forjada não pode existir (o INSERT acima não pode ter passado)
  SELECT count(*) INTO c FROM public.messages WHERE external_id = 'r2db022-forja-a';
  IF c <> 0 THEN RAISE EXCEPTION 'FALHOU: mensagem forjada existe (count=%)', c; END IF;

  -- 2b. INSERT sender='agent' com media_url preenchido (também bloqueado pelo trigger)
  v_ok := false;
  BEGIN
    INSERT INTO public.messages (contact_id, sender, content, message_type, media_url)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000111', 'agent', '[Imagem]', 'image',
            'https://exemplo.invalido/storage/v1/object/public/whatsapp-media/image/r2db022-b-secret.jpg');
    v_ok := true;
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
  END;
  IF v_ok THEN RAISE EXCEPTION 'FALHOU: INSERT de agente com media_url foi aceito'; END IF;
  RAISE NOTICE 'PASS: INSERT de agente com media_url negado (%)', v_err;

  -- 2c. UPDATE do media_url de uma mensagem própria visível p/ apontar p/ objeto de B
  v_ok := false;
  BEGIN
    UPDATE public.messages
       SET media_url = 'https://exemplo.invalido/storage/v1/object/public/whatsapp-media/image/r2db022-b-secret.jpg'
     WHERE id = 'dddddddd-0000-0000-0000-000000000444';
    v_ok := true;
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
  END;
  IF v_ok THEN RAISE EXCEPTION 'FALHOU: UPDATE de media_url (forja de proveniência) foi aceito'; END IF;
  RAISE NOTICE 'PASS: UPDATE de media_url negado (%)', v_err;

  -- 2d. mesmo depois das tentativas, A continua sem ler o objeto de B
  SELECT count(*) INTO c FROM storage.objects o
   WHERE o.bucket_id='whatsapp-media' AND o.name='image/r2db022-b-secret.jpg';
  IF c <> 0 THEN RAISE EXCEPTION 'FALHOU: A leu o objeto de B após tentativas de forja (count=%)', c; END IF;
  RAISE NOTICE 'PASS: A segue negado no objeto de B após as tentativas de forja';
END $$;
RESET ROLE;

-- (3) B (dono legítimo) enxerga os próprios objetos — canônico e recebido legado confiável
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
   WHERE o.bucket_id='whatsapp-media' AND o.name='document/r2db022-b-doc.pdf';
  IF c <> 1 THEN RAISE EXCEPTION 'FALHOU: B não enxerga o próprio documento recebido legado (count=%)', c; END IF;
  RAISE NOTICE 'PASS: B enxerga o próprio documento recebido legado';

  SELECT count(*) INTO c FROM storage.objects o
   WHERE o.bucket_id='audio-messages' AND o.name='audio/r2db022-b-secret.ogg';
  IF c <> 1 THEN RAISE EXCEPTION 'FALHOU: B não enxerga o próprio áudio recebido legado (count=%)', c; END IF;
  RAISE NOTICE 'PASS: B enxerga o próprio áudio recebido legado';

  -- B NÃO enxerga objetos do contato de A (nem mídia, nem áudio enviado)
  SELECT count(*) INTO c FROM storage.objects o
   WHERE o.bucket_id='whatsapp-media' AND o.name='aaaaaaaa-0000-0000-0000-000000000111/image/own.jpg';
  IF c <> 0 THEN RAISE EXCEPTION 'FALHOU: B enxergou objeto do contato de A (count=%)', c; END IF;
  RAISE NOTICE 'PASS: B negado no objeto do contato de A';

  SELECT count(*) INTO c FROM storage.objects o
   WHERE o.bucket_id='audio-messages' AND o.name='aaaaaaaa-0000-0000-0000-000000000111/1759700000000.webm';
  IF c <> 0 THEN RAISE EXCEPTION 'FALHOU: B enxergou áudio do contato de A (count=%)', c; END IF;
  RAISE NOTICE 'PASS: B negado no áudio do contato de A';

  -- referência sem external_id NÃO autoriza nem o dono do contato (origem não confiável)
  SELECT count(*) INTO c FROM storage.objects o
   WHERE o.bucket_id='whatsapp-media' AND o.name='image/r2db022-b-untrusted.jpg';
  IF c <> 0 THEN RAISE EXCEPTION 'FALHOU: B leu objeto por referência sem external_id (count=%)', c; END IF;
  RAISE NOTICE 'PASS: B negado no objeto com referência sem external_id';

  -- media_url confiável mas com query string não casa exato (fail-closed)
  SELECT count(*) INTO c FROM storage.objects o
   WHERE o.bucket_id='whatsapp-media' AND o.name='image/r2db022-b-query.jpg';
  IF c <> 0 THEN RAISE EXCEPTION 'FALHOU: B leu objeto cuja media_url tinha query string (count=%)', c; END IF;
  RAISE NOTICE 'PASS: B negado no objeto com media_url contendo query';
END $$;
RESET ROLE;

-- (4) usuário SEM vínculo (perfil sem contato) é negado
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

-- (5) anon é negado (não há policy SELECT para anon nestes buckets)
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
-- (6) Nenhuma policy SELECT residual baseada em referência reassociável
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
