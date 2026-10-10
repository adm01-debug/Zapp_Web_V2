-- Rollback: restaura bucket public e recria policy "Anyone can view avatars"
-- Rollback (SQL executável, na ordem):
--   UPDATE storage.buckets SET public = true WHERE id = 'avatars';
--   DROP POLICY IF EXISTS "Authenticated users can view their own avatar" ON storage.objects;
--   CREATE POLICY "Anyone can view avatars" ON storage.objects FOR SELECT TO public USING (bucket_id = 'avatars');

-- Tornar o bucket avatars privado (não mais acessível sem login)
UPDATE storage.buckets SET public = false WHERE id = 'avatars';

-- Remover a policy que permitia acesso público a todas as avatars
DROP POLICY IF EXISTS "Anyone can view avatars" ON storage.objects;

-- Criar policy que permite apenas usuários autenticados verem sua própria avatar
CREATE POLICY "Authenticated users can view their own avatar"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);