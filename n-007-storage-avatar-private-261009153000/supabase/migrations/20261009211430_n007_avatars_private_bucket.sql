-- N-007: fotos de perfil fora do bucket público, com link temporário
-- Rollback:
-- Rollback (SQL executável, na ordem):
--   DROP POLICY IF EXISTS "Authenticated users can read avatars" ON storage.objects;
--   DROP POLICY IF EXISTS "Authenticated users can upload avatars" ON storage.objects;
--   DROP POLICY IF EXISTS "Authenticated users can update avatars" ON storage.objects;
--   CREATE POLICY "Avatar images are publicly accessible" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'avatars');
--   CREATE POLICY "Anyone can view avatars" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'avatars');
--   UPDATE storage.buckets SET public = true WHERE id = 'avatars';

-- 1. Tornar o bucket avatars privado (não mais acessível sem login)
UPDATE storage.buckets SET public = false WHERE id = 'avatars';

-- 2. Remover a policy de leitura pública original
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;

-- 3. Remover a policy de leitura pública alternativa
DROP POLICY IF EXISTS "Anyone can view avatars" ON storage.objects;

-- 4. Permitir que usuários autenticados leiam avatars
CREATE POLICY "Authenticated users can read avatars"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'avatars');

-- 5. Permitir que usuários autenticados façam upload de avatars
CREATE POLICY "Authenticated users can upload avatars"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'avatars');

-- 6. Permitir que usuários autenticados atualizem avatars
CREATE POLICY "Authenticated users can update avatars"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'avatars');
