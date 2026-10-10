-- avatars_bucket_private — torna o bucket `avatars` privado e restringe a escrita ao dono.
--
-- Rollback: devolve o bucket `avatars` para público e recria a leitura anônima.
-- Rollback (SQL executável, na ordem):
--   DROP POLICY IF EXISTS "avatars owner insert" ON storage.objects;
--   DROP POLICY IF EXISTS "avatars owner update" ON storage.objects;
--   DROP POLICY IF EXISTS "avatars authenticated read" ON storage.objects;
--   CREATE POLICY "Anyone can view avatars" ON storage.objects FOR SELECT TO public USING (bucket_id = 'avatars');
--   UPDATE storage.buckets SET public = true WHERE id = 'avatars';

-- 1. Bucket privado: cria se não existir e garante public = false (idempotente).
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- 2. Idempotência: remove a leitura pública antiga e eventuais versões anteriores destas policies.
DROP POLICY IF EXISTS "Anyone can view avatars" ON storage.objects;
DROP POLICY IF EXISTS "avatars authenticated read" ON storage.objects;
DROP POLICY IF EXISTS "avatars owner insert" ON storage.objects;
DROP POLICY IF EXISTS "avatars owner update" ON storage.objects;

-- 3. Leitura: só usuário autenticado (o bucket deixou de ser público). O admin precisa
--    enxergar o avatar de outros usuários na tela de administração, então a leitura é
--    liberada para `authenticated`, não só para o dono.
CREATE POLICY "avatars authenticated read"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'avatars');

-- 4. Escrita: só o dono grava no próprio diretório (`<auth.uid()>/...`). O admin
--    (`public.is_admin`) mantém o fluxo de gestão de usuários, que grava avatar de terceiros.
CREATE POLICY "avatars owner insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin(auth.uid()))
);

CREATE POLICY "avatars owner update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin(auth.uid()))
)
WITH CHECK (
  bucket_id = 'avatars'
  AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin(auth.uid()))
);
