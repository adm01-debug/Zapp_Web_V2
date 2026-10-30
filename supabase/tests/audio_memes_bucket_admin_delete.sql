-- =====================================================================
-- audio-memes: admin apaga qualquer meme + teto de 5 MB e allowlist audio/*
-- Cartao: t_a65f9f8f (worker sql) — migration 20261016001136
-- =====================================================================
-- Roda no banco LOCAL da tarefa (Postgres de verdade, migrations REAIS,
-- papeis anon/authenticated/service_role e auth.uid() vindo de
-- request.jwt.claims). Fixtures e assercoes numa transacao que termina em
-- ROLLBACK: zero efeito colateral, idempotente, roda quantas vezes quiser.
-- Nenhuma assercao executa como postgres: cada uma faz SET LOCAL ROLE do
-- papel real antes de tocar o objeto.
--
--   T1 admin apaga meme de OUTRO usuario .................. 1 linha  [vermelho antes]
--   T2 admin apaga objeto LEGADO na raiz do bucket ........ 1 linha  [vermelho antes]
--   T3 dono apaga o PROPRIO meme .......................... 1 linha  (nao regrediu)
--   T4 agente comum NAO apaga meme de outro ............... 0 linhas
--   T5 anon NAO apaga nada do bucket ...................... 0 linhas
--   T6 leitura do bucket segue aberta ao authenticated .... >= 1 linha
--   T7 bucket segue publico, com file_size_limit 5 MB e allowlist audio/*
--   T8 admin NAO apaga em OUTRO bucket (policy escopada) .. 0 linhas
--
-- Uso: zapp-db-local psql . <nome-do-banco> < supabase/tests/audio_memes_bucket_admin_delete.sql
-- (sai != 0 com "PROVA FALHOU" quando qualquer verificacao falha)
\set ON_ERROR_STOP on

BEGIN;

-- O Storage marca a sessao antes de apagar (`storage.allow_delete_query = true`);
-- sem isso o gatilho `protect_objects_delete` recusa QUALQUER DELETE direto em
-- storage.objects. Esta prova reproduz o mesmo caminho do Storage (papel real +
-- claims) e mantem o gatilho ligado: o que decide e a RLS, nao o gatilho.
SELECT set_config('storage.allow_delete_query', 'true', true);

-- ---------------------------------------------------------------- fixtures
-- Inseridos como postgres (papel de servico da sessao); a prova em si roda
-- como authenticated/anon. UUIDs e e-mails sinteticos (example.test).
-- O gatilho on_auth_user_created cria as linhas de public.profiles.
DO $fixture$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = '00000000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'fixture: identidade do admin semeado ausente; rode este arquivo no banco local da tarefa (zapp-db-local)';
  END IF;
END $fixture$;

INSERT INTO auth.users (id, email, is_sso_user, is_anonymous) VALUES
  ('11111111-1111-4111-8111-111111111111','agente.a@example.test',false,false),
  ('22222222-2222-4222-8222-222222222222','agente.b@example.test',false,false);

-- Objetos do bucket `audio-memes` (a pasta e o auth.uid() do dono, como o app grava):
--   1) meme de B                  -> alvo do T1
--   2) objeto LEGADO na RAIZ      -> alvo do T2 (nome sem pasta; foldername = {})
--   3) meme do PROPRIO A          -> alvo do T3/T4 nao pode ser apagado por B
--   4) objeto intocado            -> prova de leitura do T6
INSERT INTO storage.objects (id, bucket_id, name, owner, created_at, updated_at) VALUES
  ('0e000000-0000-4000-8000-000000000001','audio-memes','22222222-2222-4222-8222-222222222222/meme-do-b.mp3','22222222-2222-4222-8222-222222222222', now(), now()),
  ('0e000000-0000-4000-8000-000000000002','audio-memes','legado-na-raiz.mp3','22222222-2222-4222-8222-222222222222', now(), now()),
  ('0e000000-0000-4000-8000-000000000003','audio-memes','11111111-1111-4111-8111-111111111111/meu-meme.mp3','11111111-1111-4111-8111-111111111111', now(), now()),
  ('0e000000-0000-4000-8000-000000000004','audio-memes','22222222-2222-4222-8222-222222222222/intocado.mp3','22222222-2222-4222-8222-222222222222', now(), now());

-- Objeto de OUTRO bucket, para provar que a policy nova e escopada ao audio-memes (T8).
INSERT INTO storage.objects (id, bucket_id, name, owner, created_at, updated_at) VALUES
  ('0e000000-0000-4000-8000-000000000005','audio-messages','22222222-2222-4222-8222-222222222222/msg-do-b.mp3','22222222-2222-4222-8222-222222222222', now(), now());

-- ---------------------------------------------------------------- assercoes
DO $prova$
DECLARE
  v_falhas integer := 0;
  v_n      integer;
  v_bool   boolean;
  v_txt    text;
  v_mimes  text[];
BEGIN
  ------------------------------------------- T1 admin apaga meme de OUTRO usuario
  -- [vermelho antes] sem a migration 20261016001136 o admin nao tem policy de DELETE
  -- neste bucket: 0 linhas afetadas (era o bug relatado no toast 'arquivo ficou orfao').
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
    DELETE FROM storage.objects WHERE id = '0e000000-0000-4000-8000-000000000001';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RESET ROLE;
    IF v_n <> 1 THEN RAISE EXCEPTION 'admin apagou % linha(s) do meme de outro usuario, esperado 1', v_n; END IF;
    RAISE NOTICE 'T1 OK    admin apaga meme de OUTRO usuario (1 linha)';
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE; v_falhas := v_falhas + 1;
    RAISE NOTICE 'T1 FALHOU: %', SQLERRM;
  END;

  ---------------------------------------------- T2 admin apaga objeto LEGADO na raiz
  -- [vermelho antes] na raiz do bucket foldername(name) = {} e a policy antiga
  -- (`foldername[1] = auth.uid()`) fica falsa para QUALQUER usuario.
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
    DELETE FROM storage.objects WHERE id = '0e000000-0000-4000-8000-000000000002';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RESET ROLE;
    IF v_n <> 1 THEN RAISE EXCEPTION 'admin apagou % linha(s) do objeto legado na raiz, esperado 1', v_n; END IF;
    RAISE NOTICE 'T2 OK    admin apaga objeto LEGADO na raiz do bucket (1 linha)';
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE; v_falhas := v_falhas + 1;
    RAISE NOTICE 'T2 FALHOU: %', SQLERRM;
  END;

  ---------------------------------------------------- T3 dono apaga o PROPRIO meme
  -- Regressao: a policy "Users can delete own audio memes" (pasta = auth.uid())
  -- NAO foi tocada e continua valendo.
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
    DELETE FROM storage.objects WHERE id = '0e000000-0000-4000-8000-000000000003';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RESET ROLE;
    IF v_n <> 1 THEN RAISE EXCEPTION 'dono apagou % linha(s) do proprio meme, esperado 1', v_n; END IF;
    RAISE NOTICE 'T3 OK    dono apaga o PROPRIO meme pela policy antiga (1 linha)';
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE; v_falhas := v_falhas + 1;
    RAISE NOTICE 'T3 FALHOU: %', SQLERRM;
  END;

  ------------------------------------------------- A4 agente comum x meme de outro
  -- A policy nova e SO para admin/supervisor: o agente comum continua barrado.
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
    DELETE FROM storage.objects WHERE id = '0e000000-0000-4000-8000-000000000004';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RESET ROLE;
    IF v_n <> 0 THEN RAISE EXCEPTION 'agente comum apagou % linha(s) do meme de outro usuario', v_n; END IF;
    RAISE NOTICE 'T4 OK    agente comum NAO apaga meme de outro usuario (0 linhas)';
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE; v_falhas := v_falhas + 1;
    RAISE NOTICE 'T4 FALHOU: %', SQLERRM;
  END;

  ----------------------------------------------------------- T5 anon nao apaga
  -- anon nao tem policy de DELETE neste bucket (a nova e TO authenticated).
  -- Falta de privilegio de tabela tambem conta como "nao apagou".
  BEGIN
    v_n := 0;
    SET LOCAL ROLE anon;
    BEGIN
      DELETE FROM storage.objects WHERE id = '0e000000-0000-4000-8000-000000000004';
      GET DIAGNOSTICS v_n = ROW_COUNT;
    EXCEPTION WHEN insufficient_privilege THEN
      v_n := 0;
    END;
    RESET ROLE;
    IF v_n <> 0 THEN RAISE EXCEPTION 'anon apagou % linha(s) do bucket', v_n; END IF;
    RAISE NOTICE 'T5 OK    anon NAO apaga nada do bucket (0 linhas)';
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE; v_falhas := v_falhas + 1;
    RAISE NOTICE 'T5 FALHOU: %', SQLERRM;
  END;

  ------------------------------------------------- T6 leitura segue aberta (authenticated)
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
    SELECT count(*) INTO v_n FROM storage.objects
     WHERE bucket_id = 'audio-memes' AND id = '0e000000-0000-4000-8000-000000000004';
    RESET ROLE;
    IF v_n <> 1 THEN RAISE EXCEPTION 'usuario autenticado enxergou % linha(s) do bucket, esperado 1', v_n; END IF;
    RAISE NOTICE 'T6 OK    leitura do bucket segue aberta ao authenticated (1 linha)';
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE; v_falhas := v_falhas + 1;
    RAISE NOTICE 'T6 FALHOU: %', SQLERRM;
  END;

  ------------------------------------------ T7 bucket publico + teto 5 MB + allowlist audio/*
  -- A Storage API le estas colunas ANTES de gravar: e o que passa a recusar
  -- upload acima de 5 MB ou fora de audio/* por chamada direta ao Storage.
  BEGIN
    SELECT public, file_size_limit, allowed_mime_types
      INTO v_bool, v_n, v_mimes
      FROM storage.buckets WHERE id = 'audio-memes';
    IF v_bool IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'bucket audio-memes deixou de ser publico (a URL publica esta em audio_memes.audio_url)';
    END IF;
    IF v_n IS DISTINCT FROM 5242880 THEN
      RAISE EXCEPTION 'file_size_limit = %, esperado 5242880 (5 MB)', v_n;
    END IF;
    IF v_mimes IS DISTINCT FROM ARRAY['audio/*']::text[] THEN
      RAISE EXCEPTION 'allowed_mime_types = %, esperado {audio/*}', coalesce(array_to_string(v_mimes, ','), 'NULL');
    END IF;
    RAISE NOTICE 'T7 OK    bucket publico, file_size_limit 5242880 e allowed_mime_types {audio/*}';
  EXCEPTION WHEN OTHERS THEN
    v_falhas := v_falhas + 1;
    RAISE NOTICE 'T7 FALHOU: %', SQLERRM;
  END;

  ------------------------------------------- T8 admin NAO apaga em OUTRO bucket
  -- A policy nova e escopada a bucket_id = 'audio-memes'; o audio-messages
  -- continua so com a policy do proprio dono.
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
    DELETE FROM storage.objects WHERE id = '0e000000-0000-4000-8000-000000000005';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RESET ROLE;
    IF v_n <> 0 THEN RAISE EXCEPTION 'admin apagou % linha(s) de OUTRO bucket', v_n; END IF;
    RAISE NOTICE 'T8 OK    admin NAO apaga em OUTRO bucket (0 linhas)';
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE; v_falhas := v_falhas + 1;
    RAISE NOTICE 'T8 FALHOU: %', SQLERRM;
  END;

  IF v_falhas > 0 THEN
    RAISE EXCEPTION 'PROVA FALHOU: % de 8 verificacoes falharam', v_falhas;
  END IF;
  RAISE NOTICE 'PROVA OK: 8 de 8 verificacoes passaram';
END $prova$;

ROLLBACK;
