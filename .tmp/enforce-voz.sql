\set ON_ERROR_STOP on
-- G2 voz: enforcement real das policies de storage no banco LOCAL da tarefa,
-- com papel `authenticated` (não admin). Tudo em UMA transação com ROLLBACK:
-- os fixtures sintéticos e os objetos não ficam no banco.
BEGIN;
DO $$
DECLARE
  v_prof       uuid;
  v_user       uuid := 'a0000000-0000-4000-8000-000000000001';
  v_cont       uuid;
  v_outro_user uuid := 'a0000000-0000-4000-8000-000000000002';
  v_outro_prof uuid := 'b0000000-0000-4000-8000-000000000002';
  v_n          int;
BEGIN
  -- fixtures sintéticos: dois usuários (um vinculado ao contato, outro não) —
  -- desfeitos pelo ROLLBACK no fim; o banco local começa sem seed de usuários.
  INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  VALUES (v_user, 'authenticated', 'authenticated', 'voz-g2-a@example.invalid', '', now(), now(), now()),
         (v_outro_user, 'authenticated', 'authenticated', 'voz-g2-b@example.invalid', '', now(), now(), now());
  -- o trigger de auth.users pode já criar o profile; garante o vínculo e o nome
  INSERT INTO public.profiles (id, user_id, name) VALUES (gen_random_uuid(), v_user, 'Atendente Voz G2')
  ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name RETURNING id INTO v_prof;
  INSERT INTO public.profiles (id, user_id, name) VALUES (v_outro_prof, v_outro_user, 'Outro Atendente G2')
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.contacts (name, phone, assigned_to)
  VALUES ('AAA Teste Voz G2', '5511900000001', v_prof) RETURNING id INTO v_cont;
  RAISE NOTICE 'fixtures: profile=% user=% contato=%', v_prof, v_user, v_cont;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  RAISE NOTICE 'auth.uid()=% (atendente vinculado ao contato)', auth.uid();

  -- T1: caminho NOVO (pasta do contato em audio-messages) é aceito
  BEGIN
    INSERT INTO storage.objects (id, bucket_id, name, owner, metadata)
    VALUES (gen_random_uuid(), 'audio-messages', v_cont::text || '/voice-changer_1750000000000.webm',
            v_user, '{"mimetype":"audio/webm"}'::jsonb);
    RAISE NOTICE 'PASS T1: atendente comum sobe audio-messages/<contato>/voice-changer_<ts>.webm';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE EXCEPTION 'FALHOU T1: upload no caminho novo recusado (needs_input: policy mudou?)';
  END;

  -- T2: caminho ANTIGO (audio-memes/voice-changer) é RECUSADO para não admin
  BEGIN
    INSERT INTO storage.objects (id, bucket_id, name, owner, metadata)
    VALUES (gen_random_uuid(), 'audio-memes', 'voice-changer/1750000000000_abc.mp3',
            v_user, '{"mimetype":"audio/mpeg"}'::jsonb);
    RAISE EXCEPTION 'FALHOU T2: atendente comum conseguiu subir audio-memes/voice-changer/...';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS T2: audio-memes/voice-changer/... recusado para atendente comum (row-level security)';
  END;

  -- T3: o atendente atribuído LÊ o objeto do caminho novo (locator assinado na leitura)
  SELECT count(*) INTO v_n FROM storage.objects
   WHERE bucket_id = 'audio-messages' AND name = v_cont::text || '/voice-changer_1750000000000.webm';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FALHOU T3: atendente atribuído não enxerga o objeto (n=%)', v_n; END IF;
  RAISE NOTICE 'PASS T3: atendente atribuído lê o próprio áudio (n=%)', v_n;

  -- T4: atendente de OUTRA conversa NÃO lê o áudio do cliente
  IF v_outro_user IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_outro_user, 'role', 'authenticated')::text, true);
    SELECT count(*) INTO v_n FROM storage.objects
     WHERE bucket_id = 'audio-messages' AND name = v_cont::text || '/voice-changer_1750000000000.webm';
    IF v_n <> 0 THEN RAISE EXCEPTION 'FALHOU T4: atendente não atribuído enxerga o áudio (n=%)', v_n; END IF;
    RAISE NOTICE 'PASS T4: outro atendente não lê o áudio (bucket privado, pasta do contato)';
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  ELSE
    RAISE NOTICE 'T4 pulado (só um usuário no banco local)';
  END IF;

  -- T5: não-regressão — o meme na própria pasta continua passando
  INSERT INTO storage.objects (id, bucket_id, name, owner, metadata)
  VALUES (gen_random_uuid(), 'audio-memes', v_user::text || '/meme_1.mp3', v_user, '{"mimetype":"audio/mpeg"}'::jsonb);
  RAISE NOTICE 'PASS T5: meme em audio-memes/<auth.uid()>/ segue permitido';

  -- T6: anon não escreve em audio-messages
  RESET ROLE;
  SET LOCAL ROLE anon;
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}'::text, true);
  BEGIN
    INSERT INTO storage.objects (id, bucket_id, name, owner, metadata)
    VALUES (gen_random_uuid(), 'audio-messages', v_cont::text || '/anon.webm', NULL, '{}'::jsonb);
    RAISE EXCEPTION 'FALHOU T6: anon escreveu em audio-messages';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS T6: anon não escreve em audio-messages';
  END;

  RAISE NOTICE 'ENFORCEMENT OK: 6 asserções (T1..T6) contra as policies reais, papel authenticated/anon';
END $$;
ROLLBACK;
