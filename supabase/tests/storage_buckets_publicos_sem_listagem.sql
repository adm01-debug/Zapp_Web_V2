-- storage_buckets_publicos_sem_listagem — prova de ENFORCEMENT dos buckets PÚBLICOS
-- avatars / stickers / custom-emojis (cartão t_b8bd3bbf; migration 20261013210001).
--
-- O QUE PROVA. Os três são buckets PÚBLICOS por design (public=true) e a leitura é por URL
-- direta (getPublicUrl). O defeito era a LISTAGEM: as 4 policies de SELECT em storage.objects
-- tinham predicado só `bucket_id = '<bucket>'` TO authenticated, então qualquer autenticado
-- enumerava o bucket inteiro. Aqui as policies reais são aplicadas e consultadas com o PAPEL
-- REAL (authenticated, anon, service_role), nunca como postgres:
--   A1  existem as 4 policies de SELECT abertas (estado atual, migration REAL 20260511233306);
--   A2  authenticated LISTA o bucket avatars inteiro (2 objetos) — o defeito;
--   A3  authenticated LISTA o bucket stickers (1 objeto de outro dono) — o defeito;
--   A4  authenticated LISTA o bucket custom-emojis (1 objeto de outro dono) — o defeito;
--   A5  anon não lista (já era 0: nunca houve policy para anon);
--   B1  nenhuma policy de SELECT sobrou sem predicado de dono; B1b sobra só a leitura do dono em avatars;
--   B2  authenticated vê SÓ o próprio avatar (1 de 2) e B2b NÃO vê o de BOB;
--   B3  authenticated NÃO lista stickers; B4 NÃO lista custom-emojis; B5 anon segue sem listar;
--   B6  service_role (BYPASSRLS) segue enxergando os 4 objetos;
--   B7  as 10 policies de ESCRITA seguem existindo (nada de escrita foi removido);
--   B8  authenticated atualiza/upserta o PRÓPRIO avatar (o app usa upsert em `<uid>/avatar.<ext>`);
--   B9  authenticated NÃO sobrescreve avatar alheio; B10 NÃO insere na pasta alheia (WITH CHECK);
--   B11 insere na própria pasta; B12 os 3 buckets seguem public=true (URL direta continua servindo).
--
-- COMO RODA. Postgres descartável, tudo numa transação que termina em ROLLBACK (zero efeito
-- colateral, idempotente). A superfície do Supabase é criada à mão aqui; o estado ATUAL das
-- policies destes buckets vem da migration REAL 20260511233306 (não recriado à mão), e a
-- migration sob teste é a 20261013210001:
--   docker run --rm -d --name zapp-v2-storelist-$$ -e POSTGRES_PASSWORD=test_only postgres:17-alpine
--   docker exec -i zapp-v2-storelist-$$ psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres \
--     -v mig_estado=/repo/supabase/migrations/20260511233306_0e3f3b66-5585-4762-af6b-549c050f6275.sql \
--     -v mig_nova=/repo/supabase/migrations/20261013210001_storage_buckets_publicos_sem_listagem.sql \
--     < supabase/tests/storage_buckets_publicos_sem_listagem.sql
-- VERMELHO esperado sem a migration nova: B1..B4 falham (o bucket continua listável).

\set ON_ERROR_STOP on

BEGIN;

-- ── superfície do Supabase (auth, papéis, storage) ──────────────────────────────
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT COALESCE(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
$$;

CREATE FUNCTION public.is_admin_or_supervisor(uid uuid) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$ SELECT false $$;

CREATE TABLE public.profiles (id uuid PRIMARY KEY, user_id uuid);
CREATE TABLE public.contacts (id uuid PRIMARY KEY, assigned_to uuid);
CREATE TABLE public.team_conversation_members (conversation_id uuid, profile_id uuid);
GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
GRANT SELECT ON public.profiles, public.contacts, public.team_conversation_members TO authenticated, anon, service_role;

CREATE SCHEMA storage;
CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE parts text[];
BEGIN
  SELECT string_to_array(name, '/') INTO parts;
  RETURN parts[1:array_length(parts,1)-1];
END $$;
CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean DEFAULT false);
CREATE TABLE storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text REFERENCES storage.buckets(id),
  name text,
  owner uuid,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA storage TO authenticated, anon, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated, anon, service_role;

CREATE FUNCTION public._zapp_storage_assert(ok boolean, msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF ok IS NOT TRUE THEN RAISE EXCEPTION '[FALHOU] %', msg; END IF;
  RAISE NOTICE '[PASS] %', msg;
END $$;
GRANT EXECUTE ON FUNCTION public._zapp_storage_assert(boolean, text) TO authenticated, anon, service_role;

-- ── estado ATUAL das policies destes buckets: migration REAL ────────────────────
\i :mig_estado

-- ── fixture: objetos de ALICE e BOB nos 3 buckets (como postgres, dono do banco) ──
INSERT INTO storage.objects (bucket_id, name, owner) VALUES
  ('avatars','11111111-1111-1111-1111-111111111111/avatar.png','11111111-1111-1111-1111-111111111111'),
  ('avatars','22222222-2222-2222-2222-222222222222/avatar.png','22222222-2222-2222-2222-222222222222'),
  ('stickers','22222222-2222-2222-2222-222222222222/figurinha.webp','22222222-2222-2222-2222-222222222222'),
  ('custom-emojis','emoji_1_abc.png','22222222-2222-2222-2222-222222222222');

\echo
\echo '── BLOCO A: ANTES (o defeito) ─────────────────────────────────────────────────────'
SELECT public._zapp_storage_assert(
  (SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND cmd='SELECT'
     AND roles::text='{authenticated}'
     AND (qual LIKE '%''avatars''%' OR qual LIKE '%''stickers''%' OR qual LIKE '%''custom-emojis''%')
     AND qual NOT LIKE '%auth.uid%') = 4,
  'A1 as 4 policies de SELECT abertas dos buckets existem');

DO $$ DECLARE n int;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',false);
  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id='avatars';
  PERFORM public._zapp_storage_assert(n=2,'A2 authenticated LISTA avatars (defeito)');
  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id='stickers';
  PERFORM public._zapp_storage_assert(n=1,'A3 authenticated LISTA stickers (defeito)');
  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id='custom-emojis';
  PERFORM public._zapp_storage_assert(n=1,'A4 authenticated LISTA custom-emojis (defeito)');
  RESET ROLE;
END $$;

DO $$ DECLARE n int;
BEGIN
  SET LOCAL ROLE anon;
  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id='avatars';
  PERFORM public._zapp_storage_assert(n=0,'A5 anon NAO lista avatars (ja era 0)');
  RESET ROLE;
END $$;

-- ── aplica a migration sob teste ────────────────────────────────────────────────
\i :mig_nova

\echo
\echo '── BLOCO B: DEPOIS (sem listagem, escrita intacta) ────────────────────────────────'
SELECT public._zapp_storage_assert(
  (SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND cmd='SELECT'
     AND roles::text='{authenticated}'
     AND (qual LIKE '%''avatars''%' OR qual LIKE '%''stickers''%' OR qual LIKE '%''custom-emojis''%')
     AND qual NOT LIKE '%auth.uid%') = 0,
  'B1 nenhuma policy de SELECT aberta sobrou');
SELECT public._zapp_storage_assert(
  (SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND cmd='SELECT'
     AND policyname='Avatares: dono le a propria pasta' AND qual LIKE '%auth.uid%') = 1,
  'B1b so a leitura do dono em avatars (1 policy)');

DO $$ DECLARE n int;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',false);
  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id='avatars';
  PERFORM public._zapp_storage_assert(n=1,'B2 authenticated ve SO o proprio avatar (1 de 2)');
  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id='avatars' AND name='22222222-2222-2222-2222-222222222222/avatar.png';
  PERFORM public._zapp_storage_assert(n=0,'B2b authenticated NAO enxerga o avatar de BOB');
  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id='stickers';
  PERFORM public._zapp_storage_assert(n=0,'B3 authenticated NAO lista stickers');
  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id='custom-emojis';
  PERFORM public._zapp_storage_assert(n=0,'B4 authenticated NAO lista custom-emojis');
  RESET ROLE;
END $$;

DO $$ DECLARE n int;
BEGIN
  SET LOCAL ROLE anon;
  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id='custom-emojis';
  PERFORM public._zapp_storage_assert(n=0,'B5 anon segue sem listar');
  RESET ROLE;
END $$;

DO $$ DECLARE n int;
BEGIN
  SET LOCAL ROLE service_role;
  SELECT count(*) INTO n FROM storage.objects;
  PERFORM public._zapp_storage_assert(n=4,'B6 service_role (BYPASSRLS) segue enxergando os 4 objetos');
  RESET ROLE;
END $$;

SELECT public._zapp_storage_assert(
  (SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND cmd IN ('INSERT','UPDATE','DELETE')
     AND roles::text='{authenticated}'
     AND (qual LIKE '%''avatars''%' OR with_check LIKE '%''avatars''%'
       OR qual LIKE '%''stickers''%' OR with_check LIKE '%''stickers''%'
       OR qual LIKE '%''custom-emojis''%' OR with_check LIKE '%''custom-emojis''%')) = 10,
  'B7 as 10 policies de ESCRITA dos buckets seguem existindo');

DO $$ DECLARE n int;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',false);
  WITH u AS (UPDATE storage.objects SET owner=owner
             WHERE bucket_id='avatars' AND name='11111111-1111-1111-1111-111111111111/avatar.png' RETURNING 1)
  SELECT count(*) INTO n FROM u;
  PERFORM public._zapp_storage_assert(n=1,'B8 authenticated ATUALIZA o proprio avatar (upsert do dono)');
  WITH u AS (UPDATE storage.objects SET owner=owner
             WHERE bucket_id='avatars' AND name='22222222-2222-2222-2222-222222222222/avatar.png' RETURNING 1)
  SELECT count(*) INTO n FROM u;
  PERFORM public._zapp_storage_assert(n=0,'B9 authenticated NAO sobrescreve avatar alheio');
  BEGIN
    INSERT INTO storage.objects (bucket_id,name,owner)
      VALUES ('avatars','22222222-2222-2222-2222-222222222222/hack.png','11111111-1111-1111-1111-111111111111');
    PERFORM public._zapp_storage_assert(false,'B10 authenticated NAO insere na pasta alheia (deveria barrar)');
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE '[PASS] B10 authenticated NAO insere na pasta alheia (WITH CHECK barrou)';
  END;
  WITH i AS (INSERT INTO storage.objects (bucket_id,name,owner)
             VALUES ('avatars','11111111-1111-1111-1111-111111111111/novo.png','11111111-1111-1111-1111-111111111111') RETURNING 1)
  SELECT count(*) INTO n FROM i;
  PERFORM public._zapp_storage_assert(n=1,'B11 authenticated insere na propria pasta');
  RESET ROLE;
END $$;

SELECT public._zapp_storage_assert(
  (SELECT count(*) FROM storage.buckets WHERE id IN ('avatars','stickers','custom-emojis') AND public IS TRUE) = 3,
  'B12 os 3 buckets seguem public=true (URL direta continua servindo)');

ROLLBACK;

\echo
\echo '[OK] buckets publicos avatars/stickers/custom-emojis sem listagem e sem escrita fora do dono'
