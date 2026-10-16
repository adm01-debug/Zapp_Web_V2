-- =====================================================================
-- Sussurro com audio — prova com o PAPEL REAL
-- =====================================================================
-- Roda no banco LOCAL da tarefa (Postgres de verdade, com as migrations
-- REAIS aplicadas, papeis anon/authenticated/service_role e auth.uid()
-- vindo de request.jwt.claims). Fixtures e assercoes numa transacao que
-- termina em ROLLBACK: zero efeito colateral, idempotente.
-- Nenhuma assercao executa como postgres: cada uma faz SET LOCAL ROLE do
-- papel real antes de tocar a tabela ou o objeto.
--
--   T1  citar objeto da PASTA DE OUTRO usuario e negado ....................... 23514
--   T2  apos a recusa, o objeto alheio continua ILEGIVEL para quem tentou ...... 0 linhas
--   T3  caminho de OUTRA conversa e negado ..................................... 23514
--   T4  caminho fora do formato <uid>/<conversa>/<arquivo> e negado ............ 23514
--   T5  objeto que nao e audio (application/pdf) e negado ...................... 23514
--   T6  objeto acima de 10 MiB e negado ........................................ 23514
--   T7  objeto que DECLARA duration acima de 300 s e negado .................... 23514
--   T8  objeto inexistente no bucket e negado .................................. 23514
--   T9  uso legitimo: audio proprio, conversa certa, entra .................... 1 linha
--   T10 o REMETENTE le o proprio audio ......................................... 1 linha
--   T11 o agente DESTINO le o audio ............................................ 1 linha
--   T12 terceiro que ENXERGA o contato NAO le o sussurro dos outros ............. 0 linhas
--   T13 admin/supervisor le .................................................... 1 linha
--   T14 anonimo nao le ......................................................... 0/negado
--   T15 terceiro nao apaga o audio do remetente ................................ 0 linhas
--   T16 o proprio remetente apaga o audio que subiu ............................. 1 linha
--
-- Uso: zapp-db-local psql . <nome-do-banco> < supabase/tests/whisper_audio_path.sql
-- (sai != 0 com "PROVA FALHOU" quando qualquer verificacao falha)
\set ON_ERROR_STOP on

BEGIN;

-- ---------------------------------------------------------------- fixtures
-- Inseridos como postgres (dono das tabelas, sem RLS). UUIDs e telefones
-- sinteticos. O gatilho on_auth_user_created cria a linha de public.profiles.
DO $fixture$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = '00000000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'fixture: identidade do admin semeado ausente; rode este arquivo no banco local da tarefa (zapp-db-local)';
  END IF;
END $fixture$;

-- A partir daqui a sessao age como o admin SEMEADO (mesma identidade do
-- `seed.sql`): e o que o gatilho prevent_profile_privilege_escalation exige
-- para gravar role/access_level/permissions nas fixtures. Cada assercao troca
-- os claims adiante.
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

INSERT INTO auth.users (id, email, is_sso_user, is_anonymous) VALUES
  ('11111111-1111-4111-8111-111111111111','sussurro.a@example.test',false,false),
  ('22222222-2222-4222-8222-222222222222','sussurro.b@example.test',false,false),
  ('33333333-3333-4333-8333-333333333333','sussurro.c@example.test',false,false),
  ('44444444-4444-4444-8444-444444444444','sussurro.d@example.test',false,false);

UPDATE public.profiles SET name='Agente A', role='agent', access_level='basic',
       permissions='[]'::jsonb, can_download=false
 WHERE user_id='11111111-1111-4111-8111-111111111111';
UPDATE public.profiles SET name='Agente B', role='agent', access_level='basic',
       permissions='[]'::jsonb, can_download=false
 WHERE user_id='22222222-2222-4222-8222-222222222222';
UPDATE public.profiles SET name='Supervisor C', role='supervisor', access_level='basic',
       permissions='[]'::jsonb, can_download=false
 WHERE user_id='33333333-3333-4333-8333-333333333333';
UPDATE public.profiles SET name='Agente D', role='agent', access_level='basic',
       permissions='[]'::jsonb, can_download=false
 WHERE user_id='44444444-4444-4444-8444-444444444444';

INSERT INTO public.user_roles (user_id, role) VALUES ('33333333-3333-4333-8333-333333333333','supervisor');

-- Fila 1 com A e D: D ENXERGA o contato A sem ser responsavel nem destino.
INSERT INTO public.queues (id, name, color) VALUES
  ('d0000000-0000-4000-8000-000000000001','Fila da prova','#3B82F6');

INSERT INTO public.queue_members (queue_id, profile_id, is_active) VALUES
  ('d0000000-0000-4000-8000-000000000001',
   (SELECT id FROM public.profiles WHERE user_id='11111111-1111-4111-8111-111111111111'), true),
  ('d0000000-0000-4000-8000-000000000001',
   (SELECT id FROM public.profiles WHERE user_id='22222222-2222-4222-8222-222222222222'), true),
  ('d0000000-0000-4000-8000-000000000001',
   (SELECT id FROM public.profiles WHERE user_id='44444444-4444-4444-8444-444444444444'), true);

INSERT INTO public.contacts (id, name, phone, conversation_status, is_lid_legacy,
                             queue_id, assigned_to, created_at, updated_at) VALUES
  ('c0000000-0000-4000-8000-00000000000a','Contato A','5500000000011','open',false,
   'd0000000-0000-4000-8000-000000000001',
   (SELECT id FROM public.profiles WHERE user_id='11111111-1111-4111-8111-111111111111'), now(), now()),
  ('c0000000-0000-4000-8000-00000000000b','Contato B','5500000000012','open',false,
   NULL,
   (SELECT id FROM public.profiles WHERE user_id='22222222-2222-4222-8222-222222222222'), now(), now());

-- Objetos no bucket privado `audio-messages`, no formato <uid>/<conversa>/<uuid>.
--   obj_a      audio do agente A na conversa A        (o caso legitimo)
--   obj_a2     audio do agente B na conversa A        (objeto ALHEIO na pasta de B)
--   obj_b      audio do agente B na conversa B
--   obj_b_em_a audio do agente A com a conversa B     (conversa != contact_id da linha)
--   obj_4seg   quatro segmentos                       (fora do formato)
--   obj_pdf    mimetype application/pdf
--   obj_big    20 MiB
--   obj_long   declara duration = 600 s
INSERT INTO storage.objects (id, bucket_id, name, owner, created_at, updated_at, metadata) VALUES
  ('0d000000-0000-4000-8000-000000000001','audio-messages',
   '11111111-1111-4111-8111-111111111111/c0000000-0000-4000-8000-00000000000a/0a000000-0000-4000-8000-000000000001.webm',
   '11111111-1111-4111-8111-111111111111', now(), now(),
   '{"size":"1024","mimetype":"audio/webm"}'::jsonb),
  ('0d000000-0000-4000-8000-000000000002','audio-messages',
   '22222222-2222-4222-8222-222222222222/c0000000-0000-4000-8000-00000000000a/0a000000-0000-4000-8000-000000000002.webm',
   '22222222-2222-4222-8222-222222222222', now(), now(),
   '{"size":"1024","mimetype":"audio/webm"}'::jsonb),
  ('0d000000-0000-4000-8000-000000000003','audio-messages',
   '22222222-2222-4222-8222-222222222222/c0000000-0000-4000-8000-00000000000b/0b000000-0000-4000-8000-000000000001.webm',
   '22222222-2222-4222-8222-222222222222', now(), now(),
   '{"size":"1024","mimetype":"audio/webm"}'::jsonb),
  ('0d000000-0000-4000-8000-000000000004','audio-messages',
   '11111111-1111-4111-8111-111111111111/c0000000-0000-4000-8000-00000000000b/0b000000-0000-4000-8000-000000000002.webm',
   '11111111-1111-4111-8111-111111111111', now(), now(),
   '{"size":"1024","mimetype":"audio/webm"}'::jsonb),
  ('0d000000-0000-4000-8000-000000000005','audio-messages',
   '11111111-1111-4111-8111-111111111111/c0000000-0000-4000-8000-00000000000a/extra/file.webm',
   '11111111-1111-4111-8111-111111111111', now(), now(),
   '{"size":"1024","mimetype":"audio/webm"}'::jsonb),
  ('0d000000-0000-4000-8000-000000000006','audio-messages',
   '11111111-1111-4111-8111-111111111111/c0000000-0000-4000-8000-00000000000a/0a000000-0000-4000-8000-000000000003.pdf',
   '11111111-1111-4111-8111-111111111111', now(), now(),
   '{"size":"1024","mimetype":"application/pdf"}'::jsonb),
  ('0d000000-0000-4000-8000-000000000007','audio-messages',
   '11111111-1111-4111-8111-111111111111/c0000000-0000-4000-8000-00000000000a/0a000000-0000-4000-8000-000000000004.webm',
   '11111111-1111-4111-8111-111111111111', now(), now(),
   '{"size":"20971520","mimetype":"audio/webm"}'::jsonb),
  ('0d000000-0000-4000-8000-000000000008','audio-messages',
   '11111111-1111-4111-8111-111111111111/c0000000-0000-4000-8000-00000000000a/0a000000-0000-4000-8000-000000000005.webm',
   '11111111-1111-4111-8111-111111111111', now(), now(),
   '{"size":"2048","mimetype":"audio/webm","duration":"600"}'::jsonb);

-- Sussurro de AUDIO da conversa A: remetente A, destino B, apontando o audio de A.
-- A sessao volta a ficar SEM identidade (auth.uid() nulo) porque quem grava a fixture
-- aqui e o dono das tabelas, nao o agente A: o gatilho so cobra "pasta do remetente".
SELECT set_config('request.jwt.claims','{}', true);
INSERT INTO public.whisper_messages (id, contact_id, sender_id, target_agent_id, content, audio_path, created_at) VALUES
  ('ee000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-00000000000a',
   (SELECT id FROM public.profiles WHERE user_id='11111111-1111-4111-8111-111111111111'),
   (SELECT id FROM public.profiles WHERE user_id='22222222-2222-4222-8222-222222222222'),
   '', '11111111-1111-4111-8111-111111111111/c0000000-0000-4000-8000-00000000000a/0a000000-0000-4000-8000-000000000001.webm', now());

-- ---------------------------------------------------------------- assercoes
DO $prova$
DECLARE
  v_falhas integer := 0;
  v_n      integer;
  v_msg    text;
  v_state  text;
  v_negado boolean;
  v_perfil_a uuid := (SELECT id FROM public.profiles WHERE user_id='11111111-1111-4111-8111-111111111111');
  v_perfil_b uuid := (SELECT id FROM public.profiles WHERE user_id='22222222-2222-4222-8222-222222222222');
  v_uid_a constant text := '11111111-1111-4111-8111-111111111111';
  v_uid_b constant text := '22222222-2222-4222-8222-222222222222';
  v_uid_c constant text := '33333333-3333-4333-8333-333333333333';
  v_uid_d constant text := '44444444-4444-4444-8444-444444444444';
  v_conv_a constant text := 'c0000000-0000-4000-8000-00000000000a';
  v_conv_b constant text := 'c0000000-0000-4000-8000-00000000000b';
  v_obj_a  constant text := '11111111-1111-4111-8111-111111111111/c0000000-0000-4000-8000-00000000000a/0a000000-0000-4000-8000-000000000001.webm';
  v_obj_a2 constant text := '22222222-2222-4222-8222-222222222222/c0000000-0000-4000-8000-00000000000a/0a000000-0000-4000-8000-000000000002.webm';
BEGIN

  -- helper: garante que a assercao termina sem papel trocado
  -- (cada bloco faz SET LOCAL ROLE authenticated e RESET ROLE no fim)

  ------------------------------------------------- T1 objeto da pasta de OUTRO
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims','{"sub":"'||v_uid_a||'","role":"authenticated"}', true);
    v_negado := false;
    BEGIN
      INSERT INTO public.whisper_messages (id, contact_id, sender_id, target_agent_id, content, audio_path)
      VALUES ('ee000000-0000-4000-8000-000000000011', v_conv_a::uuid, v_perfil_a, v_perfil_b, '', v_obj_a2);
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
      v_negado := (v_state = '23514');
    END;
    RESET ROLE;
    IF v_negado THEN
      RAISE NOTICE 'T1 OK    citar objeto da pasta de OUTRO usuario e negado (23514)';
    ELSE
      v_falhas := v_falhas + 1;
      RAISE NOTICE 'T1 FALHOU citar objeto alheio passou (state=%, msg=%)', v_state, v_msg;
    END IF;
  END;

  ------------------------------------------------- T2 o objeto alheio continua fechado
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims','{"sub":"'||v_uid_a||'","role":"authenticated"}', true);
    SELECT count(*) INTO v_n FROM storage.objects WHERE name = v_obj_a2;
    RESET ROLE;
    IF v_n = 0 THEN
      RAISE NOTICE 'T2 OK    o objeto alheio continua ILEGIVEL para quem tentou (0 linhas)';
    ELSE
      v_falhas := v_falhas + 1;
      RAISE NOTICE 'T2 FALHOU objeto alheio ficou legivel (% linhas)', v_n;
    END IF;
  END;

  ------------------------------------------------- T3 conversa diferente da linha
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims','{"sub":"'||v_uid_a||'","role":"authenticated"}', true);
    v_negado := false;
    BEGIN
      INSERT INTO public.whisper_messages (id, contact_id, sender_id, target_agent_id, content, audio_path)
      VALUES ('ee000000-0000-4000-8000-000000000012', v_conv_a::uuid, v_perfil_a, v_perfil_b, '',
              v_uid_a||'/'||v_conv_b||'/0b000000-0000-4000-8000-000000000002.webm');
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
      v_negado := (v_state = '23514');
    END;
    RESET ROLE;
    IF v_negado THEN
      RAISE NOTICE 'T3 OK    caminho de OUTRA conversa e negado (23514)';
    ELSE
      v_falhas := v_falhas + 1;
      RAISE NOTICE 'T3 FALHOU caminho de outra conversa passou (state=%, msg=%)', v_state, v_msg;
    END IF;
  END;

  ------------------------------------------------- T4 fora do formato
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims','{"sub":"'||v_uid_a||'","role":"authenticated"}', true);
    v_negado := false;
    BEGIN
      INSERT INTO public.whisper_messages (id, contact_id, sender_id, target_agent_id, content, audio_path)
      VALUES ('ee000000-0000-4000-8000-000000000013', v_conv_a::uuid, v_perfil_a, v_perfil_b, '',
              v_uid_a||'/'||v_conv_a||'/extra/file.webm');
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
      v_negado := (v_state = '23514');
    END;
    RESET ROLE;
    IF v_negado THEN
      RAISE NOTICE 'T4 OK    caminho fora do formato <uid>/<conversa>/<arquivo> e negado (23514)';
    ELSE
      v_falhas := v_falhas + 1;
      RAISE NOTICE 'T4 FALHOU caminho de 4 segmentos passou (state=%, msg=%)', v_state, v_msg;
    END IF;
  END;

  ------------------------------------------------- T5 objeto que nao e audio
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims','{"sub":"'||v_uid_a||'","role":"authenticated"}', true);
    v_negado := false;
    BEGIN
      INSERT INTO public.whisper_messages (id, contact_id, sender_id, target_agent_id, content, audio_path)
      VALUES ('ee000000-0000-4000-8000-000000000014', v_conv_a::uuid, v_perfil_a, v_perfil_b, '',
              v_uid_a||'/'||v_conv_a||'/0a000000-0000-4000-8000-000000000003.pdf');
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
      v_negado := (v_state = '23514');
    END;
    RESET ROLE;
    IF v_negado THEN
      RAISE NOTICE 'T5 OK    objeto que nao e audio (application/pdf) e negado (23514)';
    ELSE
      v_falhas := v_falhas + 1;
      RAISE NOTICE 'T5 FALHOU objeto nao-audio passou (state=%, msg=%)', v_state, v_msg;
    END IF;
  END;

  ------------------------------------------------- T6 acima do teto de tamanho
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims','{"sub":"'||v_uid_a||'","role":"authenticated"}', true);
    v_negado := false;
    BEGIN
      INSERT INTO public.whisper_messages (id, contact_id, sender_id, target_agent_id, content, audio_path)
      VALUES ('ee000000-0000-4000-8000-000000000015', v_conv_a::uuid, v_perfil_a, v_perfil_b, '',
              v_uid_a||'/'||v_conv_a||'/0a000000-0000-4000-8000-000000000004.webm');
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
      v_negado := (v_state = '23514');
    END;
    RESET ROLE;
    IF v_negado THEN
      RAISE NOTICE 'T6 OK    objeto acima de 10 MiB e negado (23514)';
    ELSE
      v_falhas := v_falhas + 1;
      RAISE NOTICE 'T6 FALHOU objeto acima do teto passou (state=%, msg=%)', v_state, v_msg;
    END IF;
  END;

  ------------------------------------------------- T7 duration declarada acima de 300 s
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims','{"sub":"'||v_uid_a||'","role":"authenticated"}', true);
    v_negado := false;
    BEGIN
      INSERT INTO public.whisper_messages (id, contact_id, sender_id, target_agent_id, content, audio_path)
      VALUES ('ee000000-0000-4000-8000-000000000016', v_conv_a::uuid, v_perfil_a, v_perfil_b, '',
              v_uid_a||'/'||v_conv_a||'/0a000000-0000-4000-8000-000000000005.webm');
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
      v_negado := (v_state = '23514');
    END;
    RESET ROLE;
    IF v_negado THEN
      RAISE NOTICE 'T7 OK    objeto que DECLARA duration acima de 300 s e negado (23514)';
    ELSE
      v_falhas := v_falhas + 1;
      RAISE NOTICE 'T7 FALHOU duration declarada acima do teto passou (state=%, msg=%)', v_state, v_msg;
    END IF;
  END;

  ------------------------------------------------- T8 objeto inexistente
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims','{"sub":"'||v_uid_a||'","role":"authenticated"}', true);
    v_negado := false;
    BEGIN
      INSERT INTO public.whisper_messages (id, contact_id, sender_id, target_agent_id, content, audio_path)
      VALUES ('ee000000-0000-4000-8000-000000000017', v_conv_a::uuid, v_perfil_a, v_perfil_b, '',
              v_uid_a||'/'||v_conv_a||'/0a000000-0000-4000-8000-0000000000ff.webm');
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
      v_negado := (v_state = '23514');
    END;
    RESET ROLE;
    IF v_negado THEN
      RAISE NOTICE 'T8 OK    objeto inexistente no bucket e negado (23514)';
    ELSE
      v_falhas := v_falhas + 1;
      RAISE NOTICE 'T8 FALHOU objeto inexistente passou (state=%, msg=%)', v_state, v_msg;
    END IF;
  END;

  ------------------------------------------------- T9 uso legitimo (audio proprio, conversa certa)
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims','{"sub":"'||v_uid_a||'","role":"authenticated"}', true);
    v_negado := false;
    BEGIN
      INSERT INTO public.whisper_messages (id, contact_id, sender_id, target_agent_id, content, audio_path, created_at)
      VALUES ('ee000000-0000-4000-8000-000000000021', v_conv_a::uuid, v_perfil_a, v_perfil_b, '', v_obj_a, now());
      v_negado := true;
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    END;
    RESET ROLE;
    IF v_negado THEN
      RAISE NOTICE 'T9 OK    uso legitimo entra (1 linha)';
    ELSE
      v_falhas := v_falhas + 1;
      RAISE NOTICE 'T9 FALHOU uso legitimo foi negado (state=%, msg=%)', v_state, v_msg;
    END IF;
  END;

  ------------------------------------------------- T10 remetente le o proprio audio
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims','{"sub":"'||v_uid_a||'","role":"authenticated"}', true);
    SELECT count(*) INTO v_n FROM storage.objects WHERE name = v_obj_a;
    RESET ROLE;
    IF v_n = 1 THEN
      RAISE NOTICE 'T10 OK   o REMETENTE le o proprio audio (1 linha)';
    ELSE
      v_falhas := v_falhas + 1;
      RAISE NOTICE 'T10 FALHOU remetente leu % linha(s)', v_n;
    END IF;
  END;

  ------------------------------------------------- T11 destino le o audio do sussurro
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims','{"sub":"'||v_uid_b||'","role":"authenticated"}', true);
    SELECT count(*) INTO v_n FROM storage.objects WHERE name = v_obj_a;
    RESET ROLE;
    IF v_n = 1 THEN
      RAISE NOTICE 'T11 OK   o agente DESTINO le o audio do sussurro (1 linha)';
    ELSE
      v_falhas := v_falhas + 1;
      RAISE NOTICE 'T11 FALHOU destino leu % linha(s)', v_n;
    END IF;
  END;

  ------------------------------------------------- T12 terceiro que enxerga o contato
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims','{"sub":"'||v_uid_d||'","role":"authenticated"}', true);
    SELECT count(*) INTO v_n FROM storage.objects WHERE name = v_obj_a;
    RESET ROLE;
    IF v_n = 0 THEN
      RAISE NOTICE 'T12 OK   terceiro que ENXERGA o contato NAO le o sussurro dos outros (0 linhas)';
    ELSE
      v_falhas := v_falhas + 1;
      RAISE NOTICE 'T12 FALHOU terceiro leu % linha(s)', v_n;
    END IF;
  END;

  ------------------------------------------------- T13 supervisor le
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims','{"sub":"'||v_uid_c||'","role":"authenticated"}', true);
    SELECT count(*) INTO v_n FROM storage.objects WHERE name = v_obj_a;
    RESET ROLE;
    IF v_n = 1 THEN
      RAISE NOTICE 'T13 OK   admin/supervisor le (1 linha)';
    ELSE
      v_falhas := v_falhas + 1;
      RAISE NOTICE 'T13 FALHOU supervisor leu % linha(s)', v_n;
    END IF;
  END;

  ------------------------------------------------- T14 anonimo
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM set_config('request.jwt.claims','{"sub":"'||v_uid_d||'","role":"anon"}', true);
    v_negado := false;
    BEGIN
      SELECT count(*) INTO v_n FROM storage.objects WHERE name = v_obj_a;
      v_negado := (v_n = 0);
    EXCEPTION WHEN OTHERS THEN
      v_negado := true;
    END;
    RESET ROLE;
    IF v_negado THEN
      RAISE NOTICE 'T14 OK   anonimo nao le (0/negado)';
    ELSE
      v_falhas := v_falhas + 1;
      RAISE NOTICE 'T14 FALHOU anonimo leu % linha(s)', v_n;
    END IF;
  END;

  ------------------------------------------------- T15 terceiro nao apaga
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims','{"sub":"'||v_uid_d||'","role":"authenticated"}', true);
    PERFORM set_config('storage.allow_delete_query','true', true);
    v_negado := false;
    BEGIN
      DELETE FROM storage.objects WHERE name = v_obj_a;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_negado := (v_n = 0);
    EXCEPTION WHEN OTHERS THEN
      v_negado := true;
    END;
    RESET ROLE;
    IF v_negado THEN
      RAISE NOTICE 'T15 OK   terceiro NAO apaga o audio do remetente (0 linhas)';
    ELSE
      v_falhas := v_falhas + 1;
      RAISE NOTICE 'T15 FALHOU terceiro apagou % linha(s)', v_n;
    END IF;
  END;

  ------------------------------------------------- T16 o proprio remetente apaga
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims','{"sub":"'||v_uid_a||'","role":"authenticated"}', true);
    PERFORM set_config('storage.allow_delete_query','true', true);
    v_n := 0;
    BEGIN
      DELETE FROM storage.objects WHERE name = v_obj_a;
      GET DIAGNOSTICS v_n = ROW_COUNT;
    EXCEPTION WHEN OTHERS THEN
      v_n := -1;
    END;
    RESET ROLE;
    IF v_n = 1 THEN
      RAISE NOTICE 'T16 OK   o proprio remetente apaga o audio que subiu (1 linha)';
    ELSE
      v_falhas := v_falhas + 1;
      RAISE NOTICE 'T16 FALHOU remetente apagou % linha(s)', v_n;
    END IF;
  END;

  IF v_falhas > 0 THEN
    RAISE EXCEPTION 'PROVA FALHOU: % verificacao(oes) nao passaram', v_falhas;
  END IF;
  RAISE NOTICE 'PROVA OK: 16 de 16 verificacoes passaram';
END $prova$;

ROLLBACK;
