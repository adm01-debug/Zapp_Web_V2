-- r2_db_022_storage_acl — regressão da ACL de LEITURA dos buckets privados de mídia do WhatsApp.
--
-- R2-DB-022 B1 (cartão t_5a58bbda). Prova, com roles/JWT/RLS REAIS (SET ROLE +
-- request.jwt.claim.sub, sem BYPASSRLS e sem inspeção textual de pg_policies como
-- evidência de acesso), que depois da migration a leitura de storage.objects nos
-- buckets whatsapp-media e audio-messages é autorizada SÓ pela propriedade canônica
-- do objeto (1º segmento do path = contact_id visível ao usuário) ou por
-- admin/supervisor — nunca por referência em public.messages.media_url.
--
-- FAIL-CLOSED sem o trigger irmão: a fronteira de escrita
-- (trg_guard_message_provenance_fields) NÃO existe nesta base e a policy de INSERT
-- de public.messages (20260925120000) não restringe sender/external_id/media_url.
-- Qualquer ramo que autorize por media_url é forjável por authenticated — por isso
-- o bloco (2) FORJA a referência como usuário real (o INSERT passa hoje) e prova
-- que mesmo assim o SELECT segue negado.
--
-- Como rodar (banco LOCAL da tarefa, com a migration aplicada):
--   zapp-db-local psql . <NOME_DO_BANCO> < este arquivo
-- Um RAISE EXCEPTION em qualquer asserção aborta o psql (ON_ERROR_STOP) com código != 0.

\set ON_ERROR_STOP on

-- ============================================================================
-- Identificadores fixos do cenário
-- ============================================================================
--   user_A        agente A (atacante), atribuído ao contact_A
--   user_B        agente B (dono legítimo), atribuído ao contact_B
--   user_unlinked usuário com perfil mas SEM contato atribuído
--   user_sup      supervisor (mantém o acesso já previsto, inclusive paths legados)
-- Objetos privados de B:
--   whatsapp-media/<contact_B>/image/secret.jpg              (canônico)
--   whatsapp-media/<contact_B>/image/20261006-recebida.jpg   (recebida no path do contato — caminho atual da ingestão)
--   whatsapp-media/<contact_B>/image/fwd-copia.jpg           (encaminhamento/cópia legítima no path do contato)
--   whatsapp-media/image/r2db022-b-legacy.jpg                (recebido legado SEM prefixo de contato)
--   whatsapp-media/document/r2db022-b-doc.pdf                (recebido legado SEM prefixo de contato)
--   audio-messages/audio/r2db022-b-legacy.ogg                (recebido legado SEM prefixo de contato)
--   audio-messages/<contact_B>/1759700000001.webm            (áudio canônico de B)
--   whatsapp-media/image/r2db022%evil.jpg                    (nome com '%' — não pode virar curinga)
-- Objetos próprios de A (caminhos REAIS de upload do app):
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
  uS uuid := 'eeeeeeee-0000-0000-0000-000000000004';
  v_pA uuid; v_pB uuid; v_pU uuid; v_pS uuid;
  cA uuid := 'aaaaaaaa-0000-0000-0000-000000000111';
  cB uuid := 'bbbbbbbb-0000-0000-0000-000000000222';
BEGIN
  -- limpeza de eventual execução anterior (idempotente; storage.objects não pode ser
  -- apagado direto por causa do trigger storage.protect_delete — usamos ON CONFLICT abaixo)
  DELETE FROM public.messages WHERE contact_id IN (cA, cB)
    OR external_id LIKE 'r2db022%';
  DELETE FROM public.contacts WHERE id IN (cA, cB);
  DELETE FROM public.user_roles WHERE user_id IN (uA, uB, uU, uS);
  DELETE FROM public.profiles WHERE user_id IN (uA, uB, uU, uS);
  DELETE FROM auth.users WHERE id IN (uA, uB, uU, uS);

  INSERT INTO auth.users (id, email, instance_id, aud, role, created_at, updated_at) VALUES
    (uA, 'r2db022-a@teste.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now(), now()),
    (uB, 'r2db022-b@teste.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now(), now()),
    (uU, 'r2db022-u@teste.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now(), now()),
    (uS, 'r2db022-s@teste.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now(), now());

  -- perfis criados automaticamente pelo trigger handle_new_user (on_auth_user_created)
  SELECT id INTO v_pA FROM public.profiles WHERE user_id = uA;
  SELECT id INTO v_pB FROM public.profiles WHERE user_id = uB;
  SELECT id INTO v_pU FROM public.profiles WHERE user_id = uU;
  SELECT id INTO v_pS FROM public.profiles WHERE user_id = uS;

  INSERT INTO public.user_roles (user_id, role) VALUES
    (uA, 'agent'), (uB, 'agent'), (uU, 'agent'), (uS, 'supervisor')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.contacts (id, name, phone, assigned_to) VALUES
    (cA, 'Contato A (r2db022)', '+550000000001', v_pA),
    (cB, 'Contato B (r2db022)', '+550000000002', v_pB);

  -- objetos privados de B + objetos próprios de A (caminhos reais do app) + edge cases
  INSERT INTO storage.objects (bucket_id, name) VALUES
    ('whatsapp-media', cB::text || '/image/secret.jpg'),
    ('whatsapp-media', cB::text || '/image/20261006-recebida.jpg'),
    ('whatsapp-media', cB::text || '/image/fwd-copia.jpg'),
    ('whatsapp-media', 'image/r2db022-b-legacy.jpg'),
    ('whatsapp-media', 'document/r2db022-b-doc.pdf'),
    ('audio-messages', 'audio/r2db022-b-legacy.ogg'),
    ('audio-messages', cB::text || '/1759700000001.webm'),
    ('whatsapp-media', 'image/r2db022%evil.jpg'),
    ('whatsapp-media', cA::text || '/image/own.jpg'),
    ('whatsapp-media', cA::text || '/01arz3ndektsv4rrffq69g5fav-foto.jpg'),
    ('audio-messages', cA::text || '/1759700000000.webm')
  ON CONFLICT DO NOTHING;

  -- mensagens RECEBIDAS legítimas de B (escritas como postgres = ingestão privilegiada):
  -- uma apontando para objeto NO PATH DO CONTATO e outra para path legado sem prefixo.
  -- A segunda prova que nem uma referência recebida REAL autoriza leitura de path legado:
  -- dentro da policy ela é indistinguível de uma forjada.
  INSERT INTO public.messages (contact_id, sender, content, message_type, media_url, external_id) VALUES
    (cB, 'contact', '[Imagem]', 'image',
     'https://exemplo.invalido/storage/v1/object/public/whatsapp-media/' || cB::text || '/image/20261006-recebida.jpg',
     'r2db022-recv-contatopath'),
    (cB, 'contact', '[Imagem]', 'image',
     'https://exemplo.invalido/storage/v1/object/public/whatsapp-media/image/r2db022-b-legacy.jpg',
     'r2db022-recv-legacy'),
    (cB, 'contact', '[Áudio]', 'audio',
     'https://exemplo.invalido/storage/v1/object/public/audio-messages/audio/r2db022-b-legacy.ogg',
     'r2db022-recv-legacy-audio');

  -- mensagem própria de A (agent) — alvo do UPDATE-forja do bloco (2)
  INSERT INTO public.messages (id, contact_id, sender, content, message_type, media_url)
  VALUES ('dddddddd-0000-0000-0000-000000000444', cA, 'agent', 'texto', 'text', NULL)
  ON CONFLICT DO NOTHING;
END $$;

-- ============================================================================
-- ASSERÇÕES (roles/JWT/RLS reais)
-- ============================================================================

-- (1) A (agente) NÃO enxerga os objetos privados de B — em nenhuma variante —
--     e enxerga os próprios nos caminhos reais que o app grava
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
   WHERE o.bucket_id='whatsapp-media' AND o.name='bbbbbbbb-0000-0000-0000-000000000222/image/20261006-recebida.jpg';
  IF c <> 0 THEN RAISE EXCEPTION 'FALHOU: A enxerga a mídia recebida de B no path do contato (count=%)', c; END IF;
  RAISE NOTICE 'PASS: A negado na mídia recebida de B (path do contato B)';

  SELECT count(*) INTO c FROM storage.objects o
   WHERE o.bucket_id='whatsapp-media' AND o.name='bbbbbbbb-0000-0000-0000-000000000222/image/fwd-copia.jpg';
  IF c <> 0 THEN RAISE EXCEPTION 'FALHOU: A enxerga a cópia de encaminhamento de B (count=%)', c; END IF;
  RAISE NOTICE 'PASS: A negado na cópia/encaminhamento de B';

  SELECT count(*) INTO c FROM storage.objects o
   WHERE o.bucket_id='whatsapp-media' AND o.name='image/r2db022-b-legacy.jpg';
  IF c <> 0 THEN RAISE EXCEPTION 'FALHOU: A enxerga a imagem recebida legada de B (count=%)', c; END IF;
  RAISE NOTICE 'PASS: A negado na imagem recebida legada de B';

  SELECT count(*) INTO c FROM storage.objects o
   WHERE o.bucket_id='whatsapp-media' AND o.name='document/r2db022-b-doc.pdf';
  IF c <> 0 THEN RAISE EXCEPTION 'FALHOU: A enxerga o documento recebido legado de B (count=%)', c; END IF;
  RAISE NOTICE 'PASS: A negado no documento recebido legado de B';

  SELECT count(*) INTO c FROM storage.objects o
   WHERE o.bucket_id='audio-messages' AND o.name='audio/r2db022-b-legacy.ogg';
  IF c <> 0 THEN RAISE EXCEPTION 'FALHOU: A enxerga o áudio recebido legado de B (count=%)', c; END IF;
  RAISE NOTICE 'PASS: A negado no áudio recebido legado de B';

  SELECT count(*) INTO c FROM storage.objects o
   WHERE o.bucket_id='audio-messages' AND o.name='bbbbbbbb-0000-0000-0000-000000000222/1759700000001.webm';
  IF c <> 0 THEN RAISE EXCEPTION 'FALHOU: A enxerga o áudio canônico de B (count=%)', c; END IF;
  RAISE NOTICE 'PASS: A negado no áudio canônico de B';

  -- '%' não vira curinga: A não lê o objeto com '%' no nome
  SELECT count(*) INTO c FROM storage.objects o
   WHERE o.bucket_id='whatsapp-media' AND o.name='image/r2db022%evil.jpg';
  IF c <> 0 THEN RAISE EXCEPTION 'FALHOU: A leu objeto com %% no nome (curinga) count=%', c; END IF;
  RAISE NOTICE 'PASS: A negado no objeto com %% no nome';

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

-- (2) FORJA DE REFERÊNCIA por authenticated NÃO compra leitura (fail-closed).
--     Sem o trigger irmão, os INSERTs/UPDATEs abaixo SÃO aceitos pela policy de
--     escrita de hoje — e é exatamente por isso que a policy de leitura não pode
--     confiar em messages.media_url. A prova: mesmo com a linha forjada gravada,
--     o SELECT de A segue negado.
DO $$
DECLARE
  v_ok boolean; v_err text; c integer;
BEGIN
  -- 2a. INSERT forjando origem recebida (sender='contact' + external_id + media_url de B).
  --     Hoje é aceito (fronteira de escrita aberta); se o cartão irmão fechar a escrita,
  --     o erro é capturado e a asserção essencial (leitura negada) continua valendo.
  v_ok := false; v_err := NULL;
  BEGIN
    INSERT INTO public.messages (contact_id, sender, content, message_type, media_url, external_id)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000111', 'contact', '[Imagem]', 'image',
            'https://exemplo.invalido/storage/v1/object/public/whatsapp-media/bbbbbbbb-0000-0000-0000-000000000222/image/secret.jpg',
            'r2db022-forja-a');
    v_ok := true;
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
  END;
  RAISE NOTICE 'INFO: INSERT forjado aceito=% %', v_ok, coalesce(v_err,'');

  -- se a linha forjada existe, ela está visível para A (contato cA é de A)
  SELECT count(*) INTO c FROM public.messages WHERE external_id = 'r2db022-forja-a';
  IF v_ok AND c <> 1 THEN RAISE EXCEPTION 'FALHOU: mensagem forjada não foi gravada (count=%)', c; END IF;

  -- e mesmo assim A NÃO lê o objeto de B
  SELECT count(*) INTO c FROM storage.objects o
   WHERE o.bucket_id='whatsapp-media' AND o.name='bbbbbbbb-0000-0000-0000-000000000222/image/secret.jpg';
  IF c <> 0 THEN RAISE EXCEPTION 'FALHOU: A leu o objeto de B após forjar referência INSERT (count=%)', c; END IF;
  RAISE NOTICE 'PASS: A segue negado no objeto de B após INSERT forjado';

  -- 2b. INSERT forjado apontando para objeto legado (sem prefixo) de B
  v_ok := false; v_err := NULL;
  BEGIN
    INSERT INTO public.messages (contact_id, sender, content, message_type, media_url, external_id)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000111', 'contact', '[Áudio]', 'audio',
            'https://exemplo.invalido/storage/v1/object/public/audio-messages/audio/r2db022-b-legacy.ogg',
            'r2db022-forja-a2');
    v_ok := true;
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
  END;
  SELECT count(*) INTO c FROM storage.objects o
   WHERE o.bucket_id='audio-messages' AND o.name='audio/r2db022-b-legacy.ogg';
  IF c <> 0 THEN RAISE EXCEPTION 'FALHOU: A leu áudio legado de B após forja (count=%)', c; END IF;
  RAISE NOTICE 'PASS: A segue negado no áudio legado de B após INSERT forjado (insert aceito=%)', v_ok;

  -- 2c. UPDATE do media_url de mensagem própria visível p/ apontar p/ objeto de B.
  --     Se a policy de UPDATE permitir, o vínculo muda; se não permitir, o erro é
  --     capturado. Nos DOIS casos a leitura tem de continuar negada.
  v_ok := false;
  BEGIN
    UPDATE public.messages
       SET media_url = 'https://exemplo.invalido/storage/v1/object/public/whatsapp-media/bbbbbbbb-0000-0000-0000-000000000222/image/secret.jpg'
     WHERE id = 'dddddddd-0000-0000-0000-000000000444';
    v_ok := true;
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
  END;
  SELECT count(*) INTO c FROM storage.objects o
   WHERE o.bucket_id='whatsapp-media' AND o.name='bbbbbbbb-0000-0000-0000-000000000222/image/secret.jpg';
  IF c <> 0 THEN RAISE EXCEPTION 'FALHOU: A leu o objeto de B após UPDATE forjado (count=%)', c; END IF;
  RAISE NOTICE 'PASS: A segue negado no objeto de B após UPDATE forjado (update aceito=% %)', v_ok, coalesce(v_err,'');
END $$;
RESET ROLE;

-- (3) B (dono legítimo) enxerga os próprios objetos no path do contato
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

  -- mídia recebida legítima no path do contato (caminho atual da ingestão)
  SELECT count(*) INTO c FROM storage.objects o
   WHERE o.bucket_id='whatsapp-media' AND o.name='bbbbbbbb-0000-0000-0000-000000000222/image/20261006-recebida.jpg';
  IF c <> 1 THEN RAISE EXCEPTION 'FALHOU: B não enxerga a própria mídia recebida no path do contato (count=%)', c; END IF;
  RAISE NOTICE 'PASS: B enxerga a própria mídia recebida no path do contato';

  -- encaminhamento/cópia legítima no path do contato
  SELECT count(*) INTO c FROM storage.objects o
   WHERE o.bucket_id='whatsapp-media' AND o.name='bbbbbbbb-0000-0000-0000-000000000222/image/fwd-copia.jpg';
  IF c <> 1 THEN RAISE EXCEPTION 'FALHOU: B não enxerga a cópia/encaminhamento no próprio path (count=%)', c; END IF;
  RAISE NOTICE 'PASS: B enxerga a cópia/encaminhamento no path do próprio contato';

  SELECT count(*) INTO c FROM storage.objects o
   WHERE o.bucket_id='audio-messages' AND o.name='bbbbbbbb-0000-0000-0000-000000000222/1759700000001.webm';
  IF c <> 1 THEN RAISE EXCEPTION 'FALHOU: B não enxerga o próprio áudio canônico (count=%)', c; END IF;
  RAISE NOTICE 'PASS: B enxerga o próprio áudio canônico';

  -- mídia recebida LEGADA sem prefixo de contato: negada até para B (fail-closed —
  -- referência recebida real é indistinguível de forjada dentro da policy)
  SELECT count(*) INTO c FROM storage.objects o
   WHERE o.bucket_id='whatsapp-media' AND o.name='image/r2db022-b-legacy.jpg';
  IF c <> 0 THEN RAISE EXCEPTION 'FALHOU: B leu imagem legada por referência em media_url (count=%)', c; END IF;
  RAISE NOTICE 'PASS: B negado na imagem legada sem prefixo (fail-closed, mesmo com mensagem recebida real)';

  SELECT count(*) INTO c FROM storage.objects o
   WHERE o.bucket_id='audio-messages' AND o.name='audio/r2db022-b-legacy.ogg';
  IF c <> 0 THEN RAISE EXCEPTION 'FALHOU: B leu áudio legado por referência em media_url (count=%)', c; END IF;
  RAISE NOTICE 'PASS: B negado no áudio legado sem prefixo (fail-closed)';

  -- B NÃO enxerga objetos do contato de A (nem mídia, nem áudio enviado)
  SELECT count(*) INTO c FROM storage.objects o
   WHERE o.bucket_id='whatsapp-media' AND o.name='aaaaaaaa-0000-0000-0000-000000000111/image/own.jpg';
  IF c <> 0 THEN RAISE EXCEPTION 'FALHOU: B enxergou objeto do contato de A (count=%)', c; END IF;
  RAISE NOTICE 'PASS: B negado no objeto do contato de A';

  SELECT count(*) INTO c FROM storage.objects o
   WHERE o.bucket_id='audio-messages' AND o.name='aaaaaaaa-0000-0000-0000-000000000111/1759700000000.webm';
  IF c <> 0 THEN RAISE EXCEPTION 'FALHOU: B enxergou áudio do contato de A (count=%)', c; END IF;
  RAISE NOTICE 'PASS: B negado no áudio do contato de A';

  -- '%' não vira curinga nem para o dono
  SELECT count(*) INTO c FROM storage.objects o
   WHERE o.bucket_id='whatsapp-media' AND o.name='image/r2db022%evil.jpg';
  IF c <> 0 THEN RAISE EXCEPTION 'FALHOU: B leu objeto com %% no nome (count=%)', c; END IF;
  RAISE NOTICE 'PASS: B negado no objeto com %% no nome';
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
   WHERE o.bucket_id='whatsapp-media' AND o.name='bbbbbbbb-0000-0000-0000-000000000222/image/secret.jpg';
  IF c <> 0 THEN RAISE EXCEPTION 'FALHOU: usuário sem vínculo enxergou objeto de B (count=%)', c; END IF;
  RAISE NOTICE 'PASS: usuário sem vínculo negado (canônico)';

  SELECT count(*) INTO c FROM storage.objects o
   WHERE o.bucket_id='whatsapp-media' AND o.name='image/r2db022-b-legacy.jpg';
  IF c <> 0 THEN RAISE EXCEPTION 'FALHOU: usuário sem vínculo enxergou legado de B (count=%)', c; END IF;
  RAISE NOTICE 'PASS: usuário sem vínculo negado (legado)';
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
     WHERE o.bucket_id='whatsapp-media' AND o.name='bbbbbbbb-0000-0000-0000-000000000222/image/secret.jpg';
  EXCEPTION WHEN insufficient_privilege THEN
    -- anon pode não ter GRANT de SELECT em tabelas referenciadas por outras
    -- policies (ex.: team_messages via policy TO public de team-chat-files);
    -- erro de permissão também é "negado" (fail-closed).
    c := 0;
  END;
  IF c <> 0 THEN RAISE EXCEPTION 'FALHOU: anon enxergou objeto privado (count=%)', c; END IF;
  RAISE NOTICE 'PASS: anon negado';
END $$;
RESET ROLE;

-- (6) supervisor mantém o acesso já previsto — inclusive nos paths legados
SET ROLE authenticated;
SET request.jwt.claim.sub = 'eeeeeeee-0000-0000-0000-000000000004';
SET request.jwt.claim.role = 'authenticated';
DO $$
DECLARE c integer;
BEGIN
  SELECT count(*) INTO c FROM storage.objects o
   WHERE o.bucket_id='whatsapp-media' AND o.name='bbbbbbbb-0000-0000-0000-000000000222/image/secret.jpg';
  IF c <> 1 THEN RAISE EXCEPTION 'FALHOU: supervisor não enxerga objeto de B (count=%)', c; END IF;
  RAISE NOTICE 'PASS: supervisor enxerga objeto de B';

  SELECT count(*) INTO c FROM storage.objects o
   WHERE o.bucket_id='whatsapp-media' AND o.name='image/r2db022-b-legacy.jpg';
  IF c <> 1 THEN RAISE EXCEPTION 'FALHOU: supervisor não enxerga legado de B (count=%)', c; END IF;
  RAISE NOTICE 'PASS: supervisor enxerga imagem legada (acesso já previsto mantido)';

  SELECT count(*) INTO c FROM storage.objects o
   WHERE o.bucket_id='audio-messages' AND o.name='audio/r2db022-b-legacy.ogg';
  IF c <> 1 THEN RAISE EXCEPTION 'FALHOU: supervisor não enxerga áudio legado de B (count=%)', c; END IF;
  RAISE NOTICE 'PASS: supervisor enxerga áudio legado';
END $$;
RESET ROLE;

-- ============================================================================
-- (7) Nenhuma policy SELECT residual baseada em referência reassociável
--     (media_url / LIKE / substring / position / replace) combinada por OR, e a
--     policy inteiramente baseada em media_url ("whatsapp media readable via
--     visible message") não existe mais.
-- ============================================================================
SET ROLE postgres;
DO $$
DECLARE c integer;
BEGIN
  -- a policy baseada em media_url foi removida
  SELECT count(*) INTO c FROM pg_policies
   WHERE schemaname='storage' AND tablename='objects'
     AND policyname = 'whatsapp media readable via visible message';
  IF c <> 0 THEN
    RAISE EXCEPTION 'FALHOU: policy "whatsapp media readable via visible message" ainda existe (count=%)', c;
  END IF;
  RAISE NOTICE 'PASS: policy baseada em media_url removida';

  -- as duas policies de locator canônico existem (SELECT)
  SELECT count(*) INTO c FROM pg_policies
   WHERE schemaname='storage' AND tablename='objects' AND cmd='SELECT'
     AND policyname IN ('Users can read assigned whatsapp media',
                        'Users can read assigned audio messages');
  IF c <> 2 THEN RAISE EXCEPTION 'FALHOU: esperava 2 policies de locator, achei %', c; END IF;
  RAISE NOTICE 'PASS: 2 policies de locator canônico presentes';

  -- exatamente UMA policy SELECT menciona cada bucket (o locator novo); qualquer
  -- policy permissiva residual combinada por OR apareceria aqui
  SELECT count(*) INTO c FROM pg_policies
   WHERE schemaname='storage' AND tablename='objects' AND cmd='SELECT'
     AND qual ~ 'whatsapp-media';
  IF c <> 1 THEN RAISE EXCEPTION 'FALHOU: % policies SELECT mencionam whatsapp-media (esperava 1)', c; END IF;
  SELECT count(*) INTO c FROM pg_policies
   WHERE schemaname='storage' AND tablename='objects' AND cmd='SELECT'
     AND qual ~ 'audio-messages';
  IF c <> 1 THEN RAISE EXCEPTION 'FALHOU: % policies SELECT mencionam audio-messages (esperava 1)', c; END IF;
  RAISE NOTICE 'PASS: exatamente 1 policy SELECT por bucket (sem residual combinada por OR)';

  -- nenhuma policy SELECT nesses buckets usa media_url nem comparação de padrão
  SELECT count(*) INTO c FROM pg_policies
   WHERE schemaname='storage' AND tablename='objects' AND cmd='SELECT'
     AND (qual ~ 'whatsapp-media' OR qual ~ 'audio-messages')
     AND (qual ~* 'media_url' OR qual ~ '~~' OR qual ~* 'position\('
          OR qual ~* 'substring\(' OR qual ~* 'replace\(' OR qual ~* 'right\(');
  IF c <> 0 THEN
    RAISE EXCEPTION 'FALHOU: % policy(s) SELECT residual(is) com media_url/pattern-match', c;
  END IF;
  RAISE NOTICE 'PASS: nenhuma policy SELECT residual baseada em media_url ou pattern-match';
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
  uS uuid := 'eeeeeeee-0000-0000-0000-000000000004';
  cA uuid := 'aaaaaaaa-0000-0000-0000-000000000111';
  cB uuid := 'bbbbbbbb-0000-0000-0000-000000000222';
BEGIN
  DELETE FROM public.messages WHERE contact_id IN (cA, cB) OR external_id LIKE 'r2db022%';
  DELETE FROM public.contacts WHERE id IN (cA, cB);
  DELETE FROM public.user_roles WHERE user_id IN (uA, uB, uU, uS);
  DELETE FROM public.profiles WHERE user_id IN (uA, uB, uU, uS);
  DELETE FROM auth.users WHERE id IN (uA, uB, uU, uS);
END $$;

\echo 'r2_db_022_storage_acl: TODAS AS ASSERÇÕES PASSARAM'
