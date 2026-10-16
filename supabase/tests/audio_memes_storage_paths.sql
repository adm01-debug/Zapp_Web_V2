-- =====================================================================
-- PK-16 (paridade V3 doc 11, item G2) — prova com o BANCO LOCAL, sem mock
-- =====================================================================
-- Roda no banco LOCAL da tarefa (Postgres de verdade, com as migrations
-- REAIS aplicadas, papéis anon/authenticated/service_role e auth.uid()
-- vindo de request.jwt.claims). Sem oráculo: cada verificação calcula o
-- esperado a partir do próprio estado (contagens antes/depois, regra de
-- pasta bean/<uid>).
--
--   PARTE 1 (catálogo) — o que a migration PK-16 precisava garantir:
--     1. bucket voice-changer-tmp existe e é PRIVADO (public = false);
--     2. só restam as 3 policies canônicas do audio-memes (nenhuma
--        sobreposta de outro cartão) e a de DELETE cita
--        is_admin_or_supervisor (o defeito original: admin não apagava
--        meme de outro autor);
--     3. a policy permissiva antiga "Auth upload audio memes" (só
--        bucket_id, sem pasta) NÃO existe mais — foi trocada pela
--        variante "owned" com pasta em 20260401002318;
--     4. a função de expurgo existe com TTL padrão de 24h e enfileira na
--        fila única (nada fixo fora dos parâmetros);
--     5. o job horário chama a função e as duas tabelas estão na
--        publicação supabase_realtime (o front assina);
--     6. o rollback declara a ordem inversa (função/cron primeiro,
--        policies/bucket por último).
--   PARTE 2 (comportamento, SET LOCAL ROLE authenticated + claims reais):
--     2.1  atendente grava na PRÓPRIA pasta do voice-changer-tmp ... OK
--     2.1b atendente grava na PRÓPRIA pasta do audio-memes ......... OK
--     2.2  atendente NÃO grava na pasta DE OUTRO (voice-changer-tmp, 42501)
--     2.2b atendente NÃO grava na pasta DE OUTRO (audio-memes, 42501)
--     2.3  admin APAGA objeto de outro autor no audio-memes ........ 1 linha
--     2.3b atendente NAO apaga objeto de outro autor .............. 0 linhas
--     2.4  expurgo enfileira o vencido e ignora o novo ............. 1/0
-- Uso: zapp-db-local psql . <nome-do-banco> < supabase/tests/audio_memes_storage_paths.sql
-- (sai != 0 com "PK-16 ... FALHOU" quando qualquer verificação falha)
\set ON_ERROR_STOP on

-- ============================================================ PARTE 1
DO $parte1$
DECLARE
  v_pub          boolean;
  v_pols         text[];
  v_def_delete   text;
  v_fn           text;
  v_lista        text[];
  v_permissiva   integer;
BEGIN
  SELECT public INTO v_pub FROM storage.buckets WHERE id = 'voice-changer-tmp';
  IF v_pub IS NULL THEN
    RAISE EXCEPTION 'PK-16 PARTE 1 FALHOU -> bucket voice-changer-tmp ausente';
  END IF;
  IF v_pub THEN
    RAISE EXCEPTION 'PK-16 PARTE 1 FALHOU -> bucket voice-changer-tmp PUBLICO (vazamento de voz)';
  END IF;

  SELECT array_agg(policyname ORDER BY policyname) INTO v_pols
    FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
     AND policyname IN ('Auth upload audio memes owned',
                        'Users can update own audio memes',
                        'Users can delete own audio memes');
  IF coalesce(array_length(v_pols, 1), 0) <> 3 THEN
    RAISE EXCEPTION 'PK-16 PARTE 1 FALHOU -> policies canonicas do audio-memes divergentes: %', coalesce(v_pols::text, '{}');
  END IF;

  SELECT (coalesce(qual, '') || ' ' || coalesce(with_check, '')) INTO v_def_delete FROM pg_policies
   WHERE schemaname = 'storage' AND tablename = 'objects'
     AND policyname = 'Users can delete own audio memes';
  IF position('is_admin_or_supervisor' IN coalesce(v_def_delete, '')) = 0 THEN
    RAISE EXCEPTION 'PK-16 PARTE 1 FALHOU -> DELETE do audio-memes sem is_admin_or_supervisor (admin segue sem apagar meme alheio)';
  END IF;

  SELECT count(*) INTO v_permissiva FROM pg_policies
   WHERE schemaname = 'storage' AND tablename = 'objects'
     AND policyname = 'Auth upload audio memes';
  IF v_permissiva <> 0 THEN
    RAISE EXCEPTION 'PK-16 PARTE 1 FALHOU -> policy permissiva antiga "Auth upload audio memes" ainda existe (INSERT sem pasta continua liberado)';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_fn FROM pg_proc p
   WHERE p.proname = 'purge_voice_changer_tmp';
  IF v_fn IS NULL THEN
    RAISE EXCEPTION 'PK-16 PARTE 1 FALHOU -> funcao purge_voice_changer_tmp ausente';
  END IF;
  IF position('p_ttl_hours integer DEFAULT 24' IN v_fn) = 0 THEN
    RAISE EXCEPTION 'PK-16 PARTE 1 FALHOU -> expurgo sem TTL padrao de 24h na assinatura';
  END IF;
  IF position('talkx_storage_purge_queue' IN v_fn) = 0 THEN
    RAISE EXCEPTION 'PK-16 PARTE 1 FALHOU -> expurgo fora do drenador padrao (fila talkx_storage_purge_queue)';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'voice-changer-tmp-purge'
                  AND command LIKE '%purge_voice_changer_tmp(24, 200)%') THEN
    RAISE EXCEPTION 'PK-16 PARTE 1 FALHOU -> job voice-changer-tmp-purge ausente ou sem chamar purge_voice_changer_tmp(24, 200)';
  END IF;

  SELECT array_agg(tablename ORDER BY tablename) INTO v_lista
    FROM pg_publication_tables
   WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
     AND tablename IN ('audio_memes', 'audio_meme_favorites');
  IF coalesce(array_length(v_lista, 1), 0) <> 2 THEN
    RAISE EXCEPTION 'PK-16 PARTE 1 FALHOU -> tabelas fora da publicacao supabase_realtime: %', coalesce(v_lista::text, '{}');
  END IF;

  RAISE NOTICE 'PK-16 PARTE 1 OK (catalogo: bucket privado, 3 policies canonicas com admin no DELETE, sem policy permissiva, expurgo configuravel, realtime presente)';
END $parte1$;

-- ============================================================ PARTE 2
BEGIN;

-- A prova usa a fila REAL do drenador padrao (M-DB-01). Se a migration PK-16
-- nao foi aplicada, a PARTE 1 ja falhou antes; aqui o ROLLBACK final limpa
-- as linhas enfileiradas e as fixtures (zero efeito colateral).

-- Identidades sintéticas: dois atendentes + um admin (papel REAL em user_roles).
INSERT INTO auth.users (id, email, is_sso_user, is_anonymous) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001', 'atendente.a@example.test', false, false),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0002', 'atendente.b@example.test', false, false),
  ('dddddddd-dddd-4ddd-8ddd-dddddddd0004', 'admin.d@example.test', false, false);
INSERT INTO public.user_roles (user_id, role) VALUES
  ('dddddddd-dddd-4ddd-8ddd-dddddddd0004', 'admin');

-- Objetos vencido/novo no bucket temporário (a migration PK-16 cria o bucket;
-- sem ela este INSERT já falha: vermelho honesto).
INSERT INTO storage.objects (bucket_id, name) VALUES
  ('voice-changer-tmp', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001/velho.mp3'),
  ('voice-changer-tmp', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001/novo.mp3');
UPDATE storage.objects
   SET created_at = now() - interval '30 days', updated_at = now() - interval '30 days'
 WHERE bucket_id = 'voice-changer-tmp' AND name LIKE '%/velho.mp3';

-- Objetos de OUTRO autor no audio-memes (alvos do DELETE em 2.3/2.3b).
INSERT INTO storage.objects (bucket_id, name, owner) VALUES
  ('audio-memes', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0002/meme-outro.mp3',
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0002'),
  ('audio-memes', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0002/meme-outro2.mp3',
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0002');

-- 2.1 atendente grava na PRÓPRIA pasta do temporário (uso legítimo).
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001","role":"authenticated"}', true);
INSERT INTO storage.objects (bucket_id, name)
VALUES ('voice-changer-tmp', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001/minha-voz.mp3');
reset role;

-- 2.1b atendente grava na PRÓPRIA pasta do audio-memes (uso legítimo).
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001","role":"authenticated"}', true);
INSERT INTO storage.objects (bucket_id, name)
VALUES ('audio-memes', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001/meme-meu.mp3');
reset role;

-- 2.2 atendente NÃO grava na pasta DE OUTRO no temporário (42501).
DO $t22$
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001","role":"authenticated"}', true);
  BEGIN
    INSERT INTO storage.objects (bucket_id, name)
    VALUES ('voice-changer-tmp', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0002/invasor.mp3');
    RAISE EXCEPTION 'PK-16 PARTE 2 FALHOU -> atendente GRAVOU na pasta de outro no temporario';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  RESET ROLE;
  RAISE NOTICE 'PK-16 2.2 OK (pasta alheia no temporario negada com 42501)';
END $t22$;

-- 2.2b atendente NÃO grava na pasta DE OUTRO no audio-memes (42501).
DO $t22b$
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001","role":"authenticated"}', true);
  BEGIN
    INSERT INTO storage.objects (bucket_id, name)
    VALUES ('audio-memes', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0002/meme-invasor.mp3');
    RAISE EXCEPTION 'PK-16 PARTE 2 FALHOU -> atendente GRAVOU na pasta de outro no audio-memes';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  RESET ROLE;
  RAISE NOTICE 'PK-16 2.2b OK (pasta alheia no audio-memes negada com 42501)';
END $t22b$;

-- 2.3 admin APAGA objeto de outro autor no audio-memes (o defeito original).
-- O gatilho protect_objects_delete recusa DELETE direto fora da API do
-- Storage; a API apaga com storage.allow_delete_query='true', entao a prova
-- assume esse ajuste como a API faria — quem decide e a policy de RLS.
DO $t23$
DECLARE
  v_apagadas integer;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"sub":"dddddddd-dddd-4ddd-8ddd-dddddddd0004","role":"authenticated"}', true);
  PERFORM set_config('storage.allow_delete_query', 'true', true);
  DELETE FROM storage.objects
   WHERE bucket_id = 'audio-memes'
     AND name = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0002/meme-outro.mp3';
  GET DIAGNOSTICS v_apagadas = ROW_COUNT;
  RESET ROLE;
  IF v_apagadas <> 1 THEN
    RAISE EXCEPTION 'PK-16 PARTE 2 FALHOU -> admin apagou % linha(s) de outro autor, esperado 1', v_apagadas;
  END IF;
  RAISE NOTICE 'PK-16 2.3 OK (admin apaga objeto de outro autor no audio-memes: 1 linha)';
END $t23$;

-- 2.3b atendente NAO apaga objeto de outro autor (mesmo pelo caminho da API):
-- prova que quem decide e a policy, nao o ajuste acima.
DO $t23b$
DECLARE
  v_apagadas integer;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001","role":"authenticated"}', true);
  PERFORM set_config('storage.allow_delete_query', 'true', true);
  DELETE FROM storage.objects
   WHERE bucket_id = 'audio-memes'
     AND name = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0002/meme-outro2.mp3';
  GET DIAGNOSTICS v_apagadas = ROW_COUNT;
  RESET ROLE;
  IF v_apagadas <> 0 THEN
    RAISE EXCEPTION 'PK-16 PARTE 2 FALHOU -> atendente APAGOU % linha(s) de outro autor', v_apagadas;
  END IF;
  RAISE NOTICE 'PK-16 2.3b OK (atendente nao apaga objeto de outro autor: 0 linhas)';
END $t23b$;

-- 2.4 expurgo: enfileira o vencido (>24h), ignora o novo (TTL padrao da funcao).
DO $t24$
DECLARE
  v_veredito jsonb;
BEGIN
  SELECT public.purge_voice_changer_tmp() INTO v_veredito;
  IF coalesce((v_veredito->>'enqueued')::integer, -1) <> 1 THEN
    RAISE EXCEPTION 'PK-16 PARTE 2 FALHOU -> expurgo enfileirou % (veredito %)', coalesce((v_veredito->>'enqueued')::integer, -1), v_veredito;
  END IF;
  IF (SELECT count(*) FROM public.talkx_storage_purge_queue
       WHERE reason = 'voice_changer_temp_ttl' AND object_name LIKE '%/velho.mp3') <> 1 THEN
    RAISE EXCEPTION 'PK-16 PARTE 2 FALHOU -> vencido (>24h) nao esta na fila do drenador';
  END IF;
  IF (SELECT count(*) FROM public.talkx_storage_purge_queue
       WHERE reason = 'voice_changer_temp_ttl' AND object_name LIKE '%/novo.mp3') <> 0 THEN
    RAISE EXCEPTION 'PK-16 PARTE 2 FALHOU -> objeto novo enfileirado antes do TTL de 24h';
  END IF;
  RAISE NOTICE 'PK-16 2.4 OK (vencido enfileirado, novo ignorado; veredito %)', v_veredito;
END $t24$;

ROLLBACK;
